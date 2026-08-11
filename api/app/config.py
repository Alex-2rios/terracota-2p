from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Terracota API"
    environment: str = "development"

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=480, ge=5, le=1440)

    cors_origins: str = "http://localhost:5000,http://127.0.0.1:5000,http://localhost:8081,http://localhost:19006"

    media_dir: str = "/media"
    imagen_max_bytes: int = Field(default=5 * 1024 * 1024, ge=64 * 1024)

    login_max_intentos: int = Field(default=8, ge=3, le=100)
    login_ventana_segundos: int = Field(default=300, ge=30, le=3600)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "produccion", "prod"}

@lru_cache
def get_settings() -> Settings:
    return Settings()
