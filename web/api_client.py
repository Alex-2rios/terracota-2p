"""Cliente HTTP del panel web contra la API de Terracota.

Este módulo es el ÚNICO punto por el que la web accede a los datos. No hay
ninguna conexión a PostgreSQL en el proyecto web: si un dato no está expuesto
por la API, la web no puede verlo. Eso es lo que mantiene la arquitectura
desacoplada.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import requests

logger = logging.getLogger("terracota.web.api")

class ApiError(Exception):
    """Error devuelto por la API, ya traducido a algo que se le puede enseñar
    al usuario."""

    def __init__(self, mensaje: str, status_code: Optional[int] = None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status_code = status_code

    @property
    def es_sesion_invalida(self) -> bool:
        return self.status_code == 401

class TerracotaApi:
    def __init__(self, base_url: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    @property
    def root_url(self) -> str:
        """Raíz del servicio: `/health` vive fuera del prefijo /api/v1."""
        return self.base_url.removesuffix("/api/v1").rstrip("/")

    def _request(
        self,
        metodo: str,
        ruta: str,
        *,
        token: Optional[str] = None,
        params: Optional[dict] = None,
        json: Optional[Any] = None,
        data: Optional[dict] = None,
        absoluta: bool = False,
    ) -> Any:
        url = f"{self.root_url if absoluta else self.base_url}{ruta}"
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        try:
            respuesta = requests.request(
                metodo, url, headers=headers, params=params, json=json,
                data=data, timeout=self.timeout,
            )
        except requests.Timeout:
            raise ApiError("La API tardó demasiado en responder. Revisa que el servicio esté arriba.") from None
        except requests.ConnectionError:
            raise ApiError(f"No se pudo conectar con la API en {self.base_url}.") from None

        if respuesta.status_code == 204:
            return None

        try:
            cuerpo = respuesta.json()
        except ValueError:
            cuerpo = None

        if not respuesta.ok:
            raise ApiError(_detalle(cuerpo, respuesta), respuesta.status_code)

        return cuerpo

    def login(self, usuario: str, password: str) -> dict:
        return self._request(
            "POST", "/auth/token",
            data={"username": usuario, "password": password, "grant_type": "password"},
        )

    def sesion_actual(self, token: str) -> dict:
        return self._request("GET", "/auth/me", token=token)

    def dashboard(self, token: str) -> dict:
        return self._request("GET", "/administracion/estadisticas/dashboard", token=token)

    def usuarios(self, token: str, **filtros) -> list[dict]:
        return self._request("GET", "/administracion/usuarios", token=token, params=_limpiar(filtros))

    def usuario(self, token: str, user_id: int) -> dict:
        return self._request("GET", f"/administracion/usuarios/{user_id}", token=token)

    def crear_usuario(self, token: str, payload: dict) -> dict:
        return self._request("POST", "/administracion/usuarios", token=token, json=payload)

    def actualizar_usuario(self, token: str, user_id: int, payload: dict) -> dict:
        return self._request("PATCH", f"/administracion/usuarios/{user_id}", token=token, json=payload)

    def eliminar_usuario(self, token: str, user_id: int) -> dict:
        return self._request("DELETE", f"/administracion/usuarios/{user_id}", token=token)

    def reactivar_usuario(self, token: str, user_id: int) -> dict:
        return self._request("POST", f"/administracion/usuarios/{user_id}/reactivar", token=token)

    def roles(self, token: str) -> list[dict]:
        return self._request("GET", "/administracion/roles", token=token)

    def inventario(self, token: str, **filtros) -> list[dict]:
        return self._request("GET", "/inventario/productos", token=token, params=_limpiar(filtros))

    def producto(self, token: str, product_id: int) -> dict:
        return self._request("GET", f"/inventario/productos/{product_id}", token=token)

    def crear_producto(self, token: str, payload: dict) -> dict:
        return self._request("POST", "/inventario/productos", token=token, json=payload)

    def actualizar_producto(self, token: str, product_id: int, payload: dict) -> dict:
        return self._request("PATCH", f"/inventario/productos/{product_id}", token=token, json=payload)

    def subir_imagen_producto(self, token: str, product_id: int, archivo) -> dict:
        """Reenvía a la API la foto que llegó por el formulario.

        Se manda como multipart, igual que la recibió Flask, sin escribirla en
        disco: el panel no almacena nada, sólo hace de puente.
        """
        try:
            respuesta = requests.put(
                f"{self.base_url}/inventario/productos/{product_id}/imagen",
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                files={"archivo": (archivo.filename, archivo.stream, archivo.mimetype)},
                timeout=max(self.timeout, 30.0),
            )
        except requests.Timeout:
            raise ApiError("La API tardó demasiado al recibir la imagen.") from None
        except requests.ConnectionError:
            raise ApiError(f"No se pudo conectar con la API en {self.base_url}.") from None

        try:
            cuerpo = respuesta.json()
        except ValueError:
            cuerpo = None
        if not respuesta.ok:
            raise ApiError(_detalle(cuerpo, respuesta), respuesta.status_code)
        return cuerpo

    def quitar_imagen_producto(self, token: str, product_id: int) -> dict:
        return self._request("DELETE", f"/inventario/productos/{product_id}/imagen", token=token)

    def imagen_producto(self, token: str, nombre: str) -> tuple[bytes, str]:
        """Descarga una foto de la API. Devuelve el contenido y su tipo MIME."""
        try:
            respuesta = requests.get(
                f"{self.root_url}/media/{nombre}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=self.timeout,
            )
        except requests.Timeout:
            raise ApiError("La API tardó demasiado al enviar la imagen.") from None
        except requests.ConnectionError:
            raise ApiError(f"No se pudo conectar con la API en {self.base_url}.") from None

        if not respuesta.ok:
            raise ApiError("La imagen no existe.", respuesta.status_code)
        return respuesta.content, respuesta.headers.get("Content-Type", "image/png")

    def eliminar_producto(self, token: str, product_id: int) -> dict:
        return self._request("DELETE", f"/inventario/productos/{product_id}", token=token)

    def alertas_inventario(self, token: str) -> list[dict]:
        return self._request("GET", "/inventario/alertas", token=token)

    def categorias(self, token: str) -> list[dict]:
        return self._request("GET", "/catalogos/categorias", token=token)

    def pedidos(self, token: str, **filtros) -> list[dict]:
        return self._request("GET", "/administracion/pedidos", token=token, params=_limpiar(filtros))

    def pedido(self, token: str, pedido_id: int) -> dict:
        return self._request("GET", f"/administracion/pedidos/{pedido_id}", token=token)

    def cancelar_pedido(self, token: str, pedido_id: int, motivo: str,
                        cliente_en_mesa: bool = False) -> dict:
        """`cliente_en_mesa` decide si la mesa queda libre o pendiente de retomar."""
        return self._request(
            "POST", f"/administracion/pedidos/{pedido_id}/cancelar", token=token,
            json={"motivo": motivo, "cliente_en_mesa": cliente_en_mesa},
        )

    def gastos(self, token: str, **filtros) -> list[dict]:
        return self._request("GET", "/administracion/gastos", token=token, params=_limpiar(filtros))

    def crear_gasto(self, token: str, payload: dict) -> dict:
        return self._request("POST", "/administracion/gastos", token=token, json=payload)

    def eliminar_gasto(self, token: str, gasto_id: int) -> dict:
        return self._request("DELETE", f"/administracion/gastos/{gasto_id}", token=token)

    def opciones_reporte(self, token: str) -> dict:
        """Catálogo de reportes y valores de sus filtros.

        La web construye el formulario con esto: agregar un reporte en la API
        lo hace aparecer aquí sin tocar el frontend.
        """
        return self._request("GET", "/administracion/reportes/opciones", token=token)

    def reporte(self, token: str, **filtros) -> dict:
        return self._request("GET", "/administracion/reportes", token=token, params=_limpiar(filtros))

    def health(self) -> dict:
        return self._request("GET", "/health", absoluta=True)

def _limpiar(filtros: dict) -> dict:
    """Quita los filtros vacíos para no mandar `?estado=` a la API."""
    return {k: v for k, v in filtros.items() if v not in (None, "", [])}

def _detalle(cuerpo: Any, respuesta: requests.Response) -> str:
    """Convierte el cuerpo de error de FastAPI en un mensaje legible."""
    if isinstance(cuerpo, dict):
        detalle = cuerpo.get("detail")
        if isinstance(detalle, str):
            return detalle
        if isinstance(detalle, list):
            partes = []
            for item in detalle:
                campo = " → ".join(str(x) for x in item.get("loc", []) if x != "body")
                mensaje = item.get("msg", "dato inválido")
                partes.append(f"{campo}: {mensaje}" if campo else mensaje)
            return "; ".join(partes)

    genericos = {
        401: "Tu sesión expiró. Vuelve a iniciar sesión.",
        403: "No tienes permisos para esta operación.",
        404: "El recurso solicitado no existe.",
        409: "La operación entra en conflicto con el estado actual.",
        429: "Demasiados intentos. Espera unos segundos.",
        503: "La base de datos no está disponible.",
    }
    return genericos.get(respuesta.status_code, f"Error {respuesta.status_code} al llamar a la API.")
