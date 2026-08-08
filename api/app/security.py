from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock

import jwt

from .config import Settings


def create_access_token(*, user_id: int, username: str, roles: list[str], settings: Settings) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "uid": user_id,
        "roles": roles,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


class LoginThrottle:
    """Freno de fuerza bruta en memoria.

    Suficiente para un despliegue de un solo proceso como el de la entrega. Si
    algún día se corre con varios workers hay que moverlo a Redis o a la base.
    """

    def __init__(self) -> None:
        self._intentos: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _limpiar(self, clave: str, ventana: int, ahora: float) -> list[float]:
        vigentes = [t for t in self._intentos[clave] if ahora - t < ventana]
        self._intentos[clave] = vigentes
        return vigentes

    def bloqueado(self, clave: str, settings: Settings) -> int:
        """Devuelve los segundos que faltan para poder reintentar (0 = libre)."""
        ahora = time.monotonic()
        with self._lock:
            vigentes = self._limpiar(clave, settings.login_ventana_segundos, ahora)
            if len(vigentes) < settings.login_max_intentos:
                return 0
            return max(1, int(settings.login_ventana_segundos - (ahora - vigentes[0])))

    def registrar_fallo(self, clave: str, settings: Settings) -> None:
        ahora = time.monotonic()
        with self._lock:
            self._limpiar(clave, settings.login_ventana_segundos, ahora)
            self._intentos[clave].append(ahora)

    def limpiar(self, clave: str) -> None:
        with self._lock:
            self._intentos.pop(clave, None)


login_throttle = LoginThrottle()
