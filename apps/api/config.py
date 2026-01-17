from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApplicationSettings(BaseSettings):
    """
    Application-specific settings for the API application.
    """

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


class Settings(BaseSettings):
    """
    Global settings for the API application.
    """

    def __init__(  # type: ignore[no-untyped-def]
        self,
        **data,
    ) -> None:
        super().__init__(**data)

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

    application: ApplicationSettings = ApplicationSettings()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    import os

    current = os.getenv("APP_ENV") or os.getenv("ENV") or "development"
    env_files = (".env", f".env.{current}", ".env.local")

    return Settings(_env_file=env_files, _env_file_encoding="utf-8")
