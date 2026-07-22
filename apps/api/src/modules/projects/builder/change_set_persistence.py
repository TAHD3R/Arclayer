from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import NoReturn, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.builder._enums import (
    BuilderApprovalClass,
    BuilderApprovalStatus,
    BuilderChangeSetCommandKind,
    BuilderChangeSetStatus,
    BuilderProvenanceSource,
)
from src.models.builder.change_set import BuilderChangeSetRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.projects.builder.change_set_context import ResolvedBuilderAgentProvenance
from src.modules.projects.builder.change_set_preview import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApprovalOut,
    BuilderChangeSetPreviewOut,
    BuilderChangeSetPreviewRequest,
)
from src.modules.projects.builder.change_set_token import (
    BuilderChangeSetPreviewTokenClaims,
    build_builder_change_set_preview_token,
    builder_change_set_preview_token_hash,
)
from src.modules.projects.builder.initialization import ActivityWriter
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import SiteRevisionManifestV1
from src.modules.projects.builder.snapshot import canonical_hash

_PREVIEW_SUMMARY_KEY = "BUILDER_CHANGE_SET_PREVIEW_SUMMARY"


async def persist_builder_change_set_preview(
    *,
    repository: SiteBuilderRepository,
    settings: Settings,
    activity_writer: ActivityWriter,
    organization_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    idempotency_key: str,
    fingerprint: str,
    payload: BuilderChangeSetPreviewRequest,
    manifest: SiteRevisionManifestV1,
    provenance: BuilderProvenanceSource,
    agent_provenance: ResolvedBuilderAgentProvenance | None,
    analysis: BuilderChangeSetAnalysis,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetPreviewOut:
    change_set_id = uuid7()
    now = datetime.now(UTC)
    expires_at = now + timedelta(seconds=payload.expires_in_seconds)
    operations_json = [operation.model_dump(mode="json", by_alias=True) for operation in analysis.operations]
    operations_hash = canonical_hash(cast(JsonValue, operations_json))
    token = _build_preview_token(
        settings=settings,
        change_set_id=change_set_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        base_revision_id=UUID(str(manifest.id)),
        base_etag=manifest.manifest_hash,
        operations_hash=operations_hash,
        expires_at=expires_at,
    )
    result = BuilderChangeSetPreviewOut(
        change_set_id=change_set_id,
        status=BuilderChangeSetStatus.PREVIEWED,
        base_revision_id=manifest.id,
        base_etag=manifest.manifest_hash,
        operations=analysis.operations,
        operations_hash=operations_hash,
        affected_targets=analysis.affected_targets,
        issues=analysis.issues,
        required_permissions=analysis.required_permissions,
        approval_class=analysis.approval_class,
        approval=None,
        preview_ref=f"/projects/{project_id}/builder/change-sets/{change_set_id}",
        preview_token=token,
        expires_at=expires_at,
        summary_key=_PREVIEW_SUMMARY_KEY,
        summary_params=analysis.summary_params,
        wireframe_candidates=analysis.wireframe_candidates,
        design_candidates=analysis.design_candidates,
        global_section_graph=analysis.global_section_graph,
    )
    await _create_change_set(
        repository=repository,
        result=result,
        operations_json=operations_json,
        token=token,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        payload=payload,
        provenance=provenance,
        agent_provenance=agent_provenance,
        now=now,
        conn=conn,
    )
    if analysis.approval_class is not BuilderApprovalClass.NONE:
        approval = await repository.create_change_set_approval(
            values={
                "workspace_id": workspace_id,
                "project_id": project_id,
                "change_set_id": change_set_id,
                "approval_class": analysis.approval_class,
                "operations_hash": operations_hash,
                "status": BuilderApprovalStatus.PENDING,
                "requested_by_user_id": actor_user_id,
                "expires_at": expires_at,
            },
            conn=conn,
        )
        result = result.model_copy(
            update={
                "approval": BuilderChangeSetApprovalOut(
                    approval_id=approval.id,
                    approval_class=analysis.approval_class,
                    status=BuilderApprovalStatus.PENDING,
                    expires_at=expires_at,
                )
            }
        )
    await _write_preview_activity(
        settings=settings,
        activity_writer=activity_writer,
        organization_id=organization_id,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        result=result,
        conn=conn,
    )
    snapshot = cast(
        JsonObject,
        result.model_dump(mode="json", by_alias=True, exclude={"preview_token"}),
    )
    await repository.create_change_set_command(
        values={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "change_set_id": change_set_id,
            "command_kind": BuilderChangeSetCommandKind.PREVIEW,
            "request_idempotency_key": idempotency_key,
            "request_fingerprint": fingerprint,
            "result_snapshot": snapshot,
            "actor_user_id": actor_user_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )
    return result


async def replay_builder_change_set_preview(
    *,
    repository: SiteBuilderRepository,
    settings: Settings,
    project_id: UUID,
    change_set_id: UUID | None,
    snapshot: JsonObject,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetPreviewOut:
    if change_set_id is None:
        _raise_conflict("CHANGE_SET_NOT_FOUND")
    record = await repository.get_change_set(
        project_id=project_id,
        change_set_id=change_set_id,
        conn=conn,
    )
    if record is None:
        _raise_conflict("CHANGE_SET_NOT_FOUND")
    token = _token_for_record(settings=settings, record=record)
    return BuilderChangeSetPreviewOut.model_validate({**snapshot, "previewToken": token})


async def _create_change_set(
    *,
    repository: SiteBuilderRepository,
    result: BuilderChangeSetPreviewOut,
    operations_json: list[JsonObject],
    token: str,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    payload: BuilderChangeSetPreviewRequest,
    provenance: BuilderProvenanceSource,
    agent_provenance: ResolvedBuilderAgentProvenance | None,
    now: datetime,
    conn: BaseDBAsyncClient,
) -> None:
    await repository.create_change_set(
        values={
            "id": result.change_set_id,
            "created_at": now,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "site_id": site_id,
            "environment_id": environment_id,
            "base_site_revision_id": result.base_revision_id,
            "base_manifest_hash": result.base_etag,
            "status": BuilderChangeSetStatus.PREVIEWED,
            "operations": operations_json,
            "operations_hash": result.operations_hash,
            "affected_targets": [target.model_dump(mode="json", by_alias=True) for target in result.affected_targets],
            "issues": [issue.model_dump(mode="json", by_alias=True) for issue in result.issues],
            "required_permissions": list(result.required_permissions),
            "approval_class": result.approval_class,
            "preview_token_hash": builder_change_set_preview_token_hash(token),
            "expires_at": result.expires_at,
            "provenance_source": provenance,
            "actor_user_id": actor_user_id,
            "agent_run_id": agent_provenance.agent_run_id if agent_provenance is not None else None,
            "agent_id": agent_provenance.agent_id if agent_provenance is not None else None,
            "agent_version_id": agent_provenance.agent_version_id if agent_provenance is not None else None,
            "agent_assignment_id": agent_provenance.agent_assignment_id if agent_provenance is not None else None,
            "tool_name": agent_provenance.tool_name if agent_provenance is not None else None,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )


def _build_preview_token(
    *,
    settings: Settings,
    change_set_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    base_revision_id: UUID,
    base_etag: str,
    operations_hash: str,
    expires_at: datetime,
) -> str:
    return build_builder_change_set_preview_token(
        settings,
        claims=BuilderChangeSetPreviewTokenClaims(
            change_set_id=change_set_id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=actor_user_id,
            base_revision_id=base_revision_id,
            base_etag=base_etag,
            operations_hash=operations_hash,
            expires_at=expires_at,
        ),
    )


def _token_for_record(*, settings: Settings, record: BuilderChangeSetRecord) -> str:
    if record.actor_user_id is None:
        _raise_conflict("CHANGE_SET_PREVIEW_REQUIRED")
    return _build_preview_token(
        settings=settings,
        change_set_id=record.id,
        workspace_id=record.workspace_id,
        project_id=record.project_id,
        site_id=record.site_id,
        environment_id=record.environment_id,
        actor_user_id=record.actor_user_id,
        base_revision_id=record.base_site_revision_id,
        base_etag=record.base_manifest_hash,
        operations_hash=record.operations_hash,
        expires_at=record.expires_at,
    )


async def _write_preview_activity(
    *,
    settings: Settings,
    activity_writer: ActivityWriter,
    organization_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
    actor_user_id: UUID,
    result: BuilderChangeSetPreviewOut,
    conn: BaseDBAsyncClient,
) -> None:
    await activity_writer(
        settings=settings,
        payload=ActivityAuditPayload(
            event_name="project.builder.change_set.previewed",
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            entity_type="builder_change_set",
            entity_id=UUID(str(result.change_set_id)),
            source="api",
            properties={
                "baseRevisionId": str(result.base_revision_id),
                "baseEtag": result.base_etag,
                "operationsHash": result.operations_hash,
                "operationCount": len(result.operations),
                "approvalClass": str(result.approval_class),
                "expiresAt": result.expires_at.isoformat(),
            },
        ),
        conn=conn,
    )


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = ["persist_builder_change_set_preview", "replay_builder_change_set_preview"]
