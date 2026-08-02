from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi.routing import APIRoute
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeGuidanceRevisionStatus,
    KnowledgeGuidanceScope,
    KnowledgeProjectGuidanceMode,
)
from src.models.knowledge.guidance import (
    KnowledgeGuidanceCommandRecord,
    KnowledgeGuidanceLayerRecord,
    KnowledgeGuidancePreviewRecord,
    KnowledgeGuidanceReferenceRecord,
    KnowledgeGuidanceRevisionRecord,
)
from src.models.knowledge.knowledge_base import KnowledgeBaseRecord
from src.modules.workspaces.knowledge.repository import WorkspaceGuidanceRepository
from src.modules.workspaces.knowledge.router import router
from src.modules.workspaces.knowledge.schema import (
    KnowledgeGuidanceDraftSaveRequest,
    KnowledgeGuidancePreviewApplyRequest,
    KnowledgeGuidancePublishRequest,
    KnowledgeGuidanceReferenceAttachRequest,
    KnowledgeGuidanceReferenceDetachRequest,
    KnowledgeGuidanceRemovePreviewRequest,
    KnowledgeGuidanceRestorePreviewRequest,
)
from src.modules.workspaces.knowledge.service import (
    WorkspaceGuidanceService,
    workspace_knowledge_capabilities,
)

pytestmark = pytest.mark.unit


