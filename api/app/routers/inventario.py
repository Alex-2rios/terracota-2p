from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection

from ..database import get_connection
from ..dependencies import CurrentUser, require_roles
from ..queries import get_categoria_id, get_producto, slugify
from ..schemas import ProductoCreate, ProductoUpdate, SuministroUpdate


router = APIRouter(prefix="/inventario", tags=["Inventario"])

# Cocina administra el menú y las existencias; el administrador también entra
# (require_roles siempre agrega `administrador`). Es el mismo recurso para la
# app móvil y para el panel web: una sola regla de negocio, un solo endpoint.
inventario_required = require_roles("cocina")

ESTADOS_INVENTARIO = ("DISPONIBLE", "BAJO", "AGOTADO", "NO_DISPONIBLE", "ELIMINADO")


@router.get("/productos", summary="Listar Inventario")
def list_products(
    categoria: Optional[str] = Query(default=None, description="Clave o nombre de la categoría"),
    estado: Optional[str] = Query(default=None, description=f"Uno de: {', '.join(ESTADOS_INVENTARIO)}"),
    buscar: Optional[str] = None,
    incluir_eliminados: bool = False,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    condiciones: list[str] = []
    parametros: list = []

    if not incluir_eliminados:
        condiciones.append("NOT eliminado")
    if categoria and categoria.strip().lower() not in {"todos", "todas", ""}:
        condiciones.append("(upper(categoria_clave) = upper(%s) OR upper(categoria) = upper(%s))")
        parametros.extend([categoria.strip(), categoria.strip()])
    if estado and estado.strip().upper() not in {"TODOS", ""}:
        normalizado = estado.strip().upper().replace(" ", "_")
        if normalizado not in ESTADOS_INVENTARIO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Estado inválido. Usa uno de: {', '.join(ESTADOS_INVENTARIO)}.",
            )
        condiciones.append("estado = %s")
        parametros.append(normalizado)
    if buscar and buscar.strip():
        condiciones.append("(nombre ILIKE %s OR clave ILIKE %s)")
        patron = f"%{buscar.strip()}%"
        parametros.extend([patron, patron])

    where = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    return connection.execute(
        f"""
        SELECT * FROM terracota.vista_inventario
        {where}
        ORDER BY categoria, nombre
        """,
        parametros,
    ).fetchall()


