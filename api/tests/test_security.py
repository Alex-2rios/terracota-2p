import pytest

from app.config import Settings
from app.security import LoginThrottle, create_access_token, decode_access_token

def build_settings(**extra) -> Settings:
    base = {
        "database_url": "postgresql://test:test@localhost/test",
        "jwt_secret": "una-clave-de-prueba-con-mas-de-32-caracteres",
    }
    base.update(extra)
    return Settings(**base)

def test_token_incluye_identidad_y_roles():
    settings = build_settings()
    token = create_access_token(user_id=7, username="mesero", roles=["mesero"], settings=settings)

    payload = decode_access_token(token, settings)

    assert payload["uid"] == 7
    assert payload["sub"] == "mesero"
    assert payload["roles"] == ["mesero"]
    assert payload["exp"] > payload["iat"]

def test_token_firmado_con_otra_clave_es_rechazado():
    import jwt

    token = create_access_token(user_id=1, username="x", roles=[], settings=build_settings())
    otra = build_settings(jwt_secret="otra-clave-distinta-de-mas-de-32-caracteres")

    with pytest.raises(jwt.PyJWTError):
        decode_access_token(token, otra)

def test_jwt_secret_corto_no_se_acepta():
    with pytest.raises(Exception):
        Settings(database_url="postgresql://t:t@localhost/t", jwt_secret="corto")

def test_throttle_bloquea_tras_los_intentos_configurados():
    settings = build_settings(login_max_intentos=3, login_ventana_segundos=60)
    throttle = LoginThrottle()
    clave = "127.0.0.1|mesero"

    for _ in range(3):
        assert throttle.bloqueado(clave, settings) == 0
        throttle.registrar_fallo(clave, settings)

    assert throttle.bloqueado(clave, settings) > 0

def test_throttle_se_libera_tras_un_login_correcto():
    settings = build_settings(login_max_intentos=3, login_ventana_segundos=60)
    throttle = LoginThrottle()
    clave = "127.0.0.1|caja"

    for _ in range(3):
        throttle.registrar_fallo(clave, settings)
    assert throttle.bloqueado(clave, settings) > 0

    throttle.limpiar(clave)
    assert throttle.bloqueado(clave, settings) == 0

def test_origenes_cors_se_separan_por_coma():
    settings = build_settings(cors_origins="http://a.com, http://b.com ,")
    assert settings.allowed_origins == ["http://a.com", "http://b.com"]
