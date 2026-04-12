from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

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
        default=True,
        validation_alias=AliasChoices("TEST_DATABASE__ENABLED", "TEST_DB_ENABLED"),
    )
    database_name: str = Field(
        default="arclayer_test",
        validation_alias=AliasChoices("TEST_DATABASE__NAME", "TEST_DB_NAME"),
    )
    valkey_enabled: bool = Field(
        default=True,
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


class SecuritySettings(BaseSettings):
    """
    Security settings for runtime secrets and FastAPI Guard integration.
    """

    class CSRFSettings(BaseModel):
        enabled: bool = Field(default=False, description="Whether to enable CSRF protection via FastAPI Guard hooks.")
        header_name: str = Field(default="X-CSRF-Token", min_length=1, description="Header used to submit CSRF token.")
        cookie_name: str = Field(default="csrf_token", min_length=1, description="Cookie used to persist CSRF token.")
        cookie_secure: bool = Field(default=False, description="Whether the CSRF cookie should be marked Secure.")
        cookie_httponly: bool = Field(
            default=False,
            description="Whether the CSRF cookie should be marked HttpOnly.",
        )
        cookie_samesite: Literal["lax", "strict", "none"] = Field(
            default="lax",
            description="SameSite policy for the CSRF cookie.",
        )
        safe_methods: list[str] = Field(
            default_factory=lambda: ["GET", "HEAD", "OPTIONS", "TRACE"],
            description="HTTP methods that should mint/read a CSRF cookie without validation.",
        )
        token_bytes: int = Field(
            default=32,
            ge=8,
            le=128,
            description="Entropy size used when minting CSRF tokens.",
        )

    model_config = SettingsConfigDict(
        env_prefix="SECURITY__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    master_key_path: Path = Field(
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "master.key",
        description="Path to the master key file used for non-config secret encryption flows.",
    )
    signing_private_key_path: Path = Field(
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "signing.ed25519",
        description="Path to the Ed25519 private key used to sign system config revisions.",
    )
    signing_public_key_path: Path = Field(
        default=Path(__file__).resolve().parents[3] / "data" / "secrets" / "signing.ed25519.pub",
        description="Path to the Ed25519 public key used to verify system config revision signatures.",
    )
    enabled: bool = Field(default=False, description="Whether to enable FastAPI Guard middleware.")
    passive_mode: bool = Field(default=False, description="Whether FastAPI Guard should log suspicious activity only.")
    enable_redis: bool = Field(default=False, description="Whether FastAPI Guard should use Redis-backed shared state.")
    redis_url: str | None = Field(
        default="redis://127.0.0.1:6379/0",
        description="Redis URL used by FastAPI Guard when distributed state is enabled.",
    )
    redis_prefix: str = Field(default="arclayer:guard:", description="Redis key prefix used by FastAPI Guard.")
    whitelist: list[str] | None = Field(default=None, description="IP addresses or CIDR ranges always allowed.")
    blacklist: list[str] = Field(default_factory=list, description="IP addresses or CIDR ranges always blocked.")
    whitelist_countries: list[str] = Field(default_factory=list, description="ISO country codes always allowed.")
    blocked_countries: list[str] = Field(default_factory=list, description="ISO country codes always blocked.")
    blocked_user_agents: list[str] = Field(
        default_factory=list, description="User-Agent substrings or patterns to block."
    )
    auto_ban_threshold: int = Field(default=10, ge=1, le=10_000, description="Suspicious request threshold before ban.")
    auto_ban_duration: int = Field(
        default=3600,
        ge=60,
        le=31_536_000,
        description="Ban duration in seconds for automatically banned IP addresses.",
    )
    custom_log_file: str | None = Field(default=None, description="Optional file path for FastAPI Guard security logs.")
    log_suspicious_level: Literal["INFO", "DEBUG", "WARNING", "ERROR", "CRITICAL"] | None = Field(default="WARNING")
    log_request_level: Literal["INFO", "DEBUG", "WARNING", "ERROR", "CRITICAL"] | None = Field(default=None)
    log_format: Literal["text", "json"] = Field(default="text", description="Log output format used by FastAPI Guard.")
    custom_error_responses: dict[int, str] = Field(
        default_factory=dict, description="Custom error messages by status code."
    )
    enable_rate_limiting: bool = Field(default=False, description="Whether to enable FastAPI Guard rate limiting.")
    rate_limit: int = Field(default=100, ge=1, le=1_000_000, description="Allowed requests per rate limit window.")
    rate_limit_window: int = Field(
        default=60,
        ge=1,
        le=86_400,
        description="Rate limiting window size in seconds.",
    )
    enforce_https: bool = Field(default=False, description="Whether FastAPI Guard should redirect insecure requests.")
    security_headers: dict[str, Any] | None = Field(
        default=None,
        description="FastAPI Guard security headers configuration object.",
    )
    enable_cors: bool = Field(default=False, description="Whether FastAPI Guard should configure CORS.")
    cors_allow_origins: list[str] = Field(default_factory=list, description="Allowed origins for CORS requests.")
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["GET"], description="Allowed CORS methods.")
    cors_allow_headers: list[str] = Field(default_factory=list, description="Allowed CORS request headers.")
    cors_allow_credentials: bool = Field(default=False, description="Whether credentialed CORS requests are allowed.")
    cors_expose_headers: list[str] = Field(
        default_factory=list, description="CORS response headers exposed to clients."
    )
    cors_max_age: int = Field(default=600, ge=0, le=86_400, description="CORS preflight cache duration in seconds.")
    block_cloud_providers: set[Literal["AWS", "GCP", "Azure"]] = Field(
        default_factory=set,
        description="Cloud providers whose IP ranges should be blocked.",
    )
    cloud_ip_refresh_interval: int = Field(
        default=3600,
        ge=60,
        le=86_400,
        description="How often cloud provider IP ranges should be refreshed.",
    )
    exclude_paths: list[str] = Field(
        default_factory=lambda: [
            "/docs",
            "/redoc",
            "/openapi.json",
            "/favicon.ico",
            "/static",
        ],
        description="Request paths that should bypass FastAPI Guard checks.",
    )
    enable_ip_banning: bool = Field(default=False, description="Whether FastAPI Guard should ban suspicious IPs.")
    enable_penetration_detection: bool = Field(
        default=False,
        description="Whether FastAPI Guard should inspect requests for suspicious patterns.",
    )
    custom_penetration_patterns: list[str] = Field(
        default_factory=list,
        description="Additional custom penetration-detection regex patterns to register.",
    )
    csrf: CSRFSettings = Field(default_factory=CSRFSettings)

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

    @field_validator("redis_url", "custom_log_file", "log_suspicious_level", "log_request_level", mode="before")
    @classmethod
    def _normalize_optional_blank_strings(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("blocked_user_agents", "whitelist_countries", "blocked_countries", "exclude_paths", mode="after")
    @classmethod
    def _strip_list_entries(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()]

    @field_validator("custom_penetration_patterns", mode="after")
    @classmethod
    def _strip_custom_patterns(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()]

    @field_validator(
        "cors_allow_origins", "cors_allow_methods", "cors_allow_headers", "cors_expose_headers", mode="after"
    )
    @classmethod
    def _normalize_cors_lists(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()]
