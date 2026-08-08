from fastapi import APIRouter, Depends
from psycopg import Connection

from ..database import get_connection
from ..dependencies import CurrentUser, get_current_user


router = APIRouter(prefix="/catalogos", tags=["Catálogos"])


@router.get("/mesas", summary="Listar Mesas")
def list_tables(
    _: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    return connection.execute(
        """
        SELECT numero AS id, numero, capacidad, estado
        FROM terracota.mesas
        WHERE activa
        ORDER BY numero
        """
    ).fetchall()


@router.get("/categorias", summary="Listar Categorías")
def list_categories(
    _: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    return connection.execute(
        """
        SELECT id, clave, nombre
        FROM terracota.categorias
        WHERE activo
        ORDER BY orden, nombre
        """
    ).fetchall()


@router.get("/productos", summary="Listar Productos del Menú")
def list_products(
    _: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    """Sólo lo que un mesero puede vender: disponible, no eliminado y con stock."""
    return connection.execute(
        """
        SELECT p.clave AS id, p.clave, p.nombre, c.clave AS categoria,
               c.nombre AS categoria_nombre, p.descripcion AS nota,
               p.precio, p.stock_actual, p.disponible
        FROM terracota.productos p
        JOIN terracota.categorias c ON c.id = p.categoria_id
        WHERE c.activo AND p.disponible AND NOT p.eliminado AND p.stock_actual > 0
        ORDER BY c.orden, p.nombre
        """
    ).fetchall()
