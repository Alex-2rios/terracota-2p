from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from psycopg import Connection

from ..config import Settings, get_settings
from ..database import get_connection
from ..dependencies import CurrentUser, get_current_user
from ..queries import get_usuario
from ..schemas import TokenResponse, UserIdentity
from ..security import create_access_token, login_throttle

router = APIRouter(prefix="/auth", tags=["Autenticación"])

@router.post("/token", response_model=TokenResponse, summary="Iniciar Sesión")
def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    connection: Connection = Depends(get_connection),
    settings: Settings = Depends(get_settings),
) -> TokenResponse:
    """Valida credenciales contra `terracota.autenticar_usuario` y emite un JWT.

    El token lleva el id, el usuario y los roles reales de la base: ningún
    cliente puede otorgarse permisos por su cuenta.
    """
    ip = request.client.host if request.client else "desconocida"
    clave_intentos = f"{ip}|{form.username.strip().lower()}"

    espera = login_throttle.bloqueado(clave_intentos, settings)
    if espera:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Demasiados intentos fallidos. Espera {espera} segundos.",
            headers={"Retry-After": str(espera)},
        )

    registro = connection.execute(
        "SELECT * FROM terracota.autenticar_usuario(%s, %s)",
        (form.username, form.password),
    ).fetchone()

    if registro is None:
        login_throttle.registrar_fallo(clave_intentos, settings)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not registro["roles"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no tiene ningún rol asignado. Contacta al administrador.",
        )

    login_throttle.limpiar(clave_intentos)

    identidad = UserIdentity(
        id=registro["usuario_id"],
        nombre=registro["nombre"],
        usuario=registro["usuario"],
        roles=list(registro["roles"]),
    )
    token = create_access_token(
        user_id=identidad.id,
        username=identidad.usuario,
        roles=identidad.roles,
        settings=settings,
    )
    return TokenResponse(
        access_token=token,
        expira_en_minutos=settings.access_token_minutes,
        usuario=identidad,
    )

@router.get("/me", response_model=UserIdentity, summary="Sesión Actual")
def sesion_actual(
    user: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> UserIdentity:
    """Revalida el token contra la base.

    Sirve para que el panel web detecte de inmediato a un usuario desactivado
    o eliminado, sin esperar a que caduque el JWT.
    """
    registro = get_usuario(connection, user.id)
    if registro["eliminado"] or not registro["activo"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La cuenta fue desactivada.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return UserIdentity(
        id=registro["id"],
        nombre=registro["nombre"],
        usuario=registro["usuario"],
        roles=list(registro["roles"]),
    )
