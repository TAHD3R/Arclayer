from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, TypeVar, cast

from pydantic import AliasChoices, Field, SecretStr, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent  # `<repo>/apps/api`
_REPO_ROOT = _API_DIR.parents[1]  # `<repo>`
_REPO_ROOT_PREFIXES = {
    "apps",
    "data",
    "packages",
    "plugins",
    "locales",
    "static",
    "docs",
    "docker",
}

S = TypeVar("S", bound=BaseSettings)


def _build_settings_from_env_file(
    settings_cls: type[S],
    *,
    env_file: Any,
    env_file_encoding: str,
) -> S:
    """
    Instantiate a pydantic-settings BaseSettings subclass using runtime dotenv sources.

    Notes:
    - pydantic-settings supports `_env_file` / `_env_file_encoding` at runtime, but some type stubs
      don't expose these kwargs, which can confuse Pyright.
    - We isolate the cast here to keep the rest of the codebase strongly typed.
    """

    cls_any = cast(Any, settings_cls)
    return cls_any(_env_file=env_file, _env_file_encoding=env_file_encoding)


def _normalize_fs_path(value: Path, *, default_base: Path) -> Path:
    if value.is_absolute():
        return value

    first = value.parts[0] if value.parts else ""
    if first in _REPO_ROOT_PREFIXES:
        return (_REPO_ROOT / value).resolve()

    return (default_base / value).resolve()


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
    app_name: str = Field(default="Celestial Framework API", validation_alias="APP_NAME")
    app_version: str = Field(default="2026.01.18-dev", validation_alias="APP_VERSION")
    app_description: str = Field(
        default="Celestial is a light-weight, modular plugin-based ASGI python framework based on FastAPI.",
        validation_alias="APP_DESCRIPTION",
    )
    deployment_mode: Literal["saas", "self_host"] = Field(
        default="self_host",
        validation_alias=AliasChoices("DEPLOYMENT_MODE", "APPLICATION_DEPLOYMENT_MODE"),
        description="Deployment mode used to gate instance-level capabilities in the admin console.",
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
    frontend_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("FRONTEND_BASE_URL", "APP_FRONTEND_BASE_URL"),
        description="Base URL for the frontend application (used in emails, e.g. reset-password links).",
    )

    @field_validator("static_dir", mode="after")
    @classmethod
    def _normalize_static_dir(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_REPO_ROOT)


