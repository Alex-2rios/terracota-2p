from collections.abc import Generator

from fastapi import Request
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import Settings


def create_pool(settings: Settings) -> ConnectionPool:
    return ConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=10,
        open=False,
        timeout=10,
        kwargs={"row_factory": dict_row},
    )


def get_connection(request: Request) -> Generator[Connection, None, None]:
    """Una transacción por petición: si el handler lanza, se revierte todo."""
    with request.app.state.pool.connection() as connection:
        with connection.transaction():
            yield connection
