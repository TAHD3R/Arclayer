from __future__ import annotations

from typing import Final, Literal, cast

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
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
from src.modules.workspaces.knowledge.source_fetch_errors import (
    KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID,
    KNOWLEDGE_SOURCE_FETCH_FAILED,
    KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
    KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED,
    KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE,
    KNOWLEDGE_SOURCE_URL_FORBIDDEN,
)
from src.settings.env_models import BackgroundJobExecutionSettings

KNOWLEDGE_SOURCE_INGEST_JOB_TYPE: Final = "knowledge.source.ingest"
KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION: Final = 1
KNOWLEDGE_SOURCE_INGEST_TASK_NAME: Final = "jobs:connector:knowledge-source-ingest:v1"

KNOWLEDGE_INGESTION_CANCELLED_CODE: Final = "KNOWLEDGE_INGESTION_CANCELLED"
KNOWLEDGE_INGESTION_CONTENT_INVALID_CODE: Final = "KNOWLEDGE_INGESTION_CONTENT_INVALID"
KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE: Final = "KNOWLEDGE_INGESTION_OUTCOME_INVALID"
KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE: Final = (
    "KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE"
)
KNOWLEDGE_INGESTION_SOURCE_STALE_CODE: Final = "KNOWLEDGE_INGESTION_SOURCE_STALE"
KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE: Final = "KNOWLEDGE_INGESTION_TARGET_NOT_FOUND"

KNOWLEDGE_SOURCE_INGEST_RETRYABLE_CODES: Final = frozenset({
    "BACKGROUND_JOB_TENANT_NOT_READY",
    JOB_WORKER_LOST_ERROR_CODE,
    KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE,
})

KNOWLEDGE_SOURCE_INGEST_TERMINAL_ERROR_CONTRACTS: Final = tuple(
    sorted(
        (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            *WORKSPACE_JOB_TARGET_TERMINAL_ERROR_CONTRACTS,
            *ACTOR_REVALIDATION_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code=KNOWLEDGE_INGESTION_CONTENT_INVALID_CODE,
                metadata_schema=None,
            ),
            JobTerminalErrorContract(
                code=KNOWLEDGE_INGESTION_OUTCOME_INVALID_CODE,
                metadata_schema=None,
            ),
            JobTerminalErrorContract(
                code=KNOWLEDGE_INGESTION_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
                metadata_schema=None,
            ),
            JobTerminalErrorContract(
                code=KNOWLEDGE_INGESTION_SOURCE_STALE_CODE,
                metadata_schema=None,
            ),
            JobTerminalErrorContract(
                code=KNOWLEDGE_INGESTION_TARGET_NOT_FOUND_CODE,
                metadata_schema=None,
            ),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_FETCH_CONFIGURATION_INVALID, metadata_schema=None),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_FETCH_FAILED, metadata_schema=None),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_FETCH_TEMPORARILY_UNAVAILABLE, metadata_schema=None),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_FORMAT_UNSUPPORTED, metadata_schema=None),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_RESPONSE_TOO_LARGE, metadata_schema=None),
            JobTerminalErrorContract(code=KNOWLEDGE_SOURCE_URL_FORBIDDEN, metadata_schema=None),
        ),
        key=lambda contract: contract.code,
    )
)


class KnowledgeSourceIngestJobTarget(BaseSchema):
    """Reference-only tenant target for one immutable source-version candidate."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    knowledge_base_id: PublicUUID
    source_id: PublicUUID
    candidate_version_id: PublicUUID | None = None
    entity_type: Literal["knowledge_source"] = "knowledge_source"
    entity_id: PublicUUID


class KnowledgeSourceIngestJobInput(BaseSchema):
    """Immutable fetch/parser references; source bytes remain outside the broker."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_kind: Literal["manual", "url"]
    ingestion_mode: Literal["initial", "refresh", "reparse"]
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    normalized_content_hash: str | None = Field(default=None, pattern=r"^sha256:[0-9a-f]{64}$")
    source_url: str | None = Field(default=None, min_length=1, max_length=4096)
    parser_name: Literal["manual-markdown", "web-text"]
    parser_version: Literal["1"] = "1"
    chunker_name: Literal["knowledge-default"] = "knowledge-default"
    chunker_version: Literal["1"] = "1"
    index_schema_version: Literal[1] = 1

    @model_validator(mode="after")
    def _validate_source_variant(self) -> KnowledgeSourceIngestJobInput:
        if self.source_kind == "manual":
            if self.normalized_content_hash is None or self.source_revision != self.normalized_content_hash:
                raise ValueError("Manual ingestion requires its immutable normalized content hash as sourceRevision")
            if self.source_url is not None or self.parser_name != "manual-markdown":
                raise ValueError("Manual ingestion cannot contain URL fetch references")
            if self.ingestion_mode not in {"initial", "reparse"}:
                raise ValueError("Manual ingestion supports initial or reparse mode")
            return self
        if self.normalized_content_hash is not None or self.source_url is None or self.parser_name != "web-text":
            raise ValueError("URL ingestion requires only its normalized URL and locator revision")
        if self.ingestion_mode not in {"initial", "refresh"}:
            raise ValueError("URL ingestion supports initial or refresh mode")
        return self


