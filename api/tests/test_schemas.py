import pytest
from pydantic import ValidationError

from app.schemas import (
    CambioEstado,
    GastoCreate,
    PagoCreate,
    PedidoCreate,
    ProductoCreate,
    UsuarioCreate,
    UsuarioUpdate,
)


def test_pedido_requiere_al_menos_un_item():
    with pytest.raises(ValidationError):
        PedidoCreate(mesa=1, items=[])


def test_pedido_rechaza_mesa_invalida():
    with pytest.raises(ValidationError):
        PedidoCreate(mesa=0, items=[{"producto_clave": "capuchino", "cantidad": 1}])


def test_pedido_limita_la_cantidad_por_renglon():
    with pytest.raises(ValidationError):
        PedidoCreate(mesa=1, items=[{"producto_clave": "capuchino", "cantidad": 100}])


def test_metodo_de_pago_se_normaliza():
    pago = PagoCreate(pedido_id=1, metodo="  efectivo ", monto_recibido=200)
    assert pago.metodo == "EFECTIVO"


def test_metodo_de_pago_desconocido_falla():
    with pytest.raises(ValidationError):
        PagoCreate(pedido_id=1, metodo="cheque")


def test_cambio_estado_solo_acepta_estados_conocidos():
    assert CambioEstado(estado="LISTO").estado == "LISTO"
    with pytest.raises(ValidationError):
        CambioEstado(estado="ENVIADO")


def test_roles_de_usuario_se_normalizan_y_deduplican():
    usuario = UsuarioCreate(
        nombre="  Usuario Demo ", usuario="usuario.demo", password="Cambiar123!",
        roles=["MESERO", "mesero", " Cocina "],
    )
    assert usuario.nombre == "Usuario Demo"
    assert usuario.roles == ["cocina", "mesero"]


def test_usuario_acepta_alias_y_correo():
    assert UsuarioCreate(
        nombre="Ana", usuario="ana.caja@terracota.com", password="Cambiar123!", roles=["caja"]
    ).usuario == "ana.caja@terracota.com"
    assert UsuarioCreate(
        nombre="Ana", usuario="caja", password="Cambiar123!", roles=["caja"]
    ).usuario == "caja"


def test_usuario_rechaza_caracteres_no_permitidos():
    with pytest.raises(ValidationError):
        UsuarioCreate(nombre="Ana", usuario="ana caja", password="Cambiar123!", roles=["caja"])


def test_password_minimo_de_ocho_caracteres():
    with pytest.raises(ValidationError):
        UsuarioCreate(nombre="Ana", usuario="ana", password="1234567", roles=["caja"])


def test_actualizar_usuario_rechaza_lista_de_roles_vacia():
    with pytest.raises(ValidationError):
        UsuarioUpdate(roles=[])


def test_actualizar_usuario_permite_campos_ausentes():
    cambio = UsuarioUpdate(nombre="Nuevo Nombre")
    assert cambio.model_dump(exclude_none=True) == {"nombre": "Nuevo Nombre"}


def test_producto_rechaza_precio_negativo():
    with pytest.raises(ValidationError):
        ProductoCreate(nombre="Café", categoria="Bebidas", precio=-1)


def test_gasto_exige_concepto():
    with pytest.raises(ValidationError):
        GastoCreate(concepto="ab", monto=10)
