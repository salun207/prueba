"""Configuración central de la app. Lee variables de entorno / .env."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    base_url: str = "http://localhost:8000"
    secret_key: str = "cambiar-esto-en-produccion"

    # --- Marca / datos públicos del kartódromo (editables en .env) ---
    brand_name: str = "Karting Zárate"
    direccion: str = "Ruta 193 Km 8.5, Zárate, Buenos Aires"
    email_contacto: str = "info@kartingzarate.com"
    # Número público para el botón de WhatsApp (formato E.164 sin '+').
    # PLACEHOLDER: reemplazar por el real del kartódromo.
    whatsapp_contacto: str = "5491112345678"
    # Consulta para el mapa de Google (ubicación del circuito).
    map_query: str = "Kartódromo Internacional de Zárate"

    # --- Datos del circuito (para la sección "El circuito") ---
    circuito_longitud_m: int = 900
    circuito_ancho_m: int = 8
    circuito_curvas: int = 10
    circuito_rectas: int = 3

    # --- WhatsApp Cloud API (envío automático de avisos) ---
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_verify_token: str = "karting-zarate-verify"

    # --- Monitor ---
    monitor_interval: int = 60
    availability_source: str = "mock"  # "mock" | "soloturnos"

    # --- Panel (protección opcional con contraseña, HTTP Basic) ---
    panel_user: str = "admin"
    panel_password: str = ""  # si está vacío, el panel queda abierto (demo)

    @property
    def whatsapp_enabled(self) -> bool:
        return bool(self.whatsapp_token and self.whatsapp_phone_number_id)

    @property
    def wa_link(self) -> str:
        """Link wa.me para el botón de contacto por WhatsApp."""
        return f"https://wa.me/{self.whatsapp_contacto}"

    @property
    def panel_protegido(self) -> bool:
        return bool(self.panel_password)


settings = Settings()
