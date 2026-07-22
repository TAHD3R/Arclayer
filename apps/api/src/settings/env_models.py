from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_SETTINGS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SETTINGS_DIR.parents[3]


def _normalize_runtime_fs_path(value: Path, *, default_base: Path) -> Path:
    if value.is_absolute():
        return value
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
        return (_REPO_ROOT / value).resolve()
    return (default_base / value).resolve()


def _normalize_runtime_path_prefix(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return ""
    normalized = normalized if normalized.startswith("/") else f"/{normalized}"
    return normalized.rstrip("/") or "/"


class TaskiqWorkloadTuningSettings(BaseModel):
    """Explicit Redis Stream and worker intake capacity for one workload."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    max_connection_pool_size: int = Field(default=10, ge=2)
    xread_block_milliseconds: int = Field(default=1000, ge=1)
    xread_count: int = Field(default=10, ge=1)
    idle_timeout_milliseconds: int = Field(default=600_000, ge=1)
    unacknowledged_batch_size: int = Field(default=10, ge=1)
    unacknowledged_lock_timeout_seconds: float = Field(default=30, gt=0)
    worker_processes: int = Field(
        default=1,
        ge=1,
        description="Conservative process baseline pending workload capacity evidence.",
    )
    max_async_tasks: int = Field(
        default=1,
        ge=1,
        description="Per-process concurrency configured explicitly for resource isolation.",
    )
    max_prefetch: int = Field(
        default=1,
        ge=0,
        description="Bounded intake prevents one worker from reserving another pool's work.",
    )


class TaskiqWorkloadSettings(BaseModel):
    """One immutable tuning block per canonical durable workload."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    agent_io: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)
    render_browser: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)
    asset_cpu: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)
    publish: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)
    connector: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)
    maintenance: TaskiqWorkloadTuningSettings = Field(default_factory=TaskiqWorkloadTuningSettings)


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
    stream_prefix: str = Field(default="arclayer:jobs", min_length=1, max_length=192)
    consumer_group_prefix: str = Field(default="arclayer:job-workers", min_length=1, max_length=192)
    consumer_identity: str | None = Field(default=None, min_length=1, max_length=128)
    redis_dsn: str | None = Field(default=None)
    scheduler_leader_lease_seconds: int = Field(
        default=15,
        ge=3,
        description="Renewable Valkey lease that fences scheduled-task publication across replicas.",
    )
    shutdown_timeout_seconds: int = Field(
        default=30,
        ge=1,
        description="Broker lifecycle shutdown budget before process termination continues.",
    )
    wait_tasks_timeout_seconds: int = Field(
        default=300,
        ge=1,
        description="Active-task drain budget; expired leases remain recoverable through fencing.",
    )
    workloads: TaskiqWorkloadSettings = Field(default_factory=TaskiqWorkloadSettings)


class BackgroundJobExecutionSettings(BaseModel):
    """Execution policy snapshot for one durable Job family."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    max_attempts: int = Field(
        default=3,
        ge=1,
        description=(
            "Finite automatic attempts for expensive background work; exhaustion is retained as "
            "dead-letter evidence and requires an explicit retry."
        ),
    )
    initial_delay_seconds: float = Field(
        default=5,
        gt=0,
        description="Base delay before the first automatic retry.",
    )
    multiplier: float = Field(
        default=2,
        gt=1,
        description="Exponential retry delay multiplier.",
    )
    maximum_delay_seconds: float = Field(
        default=300,
        gt=0,
        description="Upper bound applied before full jitter.",
    )
    timeout_seconds: int | None = Field(
        default=None,
        ge=1,
        description="Optional handler deadline. None avoids an unvalidated media-size cutoff.",
    )
    lease_seconds: int = Field(
        default=90,
        ge=3,
        description="Renewable execution lease duration; this is not a handler runtime cap.",
    )
    heartbeat_seconds: int = Field(
        default=30,
        ge=1,
        description="Heartbeat interval used to renew the execution lease.",
    )

    @model_validator(mode="after")
    def validate_lease_window(self) -> BackgroundJobExecutionSettings:
        if self.maximum_delay_seconds < self.initial_delay_seconds:
            raise ValueError("maximumDelaySeconds must be greater than or equal to initialDelaySeconds")
        if self.lease_seconds < self.heartbeat_seconds * 3:
            raise ValueError("leaseSeconds must allow at least three heartbeat intervals")
        return self


class BackgroundJobDispatcherSettings(BaseModel):
    """Transactional outbox dispatcher lease, retry, and polling policy."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    batch_size: int = Field(default=50, ge=1)
    lease_seconds: int = Field(default=30, ge=1)
    max_attempts: int = Field(default=10, ge=1)
    retry_delay_seconds: int = Field(default=5, ge=1)
    poll_interval_seconds: float = Field(default=1, gt=0)


