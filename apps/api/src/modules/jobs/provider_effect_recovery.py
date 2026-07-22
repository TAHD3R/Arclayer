from __future__ import annotations

from typing import Final, Literal

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.registry import (
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy

PROVIDER_EFFECT_RECOVERY_JOB_TYPE: Final = "provider.effect.orphan.reconcile"
PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION: Final = 1
PROVIDER_EFFECT_RECOVERY_TASK_NAME: Final = "jobs:maintenance:provider-effect-orphan-reconcile:v1"


class ProviderEffectRecoveryTarget(BaseSchema):
    """Exact source Job and Provider Effect contract owned by one maintenance Job."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_job_id: PublicUUID
    effect_type: str = Field(..., min_length=1, max_length=128)
    schema_version: int = Field(..., ge=1)


class ProviderEffectRecoveryInput(ProviderEffectRecoveryTarget):
    """Reference-only input mirrored against the system Job target."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)


class ProviderEffectRecoveryResult(ProviderEffectRecoveryTarget):
    """Terminal evidence that every selected source Effect has left ACTIVE."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["provider_effect_recovery"] = "provider_effect_recovery"
    effect_ids: tuple[PublicUUID, ...] = Field(..., min_length=1)
    committed_effect_ids: tuple[PublicUUID, ...] = ()
    cleaned_effect_ids: tuple[PublicUUID, ...] = ()

    @field_validator("effect_ids", "committed_effect_ids", "cleaned_effect_ids")
    @classmethod
    def validate_sorted_unique_ids(cls, values: tuple[PublicUUID, ...]) -> tuple[PublicUUID, ...]:
        if len(values) != len(set(values)):
            raise ValueError("Provider Effect recovery IDs must be unique")
        if values != tuple(sorted(values, key=lambda value: value.int)):
            raise ValueError("Provider Effect recovery IDs must use stable UUID order")
        return values

    @model_validator(mode="after")
    def validate_terminal_partition(self) -> ProviderEffectRecoveryResult:
        committed = set(self.committed_effect_ids)
        cleaned = set(self.cleaned_effect_ids)
        if committed & cleaned:
            raise ValueError("Committed and cleaned Provider Effect IDs must be disjoint")
        if committed | cleaned != set(self.effect_ids):
            raise ValueError("Committed and cleaned Provider Effect IDs must partition all recovered IDs")
        return self


class ProviderEffectRecoveryExecutionPolicy(BaseSchema):
    """Deployment-owned timings for bounded orphan recovery Jobs."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    retry_policy: JobRetryPolicy
    timeout_seconds: int | None = Field(..., ge=1)
    lease_seconds: int = Field(..., ge=3)
    heartbeat_seconds: int = Field(..., ge=1)

    @model_validator(mode="after")
    def validate_lease_window(self) -> ProviderEffectRecoveryExecutionPolicy:
        if self.lease_seconds < self.heartbeat_seconds * 3:
            raise ValueError("leaseSeconds must allow at least three heartbeat intervals")
        return self


class ProviderEffectRecoveryCandidate(ProviderEffectRecoveryTarget):
    """One stable terminal source Job/effect-contract group selected for fan-out."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)


class ProviderEffectRecoveryEnqueueBatch(BaseSchema):
    """Bounded scanner result with exact durable Job identities."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    scanned_count: int = Field(..., ge=0)
    created_job_ids: tuple[PublicUUID, ...] = ()
    replayed_job_ids: tuple[PublicUUID, ...] = ()

    @model_validator(mode="after")
    def validate_counts(self) -> ProviderEffectRecoveryEnqueueBatch:
        if self.scanned_count != len(self.created_job_ids) + len(self.replayed_job_ids):
            raise ValueError("Provider Effect recovery scan count must match its exact Job outcomes")
        return self


def validate_provider_effect_recovery_target_input(
    target: BaseSchema,
    input_reference: BaseSchema,
) -> None:
    if not isinstance(target, ProviderEffectRecoveryTarget) or not isinstance(
        input_reference,
        ProviderEffectRecoveryInput,
    ):
        raise TypeError("Provider Effect recovery requires its bound target and input schemas")
    if (
        target.source_job_id,
        target.effect_type,
        target.schema_version,
    ) != (
        input_reference.source_job_id,
        input_reference.effect_type,
        input_reference.schema_version,
    ):
        raise ValueError("Provider Effect recovery target and input contracts must match exactly")


def validate_provider_effect_recovery_result(context: JobResultSemanticContext) -> None:
    target = context.target
    input_reference = context.input_reference
    result = context.result_reference
    if (
        not isinstance(target, ProviderEffectRecoveryTarget)
        or not isinstance(input_reference, ProviderEffectRecoveryInput)
        or not isinstance(result, ProviderEffectRecoveryResult)
    ):
        raise TypeError("Provider Effect recovery result validation requires its bound schemas")
    expected = (target.source_job_id, target.effect_type, target.schema_version)
    if expected != (input_reference.source_job_id, input_reference.effect_type, input_reference.schema_version):
        raise ValueError("Provider Effect recovery input differs from its target")
    if expected != (result.source_job_id, result.effect_type, result.schema_version):
        raise ValueError("Provider Effect recovery result differs from its target")
    if context.source_revision != build_provider_effect_recovery_source_revision(target=target):
        raise ValueError("Provider Effect recovery source revision differs from its exact target")


def build_provider_effect_recovery_source_revision(*, target: ProviderEffectRecoveryTarget) -> str:
    return f"effect-recovery:{hash_json(target.model_dump(mode='json', by_alias=True))}"


def build_provider_effect_recovery_job_definition(
    *,
    execution_policy: ProviderEffectRecoveryExecutionPolicy,
    terminal_error_contracts: tuple[JobTerminalErrorContract, ...],
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=PROVIDER_EFFECT_RECOVERY_JOB_TYPE,
        job_type_version=PROVIDER_EFFECT_RECOVERY_JOB_TYPE_VERSION,
        task_name=PROVIDER_EFFECT_RECOVERY_TASK_NAME,
        workload_class=JobWorkloadClass.MAINTENANCE,
        target_scope=JobTargetScope.SYSTEM,
        visibility=JobVisibility.SYSTEM,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        initial_phase="queued",
        phases=frozenset({"queued", "reconciling", "cleaning", "settling"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=execution_policy.retry_policy,
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="provider-effect-recovery",
        target_schema=ProviderEffectRecoveryTarget,
        input_reference_schema=ProviderEffectRecoveryInput,
        result_reference_schema=ProviderEffectRecoveryResult,
        cross_field_validator=validate_provider_effect_recovery_target_input,
        result_semantic_validator=validate_provider_effect_recovery_result,
        terminal_error_contracts=terminal_error_contracts,
    )