class _Repository(WorkspaceGuidanceRepository):
    def __init__(self, *, workspace_id: UUID, project_id: UUID) -> None:
        self.workspace_id = workspace_id
        self.project_ids = {project_id}
        self.layers: dict[tuple[UUID, str, UUID], KnowledgeGuidanceLayerRecord] = {}
        self.revisions: dict[UUID, KnowledgeGuidanceRevisionRecord] = {}
        self.references: dict[UUID, list[KnowledgeGuidanceReferenceRecord]] = {}
        self.previews: dict[UUID, KnowledgeGuidancePreviewRecord] = {}
        self.commands: dict[tuple[UUID, str, str], KnowledgeGuidanceCommandRecord] = {}
        self.bases: dict[UUID, KnowledgeBaseRecord] = {}
        self.create_layer_calls = 0

    @asynccontextmanager
    async def connection(self, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())

    async def get_layer(
        self,
        *,
        workspace_id: UUID,
        scope_kind: str,
        scope_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceLayerRecord | None:
        return self.layers.get((workspace_id, str(scope_kind), scope_id))

    async def get_layer_for_update(
        self,
        *,
        workspace_id: UUID,
        scope_kind: str,
        scope_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerRecord | None:
        return await self.get_layer(
            workspace_id=workspace_id,
            scope_kind=scope_kind,
            scope_id=scope_id,
            conn=conn,
        )

    async def create_layer(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceLayerRecord:
        _ = (values, conn)
        self.create_layer_calls += 1
        raise AssertionError("Guidance service must not lazily create layers")

    async def save_layer(
        self,
        *,
        record: KnowledgeGuidanceLayerRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = update_fields
        record.updated_at = datetime.now(UTC)

    async def project_exists(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return workspace_id == self.workspace_id and project_id in self.project_ids

    async def get_knowledge_base(
        self,
        *,
        workspace_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeBaseRecord | None:
        return self.bases.get(knowledge_base_id) if workspace_id == self.workspace_id else None

    async def get_revision(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        record = self.revisions.get(revision_id)
        if record is None or record.workspace_id != workspace_id or record.guidance_layer_id != guidance_layer_id:
            return None
        return record

    async def get_revision_for_update(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        return await self.get_revision(
            workspace_id=workspace_id,
            guidance_layer_id=guidance_layer_id,
            revision_id=revision_id,
            conn=conn,
        )

    async def get_revision_by_idempotency_key(
        self,
        *,
        guidance_layer_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord | None:
        return next(
            (
                record
                for record in self.revisions.values()
                if record.guidance_layer_id == guidance_layer_id
                and record.request_idempotency_key == idempotency_key
            ),
            None,
        )

    async def list_revisions(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        limit: int,
        cursor: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[tuple[KnowledgeGuidanceRevisionRecord, ...], UUID | None]:
        _ = conn
        revisions = tuple(
            sorted(
                (
                    record
                    for record in self.revisions.values()
                    if record.workspace_id == workspace_id and record.guidance_layer_id == guidance_layer_id
                ),
                key=lambda record: (record.revision_number, str(record.id)),
                reverse=True,
            )
        )
        if cursor is not None:
            cursor_index = next(
                (index for index, record in enumerate(revisions) if record.id == cursor),
                None,
            )
            if cursor_index is None:
                return (), None
            revisions = revisions[cursor_index + 1 :]
        page = revisions[: limit + 1]
        next_cursor = page[limit - 1].id if len(page) > limit else None
        return tuple(page[:limit]), next_cursor

    async def next_revision_number(self, *, guidance_layer_id: UUID, conn: BaseDBAsyncClient) -> int:
        numbers = [
            record.revision_number
            for record in self.revisions.values()
            if record.guidance_layer_id == guidance_layer_id
        ]
        return max(numbers, default=0) + 1

    async def create_revision(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceRevisionRecord:
        record = _revision(**values)
        self.revisions[record.id] = record
        return record

    async def save_revision(
        self,
        *,
        record: KnowledgeGuidanceRevisionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = (record, update_fields, conn)

    async def list_references(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[KnowledgeGuidanceReferenceRecord, ...]:
        if workspace_id != self.workspace_id:
            return ()
        return tuple(self.references.get(guidance_layer_id, ()))

    async def get_reference(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        knowledge_base_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> KnowledgeGuidanceReferenceRecord | None:
        return next(
            (
                reference
                for reference in self.references.get(guidance_layer_id, ())
                if reference.workspace_id == workspace_id and reference.knowledge_base_id == knowledge_base_id
            ),
            None,
        )

    async def create_reference(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceReferenceRecord:
        reference = _reference(**values)
        self.references.setdefault(reference.guidance_layer_id, []).append(reference)
        return reference

    async def delete_reference(
        self,
        *,
        record: KnowledgeGuidanceReferenceRecord,
        conn: BaseDBAsyncClient,
    ) -> None:
        self.references[record.guidance_layer_id].remove(record)

    async def source_counts_for_references(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[int, int, int]:
        count = len(await self.list_references(
            workspace_id=workspace_id,
            guidance_layer_id=guidance_layer_id,
            conn=conn,
        ))
        return count, count, count

    async def count_project_layers(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        return sum(
            1
            for layer in self.layers.values()
            if layer.workspace_id == workspace_id
            and str(layer.scope_kind) == "project"
            and layer.removed_at is None
        )

    async def get_preview_by_idempotency_key(
        self,
        *,
        guidance_layer_id: UUID,
        kind: str,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord | None:
        return next(
            (
                preview
                for preview in self.previews.values()
                if preview.guidance_layer_id == guidance_layer_id
                and str(preview.kind) == str(kind)
                and preview.request_idempotency_key == idempotency_key
            ),
            None,
        )

    async def get_preview_for_update(
        self,
        *,
        workspace_id: UUID,
        guidance_layer_id: UUID,
        preview_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord | None:
        preview = self.previews.get(preview_id)
        if preview is None or preview.workspace_id != workspace_id or preview.guidance_layer_id != guidance_layer_id:
            return None
        return preview

    async def create_preview(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidancePreviewRecord:
        preview = _preview(**values)
        self.previews[preview.id] = preview
        return preview

    async def save_preview(
        self,
        *,
        record: KnowledgeGuidancePreviewRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        _ = (record, update_fields, conn)

    async def get_command(
        self,
        *,
        guidance_layer_id: UUID,
        kind: str,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceCommandRecord | None:
        return self.commands.get((guidance_layer_id, str(kind), idempotency_key))

    async def create_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> KnowledgeGuidanceCommandRecord:
        command = _command(**values)
        self.commands[(command.guidance_layer_id, str(command.kind), command.request_idempotency_key)] = command
        return command


class _Service(WorkspaceGuidanceService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())


def _layer(**values: object) -> KnowledgeGuidanceLayerRecord:
    now = datetime.now(UTC)
    return cast(
        KnowledgeGuidanceLayerRecord,
        SimpleNamespace(
            id=uuid4(),
            workspace_id=values["workspace_id"],
            scope_kind=values["scope_kind"],
            scope_id=values["scope_id"],
            project_mode=values.get("project_mode"),
            metadata_revision=values.get("metadata_revision", 1),
            draft_revision_id=None,
            published_revision_id=None,
            removed_at=None,
            removed_by_user_id=None,
            created_by_user_id=values.get("created_by_user_id"),
            updated_by_user_id=values.get("updated_by_user_id"),
            created_at=now,
            updated_at=now,
        ),
    )


def _revision(**values: object) -> KnowledgeGuidanceRevisionRecord:
    return cast(
        KnowledgeGuidanceRevisionRecord,
        SimpleNamespace(
            id=uuid4(),
            guidance_layer_id=values["guidance_layer_id"],
            workspace_id=values["workspace_id"],
            revision_number=values["revision_number"],
            content=values["content"],
            content_hash=values["content_hash"],
            status=values["status"],
            restored_from_revision_id=values.get("restored_from_revision_id"),
            published_at=None,
            published_by_user_id=None,
            created_by_user_id=values.get("created_by_user_id"),
            request_idempotency_key=values["request_idempotency_key"],
            request_fingerprint=values["request_fingerprint"],
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


def _reference(**values: object) -> KnowledgeGuidanceReferenceRecord:
    return cast(
        KnowledgeGuidanceReferenceRecord,
        SimpleNamespace(
            id=uuid4(),
            guidance_layer_id=values["guidance_layer_id"],
            workspace_id=values["workspace_id"],
            knowledge_base_id=values["knowledge_base_id"],
            created_by_user_id=values.get("created_by_user_id"),
            created_at=datetime.now(UTC),
        ),
    )


def _preview(**values: object) -> KnowledgeGuidancePreviewRecord:
    return cast(
        KnowledgeGuidancePreviewRecord,
        SimpleNamespace(
            id=uuid4(),
            guidance_layer_id=values["guidance_layer_id"],
            workspace_id=values["workspace_id"],
            kind=values["kind"],
            status=values["status"],
            expected_layer_revision=values["expected_layer_revision"],
            preview_revision=values["preview_revision"],
            source_revision_id=values.get("source_revision_id"),
            snapshot=values["snapshot"],
            request_idempotency_key=values["request_idempotency_key"],
            request_fingerprint=values["request_fingerprint"],
            actor_user_id=values.get("actor_user_id"),
            applied_at=None,
            applied_by_user_id=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


def _command(**values: object) -> KnowledgeGuidanceCommandRecord:
    return cast(
        KnowledgeGuidanceCommandRecord,
        SimpleNamespace(
            id=uuid4(),
            guidance_layer_id=values["guidance_layer_id"],
            workspace_id=values["workspace_id"],
            kind=values["kind"],
            request_idempotency_key=values["request_idempotency_key"],
            request_fingerprint=values["request_fingerprint"],
            result_snapshot=values["result_snapshot"],
            actor_user_id=values.get("actor_user_id"),
            created_at=datetime.now(UTC),
        ),
    )


def _service(repository: _Repository, activities: list[object]) -> _Service:
    async def write_activity(**kwargs: Any) -> None:
        activities.append(kwargs["payload"])

    return _Service(
        repository=cast(WorkspaceGuidanceRepository, repository),
        activity_writer=write_activity,
    )


def _provision_layers(
    repository: _Repository,
    *,
    workspace_id: UUID,
    project_id: UUID | None = None,
) -> None:
    workspace_layer = _layer(
        workspace_id=workspace_id,
        scope_kind=KnowledgeGuidanceScope.WORKSPACE,
        scope_id=workspace_id,
    )
    repository.layers[(workspace_id, str(KnowledgeGuidanceScope.WORKSPACE), workspace_id)] = workspace_layer
    repository.references[workspace_layer.id] = []
    if project_id is None:
        return
    project_layer = _layer(
        workspace_id=workspace_id,
        scope_kind=KnowledgeGuidanceScope.PROJECT,
        scope_id=project_id,
        project_mode=KnowledgeProjectGuidanceMode.SUPPLEMENT,
    )
    repository.layers[(workspace_id, str(KnowledgeGuidanceScope.PROJECT), project_id)] = project_layer
    repository.references[project_layer.id] = []


async def test_guidance_reads_require_preprovisioned_layers() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=project_id)
    service = _service(repository, [])

    with pytest.raises(RuntimeError, match="KNOWLEDGE_GUIDANCE_LAYER_MISSING"):
        await service.get_workspace_layer(workspace_id=workspace_id)
    with pytest.raises(RuntimeError, match="KNOWLEDGE_GUIDANCE_LAYER_MISSING"):
        await service.get_project_layer(workspace_id=workspace_id, project_id=project_id)

    _provision_layers(repository, workspace_id=workspace_id)
    with pytest.raises(RuntimeError, match="KNOWLEDGE_GUIDANCE_LAYER_MISSING"):
        await service.get_effective_preview(workspace_id=workspace_id, project_id=project_id)

    assert repository.create_layer_calls == 0
    assert len(repository.layers) == 1


async def test_guidance_mutations_require_preprovisioned_layers() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=project_id)
    service = _service(repository, [])

    with pytest.raises(RuntimeError, match="KNOWLEDGE_GUIDANCE_LAYER_MISSING"):
        await service.save_draft(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=None,
            actor_user_id=actor_user_id,
            idempotency_key="missing-workspace-layer",
            payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="Workspace guidance"),
        )

    _provision_layers(repository, workspace_id=workspace_id)
    with pytest.raises(RuntimeError, match="KNOWLEDGE_GUIDANCE_LAYER_MISSING"):
        await service.save_draft(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=project_id,
            actor_user_id=actor_user_id,
            idempotency_key="missing-project-layer",
            payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="Project guidance"),
        )

    assert repository.create_layer_calls == 0
    assert len(repository.layers) == 1


async def test_guidance_lifecycle_is_immutable_revision_bound_and_audited() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    actor_user_id = uuid4()
    organization_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=project_id)
    _provision_layers(repository, workspace_id=workspace_id, project_id=project_id)
    activities: list[object] = []
    service = _service(repository, activities)

    first_draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="workspace-v1",
        payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="Workspace v1"),
    )
    assert first_draft.current_draft is not None
    first_revision_id = first_draft.current_draft.id
    replayed = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="workspace-v1",
        payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="Workspace v1"),
    )
    assert replayed.current_draft is not None
    assert replayed.current_draft.id == first_revision_id
    assert len(repository.revisions) == 1
    with pytest.raises(Conflict, match="Idempotency key was reused with different input"):
        await service.save_draft(
            workspace_id=workspace_id,
            organization_id=organization_id,
            project_id=None,
            actor_user_id=actor_user_id,
            idempotency_key="workspace-v1",
            payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=2, content="Workspace v1"),
        )

    published = await service.publish(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="workspace-publish-v1",
        payload=KnowledgeGuidancePublishRequest(expected_revision=2),
    )
    assert published.current_draft is None
    assert published.current_published is not None
    assert published.current_published.id == first_revision_id

    project_draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key="project-v1",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=1,
            content="Project supplement",
            project_mode="supplement",
        ),
    )
    await service.publish(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key="project-publish-v1",
        payload=KnowledgeGuidancePublishRequest(
            expected_revision=project_draft.metadata_revision,
        ),
    )
    effective = await service.get_effective_preview(workspace_id=workspace_id, project_id=project_id)
    assert effective.effective_content == "Workspace v1\n\nProject supplement"
    assert effective.conflicts == ()

    override_draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key="project-override",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=3,
            content="Project override",
            project_mode="override",
        ),
    )
    await service.publish(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key="project-publish-override",
        payload=KnowledgeGuidancePublishRequest(expected_revision=override_draft.metadata_revision),
    )
    overridden = await service.get_effective_preview(workspace_id=workspace_id, project_id=project_id)
    assert overridden.effective_content == "Project override"
    assert overridden.conflicts[0].code == "project_override_hides_workspace"

    workspace_layer = await service.get_workspace_layer(workspace_id=workspace_id)
    restore_preview = await service.create_restore_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="restore-v1",
        payload=KnowledgeGuidanceRestorePreviewRequest(
            expected_revision=workspace_layer.metadata_revision,
            source_revision_id=first_revision_id,
        ),
    )
    restored = await service.apply_restore_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=restore_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="restore-v1-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=workspace_layer.metadata_revision,
            expected_preview_revision=restore_preview.preview_revision,
        ),
    )
    assert restored.current_draft is not None
    assert restored.current_draft.content == "Workspace v1"
    assert restored.current_draft.restored_from_revision_id == first_revision_id

    remove_preview = await service.create_remove_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="remove-v1",
        payload=KnowledgeGuidanceRemovePreviewRequest(expected_revision=restored.metadata_revision),
    )
    removed = await service.apply_remove_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=remove_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="remove-v1-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=restored.metadata_revision,
            expected_preview_revision=remove_preview.preview_revision,
        ),
    )
    assert removed.removed_at is not None
    assert removed.current_draft is None
    assert removed.current_published is None
    assert len(activities) == 10


async def test_guidance_history_returns_persisted_revisions_in_deterministic_pages() -> None:
    workspace_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=uuid4())
    _provision_layers(repository, workspace_id=workspace_id)
    service = _service(repository, [])
    layer = next(iter(repository.layers.values()))
    revisions = tuple(
        _revision(
            guidance_layer_id=layer.id,
            workspace_id=workspace_id,
            revision_number=number,
            content=f"Guidance revision {number}",
            content_hash=f"sha256:{number}",
            status=(
                KnowledgeGuidanceRevisionStatus.DRAFT
                if number == 3
                else KnowledgeGuidanceRevisionStatus.SUPERSEDED
                if number == 2
                else KnowledgeGuidanceRevisionStatus.PUBLISHED
            ),
            request_idempotency_key=f"revision-{number}",
            request_fingerprint=f"revision-{number}",
        )
        for number in (1, 2, 3)
    )
    repository.revisions.update({revision.id: revision for revision in revisions})

    first_page = await service.list_revision_history(
        workspace_id=workspace_id,
        project_id=None,
        limit=2,
        cursor=None,
    )

    assert [revision.revision_number for revision in first_page.items] == [3, 2]
    assert [revision.status for revision in first_page.items] == ["draft", "superseded"]
    assert first_page.next_cursor == revisions[1].id

    second_page = await service.list_revision_history(
        workspace_id=workspace_id,
        project_id=None,
        limit=2,
        cursor=first_page.next_cursor,
    )

    assert [revision.revision_number for revision in second_page.items] == [1]
    assert second_page.next_cursor is None
    assert second_page.items[0].content == "Guidance revision 1"


async def test_durable_guidance_commands_replay_their_exact_receipts() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    organization_id = uuid4()
    actor_user_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=project_id)
    _provision_layers(repository, workspace_id=workspace_id)
    service = _service(repository, [])

    first_draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="first-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="Workspace v1"),
    )
    assert first_draft.current_draft is not None
    first_revision_id = first_draft.current_draft.id
    published = await service.publish(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="publish",
        payload=KnowledgeGuidancePublishRequest(expected_revision=first_draft.metadata_revision),
    )
    second_draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="second-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=published.metadata_revision,
            content="Workspace v2",
        ),
    )
    publish_replay = await service.publish(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="publish",
        payload=KnowledgeGuidancePublishRequest(expected_revision=first_draft.metadata_revision),
    )
    assert publish_replay == published

    knowledge_base_id = uuid4()
    repository.bases[knowledge_base_id] = cast(
        KnowledgeBaseRecord,
        SimpleNamespace(id=knowledge_base_id, status=KnowledgeBaseStatus.ACTIVE),
    )
    attached = await service.attach_reference(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="attach",
        payload=KnowledgeGuidanceReferenceAttachRequest(
            expected_revision=second_draft.metadata_revision,
            knowledge_base_id=knowledge_base_id,
        ),
    )
    attached_later_change = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="third-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=attached.metadata_revision,
            content="Workspace v3",
        ),
    )
    attach_replay = await service.attach_reference(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="attach",
        payload=KnowledgeGuidanceReferenceAttachRequest(
            expected_revision=second_draft.metadata_revision,
            knowledge_base_id=knowledge_base_id,
        ),
    )
    assert attach_replay == attached

    detached = await service.detach_reference(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        knowledge_base_id=knowledge_base_id,
        actor_user_id=actor_user_id,
        idempotency_key="detach",
        payload=KnowledgeGuidanceReferenceDetachRequest(expected_revision=attached_later_change.metadata_revision),
    )
    detached_later_change = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="fourth-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=detached.metadata_revision,
            content="Workspace v4",
        ),
    )
    detach_replay = await service.detach_reference(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        knowledge_base_id=knowledge_base_id,
        actor_user_id=actor_user_id,
        idempotency_key="detach",
        payload=KnowledgeGuidanceReferenceDetachRequest(expected_revision=attached_later_change.metadata_revision),
    )
    assert detach_replay == detached

    remove_preview = await service.create_remove_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="remove-preview",
        payload=KnowledgeGuidanceRemovePreviewRequest(expected_revision=detached_later_change.metadata_revision),
    )
    removed = await service.apply_remove_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=remove_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="remove-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=detached_later_change.metadata_revision,
            expected_preview_revision=remove_preview.preview_revision,
        ),
    )
    removed_later_change = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="after-remove-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=removed.metadata_revision,
            content="After removal",
        ),
    )
    remove_replay = await service.apply_remove_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=remove_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="remove-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=detached_later_change.metadata_revision,
            expected_preview_revision=remove_preview.preview_revision,
        ),
    )
    assert remove_replay == removed

    restore_preview = await service.create_restore_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="restore-preview",
        payload=KnowledgeGuidanceRestorePreviewRequest(
            expected_revision=removed_later_change.metadata_revision,
            source_revision_id=first_revision_id,
        ),
    )
    restored = await service.apply_restore_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=restore_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="restore-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=removed_later_change.metadata_revision,
            expected_preview_revision=restore_preview.preview_revision,
        ),
    )
    await service.save_draft(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        actor_user_id=actor_user_id,
        idempotency_key="after-restore-draft",
        payload=KnowledgeGuidanceDraftSaveRequest(
            expected_revision=restored.metadata_revision,
            content="After restore",
        ),
    )
    restore_replay = await service.apply_restore_preview(
        workspace_id=workspace_id,
        organization_id=organization_id,
        project_id=None,
        preview_id=restore_preview.id,
        actor_user_id=actor_user_id,
        idempotency_key="restore-apply",
        payload=KnowledgeGuidancePreviewApplyRequest(
            expected_guidance_revision=removed_later_change.metadata_revision,
            expected_preview_revision=restore_preview.preview_revision,
        ),
    )
    assert restore_replay == restored


