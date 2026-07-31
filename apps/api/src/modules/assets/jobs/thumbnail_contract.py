from __future__ import annotations

from datetime import datetime
from re import fullmatch
from typing import Final, Literal
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.execution_errors import JOB_WORKER_LOST_ERROR_CODE
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobPermissionRequirement,
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy
from src.modules.jobs.target_resolver import PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS

ASSET_THUMBNAIL_JOB_TYPE: Final = "asset.thumbnail.generate"
ASSET_THUMBNAIL_JOB_TYPE_VERSION: Final = 1
ASSET_THUMBNAIL_TASK_NAME: Final = "jobs:asset-cpu:asset-thumbnail-generate:v1"
ASSET_THUMBNAIL_JOB_WORKLOAD: Final = JobWorkloadClass.ASSET_CPU
ASSET_THUMBNAIL_PROFILE_VERSION: Final = 1
ASSET_THUMBNAIL_PROFILE_WIDTHS: Final = (400, 800, 1200, 1600)
ASSET_THUMBNAIL_MEDIA_UNSUPPORTED_CODE: Final = "ASSET_THUMBNAIL_MEDIA_UNSUPPORTED"
ASSET_THUMBNAIL_OUTCOME_INVALID_CODE: Final = "ASSET_THUMBNAIL_OUTCOME_INVALID"
ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE: Final = "ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE: Final = "ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED"
ASSET_THUMBNAIL_RENDER_FAILED_CODE: Final = "ASSET_THUMBNAIL_RENDER_FAILED"
ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE: Final = "ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE"
ASSET_THUMBNAIL_SOURCE_NOT_FOUND_CODE: Final = "ASSET_THUMBNAIL_SOURCE_NOT_FOUND"
ASSET_THUMBNAIL_SOURCE_STALE_CODE: Final = "ASSET_THUMBNAIL_SOURCE_STALE"
ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE: Final = "ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE"
ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE: Final = "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"
ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED_CODE: Final = "ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED"
ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE: Final = "ASSET_THUMBNAIL_STORAGE_UNSUPPORTED"
ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE: Final = "ASSET_THUMBNAIL_TARGET_NOT_FOUND"
ASSET_THUMBNAIL_RETRYABLE_CODES: Final = frozenset({
    "BACKGROUND_JOB_TENANT_NOT_READY",
    JOB_WORKER_LOST_ERROR_CODE,
    ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE,
})
ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS: Final = (
    *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    *PROJECT_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_MEDIA_UNSUPPORTED_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_RENDER_FAILED_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_SOURCE_NOT_FOUND_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
        metadata_schema=None,
    ),
    JobTerminalErrorContract(
        code=ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
        metadata_schema=None,
    ),
)

_ASSET_THUMBNAIL_PHASES: Final = frozenset({
    "queued",
    "resolving",
    "rendering_preview",
    "generating",
    "uploading",
    "persisting",
})
_ASSET_THUMBNAIL_CANCELLABLE_PHASES: Final = _ASSET_THUMBNAIL_PHASES


class AssetThumbnailJobTarget(BaseSchema):
    """Public tenant target for one asset thumbnail operation."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    project_id: PublicUUID
    entity_type: Literal["asset"] = "asset"
    entity_id: PublicUUID


class AssetThumbnailJobInput(BaseSchema):
    """Reference-only thumbnail input safe to persist in the public control plane."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    asset_id: PublicUUID
    thumbnail_profile_version: int = Field(..., ge=1)


