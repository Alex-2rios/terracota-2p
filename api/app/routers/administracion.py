from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from ..database import get_connection
from ..dependencies import CurrentUser, require_roles
from ..queries import asignar_roles, get_usuario, usuario_disponible, validar_roles
from ..schemas import (
    ESTADOS_PEDIDO,
    CancelarPedido,
    GastoCreate,
    Reporte,
    SeccionReporte,
    UsuarioCreate,
    UsuarioUpdate,
)


router = APIRouter(prefix="/administracion", tags=["Administración"])
admin_required = require_roles("administrador")

TZ = "America/Mexico_City"


def _dinero(valor) -> str:
    return f"${Decimal(valor or 0):,.2f}"


def _rango(fecha_inicio: Optional[date], fecha_fin: Optional[date]) -> tuple[date, date]:
    fin = fecha_fin or date.today()
    inicio = fecha_inicio or fin.replace(day=1)
    if inicio > fin:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La fecha de inicio no puede ser posterior a la fecha final.",
        )
    return inicio, fin


# ============================================================== usuarios
@router.get("/roles", summary="Listar Roles del Sistema")
def list_roles(
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    return connection.execute(
        "SELECT id, clave, nombre FROM terracota.roles ORDER BY nombre"
    ).fetchall()


@router.get("/usuarios", summary="Listar Usuarios")
def list_users(
    incluir_eliminados: bool = False,
    buscar: Optional[str] = None,
    rol: Optional[str] = None,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    condiciones: list[str] = []
    parametros: list = []

    if not incluir_eliminados:
        condiciones.append("NOT eliminado")
    if buscar and buscar.strip():
        condiciones.append("(nombre ILIKE %s OR usuario ILIKE %s)")
        patron = f"%{buscar.strip()}%"
        parametros.extend([patron, patron])
    if rol and rol.strip().lower() not in {"todos", "todos los roles", ""}:
        condiciones.append("%s = ANY(roles)")
        parametros.append(rol.strip().lower())

    where = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    return connection.execute(
        f"SELECT * FROM terracota.vista_usuarios {where} ORDER BY nombre",
        parametros,
    ).fetchall()


@router.get("/usuarios/{user_id}", summary="Ver Usuario")
def get_user(
    user_id: int,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    return get_usuario(connection, user_id)


@router.post("/usuarios", status_code=status.HTTP_201_CREATED, summary="Crear Usuario")
def create_user(
    payload: UsuarioCreate,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    validar_roles(connection, payload.roles)
    usuario_disponible(connection, payload.usuario)

    creado = connection.execute(
        """
        INSERT INTO terracota.usuarios(nombre, usuario, password_hash, activo)
        VALUES (%s, %s, crypt(%s, gen_salt('bf')), %s)
        RETURNING id
        """,
        (payload.nombre, payload.usuario, payload.password, payload.activo),
    ).fetchone()
    asignar_roles(connection, creado["id"], payload.roles)
    return get_usuario(connection, creado["id"])


@router.patch("/usuarios/{user_id}", summary="Actualizar Usuario")
def update_user(
    user_id: int,
    payload: UsuarioUpdate,
    actual: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    existente = get_usuario(connection, user_id)
    if existente["eliminado"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario está dado de baja. Reactívalo antes de editarlo.",
        )

    # Candados para no dejar el sistema sin administrador ni bloquearse a sí mismo.
    if user_id == actual.id and payload.activo is False:
        raise HTTPException(status_code=422, detail="No puedes desactivar tu propia cuenta.")
    if user_id == actual.id and payload.roles is not None and "administrador" not in payload.roles:
        raise HTTPException(status_code=422, detail="No puedes retirarte el rol de administrador.")
    if payload.roles is not None and "administrador" in existente["roles"] and "administrador" not in payload.roles:
        _validar_ultimo_admin(connection, user_id)

    if payload.usuario:
        usuario_disponible(connection, payload.usuario, excluir_id=user_id)

    connection.execute(
        """
        UPDATE terracota.usuarios
           SET nombre  = COALESCE(%s, nombre),
               usuario = COALESCE(%s, usuario),
               activo  = COALESCE(%s, activo),
               password_hash = CASE WHEN %s::text IS NULL THEN password_hash
                                    ELSE crypt(%s, gen_salt('bf')) END
         WHERE id = %s
        """,
        (payload.nombre, payload.usuario, payload.activo, payload.password, payload.password, user_id),
    )
    if payload.roles is not None:
        asignar_roles(connection, user_id, payload.roles)
    return get_usuario(connection, user_id)


@router.delete("/usuarios/{user_id}", summary="Dar de Baja un Usuario")
def delete_user(
    user_id: int,
    actual: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Baja lógica: conserva el historial de pedidos y pagos del usuario."""
    usuario = get_usuario(connection, user_id)
    if user_id == actual.id:
        raise HTTPException(status_code=422, detail="No puedes dar de baja tu propia cuenta.")
    if "administrador" in usuario["roles"]:
        _validar_ultimo_admin(connection, user_id)

    connection.execute(
        "UPDATE terracota.usuarios SET eliminado = true, activo = false WHERE id = %s",
        (user_id,),
    )
    return {"status": "ok", "mensaje": f"{usuario['nombre']} se dio de baja."}


@router.post("/usuarios/{user_id}/reactivar", summary="Reactivar un Usuario")
def restore_user(
    user_id: int,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    get_usuario(connection, user_id)
    connection.execute(
        "UPDATE terracota.usuarios SET eliminado = false, activo = true WHERE id = %s",
        (user_id,),
    )
    return get_usuario(connection, user_id)


def _validar_ultimo_admin(connection: Connection, user_id: int) -> None:
    restantes = connection.execute(
        """
        SELECT count(*)::integer AS total
        FROM terracota.vista_usuarios
        WHERE 'administrador' = ANY(roles) AND activo AND NOT eliminado AND id <> %s
        """,
        (user_id,),
    ).fetchone()["total"]
    if restantes == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Es el único administrador activo: el sistema quedaría sin acceso.",
        )


# ============================================================== pedidos
@router.get("/pedidos", summary="Listar Pedidos (con filtros)")
def list_orders(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    estado: Optional[str] = None,
    mesa: Optional[int] = None,
    limite: int = Query(default=300, ge=1, le=1000),
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    condiciones = [f"(p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s"]
    inicio, fin = _rango(fecha_inicio, fecha_fin)
    parametros: list = [inicio, fin]

    if estado and estado.strip().upper() not in {"TODOS", ""}:
        normalizado = estado.strip().upper()
        if normalizado not in ESTADOS_PEDIDO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Estado inválido. Usa uno de: {', '.join(ESTADOS_PEDIDO)}.",
            )
        condiciones.append("p.estado = %s")
        parametros.append(normalizado)
    if mesa is not None:
        condiciones.append("m.numero = %s")
        parametros.append(mesa)

    parametros.append(limite)
    return connection.execute(
        f"""
        SELECT p.id, m.numero AS mesa, u.nombre AS mesero, p.total, p.estado,
               COALESCE(t.folio, '-') AS folio,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS fecha
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        LEFT JOIN terracota.pagos pg ON pg.pedido_id = p.id
        LEFT JOIN terracota.tickets t ON t.pago_id = pg.id
        WHERE {' AND '.join(condiciones)}
        ORDER BY p.creado_en DESC
        LIMIT %s
        """,
        parametros,
    ).fetchall()


@router.get("/pedidos/{order_id}", summary="Ver Detalle de Pedido")
def get_order_detail(
    order_id: int,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    pedido = connection.execute(
        f"""
        SELECT p.id, m.numero AS mesa, u.nombre AS mesero, p.subtotal, p.impuesto,
               p.total, p.estado, p.notas,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS fecha
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        WHERE p.id = %s
        """,
        (order_id,),
    ).fetchone()
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado.")

    pedido["items"] = connection.execute(
        """
        SELECT pd.nombre_producto AS producto, c.nombre AS categoria,
               pd.cantidad, pd.precio_unitario AS precio, pd.importe, pd.observacion
        FROM terracota.pedido_detalles pd
        JOIN terracota.productos pr ON pr.id = pd.producto_id
        JOIN terracota.categorias c ON c.id = pr.categoria_id
        WHERE pd.pedido_id = %s
        ORDER BY pd.id
        """,
        (order_id,),
    ).fetchall()

    pedido["historial"] = connection.execute(
        f"""
        SELECT h.estado_anterior, h.estado_nuevo, h.comentario,
               COALESCE(u.nombre, 'Sistema') AS usuario,
               to_char(h.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS fecha
        FROM terracota.pedido_estados_historial h
        LEFT JOIN terracota.usuarios u ON u.id = h.usuario_id
        WHERE h.pedido_id = %s
        ORDER BY h.id
        """,
        (order_id,),
    ).fetchall()
    return pedido


@router.post("/pedidos/{order_id}/cancelar", summary="Cancelar Pedido")
def cancel_order(
    order_id: int,
    payload: CancelarPedido,
    user: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Cancela y devuelve las existencias al inventario (lo hace la función SQL)."""
    connection.execute(
        "SELECT id FROM terracota.cambiar_estado_pedido(%s, 'CANCELADO', %s, %s)",
        (order_id, user.id, payload.motivo or "Cancelado por el administrador."),
    ).fetchone()
    return {"status": "ok", "mensaje": f"Pedido #{order_id} cancelado y stock restablecido."}


# ============================================================== gastos
@router.get("/gastos", summary="Listar Gastos")
def list_expenses(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    inicio, fin = _rango(fecha_inicio, fecha_fin)
    return connection.execute(
        """
        SELECT g.id, g.concepto, g.monto, g.fecha,
               COALESCE(u.nombre, '-') AS registrado_por
        FROM terracota.gastos g
        LEFT JOIN terracota.usuarios u ON u.id = g.registrado_por
        WHERE g.fecha BETWEEN %s AND %s
        ORDER BY g.fecha DESC, g.id DESC
        """,
        (inicio, fin),
    ).fetchall()


@router.post("/gastos", status_code=status.HTTP_201_CREATED, summary="Registrar Gasto")
def create_expense(
    payload: GastoCreate,
    user: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    return connection.execute(
        """
        INSERT INTO terracota.gastos(concepto, monto, fecha, registrado_por)
        VALUES (%s, %s, COALESCE(%s, (now() AT TIME ZONE 'America/Mexico_City')::date), %s)
        RETURNING id, concepto, monto, fecha
        """,
        (payload.concepto, payload.monto, payload.fecha, user.id),
    ).fetchone()


@router.delete("/gastos/{expense_id}", summary="Eliminar Gasto")
def delete_expense(
    expense_id: int,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    borrado = connection.execute(
        "DELETE FROM terracota.gastos WHERE id = %s RETURNING id", (expense_id,)
    ).fetchone()
    if borrado is None:
        raise HTTPException(status_code=404, detail="Gasto no encontrado.")
    return {"status": "ok", "mensaje": "Gasto eliminado."}


# ============================================================== estadísticas
@router.get("/estadisticas/resumen", summary="Resumen Estadístico")
def statistics_summary(
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    totales = connection.execute(
        f"""
        SELECT
          (SELECT count(*) FROM terracota.usuarios WHERE activo AND NOT eliminado)::integer AS usuarios_activos,
          (SELECT count(*) FROM terracota.mesas WHERE activa)::integer AS mesas_activas,
          (SELECT count(*) FROM terracota.productos WHERE disponible AND NOT eliminado)::integer AS productos_disponibles,
          (SELECT count(*) FROM terracota.pedidos
             WHERE (creado_en AT TIME ZONE '{TZ}')::date = (now() AT TIME ZONE '{TZ}')::date)::integer AS pedidos_hoy,
          COALESCE((SELECT total FROM terracota.vista_ventas_diarias
             WHERE fecha = (now() AT TIME ZONE '{TZ}')::date), 0) AS ventas_hoy
        """
    ).fetchone()
    estados = connection.execute(
        f"""
        SELECT estado, count(*)::integer AS cantidad
        FROM terracota.pedidos
        WHERE (creado_en AT TIME ZONE '{TZ}')::date = (now() AT TIME ZONE '{TZ}')::date
        GROUP BY estado ORDER BY estado
        """
    ).fetchall()
    return {**totales, "pedidos_por_estado": estados}


@router.get("/estadisticas/dashboard", summary="Datos del Tablero Web")
def dashboard(
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Todo lo que pinta la pantalla de inicio del panel web, en una sola llamada."""
    tarjetas = connection.execute(
        f"""
        SELECT
          COALESCE((SELECT sum(total) FROM terracota.vista_ventas_diarias
            WHERE date_trunc('month', fecha) = date_trunc('month', (now() AT TIME ZONE '{TZ}')::date)), 0) AS ventas_mes,
          COALESCE((SELECT total FROM terracota.vista_ventas_diarias
            WHERE fecha = (now() AT TIME ZONE '{TZ}')::date), 0) AS ventas_hoy,
          (SELECT count(*) FROM terracota.pedidos
            WHERE (creado_en AT TIME ZONE '{TZ}')::date = (now() AT TIME ZONE '{TZ}')::date)::integer AS pedidos_hoy,
          (SELECT count(*) FROM terracota.usuarios WHERE activo AND NOT eliminado)::integer AS usuarios_activos,
          (SELECT count(*) FROM terracota.vista_inventario
            WHERE NOT eliminado AND estado IN ('BAJO', 'AGOTADO'))::integer AS productos_bajo_stock
        """
    ).fetchone()

    serie = connection.execute(
        f"""
        WITH fechas AS (
          SELECT generate_series(
            (now() AT TIME ZONE '{TZ}')::date - interval '6 days',
            (now() AT TIME ZONE '{TZ}')::date,
            '1 day'::interval
          )::date AS fecha
        )
        SELECT
          f.fecha,
          CASE EXTRACT(DOW FROM f.fecha)
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Lun' WHEN 2 THEN 'Mar'
            WHEN 3 THEN 'Mié' WHEN 4 THEN 'Jue' WHEN 5 THEN 'Vie'
            WHEN 6 THEN 'Sáb' END AS dia_semana,
          COALESCE((SELECT sum(total) FROM terracota.vista_ventas_diarias v WHERE v.fecha = f.fecha), 0)::numeric(12,2) AS ganancias,
          COALESCE((SELECT sum(monto) FROM terracota.gastos g WHERE g.fecha = f.fecha), 0)::numeric(12,2) AS gastos
        FROM fechas f
        ORDER BY f.fecha
        """
    ).fetchall()

    top = connection.execute(
        """
        SELECT pd.nombre_producto AS nombre, sum(pd.cantidad)::integer AS cantidad
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        WHERE p.estado <> 'CANCELADO'
        GROUP BY pd.nombre_producto
        ORDER BY cantidad DESC
        LIMIT 5
        """
    ).fetchall()

    recientes = connection.execute(
        f"""
        SELECT p.id, m.numero AS mesa, u.nombre AS mesero, p.estado, p.total,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'HH24:MI') AS hora
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        ORDER BY p.creado_en DESC
        LIMIT 10
        """
    ).fetchall()

    return {
        **tarjetas,
        "serie_7_dias": serie,
        "top_productos": top,
        "pedidos_recientes": recientes,
    }


# ============================================================== reportes
@router.get("/reportes", response_model=Reporte, summary="Generar Reporte")
def build_report(
    tipo: str = Query(description="ventas | usuarios | inventario"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    categoria: Optional[str] = None,
    estado: Optional[str] = None,
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> Reporte:
    """Devuelve el reporte ya estructurado en secciones.

    La API arma los datos; el panel web sólo los convierte a PDF o XLSX. Así
    cualquier cliente puede consumir el mismo reporte.
    """
    tipo_normalizado = tipo.strip().lower()
    categoria = (categoria or "").strip()
    estado = (estado or "").strip()
    cat_libre = categoria.lower() in {"", "todos", "todas", "todos los productos", "todos los roles", "inventario general"}
    est_libre = estado.lower() in {"", "todos"}

    generado = datetime.now().strftime("%Y-%m-%d %H:%M")

    if tipo_normalizado == "ventas":
        inicio, fin = _rango(fecha_inicio, fecha_fin)
        return Reporte(
            titulo=f"Reporte Consolidado de Ventas ({inicio} a {fin})",
            generado_en=generado,
            secciones=_reporte_ventas(connection, inicio, fin, categoria, estado, cat_libre, est_libre),
        )

    if tipo_normalizado == "usuarios":
        return Reporte(
            titulo="Reporte de Usuarios del Sistema",
            generado_en=generado,
            secciones=_reporte_usuarios(connection, categoria, estado, cat_libre, est_libre),
        )

    if tipo_normalizado == "inventario":
        return Reporte(
            titulo="Reporte de Inventario y Existencias",
            generado_en=generado,
            secciones=_reporte_inventario(connection, categoria, estado, cat_libre, est_libre),
        )

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Tipo de reporte no reconocido. Usa ventas, usuarios o inventario.",
    )


def _reporte_ventas(connection, inicio, fin, categoria, estado, cat_libre, est_libre) -> list[SeccionReporte]:
    estado_sql = "PAGADO" if estado.upper() == "COMPLETADO" else estado.upper()

    filtro_cat = "" if cat_libre else " AND upper(c.nombre) = upper(%s)"
    filtro_est = "" if est_libre else " AND p.estado = %s"

    params: list = [inicio, fin]
    if not cat_libre:
        params.append(categoria)
    if not est_libre:
        params.append(estado_sql)

    productos = connection.execute(
        f"""
        SELECT pd.nombre_producto, c.nombre AS categoria,
               max(pr.stock_actual)::integer AS stock_actual,
               sum(pd.cantidad)::integer AS cantidad_vendida,
               sum(pd.importe)::numeric(12,2) AS total_recaudado
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        JOIN terracota.productos pr ON pr.id = pd.producto_id
        JOIN terracota.categorias c ON c.id = pr.categoria_id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s{filtro_cat}{filtro_est}
        GROUP BY pd.nombre_producto, c.nombre
        ORDER BY cantidad_vendida DESC
        """,
        params,
    ).fetchall()

    params_tx: list = [inicio, fin]
    if not est_libre:
        params_tx.append(estado_sql)
    filtro_cat_tx = ""
    if not cat_libre:
        filtro_cat_tx = """ AND EXISTS (
            SELECT 1 FROM terracota.pedido_detalles pds
            JOIN terracota.productos prs ON prs.id = pds.producto_id
            JOIN terracota.categorias cs ON cs.id = prs.categoria_id
            WHERE pds.pedido_id = p.id AND upper(cs.nombre) = upper(%s)
        )"""
        params_tx.append(categoria)

    transacciones = connection.execute(
        f"""
        SELECT p.id AS pedido_id, COALESCE(t.folio, '-') AS folio, m.numero AS mesa,
               u.nombre AS mesero, COALESCE(pg.metodo, '-') AS metodo, p.total,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS fecha,
               p.estado
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        LEFT JOIN terracota.pagos pg ON pg.pedido_id = p.id
        LEFT JOIN terracota.tickets t ON t.pago_id = pg.id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s{filtro_est}{filtro_cat_tx}
        ORDER BY p.creado_en DESC
        """,
        params_tx,
    ).fetchall()

    cobrado = sum(Decimal(r["total"]) for r in transacciones if r["estado"] == "PAGADO")
    gastos = connection.execute(
        "SELECT COALESCE(sum(monto), 0) AS total FROM terracota.gastos WHERE fecha BETWEEN %s AND %s",
        (inicio, fin),
    ).fetchone()["total"]

    return [
        SeccionReporte(
            titulo="1. Resumen del periodo",
            headers=["Concepto", "Valor"],
            rows=[
                ["Pedidos en el periodo", str(len(transacciones))],
                ["Pedidos cobrados", str(sum(1 for r in transacciones if r["estado"] == "PAGADO"))],
                ["Ingresos cobrados", _dinero(cobrado)],
                ["Gastos registrados", _dinero(gastos)],
                ["Utilidad estimada", _dinero(cobrado - Decimal(gastos or 0))],
            ],
        ),
        SeccionReporte(
            titulo="2. Ventas por producto (volumen y recaudación)",
            headers=["Producto", "Categoría", "Stock actual", "Cantidad vendida", "Total recaudado"],
            rows=[
                [r["nombre_producto"], r["categoria"], str(r["stock_actual"]),
                 str(r["cantidad_vendida"]), _dinero(r["total_recaudado"])]
                for r in productos
            ],
        ),
        SeccionReporte(
            titulo="3. Detalle de transacciones",
            headers=["ID", "Folio", "Mesa", "Mesero", "Método", "Total", "Fecha", "Estado"],
            rows=[
                [str(r["pedido_id"]), r["folio"], str(r["mesa"]), r["mesero"], r["metodo"],
                 _dinero(r["total"]), r["fecha"], r["estado"]]
                for r in transacciones
            ],
        ),
    ]


def _reporte_usuarios(connection, categoria, estado, cat_libre, est_libre) -> list[SeccionReporte]:
    mapa_roles = {
        "ADMINISTRADOR": "administrador", "MESERO": "mesero",
        "COCINA": "cocina", "CAJERO": "caja", "CAJA": "caja",
    }
    condiciones: list[str] = []
    params: list = []

    if not est_libre:
        etiqueta = estado.capitalize()
        if etiqueta == "Activo":
            condiciones.append("activo AND NOT eliminado")
        elif etiqueta == "Inactivo":
            condiciones.append("NOT activo AND NOT eliminado")
        elif etiqueta == "Eliminado":
            condiciones.append("eliminado")
    if not cat_libre:
        clave = mapa_roles.get(categoria.upper())
        if clave:
            condiciones.append("%s = ANY(roles)")
            params.append(clave)

    where = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    registros = connection.execute(
        f"""
        SELECT nombre, usuario, activo, eliminado,
               array_to_string(roles_nombre, ', ') AS roles,
               to_char(creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD') AS fecha_registro,
               COALESCE(to_char(ultimo_acceso AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI'), 'Nunca') AS ultimo_acceso
        FROM terracota.vista_usuarios
        {where}
        ORDER BY nombre
        """,
        params,
    ).fetchall()

    grupos = {"Activos": [], "Inactivos": [], "Dados de baja": []}
    for r in registros:
        destino = "Dados de baja" if r["eliminado"] else ("Activos" if r["activo"] else "Inactivos")
        grupos[destino].append(r)

    headers = ["Nombre", "Usuario", "Estado", "Roles", "Registro", "Último acceso"]
    secciones: list[SeccionReporte] = []
    for indice, (titulo, filas) in enumerate(grupos.items(), start=1):
        if not filas:
            continue
        etiqueta = {"Activos": "Activo", "Inactivos": "Inactivo", "Dados de baja": "Baja"}[titulo]
        secciones.append(SeccionReporte(
            titulo=f"{indice}. Usuarios {titulo.lower()}",
            headers=headers,
            rows=[[r["nombre"], r["usuario"], etiqueta, r["roles"] or "Sin rol",
                   r["fecha_registro"], r["ultimo_acceso"]] for r in filas],
        ))
    if not secciones:
        secciones.append(SeccionReporte(
            titulo="Sin resultados", headers=headers,
            rows=[["-", "-", "-", "-", "-", "-"]],
        ))
    return secciones


def _reporte_inventario(connection, categoria, estado, cat_libre, est_libre) -> list[SeccionReporte]:
    mapa_estado = {
        "DISPONIBLE": "DISPONIBLE", "BAJO": "BAJO", "URGENTE": "AGOTADO", "AGOTADO": "AGOTADO",
        "NO DISPONIBLE": "NO_DISPONIBLE", "NO_DISPONIBLE": "NO_DISPONIBLE", "ELIMINADO": "ELIMINADO",
    }
    condiciones: list[str] = []
    params: list = []

    if not cat_libre:
        condiciones.append("(upper(categoria) = upper(%s) OR upper(categoria_clave) = upper(%s))")
        params.extend([categoria, categoria])
    if not est_libre:
        clave = mapa_estado.get(estado.upper())
        if clave:
            condiciones.append("estado = %s")
            params.append(clave)

    where = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    registros = connection.execute(
        f"SELECT * FROM terracota.vista_inventario {where} ORDER BY categoria, nombre",
        params,
    ).fetchall()

    etiquetas = {
        "DISPONIBLE": "Disponible", "BAJO": "Bajo stock", "AGOTADO": "Agotado",
        "NO_DISPONIBLE": "No disponible", "ELIMINADO": "Dado de baja",
    }
    grupos: dict[str, list] = {"En venta": [], "Fuera de venta": [], "Dados de baja": []}
    for r in registros:
        if r["eliminado"]:
            grupos["Dados de baja"].append(r)
        elif r["disponible"]:
            grupos["En venta"].append(r)
        else:
            grupos["Fuera de venta"].append(r)

    headers = ["Producto", "Categoría", "Stock actual", "Stock mínimo", "Precio", "Estado"]
    secciones: list[SeccionReporte] = []
    for indice, (titulo, filas) in enumerate(grupos.items(), start=1):
        if not filas:
            continue
        secciones.append(SeccionReporte(
            titulo=f"{indice}. Productos {titulo.lower()}",
            headers=headers,
            rows=[[r["nombre"], r["categoria"], str(r["stock_actual"]), str(r["stock_minimo"]),
                   _dinero(r["precio"]), etiquetas.get(r["estado"], r["estado"])] for r in filas],
        ))
    if not secciones:
        secciones.append(SeccionReporte(
            titulo="Sin resultados", headers=headers,
            rows=[["-", "-", "-", "-", "-", "-"]],
        ))
    return secciones