async def test_effective_context_resolver_preserves_override_and_unavailable_semantics() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=project_id)
    workspace_layer = _layer(
        workspace_id=workspace_id,
        scope_kind=KnowledgeGuidanceScope.WORKSPACE,
        scope_id=workspace_id,
        project_mode=None,
    )
    project_layer = _layer(
        workspace_id=workspace_id,
        scope_kind=KnowledgeGuidanceScope.PROJECT,
        scope_id=project_id,
        project_mode=KnowledgeProjectGuidanceMode.OVERRIDE,
    )
    repository.layers[(workspace_id, "workspace", workspace_id)] = workspace_layer
    repository.layers[(workspace_id, "project", project_id)] = project_layer
    repository.references[workspace_layer.id] = []
    repository.references[project_layer.id] = []
    workspace_revision = _revision(
        guidance_layer_id=workspace_layer.id,
        workspace_id=workspace_id,
        revision_number=1,
        content="Workspace context",
        content_hash="sha256:workspace",
        status=KnowledgeGuidanceRevisionStatus.PUBLISHED,
        request_idempotency_key="workspace",
        request_fingerprint="workspace",
    )
    project_revision = _revision(
        guidance_layer_id=project_layer.id,
        workspace_id=workspace_id,
        revision_number=1,
        content="Project context",
        content_hash="sha256:project",
        status=KnowledgeGuidanceRevisionStatus.PUBLISHED,
        request_idempotency_key="project",
        request_fingerprint="project",
    )
    workspace_layer.published_revision_id = workspace_revision.id
    project_layer.published_revision_id = project_revision.id
    repository.revisions[workspace_revision.id] = workspace_revision
    repository.revisions[project_revision.id] = project_revision
    workspace_base_id = uuid4()
    project_base_id = uuid4()
    repository.references[workspace_layer.id].append(
        _reference(
            guidance_layer_id=workspace_layer.id,
            workspace_id=workspace_id,
            knowledge_base_id=workspace_base_id,
        )
    )
    repository.references[project_layer.id].append(
        _reference(
            guidance_layer_id=project_layer.id,
            workspace_id=workspace_id,
            knowledge_base_id=project_base_id,
        )
    )

    overridden = await repository.resolve_effective_context(
        workspace_id=workspace_id,
        project_id=project_id,
    )
    assert overridden.effective_content == "Project context"
    assert overridden.attached_knowledge_base_ids == (project_base_id,)
    assert overridden.conflict_codes == ("project_override_hides_workspace",)

    project_layer.published_revision_id = None
    inherited = await repository.resolve_effective_context(
        workspace_id=workspace_id,
        project_id=project_id,
    )
    assert inherited.effective_content == "Workspace context"
    assert inherited.attached_knowledge_base_ids == (workspace_base_id,)
    assert inherited.unavailable_codes == ("project_guidance_unpublished",)

    workspace_layer.removed_at = datetime.now(UTC)
    unavailable = await repository.resolve_effective_context(
        workspace_id=workspace_id,
        project_id=None,
    )
    assert unavailable.effective_content is None
    assert unavailable.attached_knowledge_base_ids == ()
    assert unavailable.unavailable_codes == ("workspace_guidance_removed",)