class StorageSettings(BaseSettings):
    """
    Storage settings for uploads and asset delivery.

    Notes:
    - Paths are deployment settings (environment-level), not admin-configurable values.
    - Default local root points to `<repo>/data/uploads`.
    """

    model_config = SettingsConfigDict(
        env_prefix="STORAGE__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    provider: Literal["local", "s3"] = Field(
        default="local",
        validation_alias=AliasChoices("PROVIDER", "STORAGE_PROVIDER", "APP_STORAGE_PROVIDER"),
    )
    local_root_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "data" / "uploads",
        validation_alias=AliasChoices("LOCAL_ROOT_DIR", "STORAGE_LOCAL_ROOT_DIR"),
    )
    local_tmp_dir: Path = Field(
        default=Path(__file__).resolve().parents[2] / "data" / "uploads" / ".tmp",
        validation_alias=AliasChoices("LOCAL_TMP_DIR", "STORAGE_LOCAL_TMP_DIR"),
    )
    public_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("PUBLIC_BASE_URL", "STORAGE_PUBLIC_BASE_URL"),
        description="Optional public base URL (e.g. CDN) used to build absolute asset URLs.",
    )
    s3_endpoint_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("S3_ENDPOINT_URL", "STORAGE_S3_ENDPOINT_URL"),
        description="S3-compatible endpoint URL (e.g. https://s3.amazonaws.com or MinIO endpoint).",
    )
    s3_region: str | None = Field(
        default=None,
        validation_alias=AliasChoices("S3_REGION", "STORAGE_S3_REGION"),
        description="S3 region (optional for some S3-compatible providers).",
    )
    s3_bucket: str | None = Field(
        default=None,
        validation_alias=AliasChoices("S3_BUCKET", "STORAGE_S3_BUCKET"),
        description="S3 bucket name.",
    )
    s3_access_key_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("S3_ACCESS_KEY_ID", "STORAGE_S3_ACCESS_KEY_ID"),
        description="S3 access key id.",
    )
    s3_secret_access_key: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("S3_SECRET_ACCESS_KEY", "STORAGE_S3_SECRET_ACCESS_KEY"),
        description="S3 secret access key.",
    )
    s3_force_path_style: bool = Field(
        default=False,
        validation_alias=AliasChoices("S3_FORCE_PATH_STYLE", "STORAGE_S3_FORCE_PATH_STYLE"),
        description="Force path-style addressing (recommended for some MinIO setups).",
    )
    s3_presign_expires_seconds: int = Field(
        default=900,
        ge=60,
        le=24 * 3600,
        validation_alias=AliasChoices("S3_PRESIGN_EXPIRES_SECONDS", "STORAGE_S3_PRESIGN_EXPIRES_SECONDS"),
        description="Presigned URL TTL (seconds) for multipart upload part URLs.",
    )
    recycle_bin_retention_days: int = Field(
        default=90,
        ge=1,
        le=3650,
        validation_alias=AliasChoices("RECYCLE_BIN_RETENTION_DAYS", "STORAGE_RECYCLE_BIN_RETENTION_DAYS"),
    )
    upload_chunk_size_mb: int = Field(
        default=8,
        ge=1,
        le=128,
        validation_alias=AliasChoices("UPLOAD_CHUNK_SIZE_MB", "STORAGE_UPLOAD_CHUNK_SIZE_MB"),
        description="Default chunk size (MiB) for resumable uploads.",
    )
    upload_max_file_size_mb: int = Field(
        default=2048,
        ge=1,
        le=1024 * 100,
        validation_alias=AliasChoices("UPLOAD_MAX_FILE_SIZE_MB", "STORAGE_UPLOAD_MAX_FILE_SIZE_MB"),
        description="Max upload file size (MiB).",
    )
    upload_max_avatar_size_mb: int = Field(
        default=10,
        ge=1,
        le=1024 * 100,
        validation_alias=AliasChoices("UPLOAD_MAX_AVATAR_SIZE_MB", "STORAGE_UPLOAD_MAX_AVATAR_SIZE_MB"),
        description="Max avatar upload size (MiB).",
    )
    upload_max_site_logo_size_mb: int = Field(
        default=20,
        ge=1,
        le=1024 * 100,
        validation_alias=AliasChoices("UPLOAD_MAX_SITE_LOGO_SIZE_MB", "STORAGE_UPLOAD_MAX_SITE_LOGO_SIZE_MB"),
        description="Max site logo upload size (MiB).",
    )
    upload_max_favicon_size_mb: int = Field(
        default=2,
        ge=1,
        le=1024 * 100,
        validation_alias=AliasChoices("UPLOAD_MAX_FAVICON_SIZE_MB", "STORAGE_UPLOAD_MAX_FAVICON_SIZE_MB"),
        description="Max favicon upload size (MiB).",
    )
    upload_session_ttl_seconds: int = Field(
        default=3600,
        ge=60,
        le=7 * 24 * 3600,
        validation_alias=AliasChoices("UPLOAD_SESSION_TTL_SECONDS", "STORAGE_UPLOAD_SESSION_TTL_SECONDS"),
        description="Upload session TTL (seconds).",
    )

    @field_validator("local_root_dir", "local_tmp_dir", mode="after")
    @classmethod
    def _normalize_storage_paths(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_REPO_ROOT)


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
    omit_tortoise_logs: bool = Field(
        default=False,
        validation_alias=AliasChoices("OMIT_TORTOISE_LOGS", "TORTOISE_LOGS_OMIT"),
    )
    omit_uvicorn_access_logs: bool = Field(
        default=True,
        validation_alias=AliasChoices("OMIT_UVICORN_ACCESS_LOGS", "UVICORN_ACCESS_LOGS_OMIT"),
    )
    trace_header_name: str = Field(
        default="X-Trace-Id",
        validation_alias=AliasChoices("TRACE_HEADER_NAME", "X_TRACE_ID_HEADER"),
    )
    request_log_omit_paths: list[str] = Field(
        default_factory=lambda: [
            "/metrics",
            "/openapi.json",
            "/docs",
            "/redoc",
            "/spotlight",
            "/favicon.ico",
        ],
        validation_alias=AliasChoices("REQUEST_LOG_OMIT_PATHS"),
    )
    request_log_omit_path_prefixes: list[str] = Field(
        default_factory=lambda: [
            "/static",
            "/_docs",
        ],
        validation_alias=AliasChoices("REQUEST_LOG_OMIT_PATH_PREFIXES"),
    )

    @field_validator("log_dir", mode="after")
    @classmethod
    def _normalize_log_dir(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_API_DIR)


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


