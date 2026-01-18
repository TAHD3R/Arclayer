from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ApplicationSettings(BaseSettings):
    """
    Application-specific settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="APPLICATION__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    api_prefix: str = Field(
        default="/api",
        validation_alias=AliasChoices("API_PREFIX"),
    )
    api_version_prefix: str = Field(
        default="/v1",
        validation_alias=AliasChoices("API_VERSION_PREFIX", "API_V1_PREFIX"),
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
        env_prefix="LOGGING__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
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


class DatabaseSettings(BaseSettings):
    """
    Database settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="DATABASE__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False, validation_alias=AliasChoices("DB_ENABLED", "DATABASE_ENABLED"))
    engine: str = Field(
        default="tortoise.backends.asyncpg", validation_alias=AliasChoices("DB_ENGINE", "DATABASE_ENGINE")
    )
    host: str = Field(default="127.0.0.1", validation_alias=AliasChoices("DB_HOST", "DATABASE_HOST"))
    port: int = Field(default=5432, validation_alias=AliasChoices("DB_PORT", "DATABASE_PORT"))
    user: str = Field(default="postgres", validation_alias=AliasChoices("DB_USER", "DATABASE_USER"))
    password: SecretStr = Field(
        default=SecretStr(""), validation_alias=AliasChoices("DB_PASSWORD", "DATABASE_PASSWORD")
    )
    database: str = Field(default="celestial", validation_alias=AliasChoices("DB_NAME", "DATABASE_NAME"))
    pool_size: int = Field(default=10, validation_alias=AliasChoices("DB_POOL_SIZE", "DATABASE_POOL_SIZE"))
    use_tz: bool = Field(default=True, validation_alias=AliasChoices("DB_USE_TZ", "DATABASE_USE_TZ"))
    timezone: str = Field(default="UTC", validation_alias=AliasChoices("DB_TIMEZONE", "DATABASE_TIMEZONE"))
    core_models: list[str] = Field(
        default_factory=lambda: ["apps.api.models"],
        validation_alias=AliasChoices("DB_CORE_MODELS", "DATABASE_CORE_MODELS"),
    )
    plugin_packages: list[str] = Field(
        default_factory=lambda: ["apps.api.plugins"],
        validation_alias=AliasChoices("DB_PLUGIN_PACKAGES", "DATABASE_PLUGIN_PACKAGES"),
    )
    models_max_depth: int | None = Field(
        default=3,
        validation_alias=AliasChoices("DB_MODELS_MAX_DEPTH", "DATABASE_MODELS_MAX_DEPTH"),
    )

    @computed_field
    @property
    def dsn_async(self) -> str:
        password = self.password.get_secret_value()
        return f"postgresql://{self.user}:{password}@{self.host}:{self.port}/{self.database}"