def test_capabilities_never_advertise_unimplemented_source_kinds() -> None:
    disabled = workspace_knowledge_capabilities(
        cast(
            Any,
            SimpleNamespace(
                knowledge_source_fetch=SimpleNamespace(enabled=False),
                knowledge_index=SimpleNamespace(enabled=False),
            ),
        )
    )
    assert disabled.supported_source_kinds == ("manual",)
    assert disabled.retrieval_available is False

    enabled = workspace_knowledge_capabilities(
        cast(
            Any,
            SimpleNamespace(
                knowledge_source_fetch=SimpleNamespace(enabled=True),
                knowledge_index=SimpleNamespace(enabled=True),
            ),
        )
    )
    assert enabled.supported_source_kinds == ("manual", "url")
    assert enabled.external_ingestion_available is True
    assert enabled.retrieval_available is False


def test_guidance_router_exposes_canonical_lifecycle_routes_with_idempotency() -> None:
    routes = tuple(route for route in router.routes if isinstance(route, APIRoute))
    paths = {route.path for route in routes}
    assert {
        "/workspaces/{workspace_id}/guidance",
        "/workspaces/{workspace_id}/guidance/history",
        "/workspaces/{workspace_id}/guidance/draft",
        "/workspaces/{workspace_id}/guidance/publish",
        "/workspaces/{workspace_id}/guidance/effective",
        "/workspaces/{workspace_id}/guidance/projects/{project_id}",
        "/workspaces/{workspace_id}/guidance/projects/{project_id}/history",
        "/workspaces/{workspace_id}/guidance/projects/{project_id}/publish",
        "/workspaces/{workspace_id}/guidance/restore-previews",
        "/workspaces/{workspace_id}/guidance/remove-previews",
        "/workspaces/{workspace_id}/guidance/references",
        "/workspaces/{workspace_id}/guidance/projects/{project_id}/references",
    } <= paths
    guidance_mutations = tuple(
        route
        for route in routes
        if "/guidance" in route.path and route.methods != {"GET"}
    )
    assert guidance_mutations
    for route in guidance_mutations:
        assert "Idempotency-Key" in {parameter.alias for parameter in route.dependant.header_params}


