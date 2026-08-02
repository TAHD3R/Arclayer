from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PluginSourceType(StrEnum):
    BUNDLED = "bundled"
    CATALOG = "catalog"
    MANUAL_UPLOAD = "manual_upload"


class PluginLifecycleState(StrEnum):
    INSTALLING = "installing"
    INSTALLED = "installed"
    UPDATE_AVAILABLE = "update_available"
    UPGRADING = "upgrading"
    DISABLING = "disabling"
    DISABLED = "disabled"
    UNINSTALLING = "uninstalling"
    FAILED = "failed"
    ROLLBACK_REQUIRED = "rollback_required"
    RECOVERING = "recovering"


class PluginRuntimeActivationState(StrEnum):
    NOT_REQUIRED = "not_required"
    PENDING_RESTART = "pending_restart"
    VERIFIED = "verified"
    FAILED = "failed"


class PluginOperationKind(StrEnum):
    INSTALL = "install"
    UPGRADE = "upgrade"
    ROLLBACK = "rollback"
    ENABLE = "enable"
    DISABLE = "disable"
    UNINSTALL = "uninstall"
    RECOVER = "recover"


class PluginTrustState(StrEnum):
    UNKNOWN = "unknown"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PluginOperationState(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_FOR_RESTART = "waiting_for_restart"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PluginArtifactState(StrEnum):
    REVIEWED = "reviewed"
    STAGED = "staged"
    ACTIVE = "active"
    RETAINED = "retained"
    FAILED = "failed"


class PluginArtifactRecord(BaseModel):
    """Immutable verified package identity and its server-owned storage locations."""

    plugin_name = fields.CharField(max_length=128, db_index=True)
    version = fields.CharField(max_length=64, db_index=True)
    source_type = fields.CharEnumField(PluginSourceType, max_length=24, db_index=True)
    source_locator = fields.CharField(max_length=1024)
    state = fields.CharEnumField(
        PluginArtifactState,
        default=PluginArtifactState.REVIEWED,
        max_length=24,
        db_index=True,
    )
    archive_path = fields.CharField(max_length=1024, null=True)
    package_path = fields.CharField(max_length=1024, null=True)
    artifact_checksum = fields.CharField(max_length=80)
    package_checksum = fields.CharField(max_length=80)
    manifest_digest = fields.CharField(max_length=80)
    detached_signature = fields.TextField()
    signer_fingerprint = fields.CharField(max_length=64, db_index=True)
    provenance_status = fields.CharField(max_length=32)
    trust_state = fields.CharEnumField(
        PluginTrustState,
        default=PluginTrustState.UNKNOWN,
        max_length=16,
        db_index=True,
    )
    trust_evidence = fields.JSONField(default=list)
    size_bytes = fields.BigIntField()
    compatibility = fields.JSONField(default=dict)
    review_projection = fields.JSONField(default=dict)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_summary = fields.CharField(max_length=512, null=True)
    uploaded_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "system_plugin_artifacts"
        table_description = "Immutable signed plugin package artifacts reviewed for lifecycle operations."
        abstract = False
        unique_together = (("artifact_checksum", "signer_fingerprint"),)
        indexes = (
            ("plugin_name", "version", "created_at"),
            ("state", "updated_at"),
        )


class PluginInstallationRecord(BaseModel):
    """Durable desired and verified state for one system plugin identity."""

    plugin_name = fields.CharField(max_length=128, unique=True)
    source_type = fields.CharEnumField(PluginSourceType, max_length=24, db_index=True)
    source_locator = fields.CharField(max_length=512)
    installed_version = fields.CharField(max_length=64, null=True, db_index=True)
    available_version = fields.CharField(max_length=64, null=True)
    previous_version = fields.CharField(max_length=64, null=True)
    rollback_version = fields.CharField(max_length=64, null=True)
    package_checksum = fields.CharField(max_length=80, null=True)
    manifest_digest = fields.CharField(max_length=80, null=True)
    provenance_status = fields.CharField(max_length=32, null=True)
    trust_state = fields.CharEnumField(
        PluginTrustState,
        default=PluginTrustState.UNKNOWN,
        max_length=16,
        db_index=True,
    )
    trust_evidence = fields.JSONField(default=list)
    compatibility = fields.JSONField(default=dict)
    declared_dependencies = fields.JSONField(default=list)
    consumer_evidence = fields.JSONField(default=dict)
    lifecycle_state = fields.CharEnumField(
        PluginLifecycleState,
        default=PluginLifecycleState.INSTALLED,
        max_length=32,
        db_index=True,
    )
    desired_enabled = fields.BooleanField(default=True, db_index=True)
    runtime_activation_state = fields.CharEnumField(
        PluginRuntimeActivationState,
        default=PluginRuntimeActivationState.NOT_REQUIRED,
        max_length=24,
        db_index=True,
    )
    enabled_capabilities = fields.JSONField(default=list)
    requested_permissions = fields.JSONField(default=list)
    approved_permissions = fields.JSONField(default=list)
    configuration_revision = fields.IntField(default=1)
    configuration = fields.JSONField(default=dict)
    secret_references = fields.JSONField(default=dict)
    current_operation_id = fields.UUIDField(null=True, db_index=True)
    current_job_id = fields.UUIDField(null=True, db_index=True)
    last_success_summary = fields.CharField(max_length=512, null=True)
    last_failure_code = fields.CharField(max_length=128, null=True)
    last_failure_summary = fields.CharField(max_length=512, null=True)
    installed_by_user_id = fields.UUIDField(null=True, db_index=True)
    updated_by_user_id = fields.UUIDField(null=True, db_index=True)
    installed_at = fields.DatetimeField(null=True)
    runtime_verified_at = fields.DatetimeField(null=True)
    active_artifact = fields.ForeignKeyField(
        "models.PluginArtifactRecord",
        related_name="active_installations",
        on_delete=fields.RESTRICT,
        null=True,
    )
    previous_artifact = fields.ForeignKeyField(
        "models.PluginArtifactRecord",
        related_name="previous_installations",
        on_delete=fields.RESTRICT,
        null=True,
    )

    if TYPE_CHECKING:
        active_artifact_id: UUID | None
        previous_artifact_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "system_plugin_installations"
        table_description = "Durable installation and runtime activation state for system plugins."
        abstract = False
        indexes = (
            ("lifecycle_state", "updated_at"),
            ("runtime_activation_state", "updated_at"),
        )


class PluginOperationRecord(BaseModel):
    """Idempotent operator intent and progress for one durable plugin lifecycle Job."""

    installation = fields.ForeignKeyField(
        "models.PluginInstallationRecord",
        related_name="operations",
        on_delete=fields.RESTRICT,
    )
    plugin_name = fields.CharField(max_length=128, db_index=True)
    kind = fields.CharEnumField(PluginOperationKind, max_length=16, db_index=True)
    state = fields.CharEnumField(
        PluginOperationState,
        default=PluginOperationState.QUEUED,
        max_length=24,
        db_index=True,
    )
    phase = fields.CharField(max_length=96, default="queued")
    progress_completed = fields.IntField(default=0)
    progress_total = fields.IntField(null=True)
    job_id = fields.UUIDField(null=True, unique=True)
    idempotency_key_hash = fields.CharField(max_length=64, unique=True)
    request_fingerprint = fields.CharField(max_length=64)
    audit_correlation_id = fields.CharField(max_length=128, null=True, db_index=True)
    recovery_of_operation_id = fields.UUIDField(null=True, db_index=True)
    requested_version = fields.CharField(max_length=64, null=True)
    previous_version = fields.CharField(max_length=64, null=True)
    package_checksum = fields.CharField(max_length=80, null=True)
    manifest_digest = fields.CharField(max_length=80, null=True)
    permission_diff = fields.JSONField(default=dict)
    requested_permissions = fields.JSONField(default=list)
    approved_permissions = fields.JSONField(default=list)
    provided_capabilities = fields.JSONField(default=list)
    migration_warnings = fields.JSONField(default=list)
    step_evidence = fields.JSONField(default=list)
    restart_required = fields.BooleanField(default=False)
    desired_enabled = fields.BooleanField(default=False)
    activation_verified = fields.BooleanField(default=False)
    retryable = fields.BooleanField(default=False)
    failure_code = fields.CharField(max_length=128, null=True)
    failure_summary = fields.CharField(max_length=512, null=True)
    requested_by_user_id = fields.UUIDField(db_index=True)
    started_at = fields.DatetimeField(null=True)
    completed_at = fields.DatetimeField(null=True)
    artifact = fields.ForeignKeyField(
        "models.PluginArtifactRecord",
        related_name="operations",
        on_delete=fields.RESTRICT,
        null=True,
    )
    previous_artifact = fields.ForeignKeyField(
        "models.PluginArtifactRecord",
        related_name="rollback_operations",
        on_delete=fields.RESTRICT,
        null=True,
    )

    if TYPE_CHECKING:
        installation_id: UUID
        artifact_id: UUID | None
        previous_artifact_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "system_plugin_operations"
        table_description = "Idempotent durable lifecycle operations for system plugins."
        abstract = False
        indexes = (
            ("plugin_name", "created_at"),
            ("state", "updated_at"),
        )
