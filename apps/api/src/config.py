from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, cast

from pydantic import BaseModel, Field, PostgresDsn, SecretStr, computed_field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.settings.env_models import (
    AuthSettings,
    BillingSettings,
    EmailSettings,
    PublicIdSettings,
    SaasSettings,
    SecuritySettings,
    TaskiqSettings,
    TestingSettings,
)

_API_SRC_DIR = Path(__file__).resolve().parent  # `<repo>/apps/api/src`
_API_DIR = _API_SRC_DIR.parent  # `<repo>/apps/api`
_REPO_ROOT = _API_DIR.parents[1]  # `<repo>`
_REPO_ROOT_PREFIXES = {
    "apps",
    "data",
    "packages",
    "locales",
    "static",
    "docs",
    "docker",
}

_DEFAULT_IMAGE_UPLOAD_EXTENSIONS = [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "bmp",
    "tif",
    "tiff",
    "avif",
]
_DEFAULT_LIBRARY_UPLOAD_EXTENSIONS = [
    *_DEFAULT_IMAGE_UPLOAD_EXTENSIONS,
    "zip",
    "pdf",
    "mp4",
    "webm",
    "mov",
    "m4v",
    "woff2",
    "woff",
    "ttf",
    "otf",
    "eot",
]

MAX_OBSERVABILITY_RETENTION_DAYS = 3650


