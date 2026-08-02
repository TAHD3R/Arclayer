from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from src.models.knowledge.guidance import (
    KnowledgeGuidanceLayerRecord,
    KnowledgeGuidanceReferenceRecord,
    KnowledgeGuidanceRevisionRecord,
)
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import KnowledgeSourceVersionRecord
from src.modules.workspaces.knowledge.schema import (
    KnowledgeAccessPolicy,
    KnowledgeBaseDetailOut,
    KnowledgeBaseSummaryOut,
    KnowledgeGuidanceConflictOut,
    KnowledgeGuidanceEffectivePreviewOut,
    KnowledgeGuidanceLayerOut,
    KnowledgeGuidanceReferenceOut,
    KnowledgeGuidanceRevisionOut,
    KnowledgeGuidanceUnavailableOut,
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


def project_guidance_revision(record: KnowledgeGuidanceRevisionRecord) -> KnowledgeGuidanceRevisionOut:
    return KnowledgeGuidanceRevisionOut(
        id=record.id,
        guidance_layer_id=record.guidance_layer_id,
        workspace_id=record.workspace_id,
        revision_number=record.revision_number,
        content=record.content,
        content_hash=record.content_hash,
        status=cast(Literal["draft", "published", "superseded"], str(record.status)),
        restored_from_revision_id=record.restored_from_revision_id,
        published_at=record.published_at,
        published_by_user_id=record.published_by_user_id,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


def project_guidance_reference(record: KnowledgeGuidanceReferenceRecord) -> KnowledgeGuidanceReferenceOut:
    return KnowledgeGuidanceReferenceOut(
        id=record.id,
        knowledge_base_id=record.knowledge_base_id,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


def project_guidance_layer(
    record: KnowledgeGuidanceLayerRecord,
    *,
    draft: KnowledgeGuidanceRevisionRecord | None,
    published: KnowledgeGuidanceRevisionRecord | None,
    references: tuple[KnowledgeGuidanceReferenceRecord, ...],
) -> KnowledgeGuidanceLayerOut:
    is_project = str(record.scope_kind) == "project"
    return KnowledgeGuidanceLayerOut(
        id=record.id,
        workspace_id=record.workspace_id,
        scope=cast(Literal["workspace", "project"], str(record.scope_kind)),
        project_id=record.scope_id if is_project else None,
        project_mode=(
            cast(Literal["supplement", "override"], str(record.project_mode))
            if record.project_mode is not None
            else None
        ),
        metadata_revision=record.metadata_revision,
        draft_revision_id=record.draft_revision_id,
        published_revision_id=record.published_revision_id,
        removed_at=record.removed_at,
        removed_by_user_id=record.removed_by_user_id,
        current_draft=project_guidance_revision(draft) if draft is not None else None,
        current_published=project_guidance_revision(published) if published is not None else None,
        references=tuple(project_guidance_reference(item) for item in references),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def project_effective_guidance_preview(
    *,
    workspace: KnowledgeGuidanceLayerOut,
    project: KnowledgeGuidanceLayerOut | None,
) -> KnowledgeGuidanceEffectivePreviewOut:
    unavailable: list[KnowledgeGuidanceUnavailableOut] = []
    conflicts: list[KnowledgeGuidanceConflictOut] = []
    workspace_content = _published_content(workspace, unavailable, "workspace")
    if project is None:
        return KnowledgeGuidanceEffectivePreviewOut(
            workspace=workspace,
            project=None,
            precedence=("workspace",),
            effective_content=workspace_content,
            conflicts=tuple(conflicts),
            unavailable=tuple(unavailable),
        )

    project_content = _published_content(project, unavailable, "project")
    if project.project_mode == "override" and project_content is not None:
        workspace_revision = workspace.current_published
        project_revision = project.current_published
        if workspace_revision is not None and workspace_content is not None and project_revision is not None:
            conflicts.append(
                KnowledgeGuidanceConflictOut(
                    code="project_override_hides_workspace",
                    message_key="knowledge.guidance.conflict.project_override_hides_workspace",
                    workspace_revision_id=workspace_revision.id,
                    project_revision_id=project_revision.id,
                )
            )
        return KnowledgeGuidanceEffectivePreviewOut(
            workspace=workspace,
            project=project,
            precedence=("project", "workspace"),
            effective_content=project_content,
            conflicts=tuple(conflicts),
            unavailable=tuple(unavailable),
        )

    effective_content = _join_guidance_content(workspace_content, project_content)
    return KnowledgeGuidanceEffectivePreviewOut(
        workspace=workspace,
        project=project,
        precedence=("workspace", "project"),
        effective_content=effective_content,
        conflicts=tuple(conflicts),
        unavailable=tuple(unavailable),
    )


def _published_content(
    layer: KnowledgeGuidanceLayerOut,
    unavailable: list[KnowledgeGuidanceUnavailableOut],
    scope: Literal["workspace", "project"],
) -> str | None:
    if layer.removed_at is not None:
        unavailable.append(
            KnowledgeGuidanceUnavailableOut(
                code=_guidance_unavailable_code(scope=scope, state="removed"),
                message_key=f"knowledge.guidance.unavailable.{scope}_guidance_removed",
            )
        )
        return None
    if layer.current_published is None:
        unavailable.append(
            KnowledgeGuidanceUnavailableOut(
                code=_guidance_unavailable_code(scope=scope, state="unpublished"),
                message_key=f"knowledge.guidance.unavailable.{scope}_guidance_unpublished",
            )
        )
        return None
    return layer.current_published.content


def _join_guidance_content(workspace_content: str | None, project_content: str | None) -> str | None:
    values = tuple(content for content in (workspace_content, project_content) if content)
    return "\n\n".join(values) if values else None


def _guidance_unavailable_code(
    *,
    scope: Literal["workspace", "project"],
    state: Literal["removed", "unpublished"],
) -> Literal[
    "workspace_guidance_unpublished",
    "project_guidance_unpublished",
    "workspace_guidance_removed",
    "project_guidance_removed",
]:
    if scope == "workspace" and state == "removed":
        return "workspace_guidance_removed"
    if scope == "workspace":
        return "workspace_guidance_unpublished"
    if state == "removed":
        return "project_guidance_removed"
    return "project_guidance_unpublished"
