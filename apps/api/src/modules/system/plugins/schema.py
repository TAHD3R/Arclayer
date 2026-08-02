from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.core.connectors import ConnectorKind, ConnectorTrustLevel
from src.core.extensions.manifest import PackageState, ProcessState
from src.models.system.plugin_installation import (
    PluginLifecycleState,
    PluginOperationKind,
    PluginOperationState,
    PluginRuntimeActivationState,
    PluginTrustState,
)


class SystemPluginProvidesOut(BaseSchema):
    services: list[str] = Field(default_factory=list)
    middlewares: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    connectors: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)


class SystemPluginAdminOut(BaseSchema):
    label_key: str
    description_key: str


class SystemConnectorAdminOut(BaseSchema):
    label_key: str
    description_key: str
    settings_section: str | None = None
    icon_key: str | None = None


class SystemConnectorDefinitionOut(BaseSchema):
    key: str
    kind: ConnectorKind
    version: str
    trust_level: ConnectorTrustLevel
    capabilities: list[str] = Field(default_factory=list)
    config_schema: JsonObject = Field(default_factory=dict)
    secret_schema: JsonObject = Field(default_factory=dict)
    scopes: list[str] = Field(default_factory=list)
    webhook_events: list[str] = Field(default_factory=list)
    health_contract: list[str] = Field(default_factory=list)
    admin: SystemConnectorAdminOut | None = None


class ExtensionConfigurationTarget(StrEnum):
    ACCESS_SIGN_IN = "access.sign-in"
    COMMERCE_SUBSCRIPTIONS = "commerce.subscriptions"
    COMMUNICATIONS_EMAIL = "communications.email"
    MONITORING_PERFORMANCE = "monitoring.performance"


class ExtensionConfigurationReadiness(StrEnum):
    READY = "ready"
    NEEDS_CONFIGURATION = "needs_configuration"
    UNAVAILABLE = "unavailable"


class ExtensionConsumerEvidenceState(StrEnum):
    UNKNOWN = "unknown"
    READY = "ready"
    BLOCKED = "blocked"


class ExtensionDependencyOut(BaseSchema):
    extension_name: str
    version_requirement: str | None = None


class ExtensionConsumerOut(BaseSchema):
    domain: str
    label: str
    deep_link: str


class ExtensionConsumerEvidenceOut(BaseSchema):
    state: ExtensionConsumerEvidenceState
    consumers: list[ExtensionConsumerOut] = Field(default_factory=list)


class ExtensionConnectionOut(BaseSchema):
    extension_name: str
    extension_version: str
    connector_key: str
    connector_kind: ConnectorKind
    trust_level: ConnectorTrustLevel
    runtime_ready: bool
    configuration_readiness: ExtensionConfigurationReadiness
    configuration_target: ExtensionConfigurationTarget
    configuration_deep_link: str


class ExtensionConnectionListOut(BaseSchema):
    items: list[ExtensionConnectionOut] = Field(default_factory=list)


class SystemPluginSourceType(StrEnum):
    BUNDLED = "bundled"
    CATALOG = "catalog"
    MANUAL_UPLOAD = "manual_upload"


class SystemPluginProvenanceStatus(StrEnum):
    UNKNOWN = "unknown"
    VERIFIED = "verified"
    REJECTED = "rejected"


class SystemPluginCompatibilityOut(BaseSchema):
    compatible: bool
    platform_requirement: str | None = None
    python_requirement: str | None = None
    issues: list[str] = Field(default_factory=list)


class SystemPluginCatalogItemOut(BaseSchema):
    name: str
    artifact_id: PublicUUID | None = None
    installation_id: UUID | None = None
    available_version: str
    installed_version: str | None = None
    has_update: bool = False
    lifecycle_state: PluginLifecycleState | None = None
    desired_enabled: bool | None = None
    runtime_activation_state: PluginRuntimeActivationState | None = None
    current_operation_id: PublicUUID | None = None
    current_job_id: PublicUUID | None = None
    source_type: SystemPluginSourceType
    source_locator: str
    artifact_checksum: str
    package_checksum: str
    manifest_digest: str
    signer_fingerprint: str | None = None
    provenance_status: SystemPluginProvenanceStatus
    trust_state: PluginTrustState = PluginTrustState.UNKNOWN
    trust_evidence: list[str] = Field(default_factory=list)
    compatibility: SystemPluginCompatibilityOut
    package_state: PackageState | None = None
    process_state: ProcessState | None = None
    provides: SystemPluginProvidesOut
    permissions: list[str] = Field(default_factory=list)
    approved_permissions: list[str] = Field(default_factory=list)
    dependencies: list[ExtensionDependencyOut] = Field(default_factory=list)
    consumers: ExtensionConsumerEvidenceOut = Field(
        default_factory=lambda: ExtensionConsumerEvidenceOut(state=ExtensionConsumerEvidenceState.UNKNOWN)
    )
    config_schema: JsonObject = Field(default_factory=dict)
    admin: SystemPluginAdminOut | None = None
    connector_definitions: list[SystemConnectorDefinitionOut] = Field(default_factory=list)