class ValkeySettings(BaseSettings):
    """
    Valkey settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="VALKEY__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False, validation_alias=AliasChoices("VALKEY_ENABLED", "CACHE_ENABLED"))
    host: str = Field(default="127.0.0.1", validation_alias=AliasChoices("VALKEY_HOST", "CACHE_HOST"))
    port: int = Field(default=6379, validation_alias=AliasChoices("VALKEY_PORT", "CACHE_PORT"))
    db: int = Field(default=0, validation_alias=AliasChoices("VALKEY_DB", "CACHE_DB"))
    username: str | None = Field(default=None, validation_alias=AliasChoices("VALKEY_USERNAME", "CACHE_USERNAME"))
    password: SecretStr = Field(
        default=SecretStr(""), validation_alias=AliasChoices("VALKEY_PASSWORD", "CACHE_PASSWORD")
    )
    prefix: str = Field(default="", validation_alias=AliasChoices("VALKEY_PREFIX", "CACHE_PREFIX"))
    default_ttl: int | None = Field(
        default=None, validation_alias=AliasChoices("VALKEY_DEFAULT_TTL", "CACHE_DEFAULT_TTL")
    )
    limiter_enabled: bool = Field(default=False)
    limiter_prefix: str = Field(default="fastapi-limiter")

    @computed_field
    @property
    def dsn(self) -> str:
        user = f"{self.username}:" if self.username else ""
        password = self.password.get_secret_value()
        auth = f"{user}{password}@" if password else ""
        return f"redis://{auth}{self.host}:{self.port}/{self.db}"


class ObservabilitySettings(BaseSettings):
    """
    Observability settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="OBSERVABILITY__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    sentry_enabled: bool = Field(default=False, validation_alias=AliasChoices("SENTRY_ENABLED", "APP_SENTRY_ENABLED"))
    sentry_dsn: str | None = Field(default=None, validation_alias=AliasChoices("SENTRY_DSN", "APP_SENTRY_DSN"))
    sentry_environment: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SENTRY_ENVIRONMENT", "APP_SENTRY_ENVIRONMENT"),
    )
    sentry_release: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SENTRY_RELEASE", "APP_SENTRY_RELEASE"),
    )
    sentry_traces_sample_rate: float = Field(
        default=0.0,
        validation_alias=AliasChoices("SENTRY_TRACES_SAMPLE_RATE", "APP_SENTRY_TRACES_SAMPLE_RATE"),
    )
    sentry_profiles_sample_rate: float = Field(
        default=0.0,
        validation_alias=AliasChoices("SENTRY_PROFILES_SAMPLE_RATE", "APP_SENTRY_PROFILES_SAMPLE_RATE"),
    )
    sentry_send_pii: bool = Field(
        default=False,
        validation_alias=AliasChoices("SENTRY_SEND_PII", "APP_SENTRY_SEND_PII"),
    )

    metrics_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("METRICS_ENABLED", "APP_METRICS_ENABLED"),
    )
    metrics_path: str = Field(
        default="/metrics",
        validation_alias=AliasChoices("METRICS_PATH", "APP_METRICS_PATH"),
    )
    metrics_include_in_schema: bool = Field(
        default=False,
        validation_alias=AliasChoices("METRICS_INCLUDE_IN_SCHEMA", "APP_METRICS_INCLUDE_IN_SCHEMA"),
    )


