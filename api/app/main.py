import logging
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, RedirectResponse

from .config import get_settings
from .database import create_pool
from .routers import administracion, auth, caja, catalogos, cocina, inventario, mesero

logger = logging.getLogger("terracota.api")
settings = get_settings()

CODIGOS_HTTP = {
    "23505": status.HTTP_409_CONFLICT,
    "23503": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "23514": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "22023": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "42501": status.HTTP_403_FORBIDDEN,
    "P0002": status.HTTP_404_NOT_FOUND,
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = create_pool(settings)
    pool.open(wait=True, timeout=30)
    app.state.pool = pool
    logger.info("Pool de PostgreSQL listo")
    try:
        yield
    finally:
        pool.close()

app = FastAPI(
    title=settings.app_name,
    description=(
        "API REST única de Terracota. La consumen tanto la aplicación móvil "
        "(Mesero, Cocina, Caja) como el panel web de Administración. "
        "Ningún cliente habla directamente con PostgreSQL."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.exception_handler(psycopg.OperationalError)
async def database_unavailable_handler(_: Request, error: psycopg.OperationalError) -> JSONResponse:
    logger.error("Base de datos no disponible: %s", error)
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": "La base de datos no está disponible. Intenta de nuevo en unos segundos."},
    )

@app.exception_handler(psycopg.Error)
async def database_error_handler(_: Request, error: psycopg.Error) -> JSONResponse:
    sqlstate = getattr(error, "sqlstate", None)
    detalle = (error.diag.message_primary if error.diag else None) or "La operación no pudo completarse."
    codigo = CODIGOS_HTTP.get(sqlstate, status.HTTP_400_BAD_REQUEST)
    if codigo >= 500:
        logger.exception("Error de base de datos %s", sqlstate)
    return JSONResponse(status_code=codigo, content={"detail": detalle})

@app.get("/health", tags=["Sistema"], summary="Estado del Servicio")
def health(request: Request) -> dict[str, str]:
    """Comprueba que la API responde y que la base contesta."""
    with request.app.state.pool.connection() as connection:
        connection.execute("SELECT 1")
    return {"status": "ok", "servicio": settings.app_name, "version": app.version}

@app.get("/", include_in_schema=False)
@app.get("/forms", include_in_schema=False)
def documentation() -> RedirectResponse:
    return RedirectResponse(url="/docs")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    esquema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    componentes = esquema.get("components", {}).get("schemas", {})
    renombres = {
        "HTTPValidationError": ("ErrorValidacionHTTP", "ErrorValidacionHTTP"),
        "ValidationError": ("ErrorValidacion", "ErrorValidacion"),
        "Body_login_api_v1_auth_token_post": ("DatosInicioSesion", "DatosInicioSesion"),
    }
    for original, (titulo, nuevo) in renombres.items():
        if original in componentes:
            componentes[original]["title"] = titulo
            componentes[nuevo] = componentes.pop(original)
    app.openapi_schema = esquema
    return app.openapi_schema

app.openapi = custom_openapi

for api_router in (
    auth.router,
    catalogos.router,
    mesero.router,
    cocina.router,
    caja.router,
    inventario.router,
    administracion.router,
):
    app.include_router(api_router, prefix="/api/v1")