class ProviderEffectRecoverySettings(BackgroundJobExecutionSettings):
    """Execution and bounded scan policy for terminal Provider Effect recovery."""

    scan_batch_size: int = Field(default=50, ge=1)
    scan_interval_seconds: int = Field(default=60, ge=1)


class AgentRunJobExecutionSettings(BackgroundJobExecutionSettings):
    """Retry window for reconciling worker loss without duplicating provider effects."""

    max_attempts: int = Field(default=3, ge=2)
    initial_delay_seconds: float = Field(default=300, gt=0)
    multiplier: float = Field(default=2, gt=1)
    maximum_delay_seconds: float = Field(default=900, gt=0)
    timeout_seconds: int | None = Field(default=None, ge=1)


class BackgroundJobsSettings(BaseSettings):
    """Durable Job policies; transport capacity remains owned by Taskiq topology settings."""

    model_config = SettingsConfigDict(
        env_prefix="BACKGROUND_JOBS__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    asset_thumbnail: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    agent_run: AgentRunJobExecutionSettings = Field(default_factory=AgentRunJobExecutionSettings)
    builder_generation: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    knowledge_source_ingest: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    knowledge_source_index: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    skill_github_import: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    skill_github_refresh: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    billing_connector_event: BackgroundJobExecutionSettings = Field(default_factory=BackgroundJobExecutionSettings)
    provider_effect_recovery: ProviderEffectRecoverySettings = Field(default_factory=ProviderEffectRecoverySettings)
    dispatcher: BackgroundJobDispatcherSettings = Field(default_factory=BackgroundJobDispatcherSettings)


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

    database_enabled: bool = Field(default=True)
    database_name: str = Field(default="arclayer_test")
    valkey_enabled: bool = Field(default=True)
    valkey_db: int = Field(default=15)
    valkey_prefix: str = Field(default="test")
    valkey_default_ttl: int | None = Field(default=5)


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
            description="Optional cookie Domain override. If omitted, shared-domain deployments may derive it from base_domain.",
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

    jwt_secret: SecretStr = Field(default=SecretStr(""))
    jwt_algorithm: str = Field(default="HS256")
    jwt_issuer: str = Field(default="arclayer")
    jwt_audience: str = Field(default="arclayer")
    access_token_ttl_seconds: int = Field(default=900)
    sys_access_token_ttl_seconds: int = Field(
        default=300,
        ge=60,
        le=24 * 3600,
        description="Short-lived step-up token TTL (seconds) for /sys governance endpoints.",
    )
    refresh_token_ttl_seconds: int = Field(default=2592000)
    reset_token_ttl_seconds: int = Field(default=900)
    allow_public_register: bool = Field(
        default=False,
        description="Whether to allow public registration via /api/v1/auth/register.",
    )
    password_hash_iterations: int = Field(default=120_000)
    password_hash_salt_bytes: int = Field(default=16)

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
        description="Secret used to encode/decode public ids. Must be stable across deploys.",
    )
    rounds: int = Field(
        default=8,
        ge=4,
        le=16,
        description="Feistel rounds for the public id permutation (4-16).",
    )
    accept_raw_uuid_input: bool = Field(
        default=True,
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

    enabled: bool = Field(default=False)
    username: str | None = Field(default=None)
    password: SecretStr | None = Field(default=None)
    mail_from: str = Field(default="noreply@example.com")
    mail_from_name: str = Field(default="Arclayer")
    server: str = Field(default="localhost")
    port: int = Field(default=587)
    starttls: bool = Field(default=True)
    ssl_tls: bool = Field(default=False)
    use_credentials: bool = Field(default=True)
    validate_certs: bool = Field(default=True)
    suppress_send: bool = Field(default=False)
    template_dir: Path | None = Field(default=None)
    default_provider: str = Field(default="smtp")
    fallback_chain: list[str] = Field(default_factory=list)
    retry_max_attempts: int = Field(default=3, ge=1, le=10)
    resend_api_key: str = Field(default="")
    cloudflare_api_token: str = Field(default="")
    ses_region: str = Field(default="")

    @field_validator("template_dir", mode="after")
    @classmethod
    def _normalize_template_dir(cls, value: Path | None) -> Path | None:
        if value is None:
            return None
        if not str(value).strip() or value == Path("."):
            return None
        current = Path(__file__).resolve().parent
        repo_root = current.parents[2]
        return _normalize_runtime_fs_path(value, default_base=repo_root / "static")


class SaasSettings(BaseSettings):
    """
    Host/domain settings for tenant-aware deployments.
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
        default="arclayer.localhost",
        description="Base domain for published site hostnames and platform-managed subdomains.",
    )
    admin_url: str = Field(
        default="https://app.arclayer.localhost",
        description="Admin console URL.",
    )
    free_tier_page_limit: int = Field(default=20, ge=1, description="Max pages for free tier.")
    free_tier_storage_mb: int = Field(default=500, ge=1, description="Max storage (MiB) for free tier.")


class BillingSettings(BaseSettings):
    """External subscription billing provider configuration."""

    model_config = SettingsConfigDict(
        env_prefix="BILLING__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    provider: Literal["disabled", "stripe"] = Field(default="disabled")
    stripe_secret_key: SecretStr = Field(default=SecretStr(""))
    stripe_webhook_secret: SecretStr = Field(default=SecretStr(""))
    stripe_api_base_url: str = Field(default="https://api.stripe.com/v1")
    webhook_tolerance_seconds: int = Field(default=300, ge=30, le=3_600)
    webhook_event_retention_days: int = Field(
        default=30,
        ge=1,
        le=3_650,
        description="Retention window for encrypted raw billing events used by replay and reconciliation.",
    )

    @property
    def checkout_enabled(self) -> bool:
        return self.provider == "stripe" and bool(self.stripe_secret_key.get_secret_value())

    @property
    def webhook_enabled(self) -> bool:
        return self.checkout_enabled and bool(self.stripe_webhook_secret.get_secret_value())


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
        protected_path_prefixes: list[str] = Field(
            default_factory=lambda: ["/api"],
            description="Path prefixes whose unsafe browser requests require CSRF validation.",
        )
        exempt_path_prefixes: list[str] = Field(
            default_factory=lambda: ["/content-api", "/api/v1/commerce/webhooks"],
            description="Path prefixes for machine-authenticated or signed APIs that bypass browser CSRF validation.",
        )
        trusted_origins: list[str] = Field(
            default_factory=list,
            description="Allowed Origin values for unsafe browser requests. Empty uses same-origin.",
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
        default=_REPO_ROOT / "data" / "secrets" / "master.key",
        description="Path to the master key file used for non-config secret encryption flows.",
    )
    signing_private_key_path: Path = Field(
        default=_REPO_ROOT / "data" / "secrets" / "signing.ed25519",
        description="Path to the Ed25519 private key used to sign system config revisions.",
    )
    signing_public_key_path: Path = Field(
        default=_REPO_ROOT / "data" / "secrets" / "signing.ed25519.pub",
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
        return _normalize_runtime_fs_path(value, default_base=_REPO_ROOT)

    @field_validator("signing_private_key_path", "signing_public_key_path", mode="after")
    @classmethod
    def _normalize_signing_key_paths(cls, value: Path) -> Path:
        return _normalize_runtime_fs_path(value, default_base=_REPO_ROOT)

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

    @field_validator(
        "csrf",
        mode="after",
    )
    @classmethod
    def _normalize_csrf_policy(cls, value: CSRFSettings) -> CSRFSettings:
        value.safe_methods = [item.strip().upper() for item in value.safe_methods if item and item.strip()]
        value.protected_path_prefixes = [
            _normalize_runtime_path_prefix(item) for item in value.protected_path_prefixes if item and item.strip()
        ]
        value.exempt_path_prefixes = [
            _normalize_runtime_path_prefix(item) for item in value.exempt_path_prefixes if item and item.strip()
        ]
        value.trusted_origins = [item.strip().rstrip("/") for item in value.trusted_origins if item and item.strip()]
        return value