class UploadPurposePolicySettings(BaseModel):
    max_size_mb: int = Field(default=2048, ge=1, le=1024 * 100)
    allowed_extensions: list[str] = Field(default_factory=lambda: list(_DEFAULT_LIBRARY_UPLOAD_EXTENSIONS))

    @field_validator("allowed_extensions", mode="after")
    @classmethod
    def _normalize_allowed_extensions(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            ext = str(item or "").strip().lower().lstrip(".")
            if not ext or ext in seen:
                continue
            seen.add(ext)
            normalized.append(ext)
        return normalized


class UploadPolicySettings(BaseModel):
    defaults: UploadPurposePolicySettings = Field(
        default_factory=lambda: UploadPurposePolicySettings(
            max_size_mb=2048,
            allowed_extensions=list(_DEFAULT_LIBRARY_UPLOAD_EXTENSIONS),
        )
    )
    purposes: dict[str, UploadPurposePolicySettings] = Field(
        default_factory=lambda: {
            "library": UploadPurposePolicySettings(
                max_size_mb=2048,
                allowed_extensions=list(_DEFAULT_LIBRARY_UPLOAD_EXTENSIONS),
            ),
            "avatar": UploadPurposePolicySettings(
                max_size_mb=10,
                allowed_extensions=list(_DEFAULT_IMAGE_UPLOAD_EXTENSIONS),
            ),
            "workspace_icon": UploadPurposePolicySettings(
                max_size_mb=20,
                allowed_extensions=list(_DEFAULT_IMAGE_UPLOAD_EXTENSIONS),
            ),
            "site_logo": UploadPurposePolicySettings(
                max_size_mb=20,
                allowed_extensions=list(_DEFAULT_IMAGE_UPLOAD_EXTENSIONS),
            ),
            "favicon": UploadPurposePolicySettings(
                max_size_mb=2,
                allowed_extensions=["ico", "png"],
            ),
        }
    )


def _build_settings_from_env_file[S: BaseSettings](
    settings_cls: type[S],
    *,
    env_file: Any,
    env_file_encoding: str,
) -> S:
    """
    Instantiate a pydantic-settings BaseSettings subclass using runtime dotenv sources.

    Notes:
    - pydantic-settings supports `_env_file` / `_env_file_encoding` at runtime, but some type stubs
      don't expose these kwargs, which can confuse static type checkers.
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

    api_prefix: str = Field(default="/api")
    api_version_prefix: str = Field(default="/v1")
    content_api_prefix: str = Field(
        default="/content-api",
        description="Root prefix for content consumer and preview delivery APIs.",
    )
    management_api_prefix: str = Field(
        default="/management-api",
        description="Reserved root prefix for future programmatic management APIs.",
    )
    app_host: str = Field(default="127.0.0.1")
    app_port: int = Field(default=8000)
    app_name: str = Field(default="Arclayer API")
    app_version: str = Field(default="2026.01.18-dev")
    app_description: str = Field(default="Structured content, visually built.")
    app_openapi_url: str | None = Field(default="/openapi.json")
    app_docs_url: str | None = Field(default="/docs")
    app_redoc_url: str | None = Field(default="/redoc")
    static_enabled: bool = Field(default=False)
    static_dir: Path = Field(default=_REPO_ROOT / "static")
    data_dir: Path = Field(default=_REPO_ROOT / "data")
    static_url: str = Field(default="/static")
    frontend_base_url: str | None = Field(
        default=None,
        description="Base URL for the frontend application (used in emails, e.g. reset-password links).",
    )

    @field_validator("static_dir", "data_dir", mode="after")
    @classmethod
    def _normalize_application_path(cls, value: Path) -> Path:
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

    default_profile_key: str = Field(default="env-default")
    provider: Literal["local", "s3"] = Field(default="local")
    local_root_dir: Path = Field(default=_REPO_ROOT / "data" / "uploads")
    local_tmp_dir: Path = Field(default=_REPO_ROOT / "data" / "uploads" / ".tmp")
    public_base_url: str | None = Field(
        default=None,
        description="Optional public base URL (e.g. CDN) used to build absolute asset URLs.",
    )
    public_delivery_mode: Literal["auto", "direct", "presign"] = Field(
        default="auto",
        description="Public asset delivery mode: direct (CDN/base URL), presign, or auto.",
    )
    s3_endpoint_url: str | None = Field(
        default=None,
        description="S3-compatible endpoint URL (e.g. https://s3.amazonaws.com or MinIO endpoint).",
    )
    s3_region: str | None = Field(
        default=None,
        description="S3 region (optional for some S3-compatible providers).",
    )
    s3_bucket: str | None = Field(
        default=None,
        description="S3 bucket name.",
    )
    s3_public_bucket: str | None = Field(
        default=None,
        description="Optional dedicated bucket for public assets (recommended for S3-compatible providers without ACL).",
    )
    s3_access_key_id: str | None = Field(
        default=None,
        description="S3 access key id.",
    )
    s3_secret_access_key: SecretStr | None = Field(
        default=None,
        description="S3 secret access key.",
    )
    s3_force_path_style: bool = Field(
        default=False,
        description="Force path-style addressing (recommended for some MinIO setups).",
    )
    s3_presign_expires_seconds: int = Field(
        default=900,
        ge=60,
        le=24 * 3600,
        description="Presigned URL TTL (seconds) for multipart upload part URLs.",
    )
    recycle_bin_retention_days: int = Field(
        default=90,
        ge=1,
        le=3650,
    )
    upload_chunk_size_mb: int = Field(
        default=8,
        ge=1,
        le=128,
        description="Default chunk size (MiB) for resumable uploads.",
    )
    upload_max_file_size_mb: int = Field(
        default=2048,
        ge=1,
        le=1024 * 100,
        description="Max upload file size (MiB).",
    )
    upload_max_avatar_size_mb: int = Field(
        default=10,
        ge=1,
        le=1024 * 100,
        description="Max avatar upload size (MiB).",
    )
    upload_max_site_logo_size_mb: int = Field(
        default=20,
        ge=1,
        le=1024 * 100,
        description="Max site logo upload size (MiB).",
    )
    upload_max_favicon_size_mb: int = Field(
        default=2,
        ge=1,
        le=1024 * 100,
        description="Max favicon upload size (MiB).",
    )
    upload_policy: UploadPolicySettings = Field(default_factory=UploadPolicySettings)
    upload_session_ttl_seconds: int = Field(
        default=3600,
        ge=60,
        le=7 * 24 * 3600,
        description="Upload session TTL (seconds).",
    )

    @field_validator("local_root_dir", "local_tmp_dir", mode="after")
    @classmethod
    def _normalize_storage_paths(cls, value: Path) -> Path:
        return _normalize_fs_path(value, default_base=_REPO_ROOT)


class SearchSettings(BaseSettings):
    """
    Search backend settings for published Content API search.
    """

    model_config = SettingsConfigDict(
        env_prefix="SEARCH__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False)
    backend: Literal["meilisearch", "memory"] = Field(default="meilisearch")
    index_prefix: str = Field(default="arclayer_content", min_length=1, max_length=64)
    meilisearch_url: str = Field(default="http://127.0.0.1:7700")
    meilisearch_api_key: SecretStr = Field(default=SecretStr(""))
    request_timeout_seconds: float = Field(default=5.0, gt=0, le=60)


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

    level: str = Field(default="INFO")
    json_logs: bool | None = Field(default=False)
    log_dir: Path = Field(default=_API_DIR / "logs")
    rotation: str = Field(default="1d")
    retention: str = Field(default="7d")
    async_enabled: bool = Field(default=False)
    omit_tortoise_logs: bool = Field(default=False)
    omit_uvicorn_access_logs: bool = Field(default=True)
    trace_header_name: str = Field(default="X-Trace-Id")
    request_log_omit_paths: list[str] = Field(
        default_factory=lambda: [
            "/openapi.json",
            "/docs",
            "/redoc",
            "/favicon.ico",
        ],
    )
    request_log_omit_path_prefixes: list[str] = Field(
        default_factory=lambda: [
            "/static",
        ],
    )
    watchfiles_level: str = Field(
        default="INFO",
        description="Python logging level for watchfiles.* loggers (kept higher to avoid dev console spam).",
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

    enabled: bool = Field(default=False)
    engine: str = Field(default="tortoise.backends.asyncpg")
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=5432)
    user: str = Field(default="postgres")
    password: SecretStr = Field(default=SecretStr(""))
    database: str = Field(default="arclayer")
    pool_size: int = Field(default=10)
    use_tz: bool = Field(default=True)
    timezone: str = Field(default="UTC")
    core_models: list[str] = Field(
        # ORM models live under `src.models`. Do not include `src.modules` here:
        # business modules do not contain Tortoise models by design.
        default_factory=lambda: ["src.models"],
    )
    models_max_depth: int | None = Field(default=4)

    @computed_field
    @property
    def dsn_async(self) -> str:
        return PostgresDsn.build(
            scheme="postgresql",
            username=self.user,
            password=self.password.get_secret_value() or None,
            host=self.host,
            port=self.port,
            path=self.database,
        ).unicode_string()

    @computed_field
    @property
    def dsn_async_hint(self) -> str:
        return PostgresDsn.build(
            scheme="postgresql",
            username=self.user,
            host=self.host,
            port=self.port,
            path=self.database,
        ).unicode_string()


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

    enabled: bool = Field(default=False)
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=6379)
    db: int = Field(default=0)
    username: str | None = Field(default=None)
    password: SecretStr = Field(default=SecretStr(""))
    prefix: str = Field(default="")
    default_ttl: int | None = Field(default=180)

    @computed_field
    @property
    def dsn(self) -> str:
        user = f"{self.username}:" if self.username else ""
        password = self.password.get_secret_value()
        auth = f"{user}{password}@" if password else ""
        return f"redis://{auth}{self.host}:{self.port}/{self.db}"


class ProjectDatabaseProvisioningSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PROJECT_DATABASES__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=False)
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=5432)
    user: str = Field(default="postgres")
    password: SecretStr = Field(default=SecretStr(""))
    database: str = Field(default="postgres")


class AnalyticsAuditLogSettings(BaseSettings):
    """
    Analytics audit log settings.

    Notes:
    - Audit log writes are best-effort and should never block the main request path.
    - Retention cleanup is handled by Taskiq jobs (not in-process coroutines).
    """

    model_config = SettingsConfigDict(
        env_prefix="ANALYTICS__AUDIT_LOG__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=True)

    # In-process ingestion queue (protects request path by allowing drops when full).
    queue_maxsize: int = Field(default=5000, ge=1, le=200_000)
    flush_batch_size: int = Field(default=200, ge=1, le=10_000)
    flush_interval_ms: int = Field(default=200, ge=10, le=60_000)

    # Payload sanitization guardrails.
    max_property_keys: int = Field(default=50, ge=1, le=500)
    max_string_length: int = Field(default=512, ge=16, le=16_384)
    max_depth: int = Field(default=5, ge=1, le=20)

    # Retention (days). Cleanup is executed by Taskiq scheduled jobs.
    retention_enabled: bool = Field(default=True)
    retention_days: int = Field(default=90, ge=1, le=3650)
    retention_batch_size: int = Field(default=2000, ge=100, le=100_000)
    retention_max_delete_per_run: int = Field(default=20_000, ge=100, le=10_000_000)

    # Allowlist for events to store as audit logs.
    # Supports exact match and fnmatch-style globs.
    event_allowlist: list[str] = Field(
        default_factory=lambda: [
            "auth.*",
            "me.api_key.*",
            "project.*",
            "workspace.*",
            "rbac.*",
            "system.*",
            "settings.updated",
            "plugin.*",
            "asset.*",
        ]
    )


class AnalyticsSettings(BaseSettings):
    """Analytics settings."""

    model_config = SettingsConfigDict(
        env_prefix="ANALYTICS__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=True)
    audit_log: AnalyticsAuditLogSettings = Field(default_factory=AnalyticsAuditLogSettings)


class ObservabilitySettings(BaseSettings):
    """Persisted operational-metrics policy exposed through environment configuration."""

    model_config = SettingsConfigDict(
        env_prefix="OBSERVABILITY__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    enabled: bool = Field(default=True)
    retention_enabled: bool = Field(default=True)
    retention_days: int = Field(default=365, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS)
    max_query_days: int = Field(default=365, ge=1, le=MAX_OBSERVABILITY_RETENTION_DAYS)
    retention_batch_size: int = Field(default=5000, ge=100, le=100_000)
    retention_max_delete_per_run: int = Field(default=100_000, ge=100, le=10_000_000)

    @model_validator(mode="after")
    def validate_query_window(self) -> "ObservabilitySettings":
        if self.max_query_days > self.retention_days:
            raise ValueError("observability max_query_days cannot exceed retention_days")
        return self


class AISettings(BaseSettings):
    """AI/LLM infrastructure settings.

    Environment prefix: AI__
    """

    model_config = SettingsConfigDict(
        env_prefix="AI__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )

    # LiteLLM proxy connection
    litellm_base_url: str = Field(default="http://localhost:4000")
    litellm_master_key: str | None = Field(default=None, description="LiteLLM master key for virtual key management")
    litellm_timeout_seconds: float = Field(default=120.0, ge=1.0, le=600.0)

    # Default LLM model
    default_model: str = Field(default="gpt-4o-mini")
    default_max_tokens: int = Field(default=4096, ge=1, le=128000)

    # Budget defaults (in microdollars)
    default_monthly_limit_micros: int = Field(
        default=100_000_000,  # $100
        ge=0,
        description="Default monthly AI spend limit per workspace (microdollars)",
    )
    reservation_ttl_seconds: int = Field(
        default=300,
        ge=10,
        le=3600,
        description="TTL for budget reservations before automatic expiry",
    )

    # Rate limiting defaults
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_capacity: int = Field(default=100, ge=1, description="Max requests per window")
    rate_limit_window_seconds: int = Field(default=60, ge=1, le=86400)

    # Provider data retention (R3 blocker #4)
    # When False, sends data retention opt-out to providers (OpenAI: store=false, Anthropic: retention={store:false})
    data_retention_enabled: bool = Field(
        default=False,
        description="Allow providers to retain/train on API data",
    )

    # Mock mode for development without real provider keys
    mock_enabled: bool = Field(
        default=False,
        description="Use mock LLM provider instead of real LiteLLM",
    )

    # Observability
    audit_log_enabled: bool = Field(default=True)
    metrics_enabled: bool = Field(default=True)

    # Key resolution (Workspace-First)
    master_key_path: str | None = Field(
        default="data/keys/ai-master.key",
        description="Path to symmetric encryption key file for virtual key storage. "
        "Relative paths are resolved from the repository root.",
    )
    allow_platform_key: bool = Field(
        default=False,
        description="Allow fallback to platform shared virtual key when no workspace/user key exists",
    )

    # Provider API keys (optional — can also be set via LiteLLM config)
    openai_api_key: str | None = Field(default=None)
    anthropic_api_key: str | None = Field(default=None)


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

    gzip_enabled: bool = Field(default=False)
    gzip_minimum_size: int = Field(default=500)
    gzip_compresslevel: int = Field(default=9)

    trusted_host_enabled: bool = Field(default=False)
    trusted_hosts: list[str] = Field(default_factory=lambda: ["*"])
    trusted_host_www_redirect: bool = Field(default=True)

    https_redirect_enabled: bool = Field(default=False)


class Settings(BaseSettings):
    """
    Global settings for the API application.
    """

    def __init__(  # type: ignore[no-untyped-def]
        self,
        **data,
    ) -> None:
        super().__init__(**data)
        self._apply_test_mode_overrides()

        # In production, default to a hard cut-over: accept only public ids as inputs
        # unless explicitly enabled by environment configuration.
        if self.app_env == "production" and "accept_raw_uuid_input" not in self.public_id.model_fields_set:
            self.public_id = self.public_id.model_copy(update={"accept_raw_uuid_input": False})

        # Fail fast in production if the public id secret is missing. Without a stable secret, URLs
        # are either trivially reversible or unstable across deploys, both of which are unsafe.
        if self.app_env == "production" and not self.public_id.secret.get_secret_value():
            raise ValueError("PUBLIC_ID__SECRET is required when APP_ENV=production")

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
        validate_default=True,
    )
    app_env: Literal["development", "production", "test"] = Field(default="development")

    application: ApplicationSettings = Field(default_factory=ApplicationSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    search: SearchSettings = Field(default_factory=SearchSettings)
    logging: LoggingSettings = Field(default_factory=LoggingSettings)
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    project_databases: ProjectDatabaseProvisioningSettings = Field(default_factory=ProjectDatabaseProvisioningSettings)
    valkey: ValkeySettings = Field(default_factory=ValkeySettings)
    analytics: AnalyticsSettings = Field(default_factory=AnalyticsSettings)
    observability: ObservabilitySettings = Field(default_factory=ObservabilitySettings)
    taskiq: TaskiqSettings = Field(default_factory=TaskiqSettings)
    middleware: MiddlewareSettings = Field(default_factory=MiddlewareSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)
    billing: BillingSettings = Field(default_factory=BillingSettings)
    public_id: PublicIdSettings = Field(default_factory=PublicIdSettings)
    email: EmailSettings = Field(default_factory=EmailSettings, validation_alias="MAIL")
    saas: SaasSettings = Field(default_factory=SaasSettings)
    security: SecuritySettings = Field(default_factory=SecuritySettings)
    ai: AISettings = Field(default_factory=AISettings)
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

    def _apply_test_mode_overrides(self) -> None:
        if self.app_env == "test":
            if self.testing.database_enabled and self.database.enabled:
                updates: dict[str, Any] = {
                    "enabled": True,
                    "database": self.testing.database_name,
                }
                self.database = self.database.model_copy(update=updates)
            if self.testing.valkey_enabled and self.valkey.enabled:
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

    current = os.getenv("APP_ENV") or "development"
    env_files = (
        str(_API_DIR / ".env"),
        str(_API_DIR / f".env.{current}"),
        str(_API_DIR / ".env.local"),
    )

    return _build_settings_from_env_file(Settings, env_file=env_files, env_file_encoding="utf-8")
