"""Configuración de la aplicación.

QUÉ es: un objeto que lee variables de entorno y las valida al arrancar.
PARA QUÉ: no tener secretos en el código y poder cambiar de entorno
(development/testing/staging/production) sin tocar código.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore", case_sensitive=False)

    app_env: Literal["development", "testing", "staging", "production"] = "development"
    log_level: str = "INFO"
    service_name: str = "tallerya-api"

    postgres_user: str = "tallerya"
    postgres_password: str = "tallerya"
    postgres_db: str = "tallerya"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    # Alternativa a POSTGRES_*: una sola URL (Render la entrega como DATABASE_URL, estilo postgres://...).
    db_url: str | None = Field(default=None, validation_alias="DATABASE_URL")

    cors_allowed_origins: str = "http://localhost:3000"

    # Auth (Hito 3). En producción DEBE venir del entorno.
    jwt_secret: str = Field(default="dev-only-change-me-please-32-bytes-min")
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    cookie_secure: bool = False
    # Nº de proxies de confianza delante del backend (p. ej. 1 = el frontend de Next). 0 = ninguno: se usa la IP directa.
    trusted_proxy_hops: int = 0

    # Pagos. El proveedor real se decide en P-02; hoy existe un proveedor simulado.
    payment_provider: str = "fake"
    payment_webhook_secret: str = "dev-only-webhook-secret-change-me"
    webhook_tolerance_seconds: int = 300

    # DEMO: permite el proveedor de pagos SIMULADO fuera de desarrollo (p. ej. un despliegue de demostración en Render).
    # No se cobra nada real. Con un proveedor real esto debe estar en false.
    allow_fake_payments: bool = False

    # Worker embebido en el proceso de la API (para planes sin "background worker" separado). Un solo proceso.
    embedded_worker: bool = False

    # Arranque de un entorno nuevo (idempotente): crea el primer propietario y/o datos de demostración.
    bootstrap_owner_email: str = ""
    bootstrap_owner_password: str = ""
    seed_demo: bool = False

    # Asistente de IA (Claude). Sin clave el asistente queda DESACTIVADO (la web funciona igual).
    anthropic_api_key: str = ""
    assistant_model: str = (
        "claude-opus-5-5"  # configurable: p. ej. claude-sonnet-5-5 o claude-haiku-5-5 para gastar menos
    )
    assistant_daily_limit: int = (
        300  # tope global de mensajes al día (control de coste); se reinicia al reiniciar el servicio
    )
    assistant_ip_limit_per_minute: int = 8

    # Email (Mailpit en desarrollo; vacío = no enviar correos, solo avisos dentro de la web)
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    mail_from: str = "Tallerya <no-reply@tallerya.local>"
    frontend_url: str = "http://localhost:3000"

    booking_rate_limit_per_minute: int = 20
    worker_poll_seconds: int = 5

    # Observabilidad (OpenTelemetry). Desactivada por defecto.
    otel_enabled: bool = False
    otel_exporter_otlp_endpoint: str = ""

    # Reglas de negocio configurables (Hito 5/6)
    booking_payment_window_hours: int = 24
    booking_cutoff_hours: int = 24
    default_commission_bps: int = 2000  # 20 % [CLIENTE], configurable

    @model_validator(mode="after")
    def _no_default_secrets_in_production(self) -> "Settings":
        if self.app_env in ("production", "staging"):
            if self.jwt_secret.startswith("dev-only") or self.payment_webhook_secret.startswith("dev-only"):
                raise ValueError(
                    "Secretos por defecto no permitidos fuera de desarrollo: define JWT_SECRET y PAYMENT_WEBHOOK_SECRET"
                )
            if not self.cookie_secure:
                raise ValueError(
                    "COOKIE_SECURE=true es obligatorio fuera de desarrollo (las cookies de sesión viajarían sin cifrar)"
                )
            if self.payment_provider == "fake" and not self.allow_fake_payments:
                raise ValueError(
                    "El proveedor de pagos 'fake' no se puede usar en staging/producción "
                    "(solo en una DEMO: ALLOW_FAKE_PAYMENTS=true)"
                )
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        if self.db_url:
            # Render/Heroku entregan postgres://...; SQLAlchemy + psycopg 3 necesita postgresql+psycopg://
            rest = self.db_url.split("://", 1)[1]
            return f"postgresql+psycopg://{rest}"
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allowed_origins.split(",") if o.strip()]

    @property
    def dev_endpoints_enabled(self) -> bool:
        """Endpoints /dev (simular pagos). Solo en desarrollo/tests o en una demo con pagos simulados."""
        return self.app_env in ("development", "testing") or self.allow_fake_payments

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