class TestingSettings(BaseSettings):
    """
    Testing settings for integration tests.
    """

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    database_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("TEST_DATABASE__ENABLED", "TEST_DB_ENABLED"),
    )
    database_name: str = Field(
        default="celestial_test",
        validation_alias=AliasChoices("TEST_DATABASE__NAME", "TEST_DB_NAME"),
    )
    valkey_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("TEST_VALKEY__ENABLED", "TEST_CACHE_ENABLED"),
    )
    valkey_db: int = Field(
        default=15,
        validation_alias=AliasChoices("TEST_VALKEY__DB", "TEST_CACHE_DB"),
    )
    valkey_prefix: str = Field(
        default="test",
        validation_alias=AliasChoices("TEST_VALKEY__PREFIX", "TEST_CACHE_PREFIX"),
    )
    valkey_default_ttl: int | None = Field(
        default=5,
        validation_alias=AliasChoices("TEST_VALKEY__DEFAULT_TTL", "TEST_CACHE_DEFAULT_TTL"),
    )


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
    allow_public_register: bool = Field(
        default=False,
        validation_alias=AliasChoices("ALLOW_PUBLIC_REGISTER", "PUBLIC_REGISTER_ENABLED"),
        description="Whether to allow public registration via /api/v1/auth/register.",
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

    @field_validator("template_dir", mode="after")
    @classmethod
    def _normalize_template_dir(cls, value: Path | None) -> Path | None:
        if value is None:
            return None
        return _normalize_fs_path(value, default_base=_REPO_ROOT / "static")


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

    @field_validator("root_dir", mode="after")
    @classmethod
    def _normalize_plugin_root_dir(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_REPO_ROOT)


class SetupSettings(BaseSettings):
    """
    One-time system initialization (bootstrap) settings.
    """

    model_config = SettingsConfigDict(
        env_prefix="SETUP__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=True)
    token: SecretStr | None = Field(default=None, description="Optional setup token for /system/setup.")
    master_key_path: Path = Field(
        default=Path(__file__).resolve().parents[2] / "data" / "secrets" / "master.key",
        description="Path to the master key file used to encrypt secrets in settings.",
    )

    @field_validator("master_key_path", mode="after")
    @classmethod
    def _normalize_master_key_path(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_REPO_ROOT)


class Settings(BaseSettings):
    """
    Global settings for the API application.
    """

    def __init__(  # type: ignore[no-untyped-def]
        self,
        **data,
    ) -> None:
        # Capture runtime env file config so we can reuse it for nested settings overrides.
        #
        # Why this exists:
        # - `Settings(_env_file=...)` is used by get_settings() to load `.env.*`.
        # - Nested BaseSettings models (e.g. MiddlewareSettings) support legacy APP_* aliases,
        #   but those aliases are not discoverable via Settings' `env_nested_delimiter` mapping.
        # - We re-parse nested settings once using the same dotenv sources, then merge only the
        #   explicitly provided values (env/dotenv) into the already-initialized settings tree.
        self._runtime_env_file = data.get("_env_file")
        self._runtime_env_file_encoding = data.get("_env_file_encoding")

        super().__init__(**data)
        self._apply_env_overrides()
        self._apply_test_mode_overrides()

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

    application: ApplicationSettings = Field(default_factory=ApplicationSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    valkey: ValkeySettings = Field(default_factory=ValkeySettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    middleware: MiddlewareSettings = Field(default_factory=MiddlewareSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    email: EmailSettings = Field(default_factory=EmailSettings)
    plugin: PluginSettings = Field(default_factory=PluginSettings)
    setup: SetupSettings = Field(default_factory=SetupSettings)
    testing: TestingSettings = Field(default_factory=TestingSettings)

    @computed_field
    @property
    def debug(self) -> bool:
        return self.app_env == "development"

    @computed_field
    @property
    def enable_docs(self) -> bool:
        return self.app_env in {"development", "test"}

    @classmethod
    def settings_customise_sources(  # type: ignore[override]
        cls,
        settings_cls,  # type: ignore[no-untyped-def]
        init_settings,  # type: ignore[no-untyped-def]
        env_settings,  # type: ignore[no-untyped-def]
        dotenv_settings,  # type: ignore[no-untyped-def]
        file_secret_settings,  # type: ignore[no-untyped-def]
    ):  # type: ignore[no-untyped-def]
        """
        Make environment-based configuration override init kwargs.

        Why:
        - By default, BaseSettings gives init kwargs higher priority than env/dotenv.
        - In deployment, env/dotenv should always be able to override code-provided settings.
        - This also avoids re-instantiating nested settings models for env overrides.
        """

        # Order is highest priority -> lowest priority.
        return env_settings, dotenv_settings, file_secret_settings, init_settings

    def _apply_env_overrides(self) -> None:
        env_file = getattr(self, "_runtime_env_file", None)
        env_file_encoding = getattr(self, "_runtime_env_file_encoding", None) or "utf-8"

        def _merge_settings(current: Any, overrides: Any) -> Any:
            updates = {name: getattr(overrides, name) for name in overrides.model_fields_set}
            if not updates:
                return current
            return current.model_copy(update=updates)

        # Re-parse nested settings so "APP_*" aliases (and other non-nested env keys) work even
        # when Settings is primarily populated via nested delimiter env vars (e.g. MIDDLEWARE__*).
        self.application = _merge_settings(
            self.application,
            _build_settings_from_env_file(ApplicationSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.storage = _merge_settings(
            self.storage,
            _build_settings_from_env_file(StorageSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.logging = _merge_settings(
            self.logging,
            _build_settings_from_env_file(LoggingSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.database = _merge_settings(
            self.database,
            _build_settings_from_env_file(DatabaseSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.valkey = _merge_settings(
            self.valkey,
            _build_settings_from_env_file(ValkeySettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.observability = _merge_settings(
            self.observability,
            _build_settings_from_env_file(
                ObservabilitySettings, env_file=env_file, env_file_encoding=env_file_encoding
            ),
        )
        self.middleware = _merge_settings(
            self.middleware,
            _build_settings_from_env_file(MiddlewareSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.auth = _merge_settings(
            self.auth,
            _build_settings_from_env_file(AuthSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.email = _merge_settings(
            self.email,
            _build_settings_from_env_file(EmailSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.plugin = _merge_settings(
            self.plugin,
            _build_settings_from_env_file(PluginSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.setup = _merge_settings(
            self.setup,
            _build_settings_from_env_file(SetupSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )
        self.testing = _merge_settings(
            self.testing,
            _build_settings_from_env_file(TestingSettings, env_file=env_file, env_file_encoding=env_file_encoding),
        )

    def _apply_test_mode_overrides(self) -> None:
        if self.app_env == "test":
            if self.testing.database_enabled:
                updates: dict[str, Any] = {
                    "enabled": True,
                    "database": self.testing.database_name,
                }
                self.database = self.database.model_copy(update=updates)
            if self.testing.valkey_enabled:
                updates: dict[str, Any] = {
                    "enabled": True,
                    "db": self.testing.valkey_db,
                    "prefix": self.testing.valkey_prefix,
                }
                if self.testing.valkey_default_ttl is not None:
                    updates["default_ttl"] = self.testing.valkey_default_ttl
                self.valkey = self.valkey.model_copy(update=updates)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    import os

    current = os.getenv("APP_ENV") or os.getenv("ENV") or "development"
    env_files = (".env", f".env.{current}", ".env.local")

    return _build_settings_from_env_file(Settings, env_file=env_files, env_file_encoding="utf-8")