class MiddlewareSettings(BaseSettings):
    """
    Middleware settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="MIDDLEWARE__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    cors_enabled: bool = Field(default=False, validation_alias=AliasChoices("CORS_ENABLED", "APP_CORS_ENABLED"))
    cors_allow_origins: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("CORS_ALLOW_ORIGINS", "APP_CORS_ALLOW_ORIGINS"),
    )
    cors_allow_methods: list[str] = Field(
        default_factory=lambda: ["GET"],
        validation_alias=AliasChoices("CORS_ALLOW_METHODS", "APP_CORS_ALLOW_METHODS"),
    )
    cors_allow_headers: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("CORS_ALLOW_HEADERS", "APP_CORS_ALLOW_HEADERS"),
    )
    cors_allow_credentials: bool = Field(
        default=False,
        validation_alias=AliasChoices("CORS_ALLOW_CREDENTIALS", "APP_CORS_ALLOW_CREDENTIALS"),
    )
    cors_allow_origin_regex: str | None = Field(
        default=None,
        validation_alias=AliasChoices("CORS_ALLOW_ORIGIN_REGEX", "APP_CORS_ALLOW_ORIGIN_REGEX"),
    )
    cors_expose_headers: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("CORS_EXPOSE_HEADERS", "APP_CORS_EXPOSE_HEADERS"),
    )
    cors_max_age: int = Field(default=600, validation_alias=AliasChoices("CORS_MAX_AGE", "APP_CORS_MAX_AGE"))

    gzip_enabled: bool = Field(default=False, validation_alias=AliasChoices("GZIP_ENABLED", "APP_GZIP_ENABLED"))
    gzip_minimum_size: int = Field(
        default=500,
        validation_alias=AliasChoices("GZIP_MINIMUM_SIZE", "APP_GZIP_MINIMUM_SIZE"),
    )
    gzip_compresslevel: int = Field(
        default=9,
        validation_alias=AliasChoices("GZIP_COMPRESSLEVEL", "APP_GZIP_COMPRESSLEVEL"),
    )

    trusted_host_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("TRUSTED_HOST_ENABLED", "APP_TRUSTED_HOST_ENABLED"),
    )
    trusted_hosts: list[str] = Field(
        default_factory=lambda: ["*"],
        validation_alias=AliasChoices("TRUSTED_HOSTS", "APP_TRUSTED_HOSTS"),
    )
    trusted_host_www_redirect: bool = Field(
        default=True,
        validation_alias=AliasChoices("TRUSTED_HOST_WWW_REDIRECT", "APP_TRUSTED_HOST_WWW_REDIRECT"),
    )

    https_redirect_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("HTTPS_REDIRECT_ENABLED", "APP_HTTPS_REDIRECT_ENABLED"),
    )

    csrf_enabled: bool = Field(default=False, validation_alias=AliasChoices("CSRF_ENABLED", "APP_CSRF_ENABLED"))
    csrf_header_name: str = Field(
        default="X-CSRF-Token",
        validation_alias=AliasChoices("CSRF_HEADER_NAME", "APP_CSRF_HEADER_NAME"),
    )
    csrf_cookie_name: str = Field(
        default="csrf_token",
        validation_alias=AliasChoices("CSRF_COOKIE_NAME", "APP_CSRF_COOKIE_NAME"),
    )
    csrf_cookie_secure: bool = Field(
        default=False,
        validation_alias=AliasChoices("CSRF_COOKIE_SECURE", "APP_CSRF_COOKIE_SECURE"),
    )
    csrf_cookie_httponly: bool = Field(
        default=False,
        validation_alias=AliasChoices("CSRF_COOKIE_HTTPONLY", "APP_CSRF_COOKIE_HTTPONLY"),
    )
    csrf_cookie_samesite: str = Field(
        default="lax",
        validation_alias=AliasChoices("CSRF_COOKIE_SAMESITE", "APP_CSRF_COOKIE_SAMESITE"),
    )
    csrf_safe_methods: list[str] = Field(
        default_factory=lambda: ["GET", "HEAD", "OPTIONS", "TRACE"],
        validation_alias=AliasChoices("CSRF_SAFE_METHODS", "APP_CSRF_SAFE_METHODS"),
    )
    csrf_token_bytes: int = Field(
        default=32,
        validation_alias=AliasChoices("CSRF_TOKEN_BYTES", "APP_CSRF_TOKEN_BYTES"),
    )


class AuthSettings(BaseSettings):
    """
    Auth/JWT settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="AUTH__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    jwt_secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("JWT_SECRET", "APP_JWT_SECRET"),
    )
    jwt_algorithm: str = Field(
        default="HS256",
        validation_alias=AliasChoices("JWT_ALGORITHM", "APP_JWT_ALGORITHM"),
    )
    jwt_issuer: str = Field(
        default="celestial",
        validation_alias=AliasChoices("JWT_ISSUER", "APP_JWT_ISSUER"),
    )
    jwt_audience: str = Field(
        default="celestial",
        validation_alias=AliasChoices("JWT_AUDIENCE", "APP_JWT_AUDIENCE"),
    )
    access_token_ttl_seconds: int = Field(
        default=900,
        validation_alias=AliasChoices("ACCESS_TOKEN_TTL_SECONDS", "ACCESS_TOKEN_TTL"),
    )
    refresh_token_ttl_seconds: int = Field(
        default=2592000,
        validation_alias=AliasChoices("REFRESH_TOKEN_TTL_SECONDS", "REFRESH_TOKEN_TTL"),
    )
    reset_token_ttl_seconds: int = Field(
        default=900,
        validation_alias=AliasChoices("RESET_TOKEN_TTL_SECONDS", "RESET_TOKEN_TTL"),
    )
    password_hash_iterations: int = Field(
        default=120_000,
        validation_alias=AliasChoices("PASSWORD_HASH_ITERATIONS", "APP_PASSWORD_HASH_ITERATIONS"),
    )
    password_hash_salt_bytes: int = Field(
        default=16,
        validation_alias=AliasChoices("PASSWORD_HASH_SALT_BYTES", "APP_PASSWORD_HASH_SALT_BYTES"),
    )


