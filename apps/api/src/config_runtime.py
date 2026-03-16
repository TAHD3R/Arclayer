from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, BaseModel, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_runtime_fs_path(value: Path, *, default_base: Path) -> Path:
    if value.is_absolute():
        return value
    current = Path(__file__).resolve().parent
    repo_root = current.parents[2]
    prefixes = {
        "apps",
        "data",
        "packages",
        "plugins",
        "locales",
        "static",
        "docs",
        "docker",
    }
    first = value.parts[0] if value.parts else ""
    if first in prefixes:
        return (repo_root / value).resolve()
    return (default_base / value).resolve()


class TaskiqSettings(BaseSettings):
    """
    Taskiq worker/scheduler settings.

    Notes:
    - Taskiq requires Redis-compatible storage (Valkey is supported).
    - We run Taskiq as separate processes:
      - worker: executes background jobs
      - scheduler: enqueues scheduled jobs (cron)
    """

    model_config = SettingsConfigDict(
        env_prefix="TASKIQ__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False)
    queue_name: str = Field(default="arclayer:taskiq")
    redis_dsn: str | None = Field(default=None)


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
        default="arclayer_test",
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


class AuthSettings(BaseSettings):
    """
    Auth/JWT settings for the API application.
    """

    class CookieSettings(BaseModel):
        enabled: bool = Field(default=False, description="Whether to store refresh token in an HttpOnly cookie.")
        name: str = Field(
            default="arclayer_refresh_token",
            min_length=1,
            max_length=128,
            description="Cookie name used to store refresh token.",
        )
        domain: str | None = Field(
            default=None,
            description="Optional cookie Domain override. If omitted, defaults to .{saas.base_domain} in SaaS mode.",
        )
        secure: bool = Field(default=False, description="Whether to set Secure on refresh token cookie.")
        samesite: Literal["lax", "strict", "none"] = Field(
            default="lax",
            description="SameSite for refresh token cookie (lax/strict/none).",
        )

        @field_validator("domain", mode="after")
        @classmethod
        def _normalize_domain(cls, value: str | None) -> str | None:
            if value is None:
                return None
            normalized = value.strip()
            return normalized or None

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
        default="arclayer",
        validation_alias=AliasChoices("JWT_ISSUER", "APP_JWT_ISSUER"),
    )
    jwt_audience: str = Field(
        default="arclayer",
        validation_alias=AliasChoices("JWT_AUDIENCE", "APP_JWT_AUDIENCE"),
    )
    access_token_ttl_seconds: int = Field(
        default=900,
        validation_alias=AliasChoices("ACCESS_TOKEN_TTL_SECONDS", "ACCESS_TOKEN_TTL"),
    )
    sys_access_token_ttl_seconds: int = Field(
        default=300,
        ge=60,
        le=24 * 3600,
        validation_alias=AliasChoices("SYS_ACCESS_TOKEN_TTL_SECONDS", "SYS_ACCESS_TOKEN_TTL"),
        description="Short-lived step-up token TTL (seconds) for /sys governance endpoints.",
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

    cookie: CookieSettings = Field(default_factory=CookieSettings)


class PublicIdSettings(BaseSettings):
    """
    Public ID encoding settings.

    Notes:
    - The API stores and processes internal identifiers as UUIDs (uuid7/uuid4).
    - For external surfaces (URLs / JSON), we encode UUIDs into URL-safe short strings.
    - The encoding is reversible and requires a stable secret.
    """

    model_config = SettingsConfigDict(
        env_prefix="PUBLIC_ID__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices("SECRET", "APP_PUBLIC_ID_SECRET"),
        description="Secret used to encode/decode public ids. Must be stable across deploys.",
    )
    rounds: int = Field(
        default=8,
        ge=4,
        le=16,
        validation_alias=AliasChoices("ROUNDS", "APP_PUBLIC_ID_ROUNDS"),
        description="Feistel rounds for the public id permutation (4-16).",
    )
    accept_raw_uuid_input: bool = Field(
        default=True,
        validation_alias=AliasChoices("ACCEPT_RAW_UUID_INPUT", "APP_ACCEPT_RAW_UUID_INPUT"),
        description="If true, API accepts raw UUID strings as inputs in addition to public ids (dev/test convenience).",
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
    mail_from_name: str = Field(default="Arclayer", validation_alias=AliasChoices("MAIL_FROM_NAME"))
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
        current = Path(__file__).resolve().parent
        repo_root = current.parents[2]
        return _normalize_runtime_fs_path(value, default_base=repo_root / "static")


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
    root_dir: Path = Field(default=Path(__file__).resolve().parents[3] / "plugins")
    auto_migrate: bool = Field(default=True)
    auto_restart: bool = Field(default=True)
    package_max_files: int = Field(default=2000, description="Max number of files allowed in a plugin zip package.")
    package_max_total_uncompressed_bytes: int = Field(
        default=200 * 1024 * 1024,
        description="Max total uncompressed bytes allowed when extracting a plugin zip package.",
    )
    package_max_single_file_bytes: int = Field(
        default=50 * 1024 * 1024,
        description="Max uncompressed size for a single file in a plugin zip package.",
    )
    package_max_zip_bytes: int = Field(default=50 * 1024 * 1024, description="Max allowed zip upload bytes.")
    watch_enabled: bool = Field(default=False, description="Enable dev-only file watchers (watchfiles).")
    watch_debounce_ms: int = Field(default=300, description="Debounce window for watch events.")
    watch_locales: bool = Field(default=True, description="Watch locale JSON files and clear i18n cache.")
    watch_plugins: bool = Field(default=True, description="Watch plugin directory changes and request restart.")
    migration_lock_ttl_seconds: int = Field(default=300)
    migration_lock_timeout_seconds: int = Field(default=60)
    restart_poll_interval_seconds: float = Field(default=2.0)
    restart_jitter_seconds: float = Field(default=5.0)

    @field_validator("root_dir", mode="after")
    @classmethod
    def _normalize_plugin_root_dir(cls, value: Path) -> Path:
        current = Path(__file__).resolve().parent
        repo_root = current.parents[2]
        return _normalize_runtime_fs_path(value, default_base=repo_root)


class SaasSettings(BaseSettings):
    """
    SaaS-mode settings (only effective when deployment_mode == "saas").
    """

    model_config = SettingsConfigDict(
        env_prefix="SAAS__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    base_domain: str = Field(
        default="arclayer.app",
        description="Base domain for tenant subdomains (e.g. {workspace_slug}.arclayer.app).",
    )
    admin_url: str = Field(
        default="https://admin.arclayer.app",
        description="Admin console URL.",
    )
    free_tier_page_limit: int = Field(default=20, ge=1, description="Max pages for free tier.")
    free_tier_storage_mb: int = Field(default=500, ge=1, description="Max storage (MiB) for free tier.")


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
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "master.key",
        description="Path to the master key file used to encrypt secrets in settings.",
    )
    signing_private_key_path: Path = Field(
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "signing.ed25519",
        description="Path to the Ed25519 private key used to sign system config revisions.",
    )
    signing_public_key_path: Path = Field(
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "signing.ed25519.pub",
        description="Path to the Ed25519 public key used to verify system config revision signatures.",
    )

    @field_validator("master_key_path", mode="after")
    @classmethod
    def _normalize_master_key_path(cls, value: Path) -> Path:
        current = Path(__file__).resolve().parent
        repo_root = current.parents[2]
        return _normalize_runtime_fs_path(value, default_base=repo_root)

    @field_validator("signing_private_key_path", "signing_public_key_path", mode="after")
    @classmethod
    def _normalize_signing_key_paths(cls, value: Path) -> Path:
        current = Path(__file__).resolve().parent
        repo_root = current.parents[2]
        return _normalize_runtime_fs_path(value, default_base=repo_root)
