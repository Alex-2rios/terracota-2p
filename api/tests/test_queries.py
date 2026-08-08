import pytest
from fastapi import HTTPException

from app.queries import slugify


@pytest.mark.parametrize(
    "nombre, esperado",
    [
        ("Café Americano", "cafe-americano"),
        ("Moka Frappé", "moka-frappe"),
        ("  Panini   Terracota  ", "panini-terracota"),
        ("Combo Café + Postre", "combo-cafe-postre"),
        ("Piña Colada Ñ", "pina-colada-n"),
        ("Té 100% Verde", "te-100-verde"),
    ],
)
def test_slugify_produce_claves_validas(nombre, esperado):
    # La restricción productos_clave_formato sólo acepta [a-z0-9-].
    assert slugify(nombre) == esperado


def test_slugify_rechaza_nombres_sin_caracteres_utiles():
    with pytest.raises(HTTPException) as error:
        slugify("¡!¿?")
    assert error.value.status_code == 422


def test_slugify_respeta_el_limite_de_la_columna():
    assert len(slugify("a" * 200)) <= 60
