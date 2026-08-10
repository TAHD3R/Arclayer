from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.builder.draft_checkpoint import BuilderDraftCheckpointRecord
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.change_set_schema import BuilderChangeSetPreviewRequest
from src.modules.projects.builder.command import builder_request_fingerprint, require_builder_idempotency_key
from src.modules.projects.builder.draft_checkpoint_schema import (
    BuilderDraftCheckpointOut,
    BuilderDraftCheckpointSaveIn,
)
from src.modules.projects.builder.repository import SiteBuilderRepository


class BuilderDraftCheckpointService(BaseService):
    def __init__(self, *, repository: SiteBuilderRepository) -> None:
        super().__init__()
        self._repository = repository

    async def get(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        client_session_id: str,
    ) -> BuilderDraftCheckpointOut | None:
        if runtime_id is None:
            return None
        site = await self._repository.get_site(project_id=project_id, runtime_id=runtime_id)
        environment = await self._repository.get_default_preview_environment(project_id=project_id)
        if site is None or environment is None:
            return None
        record = await self._repository.get_draft_checkpoint(
            project_id=project_id,
            actor_user_id=actor_user_id,
            client_session_id=client_session_id,
            site_id=site.id,
            environment_id=environment.id,
        )
        if record is None or str(record.status) == "discarded":
            return None
        return _to_out(record)

    async def save(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: BuilderDraftCheckpointSaveIn,
    ) -> BuilderDraftCheckpointOut:
        key = require_builder_idempotency_key(idempotency_key)
        validated = BuilderChangeSetPreviewRequest(
            base_revision_id=payload.base_revision_id,
            base_etag=payload.base_etag,
            operations=payload.operations,
            provenance_source=payload.provenance_source,
            agent_run_id=payload.agent_run_id,
            agent_id=payload.agent_id,
            tool_name="builder.draft.autosave" if payload.provenance_source == "agent" else None,
        )
        fingerprint = builder_request_fingerprint(cast(JsonObject, payload.model_dump(mode="json", by_alias=True)))
        operations = [operation.model_dump(mode="json", by_alias=True) for operation in validated.operations]
        operations_payload = cast(JsonObject, {"operations": operations})
        operations_hash = f"sha256:{builder_request_fingerprint(operations_payload)}"
        async with self.tx() as conn:
            project = await self._repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
            require_builder_authority(project)
            if runtime_id is None:
                raise Conflict("Project runtime identity required", error="PROJECT_RUNTIME_IDENTITY_REQUIRED")
            site = await self._repository.get_site(
                project_id=project_id,
                runtime_id=runtime_id,
                conn=conn,
            )
            environment = await self._repository.get_default_preview_environment(
                project_id=project_id,
                conn=conn,
            )
            if site is None:
                raise NotFound("Builder site not found", error="BUILDER_SITE_NOT_FOUND")
            if environment is None:
                raise NotFound("Builder environment not found", error="BUILDER_ENVIRONMENT_NOT_FOUND")
            record = await self._repository.get_draft_checkpoint(
                project_id=project_id,
                actor_user_id=actor_user_id,
                client_session_id=payload.client_session_id,
                site_id=site.id,
                environment_id=environment.id,
                conn=conn,
                for_update=True,
            )
            if record is not None and record.last_idempotency_key == key:
                if record.last_request_fingerprint != fingerprint:
                    raise Conflict(
                        "Builder draft idempotency conflict",
                        error="BUILDER_DRAFT_IDEMPOTENCY_CONFLICT",
                    )
                return _to_out(record)
            latest_records, _ = await self._repository.list_site_revisions(
                project_id=project_id,
                site_id=site.id,
                environment_id=environment.id,
                limit=1,
                cursor=None,
                conn=conn,
            )
            if not latest_records:
                raise NotFound("Builder revision not found", error="SITE_REVISION_NOT_FOUND")
            latest = latest_records[0]
            if latest.id != payload.base_revision_id or str(latest.manifest_hash) != payload.base_etag:
                raise Conflict(
                    "Builder draft base is stale",
                    error="SITE_REVISION_STALE",
                    meta={
                        "baseRevisionId": str(payload.base_revision_id),
                        "baseEtag": payload.base_etag,
                        "currentRevisionId": str(latest.id),
                        "currentEtag": str(latest.manifest_hash),
                    },
                )
            current_version = (
                0
                if record is not None and str(record.status) == "discarded"
                else int(record.checkpoint_version)
                if record is not None
                else 0
            )
            if payload.expected_checkpoint_version != current_version:
                raise Conflict(
                    "Builder draft checkpoint changed",
                    error="BUILDER_DRAFT_CHECKPOINT_CONFLICT",
                    meta={
                        "expectedCheckpointVersion": payload.expected_checkpoint_version,
                        "currentCheckpointVersion": current_version,
                    },
                )
            values: dict[str, object] = {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "site_id": site.id,
                "environment_id": environment.id,
                "actor_user_id": actor_user_id,
                "client_session_id": payload.client_session_id,
                "base_revision_id": payload.base_revision_id,
                "base_etag": payload.base_etag,
                "checkpoint_version": current_version + 1,
                "operations": operations,
                "operations_hash": operations_hash,
                "status": "draft",
                "provenance_source": payload.provenance_source,
                "agent_run_id": payload.agent_run_id,
                "agent_id": payload.agent_id,
                "last_idempotency_key": key,
                "last_request_fingerprint": fingerprint,
                "conflict_meta": None,
                "applied_change_set_id": None,
                "discarded_at": None,
            }
            record = (
                await self._repository.create_draft_checkpoint(values=values, conn=conn)
                if record is None
                else await self._repository.update_draft_checkpoint(record=record, values=values, conn=conn)
            )
            return _to_out(record)

    async def discard(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        client_session_id: str,
        expected_checkpoint_version: int,
    ) -> BuilderDraftCheckpointOut | None:
        async with self.tx() as conn:
            if runtime_id is None:
                raise Conflict("Project runtime identity required", error="PROJECT_RUNTIME_IDENTITY_REQUIRED")
            site = await self._repository.get_site(project_id=project_id, runtime_id=runtime_id, conn=conn)
            environment = await self._repository.get_default_preview_environment(project_id=project_id, conn=conn)
            if site is None or environment is None:
                raise NotFound("Builder scope not found", error="BUILDER_SITE_NOT_FOUND")
            record = await self._repository.get_draft_checkpoint(
                project_id=project_id,
                actor_user_id=actor_user_id,
                client_session_id=client_session_id,
                site_id=site.id,
                environment_id=environment.id,
                conn=conn,
                for_update=True,
            )
            if record is None:
                return None
            if int(record.checkpoint_version) != expected_checkpoint_version:
                raise Conflict(
                    "Builder draft checkpoint changed",
                    error="BUILDER_DRAFT_CHECKPOINT_CONFLICT",
                    meta={
                        "expectedCheckpointVersion": expected_checkpoint_version,
                        "currentCheckpointVersion": int(record.checkpoint_version),
                    },
                )
            record = await self._repository.update_draft_checkpoint(
                record=record,
                values={
                    "status": "discarded",
                    "operations": [],
                    "conflict_meta": None,
                    "discarded_at": datetime.now(UTC),
                },
                conn=conn,
            )
            return _to_out(record)


def _to_out(record: BuilderDraftCheckpointRecord) -> BuilderDraftCheckpointOut:
    return BuilderDraftCheckpointOut.model_validate({
        "id": record.id,
        "projectId": record.project_id,
        "clientSessionId": record.client_session_id,
        "baseRevisionId": record.base_revision_id,
        "baseEtag": record.base_etag,
        "checkpointVersion": record.checkpoint_version,
        "operations": record.operations,
        "operationsHash": record.operations_hash,
        "status": record.status,
        "provenanceSource": record.provenance_source,
        "conflictMeta": record.conflict_meta,
        "appliedChangeSetId": record.applied_change_set_id,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    })


__all__ = ["BuilderDraftCheckpointService"]
