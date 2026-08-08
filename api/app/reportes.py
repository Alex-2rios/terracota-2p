"""Generación de reportes.

Cada reporte devuelve secciones ya armadas (título, encabezados y filas de
texto). La API produce los datos; el cliente sólo los pinta o los convierte a
PDF/XLSX. Así cualquier consumidor obtiene exactamente el mismo reporte.

Cubre todo lo que el sistema registra: lo que hace la app móvil (pedidos de
mesero, menú y suministros de cocina, cobros de caja) y lo que hace el panel
web (usuarios, inventario, gastos).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Callable, Optional

from psycopg import Connection

from .schemas import Reporte, SeccionReporte

TZ = "America/Mexico_City"

# Un pedido cuenta como venta real salvo que se haya cancelado.
NO_CANCELADO = "p.estado <> 'CANCELADO'"


@dataclass(frozen=True)
class Filtros:
    """Filtros que llegan del cliente. Cada reporte usa los que le sirven."""

    fecha_inicio: date
    fecha_fin: date
    categoria: Optional[str] = None
    estado: Optional[str] = None
    mesa: Optional[int] = None
    usuario: Optional[str] = None
    metodo: Optional[str] = None

    @staticmethod
    def _libre(valor: Optional[str], comodines: tuple[str, ...]) -> bool:
        return not valor or valor.strip().lower() in comodines

    @property
    def sin_categoria(self) -> bool:
        return self._libre(self.categoria, (
            "", "todos", "todas", "todos los productos", "todos los roles",
            "todas las categorias", "todas las categorías", "inventario general",
        ))

    @property
    def sin_estado(self) -> bool:
        return self._libre(self.estado, ("", "todos", "todas"))

    @property
    def sin_usuario(self) -> bool:
        return self._libre(self.usuario, ("", "todos", "todas"))

    @property
    def sin_metodo(self) -> bool:
        return self._libre(self.metodo, ("", "todos", "todas"))


@dataclass
class Constructor:
    """Acumula condiciones SQL y sus parámetros en el orden correcto."""

    condiciones: list[str] = field(default_factory=list)
    parametros: list = field(default_factory=list)

    def agregar(self, condicion: str, *valores) -> None:
        self.condiciones.append(condicion)
        self.parametros.extend(valores)

    @property
    def where(self) -> str:
        return f"WHERE {' AND '.join(self.condiciones)}" if self.condiciones else ""


# ------------------------------------------------------------------ formato
def dinero(valor) -> str:
    return f"${Decimal(str(valor or 0)):,.2f}"


def entero(valor) -> str:
    return f"{int(valor or 0):,}"


def porcentaje(parte, total) -> str:
    total = Decimal(str(total or 0))
    if total == 0:
        return "0%"
    return f"{Decimal(str(parte or 0)) / total * 100:.1f}%"


def _sin_datos(headers: list[str]) -> SeccionReporte:
    return SeccionReporte(
        titulo="Sin resultados para los filtros seleccionados",
        headers=headers,
        rows=[["—"] * len(headers)],
    )


def _seccion(titulo: str, headers: list[str], filas: list[list[str]]) -> SeccionReporte:
    return SeccionReporte(titulo=titulo, headers=headers, rows=filas or [["—"] * len(headers)])


# ================================================================== ventas
def reporte_ventas(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    c = Constructor()
    c.agregar(f"(p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s", f.fecha_inicio, f.fecha_fin)
    if not f.sin_estado:
        estado = "PAGADO" if f.estado.strip().upper() == "COMPLETADO" else f.estado.strip().upper()
        c.agregar("p.estado = %s", estado)
    if not f.sin_categoria:
        c.agregar("""EXISTS (
            SELECT 1 FROM terracota.pedido_detalles pd2
            JOIN terracota.productos pr2 ON pr2.id = pd2.producto_id
            JOIN terracota.categorias c2 ON c2.id = pr2.categoria_id
            WHERE pd2.pedido_id = p.id AND upper(c2.nombre) = upper(%s))""", f.categoria)
    if f.mesa:
        c.agregar("m.numero = %s", f.mesa)
    if not f.sin_usuario:
        c.agregar("u.nombre = %s", f.usuario)

    transacciones = cx.execute(f"""
        SELECT p.id, COALESCE(t.folio, '—') AS folio, m.numero AS mesa, u.nombre AS mesero,
               COALESCE(pg.metodo, '—') AS metodo, p.subtotal, p.impuesto, p.total, p.estado,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS fecha
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        LEFT JOIN terracota.pagos pg ON pg.pedido_id = p.id
        LEFT JOIN terracota.tickets t ON t.pago_id = pg.id
        {c.where}
        ORDER BY p.creado_en DESC
    """, c.parametros).fetchall()

    cobrado = sum(Decimal(str(r["total"])) for r in transacciones if r["estado"] == "PAGADO")
    impuestos = sum(Decimal(str(r["impuesto"])) for r in transacciones if r["estado"] == "PAGADO")
    gastos = cx.execute(
        "SELECT COALESCE(sum(monto), 0) AS total FROM terracota.gastos WHERE fecha BETWEEN %s AND %s",
        (f.fecha_inicio, f.fecha_fin),
    ).fetchone()["total"]
    pagados = [r for r in transacciones if r["estado"] == "PAGADO"]

    por_metodo = cx.execute(f"""
        SELECT pg.metodo, count(*)::integer AS operaciones, sum(pg.total) AS total
        FROM terracota.pagos pg
        WHERE (pg.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY pg.metodo ORDER BY total DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()
    total_metodos = sum(Decimal(str(r["total"])) for r in por_metodo)

    por_dia = cx.execute("""
        SELECT fecha, pagos, total, efectivo, tarjeta, transferencia
        FROM terracota.vista_ventas_diarias
        WHERE fecha BETWEEN %s AND %s ORDER BY fecha
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    secciones = [
        _seccion("1. Resumen del periodo", ["Concepto", "Valor"], [
            ["Pedidos registrados", entero(len(transacciones))],
            ["Pedidos cobrados", entero(len(pagados))],
            ["Pedidos cancelados", entero(sum(1 for r in transacciones if r["estado"] == "CANCELADO"))],
            ["Ingresos cobrados", dinero(cobrado)],
            ["IVA incluido", dinero(impuestos)],
            ["Gastos del periodo", dinero(gastos)],
            ["Utilidad estimada", dinero(cobrado - Decimal(str(gastos or 0)))],
            ["Ticket promedio", dinero(cobrado / len(pagados) if pagados else 0)],
        ]),
        _seccion("2. Ventas por día", ["Fecha", "Cobros", "Total", "Efectivo", "Tarjeta", "Transferencia"], [
            [str(r["fecha"]), entero(r["pagos"]), dinero(r["total"]),
             dinero(r["efectivo"]), dinero(r["tarjeta"]), dinero(r["transferencia"])]
            for r in por_dia
        ]),
        _seccion("3. Ventas por método de pago", ["Método", "Operaciones", "Total", "Participación"], [
            [r["metodo"], entero(r["operaciones"]), dinero(r["total"]), porcentaje(r["total"], total_metodos)]
            for r in por_metodo
        ]),
        _seccion("4. Detalle de transacciones",
                 ["ID", "Folio", "Mesa", "Mesero", "Método", "Subtotal", "IVA", "Total", "Fecha", "Estado"], [
            [str(r["id"]), r["folio"], str(r["mesa"]), r["mesero"], r["metodo"],
             dinero(r["subtotal"]), dinero(r["impuesto"]), dinero(r["total"]), r["fecha"], r["estado"]]
            for r in transacciones
        ]),
    ]
    return f"Reporte de Ventas ({f.fecha_inicio} a {f.fecha_fin})", secciones


# ================================================================= pedidos
def reporte_pedidos(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    c = Constructor()
    c.agregar(f"(p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s", f.fecha_inicio, f.fecha_fin)
    if not f.sin_estado:
        c.agregar("p.estado = %s", f.estado.strip().upper())
    if f.mesa:
        c.agregar("m.numero = %s", f.mesa)
    if not f.sin_usuario:
        c.agregar("u.nombre = %s", f.usuario)

    pedidos = cx.execute(f"""
        SELECT p.id, m.numero AS mesa, u.nombre AS mesero, p.estado, p.total, p.notas,
               COALESCE(sum(pd.cantidad), 0)::integer AS piezas,
               to_char(p.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS creado,
               COALESCE(to_char(p.entregado_en AT TIME ZONE '{TZ}', 'HH24:MI'), '—') AS entregado,
               COALESCE(to_char(p.cerrado_en AT TIME ZONE '{TZ}', 'HH24:MI'), '—') AS cerrado,
               COALESCE(round(extract(epoch FROM (p.entregado_en - p.creado_en)) / 60)::text, '—') AS minutos
        FROM terracota.pedidos p
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        LEFT JOIN terracota.pedido_detalles pd ON pd.pedido_id = p.id
        {c.where}
        GROUP BY p.id, m.numero, u.nombre
        ORDER BY p.creado_en DESC
    """, c.parametros).fetchall()

    por_estado = cx.execute(f"""
        SELECT p.estado, count(*)::integer AS cantidad, COALESCE(sum(p.total), 0) AS importe
        FROM terracota.pedidos p
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY p.estado ORDER BY cantidad DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    por_mesero = cx.execute(f"""
        SELECT u.nombre AS mesero, count(*)::integer AS pedidos,
               COALESCE(sum(p.total) FILTER (WHERE {NO_CANCELADO}), 0) AS importe
        FROM terracota.pedidos p
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY u.nombre ORDER BY importe DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    renglones = cx.execute(f"""
        SELECT p.id, pd.nombre_producto, pd.cantidad, pd.precio_unitario, pd.importe,
               COALESCE(pd.observacion, '—') AS observacion
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        ORDER BY p.id DESC, pd.id
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    secciones = [
        _seccion("1. Pedidos por estado", ["Estado", "Cantidad", "Importe"], [
            [r["estado"], entero(r["cantidad"]), dinero(r["importe"])] for r in por_estado
        ]),
        _seccion("2. Productividad por mesero", ["Mesero", "Pedidos", "Importe levantado"], [
            [r["mesero"], entero(r["pedidos"]), dinero(r["importe"])] for r in por_mesero
        ]),
        _seccion("3. Detalle de pedidos",
                 ["ID", "Mesa", "Mesero", "Piezas", "Total", "Creado", "Entregado", "Min.", "Estado", "Notas"], [
            [str(r["id"]), str(r["mesa"]), r["mesero"], entero(r["piezas"]), dinero(r["total"]),
             r["creado"], r["entregado"], r["minutos"], r["estado"], r["notas"] or "—"]
            for r in pedidos
        ]),
        _seccion("4. Renglones de cada pedido",
                 ["Pedido", "Producto", "Cantidad", "Precio", "Importe", "Observación"], [
            [str(r["id"]), r["nombre_producto"], entero(r["cantidad"]),
             dinero(r["precio_unitario"]), dinero(r["importe"]), r["observacion"]]
            for r in renglones
        ]),
    ]
    return f"Reporte de Pedidos ({f.fecha_inicio} a {f.fecha_fin})", secciones


# =============================================================== productos
def reporte_productos(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    c = Constructor()
    if not f.sin_categoria:
        c.agregar("(upper(categoria) = upper(%s) OR upper(categoria_clave) = upper(%s))",
                  f.categoria, f.categoria)
    if not f.sin_estado:
        c.agregar("estado = %s", f.estado.strip().upper().replace(" ", "_"))

    catalogo = cx.execute(f"""
        SELECT * FROM terracota.vista_inventario {c.where} ORDER BY categoria, nombre
    """, c.parametros).fetchall()

    desempeno = cx.execute(f"""
        SELECT pd.nombre_producto, cat.nombre AS categoria,
               sum(pd.cantidad)::integer AS piezas,
               sum(pd.importe) AS recaudado,
               count(DISTINCT p.id)::integer AS pedidos
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        JOIN terracota.productos pr ON pr.id = pd.producto_id
        JOIN terracota.categorias cat ON cat.id = pr.categoria_id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s AND {NO_CANCELADO}
        GROUP BY pd.nombre_producto, cat.nombre
        ORDER BY piezas DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    total_piezas = sum(r["piezas"] for r in desempeno)
    vendidos = {r["nombre_producto"] for r in desempeno}
    sin_venta = [r for r in catalogo if r["nombre"] not in vendidos and not r["eliminado"]]

    por_categoria = cx.execute(f"""
        SELECT cat.nombre AS categoria, count(DISTINCT pr.id)::integer AS productos,
               COALESCE(sum(pd.cantidad), 0)::integer AS piezas,
               COALESCE(sum(pd.importe), 0) AS recaudado
        FROM terracota.categorias cat
        LEFT JOIN terracota.productos pr ON pr.categoria_id = cat.id AND NOT pr.eliminado
        LEFT JOIN terracota.pedido_detalles pd ON pd.producto_id = pr.id
        LEFT JOIN terracota.pedidos p ON p.id = pd.pedido_id
            AND (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s AND {NO_CANCELADO}
        GROUP BY cat.nombre ORDER BY recaudado DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    etiquetas = {"DISPONIBLE": "Disponible", "BAJO": "Bajo stock", "AGOTADO": "Agotado",
                 "NO_DISPONIBLE": "Fuera del menú", "ELIMINADO": "Dado de baja"}

    secciones = [
        _seccion("1. Catálogo del menú",
                 ["Producto", "Clave", "Categoría", "Precio", "Stock", "Mínimo", "Estado"], [
            [r["nombre"], r["clave"], r["categoria"], dinero(r["precio"]),
             entero(r["stock_actual"]), entero(r["stock_minimo"]),
             etiquetas.get(r["estado"], r["estado"])]
            for r in catalogo
        ]),
        _seccion("2. Productos más vendidos",
                 ["Producto", "Categoría", "Piezas", "Pedidos", "Recaudado", "Participación"], [
            [r["nombre_producto"], r["categoria"], entero(r["piezas"]), entero(r["pedidos"]),
             dinero(r["recaudado"]), porcentaje(r["piezas"], total_piezas)]
            for r in desempeno
        ]),
        _seccion("3. Desempeño por categoría",
                 ["Categoría", "Productos", "Piezas vendidas", "Recaudado"], [
            [r["categoria"], entero(r["productos"]), entero(r["piezas"]), dinero(r["recaudado"])]
            for r in por_categoria
        ]),
        _seccion("4. Productos sin ventas en el periodo",
                 ["Producto", "Categoría", "Precio", "Stock", "Estado"], [
            [r["nombre"], r["categoria"], dinero(r["precio"]), entero(r["stock_actual"]),
             etiquetas.get(r["estado"], r["estado"])]
            for r in sin_venta
        ]),
    ]
    return f"Reporte de Productos ({f.fecha_inicio} a {f.fecha_fin})", secciones


# ============================================================== inventario
def reporte_inventario(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    mapa = {"DISPONIBLE": "DISPONIBLE", "BAJO": "BAJO", "URGENTE": "AGOTADO", "AGOTADO": "AGOTADO",
            "NO DISPONIBLE": "NO_DISPONIBLE", "NO_DISPONIBLE": "NO_DISPONIBLE", "ELIMINADO": "ELIMINADO"}
    c = Constructor()
    if not f.sin_categoria:
        c.agregar("(upper(categoria) = upper(%s) OR upper(categoria_clave) = upper(%s))",
                  f.categoria, f.categoria)
    if not f.sin_estado:
        clave = mapa.get(f.estado.strip().upper())
        if clave:
            c.agregar("estado = %s", clave)

    registros = cx.execute(
        f"SELECT * FROM terracota.vista_inventario {c.where} ORDER BY categoria, nombre",
        c.parametros).fetchall()

    valor_total = sum(Decimal(str(r["precio"])) * r["stock_actual"] for r in registros if not r["eliminado"])
    consumo = cx.execute(f"""
        SELECT pd.nombre_producto, sum(pd.cantidad)::integer AS consumido
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        WHERE (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s AND {NO_CANCELADO}
        GROUP BY pd.nombre_producto ORDER BY consumido DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    etiquetas = {"DISPONIBLE": "Disponible", "BAJO": "Bajo stock", "AGOTADO": "Agotado",
                 "NO_DISPONIBLE": "Fuera del menú", "ELIMINADO": "Dado de baja"}
    grupos: dict[str, list] = {"En venta": [], "Fuera del menú": [], "Dados de baja": []}
    for r in registros:
        destino = "Dados de baja" if r["eliminado"] else ("En venta" if r["disponible"] else "Fuera del menú")
        grupos[destino].append(r)

    alertas = [r for r in registros if not r["eliminado"] and r["estado"] in ("BAJO", "AGOTADO")]
    headers = ["Producto", "Categoría", "Stock", "Mínimo", "Precio", "Valor en stock", "Estado"]

    secciones = [
        _seccion("1. Resumen", ["Concepto", "Valor"], [
            ["Productos en catálogo", entero(len([r for r in registros if not r["eliminado"]]))],
            ["Con stock bajo o agotado", entero(len(alertas))],
            ["Valor total del inventario", dinero(valor_total)],
        ]),
        _seccion("2. Alertas de reposición", headers, [
            [r["nombre"], r["categoria"], entero(r["stock_actual"]), entero(r["stock_minimo"]),
             dinero(r["precio"]), dinero(Decimal(str(r["precio"])) * r["stock_actual"]),
             etiquetas.get(r["estado"], r["estado"])]
            for r in alertas
        ]),
    ]
    for indice, (titulo, filas) in enumerate(grupos.items(), start=3):
        if filas:
            secciones.append(_seccion(f"{indice}. Productos {titulo.lower()}", headers, [
                [r["nombre"], r["categoria"], entero(r["stock_actual"]), entero(r["stock_minimo"]),
                 dinero(r["precio"]), dinero(Decimal(str(r["precio"])) * r["stock_actual"]),
                 etiquetas.get(r["estado"], r["estado"])]
                for r in filas
            ]))
    secciones.append(_seccion("Consumo del periodo", ["Producto", "Piezas consumidas"], [
        [r["nombre_producto"], entero(r["consumido"])] for r in consumo
    ]))
    return "Reporte de Inventario y Existencias", secciones


# ================================================================= tickets
def reporte_tickets(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    c = Constructor()
    c.agregar(f"(t.emitido_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s", f.fecha_inicio, f.fecha_fin)
    if not f.sin_metodo:
        c.agregar("pg.metodo = %s", f.metodo.strip().upper())
    if not f.sin_usuario:
        c.agregar("cj.nombre = %s", f.usuario)

    tickets = cx.execute(f"""
        SELECT t.folio, m.numero AS mesa, cj.nombre AS cajero, pg.metodo, pg.total,
               pg.monto_recibido, pg.cambio, COALESCE(pg.referencia, '—') AS referencia,
               p.id AS pedido_id,
               to_char(t.emitido_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS emitido
        FROM terracota.tickets t
        JOIN terracota.pagos pg ON pg.id = t.pago_id
        JOIN terracota.pedidos p ON p.id = pg.pedido_id
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios cj ON cj.id = pg.cajero_id
        {c.where}
        ORDER BY t.emitido_en DESC
    """, c.parametros).fetchall()

    por_cajero = cx.execute(f"""
        SELECT cj.nombre AS cajero, count(*)::integer AS cobros, sum(pg.total) AS total,
               sum(pg.cambio) AS cambio
        FROM terracota.pagos pg
        JOIN terracota.usuarios cj ON cj.id = pg.cajero_id
        WHERE (pg.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY cj.nombre ORDER BY total DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    total = sum(Decimal(str(r["total"])) for r in tickets)
    efectivo = sum(Decimal(str(r["total"])) for r in tickets if r["metodo"] == "EFECTIVO")
    cambio = sum(Decimal(str(r["cambio"])) for r in tickets)

    secciones = [
        _seccion("1. Corte del periodo", ["Concepto", "Valor"], [
            ["Tickets emitidos", entero(len(tickets))],
            ["Total cobrado", dinero(total)],
            ["Cobrado en efectivo", dinero(efectivo)],
            ["Cambio entregado", dinero(cambio)],
            ["Efectivo neto en caja", dinero(efectivo - cambio)],
        ]),
        _seccion("2. Cobros por cajero", ["Cajero", "Cobros", "Total", "Cambio entregado"], [
            [r["cajero"], entero(r["cobros"]), dinero(r["total"]), dinero(r["cambio"])]
            for r in por_cajero
        ]),
        _seccion("3. Tickets emitidos",
                 ["Folio", "Pedido", "Mesa", "Cajero", "Método", "Total", "Recibido", "Cambio",
                  "Referencia", "Emitido"], [
            [r["folio"], str(r["pedido_id"]), str(r["mesa"]), r["cajero"], r["metodo"],
             dinero(r["total"]), dinero(r["monto_recibido"]), dinero(r["cambio"]),
             r["referencia"], r["emitido"]]
            for r in tickets
        ]),
    ]
    return f"Reporte de Tickets y Cobros ({f.fecha_inicio} a {f.fecha_fin})", secciones


# ================================================================== gastos
def reporte_gastos(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    gastos = cx.execute("""
        SELECT g.fecha, g.concepto, g.monto, COALESCE(u.nombre, '—') AS registrado_por
        FROM terracota.gastos g
        LEFT JOIN terracota.usuarios u ON u.id = g.registrado_por
        WHERE g.fecha BETWEEN %s AND %s
        ORDER BY g.fecha DESC, g.id DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    por_dia = cx.execute("""
        SELECT fecha, count(*)::integer AS movimientos, sum(monto) AS total
        FROM terracota.gastos WHERE fecha BETWEEN %s AND %s
        GROUP BY fecha ORDER BY fecha
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    ingresos = cx.execute("""
        SELECT COALESCE(sum(total), 0) AS total FROM terracota.vista_ventas_diarias
        WHERE fecha BETWEEN %s AND %s
    """, (f.fecha_inicio, f.fecha_fin)).fetchone()["total"]

    total = sum(Decimal(str(r["monto"])) for r in gastos)
    ingresos = Decimal(str(ingresos or 0))

    secciones = [
        _seccion("1. Balance del periodo", ["Concepto", "Valor"], [
            ["Ingresos cobrados", dinero(ingresos)],
            ["Gastos registrados", dinero(total)],
            ["Resultado", dinero(ingresos - total)],
            ["Gastos sobre ingresos", porcentaje(total, ingresos)],
        ]),
        _seccion("2. Gastos por día", ["Fecha", "Movimientos", "Total"], [
            [str(r["fecha"]), entero(r["movimientos"]), dinero(r["total"])] for r in por_dia
        ]),
        _seccion("3. Detalle de gastos", ["Fecha", "Concepto", "Monto", "Registrado por"], [
            [str(r["fecha"]), r["concepto"], dinero(r["monto"]), r["registrado_por"]] for r in gastos
        ]),
    ]
    return f"Reporte de Gastos ({f.fecha_inicio} a {f.fecha_fin})", secciones


# ================================================================ usuarios
def reporte_usuarios(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    mapa_roles = {"ADMINISTRADOR": "administrador", "MESERO": "mesero",
                  "COCINA": "cocina", "CAJERO": "caja", "CAJA": "caja"}
    c = Constructor()
    if not f.sin_estado:
        etiqueta = f.estado.strip().capitalize()
        if etiqueta == "Activo":
            c.agregar("activo AND NOT eliminado")
        elif etiqueta == "Inactivo":
            c.agregar("NOT activo AND NOT eliminado")
        elif etiqueta == "Eliminado":
            c.agregar("eliminado")
    if not f.sin_categoria:
        clave = mapa_roles.get(f.categoria.strip().upper())
        if clave:
            c.agregar("%s = ANY(roles)", clave)

    registros = cx.execute(f"""
        SELECT nombre, usuario, activo, eliminado,
               array_to_string(roles_nombre, ', ') AS roles,
               to_char(creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD') AS alta,
               COALESCE(to_char(ultimo_acceso AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI'), 'Nunca') AS ultimo_acceso
        FROM terracota.vista_usuarios {c.where} ORDER BY nombre
    """, c.parametros).fetchall()

    actividad = cx.execute(f"""
        SELECT u.nombre,
               count(DISTINCT p.id)::integer AS pedidos,
               count(DISTINCT pg.id)::integer AS cobros,
               count(DISTINCT h.id)::integer AS cambios_estado
        FROM terracota.usuarios u
        LEFT JOIN terracota.pedidos p ON p.mesero_id = u.id
            AND (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        LEFT JOIN terracota.pagos pg ON pg.cajero_id = u.id
            AND (pg.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        LEFT JOIN terracota.pedido_estados_historial h ON h.usuario_id = u.id
            AND (h.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        WHERE NOT u.eliminado
        GROUP BY u.nombre ORDER BY pedidos DESC, cobros DESC
    """, (f.fecha_inicio, f.fecha_fin) * 3).fetchall()

    por_rol = cx.execute("""
        SELECT r.nombre AS rol, count(ur.usuario_id)::integer AS usuarios
        FROM terracota.roles r
        LEFT JOIN terracota.usuario_roles ur ON ur.rol_id = r.id
        LEFT JOIN terracota.usuarios u ON u.id = ur.usuario_id AND NOT u.eliminado
        GROUP BY r.nombre ORDER BY r.nombre
    """).fetchall()

    grupos = {"Activos": [], "Inactivos": [], "Dados de baja": []}
    for r in registros:
        destino = "Dados de baja" if r["eliminado"] else ("Activos" if r["activo"] else "Inactivos")
        grupos[destino].append(r)

    headers = ["Nombre", "Usuario", "Estado", "Roles", "Alta", "Último acceso"]
    etiqueta_estado = {"Activos": "Activo", "Inactivos": "Inactivo", "Dados de baja": "Baja"}

    secciones = [
        _seccion("1. Usuarios por rol", ["Rol", "Usuarios"], [
            [r["rol"], entero(r["usuarios"])] for r in por_rol
        ]),
        _seccion("2. Actividad del personal en el periodo",
                 ["Usuario", "Pedidos levantados", "Cobros", "Cambios de estado"], [
            [r["nombre"], entero(r["pedidos"]), entero(r["cobros"]), entero(r["cambios_estado"])]
            for r in actividad
        ]),
    ]
    for indice, (titulo, filas) in enumerate(grupos.items(), start=3):
        if filas:
            secciones.append(_seccion(f"{indice}. Usuarios {titulo.lower()}", headers, [
                [r["nombre"], r["usuario"], etiqueta_estado[titulo], r["roles"] or "Sin rol",
                 r["alta"], r["ultimo_acceso"]]
                for r in filas
            ]))
    return "Reporte de Usuarios del Sistema", secciones


# =================================================================== mesas
def reporte_mesas(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    estado_actual = cx.execute("""
        SELECT numero, capacidad, estado, activa FROM terracota.mesas ORDER BY numero
    """).fetchall()

    uso = cx.execute(f"""
        SELECT m.numero, count(p.id)::integer AS pedidos,
               COALESCE(sum(p.total) FILTER (WHERE {NO_CANCELADO}), 0) AS importe,
               COALESCE(round(avg(p.total) FILTER (WHERE {NO_CANCELADO}), 2), 0) AS promedio
        FROM terracota.mesas m
        LEFT JOIN terracota.pedidos p ON p.mesa_id = m.id
            AND (p.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY m.numero ORDER BY importe DESC
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    total = sum(Decimal(str(r["importe"])) for r in uso)

    secciones = [
        _seccion("1. Estado actual de las mesas", ["Mesa", "Capacidad", "Estado", "Activa"], [
            [str(r["numero"]), entero(r["capacidad"]), r["estado"], "Sí" if r["activa"] else "No"]
            for r in estado_actual
        ]),
        _seccion("2. Uso en el periodo",
                 ["Mesa", "Pedidos", "Importe", "Ticket promedio", "Participación"], [
            [str(r["numero"]), entero(r["pedidos"]), dinero(r["importe"]),
             dinero(r["promedio"]), porcentaje(r["importe"], total)]
            for r in uso
        ]),
    ]
    return f"Reporte de Mesas ({f.fecha_inicio} a {f.fecha_fin})", secciones


# =============================================================== auditoría
def reporte_auditoria(cx: Connection, f: Filtros) -> tuple[str, list[SeccionReporte]]:
    historial = cx.execute(f"""
        SELECT p.id AS pedido, h.estado_anterior, h.estado_nuevo,
               COALESCE(u.nombre, 'Sistema') AS usuario, COALESCE(h.comentario, '—') AS comentario,
               to_char(h.creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS momento
        FROM terracota.pedido_estados_historial h
        JOIN terracota.pedidos p ON p.id = h.pedido_id
        LEFT JOIN terracota.usuarios u ON u.id = h.usuario_id
        WHERE (h.creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        ORDER BY h.id DESC
        LIMIT 500
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    cambios = cx.execute(f"""
        SELECT tabla, accion, count(*)::integer AS veces
        FROM terracota.auditoria
        WHERE (creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        GROUP BY tabla, accion ORDER BY tabla, accion
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    detalle = cx.execute(f"""
        SELECT tabla, registro_id, accion, usuario_bd,
               to_char(creado_en AT TIME ZONE '{TZ}', 'YYYY-MM-DD HH24:MI') AS momento
        FROM terracota.auditoria
        WHERE (creado_en AT TIME ZONE '{TZ}')::date BETWEEN %s AND %s
        ORDER BY id DESC LIMIT 300
    """, (f.fecha_inicio, f.fecha_fin)).fetchall()

    secciones = [
        _seccion("1. Movimientos por tabla", ["Tabla", "Acción", "Veces"], [
            [r["tabla"], r["accion"], entero(r["veces"])] for r in cambios
        ]),
        _seccion("2. Historial de estados de pedidos",
                 ["Pedido", "De", "A", "Usuario", "Comentario", "Momento"], [
            [str(r["pedido"]), r["estado_anterior"] or "ALTA", r["estado_nuevo"],
             r["usuario"], r["comentario"], r["momento"]]
            for r in historial
        ]),
        _seccion("3. Bitácora de cambios (últimos 300)",
                 ["Tabla", "Registro", "Acción", "Usuario BD", "Momento"], [
            [r["tabla"], str(r["registro_id"]), r["accion"], r["usuario_bd"], r["momento"]]
            for r in detalle
        ]),
    ]
    return f"Reporte de Auditoría ({f.fecha_inicio} a {f.fecha_fin})", secciones


# ================================================================ registro
TIPOS: dict[str, Callable[[Connection, Filtros], tuple[str, list[SeccionReporte]]]] = {
    "ventas": reporte_ventas,
    "pedidos": reporte_pedidos,
    "productos": reporte_productos,
    "inventario": reporte_inventario,
    "tickets": reporte_tickets,
    "gastos": reporte_gastos,
    "usuarios": reporte_usuarios,
    "mesas": reporte_mesas,
    "auditoria": reporte_auditoria,
}


def construir(cx: Connection, tipo: str, filtros: Filtros) -> Reporte:
    titulo, secciones = TIPOS[tipo](cx, filtros)
    return Reporte(
        titulo=titulo,
        generado_en=datetime.now().strftime("%Y-%m-%d %H:%M"),
        secciones=secciones or [_sin_datos(["Sin datos"])],
    )
