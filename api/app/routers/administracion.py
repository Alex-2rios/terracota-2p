from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from .. import reportes
from ..database import get_connection
from ..dependencies import CurrentUser, require_roles
from ..queries import asignar_roles, get_usuario, usuario_disponible, validar_roles
from ..schemas import (
    ESTADOS_PEDIDO,
    CancelarPedido,
    GastoCreate,
    Reporte,
    UsuarioCreate,
    UsuarioUpdate,
)

router = APIRouter(prefix="/administracion", tags=["Administración"])
admin_required = require_roles("administrador")

TZ = "America/Mexico_City"

def _rango(fecha_inicio: Optional[date], fecha_fin: Optional[date]) -> tuple[date, date]:
    fin = fecha_fin or date.today()
    inicio = fecha_inicio or fin.replace(day=1)
    if inicio > fin:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La fecha de inicio no puede ser posterior a la fecha final.",
        )
    return inicio, fin

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

CATALOGO_REPORTES = [
    {
        "clave": "ventas", "nombre": "Ventas",
        "descripcion": "Resumen del periodo, ventas por día, por método de pago y detalle de transacciones.",
        "filtros": ["fechas", "categoria", "estado_pedido", "mesa", "mesero"],
        "formato_sugerido": "pdf",
    },
    {
        "clave": "pedidos", "nombre": "Pedidos",
        "descripcion": "Pedidos por estado, productividad por mesero, tiempos de entrega y renglones de cada pedido.",
        "filtros": ["fechas", "estado_pedido", "mesa", "mesero"],
        "formato_sugerido": "pdf",
    },
    {
        "clave": "productos", "nombre": "Productos",
        "descripcion": "Catálogo del menú, ranking de más vendidos, desempeño por categoría y productos sin ventas.",
        "filtros": ["fechas", "categoria", "estado_inventario"],
        "formato_sugerido": "xlsx",
    },
    {
        "clave": "inventario", "nombre": "Inventario",
        "descripcion": "Existencias, alertas de reposición, valor del inventario y consumo del periodo.",
        "filtros": ["fechas", "categoria", "estado_inventario"],
        "formato_sugerido": "xlsx",
    },
    {
        "clave": "tickets", "nombre": "Tickets y cobros",
        "descripcion": "Corte de caja, cobros por cajero y detalle de cada ticket emitido.",
        "filtros": ["fechas", "metodo_pago", "cajero"],
        "formato_sugerido": "pdf",
    },
    {
        "clave": "gastos", "nombre": "Gastos",
        "descripcion": "Balance de ingresos contra egresos, gastos por día y detalle de cada movimiento.",
        "filtros": ["fechas"],
        "formato_sugerido": "xlsx",
    },
    {
        "clave": "usuarios", "nombre": "Usuarios",
        "descripcion": "Personal por rol, actividad en el periodo y agrupación por estado de la cuenta.",
        "filtros": ["fechas", "rol", "estado_usuario"],
        "formato_sugerido": "pdf",
    },
    {
        "clave": "mesas", "nombre": "Mesas",
        "descripcion": "Estado actual de cada mesa y su uso en el periodo (pedidos, importe y ticket promedio).",
        "filtros": ["fechas"],
        "formato_sugerido": "pdf",
    },
    {
        "clave": "auditoria", "nombre": "Auditoría",
        "descripcion": "Historial de cambios de estado de los pedidos y bitácora de movimientos del sistema.",
        "filtros": ["fechas"],
        "formato_sugerido": "pdf",
    },
]

@router.get("/reportes/opciones", summary="Catálogo de Reportes y sus Filtros")
def report_options(
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Todo lo que el formulario de reportes necesita, en una sola llamada.

    El panel web construye la pantalla a partir de esto, así que agregar un
    reporte nuevo aquí lo hace aparecer en la web sin tocar el frontend.
    """
    categorias = connection.execute(
        "SELECT nombre FROM terracota.categorias WHERE activo ORDER BY orden, nombre"
    ).fetchall()
    meseros = connection.execute(
        """
        SELECT DISTINCT u.nombre FROM terracota.usuarios u
        JOIN terracota.usuario_roles ur ON ur.usuario_id = u.id
        JOIN terracota.roles r ON r.id = ur.rol_id
        WHERE r.clave IN ('mesero', 'administrador') AND NOT u.eliminado
        ORDER BY u.nombre
        """
    ).fetchall()
    cajeros = connection.execute(
        """
        SELECT DISTINCT u.nombre FROM terracota.usuarios u
        JOIN terracota.usuario_roles ur ON ur.usuario_id = u.id
        JOIN terracota.roles r ON r.id = ur.rol_id
        WHERE r.clave IN ('caja', 'administrador') AND NOT u.eliminado
        ORDER BY u.nombre
        """
    ).fetchall()
    mesas = connection.execute(
        "SELECT numero FROM terracota.mesas WHERE activa ORDER BY numero"
    ).fetchall()
    roles = connection.execute(
        "SELECT nombre FROM terracota.roles ORDER BY nombre"
    ).fetchall()

    return {
        "tipos": CATALOGO_REPORTES,
        "opciones": {
            "categoria": ["Todas"] + [r["nombre"] for r in categorias],
            "estado_pedido": ["Todos"] + list(ESTADOS_PEDIDO),
            "estado_inventario": ["Todos", "Disponible", "Bajo", "Agotado", "No disponible", "Eliminado"],
            "estado_usuario": ["Todos", "Activo", "Inactivo", "Eliminado"],
            "metodo_pago": ["Todos", "EFECTIVO", "TARJETA", "TRANSFERENCIA"],
            "mesa": ["Todas"] + [str(r["numero"]) for r in mesas],
            "mesero": ["Todos"] + [r["nombre"] for r in meseros],
            "cajero": ["Todos"] + [r["nombre"] for r in cajeros],
            "rol": ["Todos"] + [r["nombre"] for r in roles],
        },
    }

@router.get("/reportes", response_model=Reporte, summary="Generar Reporte")
def build_report(
    tipo: str = Query(description=f"Uno de: {', '.join(reportes.TIPOS)}"),
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    categoria: Optional[str] = Query(default=None, description="Categoría de producto o rol, según el reporte"),
    estado: Optional[str] = Query(default=None, description="Estado del pedido, del inventario o del usuario"),
    mesa: Optional[int] = None,
    usuario: Optional[str] = Query(default=None, description="Nombre del mesero o del cajero"),
    metodo: Optional[str] = Query(default=None, description="Método de pago"),
    _: CurrentUser = Depends(admin_required),
    connection: Connection = Depends(get_connection),
) -> Reporte:
    """Devuelve el reporte ya estructurado en secciones.

    La API arma los datos; el cliente sólo los convierte a PDF o XLSX, de modo
    que cualquier consumidor obtiene exactamente el mismo reporte.
    """
    clave = tipo.strip().lower()
    if clave not in reportes.TIPOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de reporte no reconocido. Usa uno de: {', '.join(reportes.TIPOS)}.",
        )

    inicio, fin = _rango(fecha_inicio, fecha_fin)
    filtros = reportes.Filtros(
        fecha_inicio=inicio, fecha_fin=fin, categoria=categoria,
        estado=estado, mesa=mesa, usuario=usuario, metodo=metodo,
    )
    return reportes.construir(connection, clave, filtros)
