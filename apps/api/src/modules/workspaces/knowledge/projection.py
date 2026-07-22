from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import KnowledgeSourceVersionRecord
from src.modules.workspaces.knowledge.schema import (
    KnowledgeAccessPolicy,
    KnowledgeBaseDetailOut,
    KnowledgeBaseSummaryOut,
    KnowledgeSourceOut,
    KnowledgeSourceVersionOut,
)


def project_policy(record: KnowledgeAccessPolicyRecord) -> KnowledgeAccessPolicy:
    return KnowledgeAccessPolicy(
        visibility=cast(Literal["workspace", "restricted"], str(record.visibility)),
        allowed_project_ids=tuple(UUID(str(value)) for value in (record.allowed_project_ids or [])),
        allowed_role_codes=tuple(str(value) for value in (record.allowed_role_codes or [])),
        allowed_member_ids=tuple(UUID(str(value)) for value in (record.allowed_member_ids or [])),
        allowed_agent_definition_ids=tuple(UUID(str(value)) for value in (record.allowed_agent_definition_ids or [])),
    )


def project_base_summary(
    record: KnowledgeBaseRecord,
    *,
    source_count: int,
    ready_source_count: int,
) -> KnowledgeBaseSummaryOut:
    return KnowledgeBaseSummaryOut(
        id=record.id,
        workspace_id=record.workspace_id,
        name=record.name,
        description=record.description,
        default_locale=record.default_locale,
        status=str(record.status),
        policy_revision=record.current_policy_revision,
        metadata_revision=record.metadata_revision,
        source_count=source_count,
        ready_source_count=ready_source_count,
        created_by_user_id=record.created_by_user_id,
        updated_by_user_id=record.updated_by_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_base_detail(
    record: KnowledgeBaseRecord,
    *,
    policy: KnowledgeAccessPolicyRecord,
    source_count: int,
    ready_source_count: int,
) -> KnowledgeBaseDetailOut:
    summary = project_base_summary(
        record,
        source_count=source_count,
        ready_source_count=ready_source_count,
    )
    return KnowledgeBaseDetailOut(**summary.model_dump(), access_policy=project_policy(policy))


def project_source(record: KnowledgeSourceRecord) -> KnowledgeSourceOut:
    return KnowledgeSourceOut(
        id=record.id,
        knowledge_base_id=record.knowledge_base_id,
        workspace_id=record.workspace_id,
        source_kind=str(record.source_kind),
        display_name=record.display_name,
        locale=record.locale,
        status=str(record.status),
        locator=record.locator,
        active_ready_version_id=record.active_ready_version_id,
        latest_candidate_version_id=record.latest_candidate_version_id,
        serving_freshness=str(record.serving_freshness),
        safe_error_code=record.safe_error_code,
        metadata_revision=record.metadata_revision,
        created_by_user_id=record.created_by_user_id,
        updated_by_user_id=record.updated_by_user_id,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_version(record: KnowledgeSourceVersionRecord) -> KnowledgeSourceVersionOut:
    state = record.operational_state
    return KnowledgeSourceVersionOut(
        id=record.id,
        source_id=record.source_id,
        workspace_id=record.workspace_id,
        version_number=record.version_number,
        status=str(state.status),
        content_hash=record.content_hash,
        normalized_content_hash=record.normalized_content_hash,
        parser_name=record.parser_name,
        parser_version=record.parser_version,
        ingestion_mode=str(record.ingestion_mode),
        locale=record.locale,
        title=record.title,
        document_metadata=record.document_metadata or {},
        chunker_name=record.chunker_name,
        chunker_version=record.chunker_version,
        index_schema_version=record.index_schema_version,
        token_count=record.token_count,
        character_count=record.character_count,
        chunk_count=record.chunk_count,
        provenance_actor_user_id=record.provenance_actor_user_id,
        provenance_job_id=record.provenance_job_id,
        index_job_id=state.index_job_id,
        correlation_id=record.correlation_id,
        created_at=record.created_at,
    )
