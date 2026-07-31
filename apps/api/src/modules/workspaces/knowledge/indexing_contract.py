from __future__ import annotations

from typing import Final, Literal, cast

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.jobs.actor_authorizer import ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS
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
from src.modules.jobs.target_resolver import WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS
from src.settings.env_models import BackgroundJobExecutionSettings

KNOWLEDGE_SOURCE_INDEX_JOB_TYPE: Final = "knowledge.source.index"
KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION: Final = 1
KNOWLEDGE_SOURCE_INDEX_TASK_NAME: Final = "jobs:agent-io:knowledge-source-index:v1"

KNOWLEDGE_INDEX_CANCELLED_CODE: Final = "KNOWLEDGE_INDEX_CANCELLED"
KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE: Final = "KNOWLEDGE_INDEX_CONTENT_QUARANTINED"
KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE: Final = "KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID"
KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE: Final = "KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE"
KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE: Final = "KNOWLEDGE_INDEX_OUTCOME_INVALID"
KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE: Final = "KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE: Final = "KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID"
KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE: Final = "KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE"
KNOWLEDGE_INDEX_SOURCE_STALE_CODE: Final = "KNOWLEDGE_INDEX_SOURCE_STALE"
KNOWLEDGE_INDEX_TARGET_NOT_FOUND_CODE: Final = "KNOWLEDGE_INDEX_TARGET_NOT_FOUND"


class KnowledgeContentQuarantinedMetadata(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    chunk_id: PublicUUID
    rule: str = Field(min_length=1, max_length=128)
    scanner_name: str = Field(min_length=1, max_length=64)
    scanner_version: str = Field(min_length=1, max_length=32)


KNOWLEDGE_SOURCE_INDEX_RETRYABLE_CODES: Final = frozenset({
    "BACKGROUND_JOB_TENANT_NOT_READY",
    JOB_WORKER_LOST_ERROR_CODE,
    KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
})

KNOWLEDGE_SOURCE_INDEX_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=KNOWLEDGE_INDEX_CONTENT_QUARANTINED_CODE,
                metadata_schema=KnowledgeContentQuarantinedMetadata,
            ),
            *(
                JobTerminalErrorContract(code=code, metadata_schema=None)
                for code in (
                    KNOWLEDGE_INDEX_EMBEDDING_RESPONSE_INVALID_CODE,
                    KNOWLEDGE_INDEX_EMBEDDING_TEMPORARILY_UNAVAILABLE_CODE,
                    KNOWLEDGE_INDEX_OUTCOME_INVALID_CODE,
                    KNOWLEDGE_INDEX_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
                    KNOWLEDGE_INDEX_PROVIDER_CONFIGURATION_INVALID_CODE,
                    KNOWLEDGE_INDEX_PROVIDER_TEMPORARILY_UNAVAILABLE_CODE,
                    KNOWLEDGE_INDEX_SOURCE_STALE_CODE,
                    KNOWLEDGE_INDEX_TARGET_NOT_FOUND_CODE,
                )
            ),
        ),
        key=lambda contract: contract.code,
    )
)


class KnowledgeSourceIndexJobTarget(BaseSchema):
    """Reference-only tenant target for one parsed source-version candidate."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    candidate_version_id: PublicUUID
    entity_type: Literal["knowledge_source"] = "knowledge_source"
    entity_id: PublicUUID


class KnowledgeSourceIndexJobInput(BaseSchema):
    """Immutable provider/index references; chunks and credentials stay server-side."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    ingest_job_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    chunk_count: int = Field(ge=1)
    embedding_provider: Literal["litellm"] = "litellm"
    embedding_model: str = Field(min_length=1, max_length=128)
    embedding_version: str = Field(min_length=1, max_length=64)
    vector_dimensions: int = Field(ge=1)
    index_backend: Literal["meilisearch"] = "meilisearch"
    index_uid: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=512)
    embedder_name: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=64)
    index_schema_version: Literal[1] = 1


class KnowledgeIndexReference(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    backend: Literal["meilisearch"] = "meilisearch"
    index_uid: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=512)
    embedder_name: str = Field(pattern=r"^[A-Za-z0-9_-]+$", min_length=1, max_length=64)


class KnowledgeSourceIndexJobResult(BaseSchema):
    """Reference to a fully indexed and atomically activated source version."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["knowledge_source_index"] = "knowledge_source_index"
    source_id: PublicUUID
    source_version_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status: Literal["ready"] = "ready"
    chunk_count: int = Field(ge=1)
    vector_dimensions: int = Field(ge=1)
    index_reference: KnowledgeIndexReference
    outcome_job_id: PublicUUID


def validate_knowledge_source_index_target_input(
    target: BaseSchema,
    input_reference: BaseSchema,
) -> None:
    if not isinstance(target, KnowledgeSourceIndexJobTarget) or not isinstance(
        input_reference, KnowledgeSourceIndexJobInput
    ):
        raise TypeError("Knowledge index cross-field validation requires its bound schemas")
    if target.entity_id != target.source_id:
        raise ValueError("Knowledge index entityId must match sourceId")


def validate_knowledge_source_index_result(context: JobResultSemanticContext) -> None:
    target = cast(KnowledgeSourceIndexJobTarget, context.target)
    input_reference = cast(KnowledgeSourceIndexJobInput, context.input_reference)
    result = cast(KnowledgeSourceIndexJobResult, context.result_reference)
    if result.source_id != target.source_id or result.source_version_id != target.candidate_version_id:
        raise ValueError("Knowledge index result does not belong to its target candidate")
    if result.normalized_content_hash != input_reference.normalized_content_hash:
        raise ValueError("Knowledge index result content hash differs from its input reference")
    if result.chunk_count != input_reference.chunk_count:
        raise ValueError("Knowledge index result chunk count differs from its input reference")
    if result.vector_dimensions != input_reference.vector_dimensions:
        raise ValueError("Knowledge index result dimensions differ from its input reference")
    if (
        result.index_reference.index_uid != input_reference.index_uid
        or result.index_reference.embedder_name != input_reference.embedder_name
    ):
        raise ValueError("Knowledge index result reference differs from its input reference")
    if result.outcome_job_id != context.job_id:
        raise ValueError("Knowledge index result outcomeJobId must match the canonical Job ID")
    if context.source_revision != input_reference.normalized_content_hash:
        raise ValueError("Knowledge index Job source revision differs from its input reference")


def build_knowledge_source_index_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    content_manage = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:content:manage",
    )
    return JobTypeDefinition(
        job_type=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INDEX_JOB_TYPE_VERSION,
        task_name=KNOWLEDGE_SOURCE_INDEX_TASK_NAME,
        workload_class=JobWorkloadClass.AGENT_IO,
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=content_manage,
        commercial_effects=frozenset({RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT}),
        manage_permission=content_manage,
        initial_phase="queued",
        initial_status_key="WORKSPACE_KNOWLEDGE_INDEX_STATUS_QUEUED",
        phases=frozenset({"queued", "scanning", "embedding", "indexing", "activating"}),
        cancellable_phases=frozenset({"queued", "scanning", "embedding"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=KNOWLEDGE_SOURCE_INDEX_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="knowledge-source-index",
        target_schema=KnowledgeSourceIndexJobTarget,
        input_reference_schema=KnowledgeSourceIndexJobInput,
        result_reference_schema=KnowledgeSourceIndexJobResult,
        cross_field_validator=validate_knowledge_source_index_target_input,
        result_semantic_validator=validate_knowledge_source_index_result,
        terminal_error_contracts=KNOWLEDGE_SOURCE_INDEX_TERMINAL_ERROR_CONTRACTS,
    )