class SystemPluginCatalogListOut(BaseSchema):
    items: list[SystemPluginCatalogItemOut] = Field(default_factory=list)


class SystemPluginArtifactReviewOut(BaseOut):
    created_at: datetime
    updated_at: datetime
    plugin_name: str
    version: str
    source_type: SystemPluginSourceType
    source_locator: str
    artifact_checksum: str
    package_checksum: str
    manifest_digest: str
    signer_fingerprint: str
    provenance_status: str
    trust_state: PluginTrustState = PluginTrustState.UNKNOWN
    trust_evidence: list[str] = Field(default_factory=list)
    size_bytes: int
    compatibility: SystemPluginCompatibilityOut
    provides: SystemPluginProvidesOut
    permissions: list[str] = Field(default_factory=list)
    config_schema: JsonObject = Field(default_factory=dict)
    admin: SystemPluginAdminOut | None = None


class SystemPluginInstallationCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    source_type: SystemPluginSourceType
    plugin_name: str | None = Field(default=None, min_length=1, max_length=128)
    artifact_id: PublicUUID | None = None
    target_version: str | None = Field(default=None, min_length=1, max_length=64)
    approved_permissions: list[str] = Field(default_factory=list, max_length=128)

    @model_validator(mode="after")
    def validate_source_identity(self) -> SystemPluginInstallationCreateRequest:
        if self.source_type == SystemPluginSourceType.MANUAL_UPLOAD:
            if self.artifact_id is None or self.plugin_name is not None or self.target_version is not None:
                raise ValueError("manualUpload installation requires only artifactId")
            return self
        if self.plugin_name is None or self.artifact_id is not None:
            raise ValueError("bundled/catalog installation requires pluginName and no artifactId")
        return self

    @field_validator("approved_permissions")
    @classmethod
    def normalize_permissions(cls, values: list[str]) -> list[str]:
        normalized = sorted({value.strip() for value in values if value.strip()})
        if len(normalized) != len(values):
            raise ValueError("approvedPermissions must contain unique non-empty permission names")
        return normalized


class SystemPluginLifecycleRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    target_version: str | None = Field(default=None, min_length=1, max_length=64)
    approved_permissions: list[str] = Field(default_factory=list, max_length=128)

    @field_validator("approved_permissions")
    @classmethod
    def normalize_permissions(cls, values: list[str]) -> list[str]:
        return SystemPluginInstallationCreateRequest.normalize_permissions(values)


class SystemPluginOperationOut(BaseOut):
    plugin_name: str
    kind: PluginOperationKind
    state: PluginOperationState
    phase: str
    progress_completed: int
    progress_total: int | None
    job_id: PublicUUID | None
    requested_version: str | None
    permission_diff: JsonObject
    requested_permissions: list[str] = Field(default_factory=list)
    approved_permissions: list[str] = Field(default_factory=list)
    provided_capabilities: list[str] = Field(default_factory=list)
    migration_warnings: list[str]
    step_evidence: list[JsonObject] = Field(default_factory=list)
    restart_required: bool
    desired_enabled: bool = False
    activation_verified: bool
    retryable: bool
    failure_code: str | None
    failure_summary: str | None
    audit_correlation_id: str | None = None
    recovery_of_operation_id: UUID | None = None
    requested_by_user_id: UUID
    started_at: datetime | None
    completed_at: datetime | None


class SystemPluginDetailOut(SystemPluginCatalogItemOut):
    recent_operations: list[SystemPluginOperationOut] = Field(default_factory=list)


class SystemPluginConfigurationOut(BaseSchema):
    plugin_name: str
    revision: int = Field(..., ge=1)
    values: JsonObject = Field(default_factory=dict)
    secret_references: dict[str, str] = Field(default_factory=dict)
    restart_required: bool
    updated_at: datetime


class SystemPluginConfigurationPatch(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    expected_revision: int = Field(..., ge=1)
    values: JsonObject
    secret_references: dict[str, str]
