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


@router.delete("/productos/{product_id}", summary="Dar de Baja un Producto")
def delete_product(
    product_id: int,
    _: CurrentUser = Depends(inventario_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Baja lógica: el producto desaparece del menú pero los pedidos históricos
    y los reportes siguen mostrándolo."""
    producto = get_producto(connection, product_id)

    activos = connection.execute(
        """
        SELECT count(*)::integer AS total
        FROM terracota.pedido_detalles pd
        JOIN terracota.pedidos p ON p.id = pd.pedido_id
        WHERE pd.producto_id = %s
          AND p.estado IN ('PENDIENTE', 'PREPARANDO', 'LISTO', 'ENTREGADO')
        """,
        (product_id,),
    ).fetchone()["total"]

    if activos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"'{producto['nombre']}' está en {activos} pedido(s) en curso. "
                "Termina o cancela esos pedidos antes de darlo de baja."
            ),
        )

    connection.execute(
        "UPDATE terracota.productos SET eliminado = true, disponible = false WHERE id = %s",
        (product_id,),
    )
    return {"status": "ok", "mensaje": f"'{producto['nombre']}' se dio de baja del menú."}


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
