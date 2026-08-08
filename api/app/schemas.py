from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# Admite alias cortos (`mesero`) y correos (`luis@terracota.com`).
PATRON_USUARIO = r"^[A-Za-z0-9._+-]+(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?$"

ESTADOS_PEDIDO = ("PENDIENTE", "PREPARANDO", "LISTO", "ENTREGADO", "PAGADO", "CANCELADO")


# --------------------------------------------------------------- autenticación
class UserIdentity(BaseModel):
    model_config = {"title": "IdentidadUsuario"}
    id: int
    nombre: str
    usuario: str
    roles: list[str]


class TokenResponse(BaseModel):
    model_config = {"title": "RespuestaToken"}
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expira_en_minutos: int
    usuario: UserIdentity


# --------------------------------------------------------------------- pedidos
class PedidoItemCreate(BaseModel):
    model_config = {"title": "CrearItemPedido"}
    producto_clave: str = Field(min_length=1, max_length=60)
    cantidad: int = Field(ge=1, le=99)
    observacion: Optional[str] = Field(default=None, max_length=250)


class PedidoCreate(BaseModel):
    model_config = {"title": "CrearPedido"}
    mesa: int = Field(gt=0)
    items: list[PedidoItemCreate] = Field(min_length=1)
    notas: Optional[str] = Field(default=None, max_length=500)


class CambioEstado(BaseModel):
    model_config = {"title": "CambioEstado"}
    estado: Literal["PREPARANDO", "LISTO", "ENTREGADO", "CANCELADO"]
    comentario: Optional[str] = Field(default=None, max_length=250)


class CancelarPedido(BaseModel):
    model_config = {"title": "CancelarPedido"}
    motivo: Optional[str] = Field(default=None, max_length=250)


# ----------------------------------------------------------------------- pagos
class PagoCreate(BaseModel):
    model_config = {"title": "CrearPago"}
    pedido_id: int = Field(gt=0)
    metodo: Literal["EFECTIVO", "TARJETA", "TRANSFERENCIA"]
    monto_recibido: Optional[Decimal] = Field(default=None, ge=0)
    referencia: Optional[str] = Field(default=None, max_length=100)

    @field_validator("metodo", mode="before")
    @classmethod
    def normalize_method(cls, value: str) -> str:
        return str(value).strip().upper()


# -------------------------------------------------------------------- usuarios
class UsuarioCreate(BaseModel):
    model_config = {"title": "CrearUsuario"}
    nombre: str = Field(min_length=2, max_length=120)
    usuario: str = Field(min_length=3, max_length=60, pattern=PATRON_USUARIO)
    password: str = Field(min_length=8, max_length=128)
    roles: list[str] = Field(min_length=1)
    activo: bool = True

    @field_validator("nombre", "usuario")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("roles")
    @classmethod
    def normalize_roles(cls, values: list[str]) -> list[str]:
        roles = sorted({value.strip().lower() for value in values if value.strip()})
        if not roles:
            raise ValueError("Debe asignarse al menos un rol.")
        return roles


class UsuarioUpdate(BaseModel):
    model_config = {"title": "ActualizarUsuario"}
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=120)
    usuario: Optional[str] = Field(default=None, min_length=3, max_length=60, pattern=PATRON_USUARIO)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    activo: Optional[bool] = None
    roles: Optional[list[str]] = None

    @field_validator("nombre", "usuario")
    @classmethod
    def trim_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None

    @field_validator("roles")
    @classmethod
    def normalize_optional_roles(cls, values: Optional[list[str]]) -> Optional[list[str]]:
        if values is None:
            return None
        roles = sorted({value.strip().lower() for value in values if value.strip()})
        if not roles:
            raise ValueError("Debe asignarse al menos un rol.")
        return roles


# ------------------------------------------------------------------ inventario
class ProductoCreate(BaseModel):
    model_config = {"title": "CrearProducto"}
    nombre: str = Field(min_length=2, max_length=120)
    categoria: str = Field(min_length=2, max_length=60)
    descripcion: Optional[str] = Field(default=None, max_length=250)
    stock_actual: int = Field(default=50, ge=0)
    stock_minimo: int = Field(default=15, ge=0)
    precio: Decimal = Field(ge=0, le=Decimal("9999999999.99"))
    disponible: bool = True

    @field_validator("nombre", "categoria")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class ProductoUpdate(BaseModel):
    model_config = {"title": "ActualizarProducto"}
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=120)
    categoria: Optional[str] = Field(default=None, min_length=2, max_length=60)
    descripcion: Optional[str] = Field(default=None, max_length=250)
    stock_actual: Optional[int] = Field(default=None, ge=0)
    stock_minimo: Optional[int] = Field(default=None, ge=0)
    precio: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("9999999999.99"))
    disponible: Optional[bool] = None


class SuministroUpdate(BaseModel):
    model_config = {"title": "ActualizarSuministro"}
    stock_actual: int = Field(ge=0)
    stock_minimo: Optional[int] = Field(default=None, ge=0)


# ---------------------------------------------------------------------- gastos
class GastoCreate(BaseModel):
    model_config = {"title": "CrearGasto"}
    concepto: str = Field(min_length=3, max_length=150)
    monto: Decimal = Field(ge=0, le=Decimal("9999999999.99"))
    fecha: Optional[date] = None

    @field_validator("concepto")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


# -------------------------------------------------------------------- reportes
class SeccionReporte(BaseModel):
    model_config = {"title": "SeccionReporte"}
    titulo: str
    headers: list[str]
    rows: list[list[str]]


class Reporte(BaseModel):
    model_config = {"title": "Reporte"}
    titulo: str
    generado_en: str
    secciones: list[SeccionReporte]