class _AssetThumbnailProducedWidths(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    produced_widths: tuple[int, ...] = Field(..., min_length=1)

    @field_validator("produced_widths")
    @classmethod
    def validate_produced_widths(cls, values: tuple[int, ...]) -> tuple[int, ...]:
        if any(width <= 0 for width in values):
            raise ValueError("producedWidths must contain only positive widths")
        if len(set(values)) != len(values):
            raise ValueError("producedWidths must contain unique widths")
        if values != tuple(sorted(values)):
            raise ValueError("producedWidths must be sorted in ascending order")
        return values


class AssetThumbnailJobResult(_AssetThumbnailProducedWidths):
    """Reference to the canonical tenant outcome produced by a thumbnail Job."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["asset_thumbnail_outcome"] = "asset_thumbnail_outcome"
    asset_id: PublicUUID
    source_revision: str = Field(..., min_length=1, max_length=160)
    thumbnail_profile_version: int = Field(..., ge=1)
    outcome_job_id: PublicUUID


class AssetThumbnailOutcomeMarker(_AssetThumbnailProducedWidths):
    """Tenant-owned idempotency marker for reconciling at-least-once delivery."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: PublicUUID
    request_fingerprint: str = Field(..., min_length=64, max_length=64)
    output_identity: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    source_revision: str = Field(..., min_length=1, max_length=160)
    thumbnail_profile_version: int = Field(..., ge=1)
    completed_at: datetime

    @field_validator("output_identity", mode="before")
    @classmethod
    def validate_output_identity(cls, value: object) -> str:
        return validate_asset_thumbnail_output_identity(value)


class AssetThumbnailExecutionPolicy(BaseSchema):
    """Deployment-owned execution timings injected into the stable domain definition."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    retry_policy: JobRetryPolicy
    timeout_seconds: int | None = Field(..., ge=1)
    lease_seconds: int = Field(..., ge=3)
    heartbeat_seconds: int = Field(..., ge=1)

    @field_validator("retry_policy")
    @classmethod
    def validate_retryable_codes(cls, policy: JobRetryPolicy) -> JobRetryPolicy:
        if policy.retryable_codes != ASSET_THUMBNAIL_RETRYABLE_CODES:
            raise ValueError("asset thumbnail retryableCodes are owned by the handler contract")
        return policy


def validate_asset_thumbnail_target_input(
    target: BaseSchema,
    input_reference: BaseSchema,
) -> None:
    if not isinstance(target, AssetThumbnailJobTarget) or not isinstance(input_reference, AssetThumbnailJobInput):
        raise TypeError("asset thumbnail cross-field validation requires its bound target and input schemas")
    if target.entity_id != input_reference.asset_id:
        raise ValueError("asset thumbnail target entityId must match input assetId")


def validate_asset_thumbnail_result_semantics(context: JobResultSemanticContext) -> None:
    target = context.target
    input_reference = context.input_reference
    result = context.result_reference
    if (
        not isinstance(target, AssetThumbnailJobTarget)
        or not isinstance(input_reference, AssetThumbnailJobInput)
        or not isinstance(result, AssetThumbnailJobResult)
    ):
        raise TypeError("asset thumbnail result validation requires its bound target, input, and result schemas")
    if result.asset_id != target.entity_id or result.asset_id != input_reference.asset_id:
        raise ValueError("asset thumbnail result assetId must match the target and input asset IDs")
    if result.outcome_job_id != context.job_id:
        raise ValueError("asset thumbnail result outcomeJobId must match the canonical Job ID")
    if result.source_revision != context.source_revision:
        raise ValueError("asset thumbnail result sourceRevision must match the canonical Job source revision")
    if result.thumbnail_profile_version != input_reference.thumbnail_profile_version:
        raise ValueError("asset thumbnail result profile version must match the canonical input reference")


def build_asset_thumbnail_source_revision(*, asset_id: UUID, checksum_sha256: str | None) -> str:
    if checksum_sha256 is None:
        return f"asset-id:{asset_id}"

    checksum = checksum_sha256.strip()
    if fullmatch(r"[0-9a-fA-F]{64}", checksum) is None:
        raise ValueError("checksumSha256 must be exactly 64 hexadecimal characters")
    return checksum.lower()


def validate_asset_thumbnail_output_identity(value: object) -> str:
    if not isinstance(value, str) or fullmatch(r"[0-9a-f]{64}", value) is None:
        raise ValueError("outputIdentity must be exactly 64 lowercase hexadecimal characters")
    return value


def build_asset_thumbnail_job_definition(
    *,
    execution_policy: AssetThumbnailExecutionPolicy,
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=ASSET_THUMBNAIL_JOB_TYPE,
        job_type_version=ASSET_THUMBNAIL_JOB_TYPE_VERSION,
        task_name=ASSET_THUMBNAIL_TASK_NAME,
        workload_class=ASSET_THUMBNAIL_JOB_WORKLOAD,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.PROJECT,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        required_permission=None,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=JobPermissionRequirement(
            scope=JobPermissionScope.WORKSPACE,
            action="system:assets:manage",
        ),
        initial_phase="queued",
        phases=_ASSET_THUMBNAIL_PHASES,
        cancellable_phases=_ASSET_THUMBNAIL_CANCELLABLE_PHASES,
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=execution_policy.retry_policy,
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="asset-thumbnail",
        target_schema=AssetThumbnailJobTarget,
        input_reference_schema=AssetThumbnailJobInput,
        result_reference_schema=AssetThumbnailJobResult,
        cross_field_validator=validate_asset_thumbnail_target_input,
        result_semantic_validator=validate_asset_thumbnail_result_semantics,
        terminal_error_contracts=ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS,
    )
