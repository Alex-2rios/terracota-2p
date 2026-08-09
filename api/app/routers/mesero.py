from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import Connection
from psycopg.types.json import Jsonb

from ..database import get_connection
from ..dependencies import CurrentUser, require_roles
from ..queries import get_order
from ..schemas import CambioEstado, PedidoCreate


router = APIRouter(prefix="/mesero", tags=["Mesero"])
mesero_required = require_roles("mesero")

ESTADOS_ACTIVOS = ("PENDIENTE", "PREPARANDO", "LISTO", "ENTREGADO")


@router.get("/pedidos", summary="Listar Mis Pedidos")
def list_my_orders(
    solo_activos: bool = False,
    limite: int = Query(default=50, ge=1, le=500),
    user: CurrentUser = Depends(mesero_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    """El mesero ve sus pedidos; el administrador ve los de todos.

    Se devuelven los más recientes y en cantidad limitada: la app los recarga
    cada pocos segundos, y sin tope acabaría bajando el historial completo (con
    todos sus renglones) en cada refresco. Para el histórico está el panel web.
    """
    condiciones = []
    parametros: list = []

    if not user.es_admin:
        condiciones.append("mesero_id = %s")
        parametros.append(user.id)
    if solo_activos:
        condiciones.append("estado = ANY(%s)")
        parametros.append(list(ESTADOS_ACTIVOS))

    where = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    parametros.append(limite)
    return connection.execute(
        f"""
        SELECT * FROM terracota.vista_pedidos_operativos
        {where}
        ORDER BY creado_en DESC
        LIMIT %s
        """,
        parametros,
    ).fetchall()


@router.post("/pedidos", status_code=status.HTTP_201_CREATED, summary="Crear Pedido")
def create_order(
    payload: PedidoCreate,
    user: CurrentUser = Depends(mesero_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Alta transaccional: valida mesa, stock y precios dentro de PostgreSQL."""
    items = [item.model_dump(exclude_none=True) for item in payload.items]
    creado = connection.execute(
        "SELECT id FROM terracota.crear_pedido(%s, %s, %s, %s)",
        (payload.mesa, user.id, Jsonb(items), payload.notas),
    ).fetchone()
    return get_order(connection, creado["id"])


@router.get("/pedidos/{order_id}", summary="Ver Detalle de Pedido")
def get_my_order(
    order_id: int,
    user: CurrentUser = Depends(mesero_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    pedido = get_order(connection, order_id)
    if pedido["mesero_id"] != user.id and not user.es_admin:
        raise HTTPException(status_code=403, detail="El pedido pertenece a otro mesero.")
    return pedido


@router.patch("/pedidos/{order_id}/entregar", summary="Entregar Pedido")
def deliver_order(
    order_id: int,
    payload: CambioEstado,
    user: CurrentUser = Depends(mesero_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    if payload.estado != "ENTREGADO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mesero únicamente puede marcar ENTREGADO.",
        )

    pedido = get_order(connection, order_id)
    if pedido["mesero_id"] != user.id and not user.es_admin:
        raise HTTPException(status_code=403, detail="El pedido pertenece a otro mesero.")
    if pedido["estado"] != "LISTO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Sólo se entrega un pedido en estado LISTO. Estado actual: {pedido['estado']}.",
        )

    connection.execute(
        "SELECT id FROM terracota.cambiar_estado_pedido(%s, 'ENTREGADO', %s, %s)",
        (order_id, user.id, payload.comentario),
    ).fetchone()
    return get_order(connection, order_id)