async def test_restore_apply_rejects_stale_guidance_revision() -> None:
    workspace_id = uuid4()
    repository = _Repository(workspace_id=workspace_id, project_id=uuid4())
    _provision_layers(repository, workspace_id=workspace_id)
    service = _service(repository, [])
    draft = await service.save_draft(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        project_id=None,
        actor_user_id=uuid4(),
        idempotency_key="draft",
        payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=1, content="First"),
    )
    preview = await service.create_remove_preview(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        project_id=None,
        actor_user_id=uuid4(),
        idempotency_key="remove",
        payload=KnowledgeGuidanceRemovePreviewRequest(expected_revision=draft.metadata_revision),
    )
    await service.save_draft(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        project_id=None,
        actor_user_id=uuid4(),
        idempotency_key="draft-newer",
        payload=KnowledgeGuidanceDraftSaveRequest(expected_revision=draft.metadata_revision, content="Second"),
    )
    with pytest.raises(Conflict, match="Knowledge metadata revision is stale"):
        await service.apply_remove_preview(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            project_id=None,
            preview_id=preview.id,
            actor_user_id=uuid4(),
            idempotency_key="remove-apply",
            payload=KnowledgeGuidancePreviewApplyRequest(
                expected_guidance_revision=preview.expected_guidance_revision,
                expected_preview_revision=preview.preview_revision,
            ),
        )