class KnowledgeSourceIngestJobResult(BaseSchema):
    """Reference to parsed tenant chunks awaiting the separate index authority."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["knowledge_source_ingestion"] = "knowledge_source_ingestion"
    source_id: PublicUUID
    source_version_id: PublicUUID
    normalized_content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    status: Literal["awaiting_index"] = "awaiting_index"
    chunk_count: int = Field(ge=1)
    token_count: int = Field(ge=1)
    outcome_job_id: PublicUUID
    index_job_id: PublicUUID


def validate_knowledge_source_ingest_target_input(
    target: BaseSchema,
    input_reference: BaseSchema,
) -> None:
    if not isinstance(target, KnowledgeSourceIngestJobTarget) or not isinstance(
        input_reference, KnowledgeSourceIngestJobInput
    ):
        raise TypeError("Knowledge ingestion cross-field validation requires its bound schemas")
    if target.entity_id != target.source_id:
        raise ValueError("Knowledge ingestion entityId must match sourceId")
    if (input_reference.source_kind == "manual") != (target.candidate_version_id is not None):
        raise ValueError("Only manual ingestion may bind a pre-existing candidateVersionId")


def validate_knowledge_source_ingest_result(context: JobResultSemanticContext) -> None:
    target = cast(KnowledgeSourceIngestJobTarget, context.target)
    input_reference = cast(KnowledgeSourceIngestJobInput, context.input_reference)
    result = cast(KnowledgeSourceIngestJobResult, context.result_reference)
    if result.source_id != target.source_id:
        raise ValueError("Knowledge ingestion result does not belong to its target candidate")
    if target.candidate_version_id is not None and result.source_version_id != target.candidate_version_id:
        raise ValueError("Knowledge ingestion result does not belong to its target candidate")
    if (
        input_reference.normalized_content_hash is not None
        and result.normalized_content_hash != input_reference.normalized_content_hash
    ):
        raise ValueError("Knowledge ingestion result content hash differs from its input reference")
    if result.outcome_job_id != context.job_id:
        raise ValueError("Knowledge ingestion result outcomeJobId must match the canonical Job ID")
    if context.source_revision != input_reference.source_revision:
        raise ValueError("Knowledge ingestion Job source revision differs from its input reference")


def build_knowledge_source_ingest_job_definition(
    *,
    execution_policy: BackgroundJobExecutionSettings,
) -> JobTypeDefinition:
    content_manage = JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:content:manage",
    )
    return JobTypeDefinition(
        job_type=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE,
        job_type_version=KNOWLEDGE_SOURCE_INGEST_JOB_TYPE_VERSION,
        task_name=KNOWLEDGE_SOURCE_INGEST_TASK_NAME,
        workload_class=JobWorkloadClass.CONNECTOR,
        target_scope=JobTargetScope.WORKSPACE,
        visibility=JobVisibility.WORKSPACE,
        authority_mode=JobAuthorityMode.ACTOR_REVALIDATED,
        required_permission=content_manage,
        manage_permission=content_manage,
        initial_phase="queued",
        initial_status_key="WORKSPACE_KNOWLEDGE_INGESTION_STATUS_QUEUED",
        phases=frozenset({"queued", "parsing", "chunking", "persisting"}),
        cancellable_phases=frozenset({"queued", "parsing", "chunking"}),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=execution_policy.max_attempts,
            initial_delay_seconds=execution_policy.initial_delay_seconds,
            multiplier=execution_policy.multiplier,
            maximum_delay_seconds=execution_policy.maximum_delay_seconds,
            retryable_codes=KNOWLEDGE_SOURCE_INGEST_RETRYABLE_CODES,
        ),
        timeout_seconds=execution_policy.timeout_seconds,
        lease_seconds=execution_policy.lease_seconds,
        heartbeat_seconds=execution_policy.heartbeat_seconds,
        idempotency_namespace="knowledge-source-ingest",
        target_schema=KnowledgeSourceIngestJobTarget,
        input_reference_schema=KnowledgeSourceIngestJobInput,
        result_reference_schema=KnowledgeSourceIngestJobResult,
        cross_field_validator=validate_knowledge_source_ingest_target_input,
        result_semantic_validator=validate_knowledge_source_ingest_result,
        terminal_error_contracts=KNOWLEDGE_SOURCE_INGEST_TERMINAL_ERROR_CONTRACTS,
    )
