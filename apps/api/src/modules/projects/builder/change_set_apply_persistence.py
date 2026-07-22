from __future__ import annotations

from typing import cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.models.builder._enums import BuilderApprovalStatus, BuilderChangeSetCommandKind, BuilderChangeSetStatus
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.projects.builder.change_set_apply_context import BuilderChangeSetApplyContext
from src.modules.projects.builder.change_set_apply_operations import AppliedBuilderOperations
from src.modules.projects.builder.change_set_revision import AppliedBuilderRevision
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApplyOut,
    BuilderChangeSetApprovalOut,
)
from src.modules.projects.builder.initialization import ActivityWriter
from src.modules.projects.builder.repository import SiteBuilderRepository


async def persist_builder_change_set_apply(
    *,
    repository: SiteBuilderRepository,
    settings: Settings,
    activity_writer: ActivityWriter,
    organization_id: UUID,
    workspace_id: UUID,
    project_id: UUID,
    actor_user_id: UUID,
    idempotency_key: str,
    fingerprint: str,
    context: BuilderChangeSetApplyContext,
    operations: AppliedBuilderOperations,
    revision: AppliedBuilderRevision,
    conn: BaseDBAsyncClient,
) -> BuilderChangeSetApplyOut:
    approval_out = None
    if context.approval is not None:
        approval = await repository.update_change_set_approval(
            record=context.approval,
            values={
                "status": BuilderApprovalStatus.CONSUMED,
                "approved_by_user_id": actor_user_id,
                "approved_at": context.now,
                "consumed_at": context.now,
            },
            conn=conn,
        )
        approval_out = BuilderChangeSetApprovalOut(
            approval_id=approval.id,
            approval_class=approval.approval_class,
            status=BuilderApprovalStatus.CONSUMED,
            expires_at=approval.expires_at,
        )
    result = BuilderChangeSetApplyOut(
        change_set_id=context.change_set.id,
        status=BuilderChangeSetStatus.APPLIED,
        base_revision_id=context.base_manifest.id,
        content_structure_revision=revision.content_structure_revision,
        site_revision=revision.site_revision,
        client_page_ids=operations.client_page_ids,
        client_global_section_ids=operations.client_global_section_ids,
        approval=approval_out,
        applied_at=context.now,
    )
    snapshot = cast(JsonObject, result.model_dump(mode="json", by_alias=True))
    await repository.update_change_set(
        record=context.change_set,
        values={
            "status": BuilderChangeSetStatus.APPLIED,
            "applied_site_revision_id": revision.site_revision.id,
            "apply_result": snapshot,
            "applied_at": context.now,
        },
        conn=conn,
    )
    await activity_writer(
        settings=settings,
        payload=ActivityAuditPayload(
            event_name="project.builder.change_set.applied",
            organization_id=organization_id,
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            entity_type="builder_change_set",
            entity_id=context.change_set.id,
            source="api",
            properties={
                "baseRevisionId": str(context.base_manifest.id),
                "siteRevisionId": str(revision.site_revision.id),
                "contentStructureRevisionId": str(revision.content_structure_revision.id),
                "operationsHash": context.change_set.operations_hash,
                "operationCount": len(context.operations),
                "approvalClass": str(context.change_set.approval_class),
            },
        ),
        conn=conn,
    )
    await repository.create_change_set_command(
        values={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "change_set_id": context.change_set.id,
            "command_kind": BuilderChangeSetCommandKind.APPLY,
            "request_idempotency_key": idempotency_key,
            "request_fingerprint": fingerprint,
            "result_snapshot": snapshot,
            "actor_user_id": actor_user_id,
            "correlation_id": correlation_id.get(None),
        },
        conn=conn,
    )
    return result


def replay_builder_change_set_apply(snapshot: JsonObject) -> BuilderChangeSetApplyOut:
    return BuilderChangeSetApplyOut.model_validate(snapshot)


__all__ = ["persist_builder_change_set_apply", "replay_builder_change_set_apply"]