@router.get("/productos/{product_id}", summary="Ver Producto")
def get_product(
    product_id: int,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    return get_producto(connection, product_id, incluir_eliminados=True)


@router.post("/productos", status_code=status.HTTP_201_CREATED, summary="Crear Producto")
def create_product(
    payload: ProductoCreate,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    clave = slugify(payload.nombre)
    categoria_id = get_categoria_id(connection, payload.categoria)

    existente = connection.execute(
        "SELECT id, eliminado FROM terracota.productos WHERE clave = %s", (clave,)
    ).fetchone()
    if existente and not existente["eliminado"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un producto llamado '{payload.nombre}'.",
        )

    if existente:
        # Reactiva un producto que se había dado de baja, conservando su historial.
        creado = connection.execute(
            """
            UPDATE terracota.productos
               SET categoria_id = %s, nombre = %s, descripcion = %s, precio = %s,
                   stock_actual = %s, stock_minimo = %s, disponible = %s, eliminado = false
             WHERE id = %s
            RETURNING id
            """,
            (
                categoria_id, payload.nombre, payload.descripcion, payload.precio,
                payload.stock_actual, payload.stock_minimo, payload.disponible, existente["id"],
            ),
        ).fetchone()
    else:
        creado = connection.execute(
            """
            INSERT INTO terracota.productos
                (clave, categoria_id, nombre, descripcion, precio, stock_actual, stock_minimo, disponible)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                clave, categoria_id, payload.nombre, payload.descripcion, payload.precio,
                payload.stock_actual, payload.stock_minimo, payload.disponible,
            ),
        ).fetchone()

    return get_producto(connection, creado["id"], incluir_eliminados=True)


@router.patch("/productos/{product_id}", summary="Actualizar Producto")
def update_product(
    product_id: int,
    payload: ProductoUpdate,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    get_producto(connection, product_id)

    categoria_id = get_categoria_id(connection, payload.categoria) if payload.categoria else None

    connection.execute(
        """
        UPDATE terracota.productos
           SET nombre       = COALESCE(%s, nombre),
               categoria_id = COALESCE(%s, categoria_id),
               descripcion  = COALESCE(%s, descripcion),
               stock_actual = COALESCE(%s, stock_actual),
               stock_minimo = COALESCE(%s, stock_minimo),
               precio       = COALESCE(%s, precio),
               disponible   = COALESCE(%s, disponible)
         WHERE id = %s
        """,
        (
            payload.nombre, categoria_id, payload.descripcion, payload.stock_actual,
            payload.stock_minimo, payload.precio, payload.disponible, product_id,
        ),
    )
    return get_producto(connection, product_id)


@router.get("/productos/{product_id}/pedidos-activos", summary="Pedidos que Bloquean la Baja")
def blocking_orders(
    product_id: int,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    """Pedidos sin cerrar en los que aparece el producto."""
    get_producto(connection, product_id, incluir_eliminados=True)
    return connection.execute(
        """
        SELECT DISTINCT p.id, m.numero AS mesa, p.estado, u.nombre AS mesero
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        JOIN terracota.mesas m ON m.id = p.mesa_id
        JOIN terracota.usuarios u ON u.id = p.mesero_id
        WHERE pd.producto_id = %s
          AND p.estado IN ('PENDIENTE', 'PREPARANDO', 'LISTO', 'ENTREGADO')
        ORDER BY p.id
        """,
        (product_id,),
    ).fetchall()


@router.delete("/productos/{product_id}", summary="Dar de Baja un Producto")
def delete_product(
    product_id: int,
    user: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Baja lógica: el producto desaparece del menú, pero los pedidos históricos
    y los reportes lo siguen mostrando.

    No se permite si el producto está en un pedido sin cerrar: se quedaría un
    pedido en curso apuntando a algo que ya no existe en la carta. Hay que
    terminarlo (cobrarlo) o cancelarlo primero.
    """
    producto = get_producto(connection, product_id)
    bloqueantes = blocking_orders(product_id, user, connection)

    if bloqueantes:
        detalle = ", ".join(
            f"#{p['id']} (mesa {p['mesa']}, {p['estado']})" for p in bloqueantes[:5]
        )
        if len(bloqueantes) > 5:
            detalle += f" y {len(bloqueantes) - 5} más"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"No se puede dar de baja «{producto['nombre']}»: está en "
                f"{len(bloqueantes)} pedido(s) sin cerrar — {detalle}. "
                "Cobra o cancela esos pedidos y vuelve a intentarlo."
            ),
        )

    connection.execute(
        "UPDATE terracota.productos SET eliminado = true, disponible = false WHERE id = %s",
        (product_id,),
    )
    return {"status": "ok", "mensaje": f"«{producto['nombre']}» se dio de baja del menú."}


@router.patch("/productos/{product_id}/suministro", summary="Ajustar Existencias")
def update_supply(
    product_id: int,
    payload: SuministroUpdate,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Atajo para cocina: sólo toca stock, sin exponer precio ni categoría."""
    get_producto(connection, product_id)
    connection.execute(
        """
        UPDATE terracota.productos
           SET stock_actual = %s,
               stock_minimo = COALESCE(%s, stock_minimo)
         WHERE id = %s
        """,
        (payload.stock_actual, payload.stock_minimo, product_id),
    )
    return get_producto(connection, product_id)


@router.get("/alertas", summary="Productos con Stock Bajo")
def low_stock(
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    return connection.execute(
        """
        SELECT * FROM terracota.vista_inventario
        WHERE NOT eliminado AND estado IN ('BAJO', 'AGOTADO')
        ORDER BY stock_actual, nombre
        """
    ).fetchall()
