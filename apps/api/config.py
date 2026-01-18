from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApplicationSettings(BaseSettings):
    """
    Application-specific settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        env_nested_delimiter=".",
        extra="ignore",
        case_sensitive=False,
        validate_default=True,
    )

    api_prefix: str = Field(
        default="/api",
        validation_alias=AliasChoices("API_PREFIX", "API_V1_PREFIX", "API_VERSION_PREFIX"),
    )
    app_host: str = Field(default="127.0.0.1", validation_alias="APP_HOST")
    app_port: int = Field(default=8000, validation_alias="APP_PORT")
    app_name: str = Field(default="Celestial CMS API", validation_alias="APP_NAME")
    app_version: str = Field(default="2026.01.18-dev", validation_alias="APP_VERSION")
    app_description: str = Field(
        default="Celestial is a light-weight, plugin-based CMS framework written in Python.",
        validation_alias="APP_DESCRIPTION",
    )
    app_openapi_url: str | None = Field(
        default="/openapi.json",
        validation_alias="APP_OPENAPI_URL",
    )
    app_docs_url: str | None = Field(
        default="/docs",
        validation_alias="APP_DOCS_URL",
    )
    app_redoc_url: str | None = Field(
        default="/redoc",
        validation_alias="APP_REDOC_URL",
    )
    static_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("STATIC_ENABLED", "APP_STATIC_ENABLED"),
    )
    static_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "static",
        validation_alias=AliasChoices("STATIC_DIR", "APP_STATIC_DIR"),
    )
    static_url: str = Field(
        default="/static",
        validation_alias=AliasChoices("STATIC_URL", "APP_STATIC_URL"),
    )


class LoggingSettings(BaseSettings):
    """
    Logging settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        env_nested_delimiter=".",
        extra="ignore",
        case_sensitive=False,
        validate_default=True,
    )

    level: str = Field(default="INFO", validation_alias=AliasChoices("LOG_LEVEL", "APP_LOG_LEVEL"))
    json_logs: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("LOG_JSON", "APP_LOG_JSON"),
    )
    log_dir: Path = Field(
        default=Path(__file__).resolve().parent / "logs",
        validation_alias=AliasChoices("LOG_DIR", "APP_LOG_DIR"),
    )
    rotation: str = Field(default="1d", validation_alias=AliasChoices("LOG_ROTATION", "APP_LOG_ROTATION"))
    retention: str = Field(default="7d", validation_alias=AliasChoices("LOG_RETENTION", "APP_LOG_RETENTION"))
    async_enabled: bool = Field(default=False, validation_alias=AliasChoices("LOG_ASYNC", "APP_LOG_ASYNC"))


class Settings(BaseSettings):
    """
    Global settings for the API application.
    """

    def __init__(  # type: ignore[no-untyped-def]
        self,
        **data,
    ) -> None:
        super().__init__(**data)
        self._apply_env_overrides()

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        env_nested_delimiter=".",
        extra="ignore",
        case_sensitive=False,
        validate_default=True,
    )
    app_env: Literal["development", "production", "test"] = Field(
        default="development",
        validation_alias=AliasChoices("APP_ENV", "ENV"),
    )

    @computed_field
    @property
    def debug(self) -> bool:
        return self.app_env == "development"

    @computed_field
    @property
    def enable_docs(self) -> bool:
        return self.app_env in {"development", "test"}

    application: ApplicationSettings = Field(default_factory=ApplicationSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)

    def _apply_env_overrides(self) -> None:
        def _merge_settings(current, overrides):
            updates = {name: getattr(overrides, name) for name in overrides.model_fields_set}
            if not updates:
                return current
            return current.model_copy(update=updates)

        self.application = _merge_settings(self.application, ApplicationSettings())
        self.logging = _merge_settings(self.logging, LoggingSettings())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    import os

    current = os.getenv("APP_ENV") or os.getenv("ENV") or "development"
    env_files = (".env", f".env.{current}", ".env.local")

    return Settings(_env_file=env_files, _env_file_encoding="utf-8")
