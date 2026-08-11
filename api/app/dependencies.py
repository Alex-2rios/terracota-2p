from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import Settings, get_settings
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

ROL_ADMIN = "administrador"

@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    roles: frozenset[str]

    @property
    def es_admin(self) -> bool:
        return ROL_ADMIN in self.roles

def get_current_user(
    token: str = Depends(oauth2_scheme),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión no válida o vencida. Vuelve a iniciar sesión.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token, settings)
        user_id = int(payload["uid"])
        username = str(payload["sub"])
        roles = frozenset(str(role) for role in payload.get("roles", []))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise unauthorized from None
    return CurrentUser(id=user_id, username=username, roles=roles)

def require_roles(*allowed_roles: str):
    """El rol administrador siempre pasa: es el superusuario del sistema."""
    allowed = frozenset(allowed_roles) | {ROL_ADMIN}

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.roles.isdisjoint(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tu usuario no tiene permisos para este módulo.",
            )
        return user

    return dependency
