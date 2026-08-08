from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException, status
from psycopg import Connection

HOY_MX = "(now() AT TIME ZONE 'America/Mexico_City')::date"
FECHA_LOCAL = "(%s AT TIME ZONE 'America/Mexico_City')::date"


def slugify(nombre: str) -> str:
    """Convierte 'Café Americano' en 'cafe-americano'.

    La restricción `productos_clave_formato` sólo acepta [a-z0-9-], así que hay
    que quitar acentos antes de reemplazar. Es la ÚNICA implementación del
    proyecto: la web ya no genera claves por su cuenta.
    """
    normalizado = unicodedata.normalize("NFKD", nombre)
    sin_acentos = "".join(c for c in normalizado if not unicodedata.combining(c))
    slug = re.sub(r"[^a-z0-9]+", "-", sin_acentos.lower()).strip("-")
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El nombre debe contener al menos una letra o número.",
        )
    return slug[:60]


def get_order(connection: Connection, order_id: int) -> dict:
    pedido = connection.execute(
        "SELECT * FROM terracota.vista_pedidos_operativos WHERE id = %s",
        (order_id,),
    ).fetchone()
    if pedido is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado.")
    return pedido


def get_categoria_id(connection: Connection, categoria: str) -> int:
    """Acepta la clave (`BEBIDAS`) o el nombre visible (`Bebidas`)."""
    registro = connection.execute(
        """
        SELECT id FROM terracota.categorias
        WHERE activo AND (upper(clave) = upper(%s) OR upper(nombre) = upper(%s))
        LIMIT 1
        """,
        (categoria.strip(), categoria.strip()),
    ).fetchone()
    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"La categoría '{categoria}' no existe.",
        )
    return registro["id"]


def get_producto(connection: Connection, producto_id: int, incluir_eliminados: bool = False) -> dict:
    filtro = "" if incluir_eliminados else " AND NOT eliminado"
    producto = connection.execute(
        f"SELECT * FROM terracota.vista_inventario WHERE id = %s{filtro}",
        (producto_id,),
    ).fetchone()
    if producto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado.")
    return producto


def get_usuario(connection: Connection, user_id: int) -> dict:
    usuario = connection.execute(
        "SELECT * FROM terracota.vista_usuarios WHERE id = %s",
        (user_id,),
    ).fetchone()
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")
    return usuario


def validar_roles(connection: Connection, roles: list[str]) -> None:
    encontrados = connection.execute(
        "SELECT clave FROM terracota.roles WHERE clave = ANY(%s)", (roles,)
    ).fetchall()
    faltantes = sorted(set(roles) - {fila["clave"] for fila in encontrados})
    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Roles inexistentes: {', '.join(faltantes)}.",
        )


def asignar_roles(connection: Connection, user_id: int, roles: list[str]) -> None:
    validar_roles(connection, roles)
    connection.execute("DELETE FROM terracota.usuario_roles WHERE usuario_id = %s", (user_id,))
    connection.execute(
        """
        INSERT INTO terracota.usuario_roles(usuario_id, rol_id)
        SELECT %s, id FROM terracota.roles WHERE clave = ANY(%s)
        """,
        (user_id, roles),
    )


def usuario_disponible(connection: Connection, usuario: str, excluir_id: int | None = None) -> None:
    fila = connection.execute(
        "SELECT id FROM terracota.usuarios WHERE lower(usuario) = lower(%s)",
        (usuario,),
    ).fetchone()
    if fila and fila["id"] != excluir_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El usuario '{usuario}' ya está registrado.",
        )
