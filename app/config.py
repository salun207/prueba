"""Configuración central de la app. Lee variables de entorno / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    base_url: str = "http://localhost:8000"
    secret_key: str = "cambiar-esto-en-produccion"

    # WhatsApp Cloud API
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = "karting-zarate-verify"

    # Monitor
    monitor_interval: int = 60
    availability_source: str = "mock"  # "mock" | "soloturnos"

    @property
    def whatsapp_enabled(self) -> bool:
        return bool(self.whatsapp_token and self.whatsapp_phone_number_id)


settings = Settings()