class EmailSettings(BaseSettings):
    """
    Email settings for the API application.
    """

    model_config = SettingsConfigDict(
        env_prefix="MAIL__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False, validation_alias=AliasChoices("MAIL_ENABLED", "APP_MAIL_ENABLED"))
    username: str | None = Field(default=None, validation_alias=AliasChoices("MAIL_USERNAME", "APP_MAIL_USERNAME"))
    password: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("MAIL_PASSWORD", "APP_MAIL_PASSWORD")
    )
    mail_from: str = Field(default="noreply@example.com", validation_alias=AliasChoices("MAIL_FROM"))
    mail_from_name: str = Field(default="Celestial CMS", validation_alias=AliasChoices("MAIL_FROM_NAME"))
    server: str = Field(default="localhost", validation_alias=AliasChoices("MAIL_SERVER"))
    port: int = Field(default=587, validation_alias=AliasChoices("MAIL_PORT"))
    starttls: bool = Field(default=True, validation_alias=AliasChoices("MAIL_STARTTLS"))
    ssl_tls: bool = Field(default=False, validation_alias=AliasChoices("MAIL_SSL_TLS"))
    use_credentials: bool = Field(
        default=True,
        validation_alias=AliasChoices("MAIL_USE_CREDENTIALS", "USE_CREDENTIALS"),
    )
    validate_certs: bool = Field(
        default=True,
        validation_alias=AliasChoices("MAIL_VALIDATE_CERTS", "VALIDATE_CERTS"),
    )
    suppress_send: bool = Field(
        default=False,
        validation_alias=AliasChoices("MAIL_SUPPRESS_SEND", "SUPPRESS_SEND"),
    )
    template_dir: Path | None = Field(default=None, validation_alias=AliasChoices("MAIL_TEMPLATE_DIR"))


class PluginSettings(BaseSettings):
    """
    Plugin system settings.
    """

    model_config = SettingsConfigDict(
        env_prefix="PLUGIN__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=True)
    root_dir: Path = Field(default=Path(__file__).resolve().parents[2] / "plugins")
    auto_migrate: bool = Field(default=True)
    auto_restart: bool = Field(default=True)
    migration_lock_ttl_seconds: int = Field(default=300)
    migration_lock_timeout_seconds: int = Field(default=60)
    restart_poll_interval_seconds: float = Field(default=2.0)
    restart_jitter_seconds: float = Field(default=5.0)


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
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
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
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    valkey: ValkeySettings = Field(default_factory=ValkeySettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    middleware: MiddlewareSettings = Field(default_factory=MiddlewareSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    email: EmailSettings = Field(default_factory=EmailSettings)
    plugin: PluginSettings = Field(default_factory=PluginSettings)

    def _apply_env_overrides(self) -> None:
        def _merge_settings(current, overrides):
            updates = {name: getattr(overrides, name) for name in overrides.model_fields_set}
            if not updates:
                return current
            return current.model_copy(update=updates)

        self.application = _merge_settings(self.application, ApplicationSettings())
        self.logging = _merge_settings(self.logging, LoggingSettings())
        self.database = _merge_settings(self.database, DatabaseSettings())
        self.valkey = _merge_settings(self.valkey, ValkeySettings())
        self.observability = _merge_settings(self.observability, ObservabilitySettings())
        self.middleware = _merge_settings(self.middleware, MiddlewareSettings())
        self.auth = _merge_settings(self.auth, AuthSettings())
        self.email = _merge_settings(self.email, EmailSettings())
        self.plugin = _merge_settings(self.plugin, PluginSettings())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    import os

    current = os.getenv("APP_ENV") or os.getenv("ENV") or "development"
    env_files = (".env", f".env.{current}", ".env.local")

    return Settings(_env_file=env_files, _env_file_encoding="utf-8")
