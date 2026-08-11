from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from ..database import get_connection
from ..dependencies import CurrentUser, require_roles
from ..queries import get_order
from ..schemas import CambioEstado

router = APIRouter(prefix="/cocina", tags=["Cocina"])
cocina_required = require_roles("cocina")

ESTADOS_COCINA = ("PENDIENTE", "PREPARANDO", "LISTO")

SIGUIENTE_ESTADO = {"PENDIENTE": "PREPARANDO", "PREPARANDO": "LISTO"}

@router.get("/pedidos", summary="Listar Pedidos de Cocina")
def list_kitchen_orders(
    estado: Optional[str] = None,
    _: CurrentUser = Depends(cocina_required),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    normalizado = estado.strip().upper() if estado else None
    if normalizado and normalizado not in ESTADOS_COCINA:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Estado de cocina inválido. Usa uno de: {', '.join(ESTADOS_COCINA)}.",
        )
    return connection.execute(
        """
        SELECT * FROM terracota.vista_pedidos_operativos
        WHERE estado = ANY(%s)
          AND (%s::text IS NULL OR estado = %s)
        ORDER BY creado_en
        """,
        (list(ESTADOS_COCINA), normalizado, normalizado),
    ).fetchall()

@router.patch("/pedidos/{order_id}/estado", summary="Actualizar Estado de Pedido")
def update_order_status(
    order_id: int,
    payload: CambioEstado,
    user: CurrentUser = Depends(cocina_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    if payload.estado not in {"PREPARANDO", "LISTO"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cocina sólo puede usar PREPARANDO o LISTO.",
        )

    pedido = get_order(connection, order_id)
    esperado = SIGUIENTE_ESTADO.get(pedido["estado"])
    if esperado != payload.estado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"No se puede pasar de {pedido['estado']} a {payload.estado}."
                + (f" El siguiente paso es {esperado}." if esperado else "")
            ),
        )

    connection.execute(
        "SELECT id FROM terracota.cambiar_estado_pedido(%s, %s, %s, %s)",
        (order_id, payload.estado, user.id, payload.comentario),
    ).fetchone()
    return get_order(connection, order_id)

@router.get("/resumen", summary="Resumen del Tablero de Cocina")
def kitchen_summary(
    _: CurrentUser = Depends(cocina_required),
    connection: Connection = Depends(get_connection),
) -> dict:
    filas = connection.execute(
        """
        SELECT estado, count(*)::integer AS cantidad
        FROM terracota.pedidos
        WHERE estado = ANY(%s)
        GROUP BY estado
        """,
        (list(ESTADOS_COCINA),),
    ).fetchall()
    conteo = {fila["estado"]: fila["cantidad"] for fila in filas}
    return {estado: conteo.get(estado, 0) for estado in ESTADOS_COCINA}
