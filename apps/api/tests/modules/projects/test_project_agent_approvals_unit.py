from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.exceptions import BadRequest, Conflict
from src.models.agents.approval import AgentApprovalRecord, AgentApprovalStatus, AgentApprovalTargetType
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.projects.agents.approval_repository import AgentApprovalRepository
from src.modules.projects.agents.approval_schema import (
    AgentApprovalDecisionRequest,
    AgentContentApprovalDryRunRequest,
    AgentContentApprovalModifyRequest,
    AgentContentModelApprovalDryRunRequest,
)
from src.modules.projects.agents.approval_service import AgentApprovalService
from src.modules.projects.content.contracts.schema import (
    ContentModelImpactOut,
    ContentModelImpactPreviewOut,
    ContentModelSchemaChangePlanOut,
    ContentModelSchemaSnapshotOut,
    ContentVersionOut,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import ContentPresentationIn, ContentVersionDraftSaveIn
from src.modules.projects.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ContentModelImpactPreviewResult,
    ContentModelMutationResult,
    ProjectContentCanonicalModelsService,
)


@dataclass
class FakeModelDefinition:
    singular_key: str = "article"


@dataclass
class FakeContentItem:
    id: UUID
    workspace_id: UUID
    site_id: UUID
    environment_id: UUID | None
    title: str
    locale: str
    status: str
    draft_version: int
    published_version: int | None
    model_definition: FakeModelDefinition


@dataclass
class FakeContentVersion:
    fields_snapshot: dict[str, Any]


@dataclass
class FakeContentWriter:
    saved_payload: ContentVersionDraftSaveIn | None = None
    saved_conn: object | None = None

    async def save_draft_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentVersionDraftSaveIn,
        conn: object | None = None,
    ) -> ContentVersionOut:
        _ = workspace_id, site_id, environment_id, actor_user_id
        self.saved_payload = payload
        self.saved_conn = conn
        next_version = int(payload.expected_version or 0) + 1
        return ContentVersionOut(
            item_id=item_id,
            version_number=next_version,
            state="draft",
            created_at=datetime(2026, 6, 26, 8, 1, tzinfo=UTC),
            created_by_user_id=actor_user_id,
            last_transition_by_user_id=actor_user_id,
            fields_snapshot=payload.fields_snapshot,
            presentations=[
                presentation.model_dump(mode="json", by_alias=True) for presentation in payload.presentations
            ],
            change_summary=payload.change_summary,
        )


@dataclass
class FakeContentModelRecord:
    id: UUID
    workspace_id: UUID
    site_id: UUID
    singular_key: str = "article"
    plural_key: str = "articles"
    name: str = "Article"
    description: str | None = None
    protocol_key: str | None = None
    protocol_version: int = 1
    is_system_managed: bool = False
    system_field_keys: list[str] | None = None
    model_kind: str = "collection_type"
    draft_contract_revision: int = 4
    published_contract_revision: int | None = None
    default_role: str | None = None
    default_posture: str | None = None
    default_surface: str | None = None
    starter_pack_policy: dict[str, Any] | None = None
    surface_policy: dict[str, Any] | None = None


class FakeContentModelService:
    def __init__(self, *, model_id: UUID, workspace_id: UUID, site_id: UUID, revision: int = 4) -> None:
        self.model_id = model_id
        self.workspace_id = workspace_id
        self.site_id = site_id
        self.revision = revision
        self.preview_payload: ContentModelDefinitionPatchContract | None = None
        self.update_payload: ContentModelDefinitionPatchContract | None = None

    async def get_model_json_preview(self, **kwargs):  # type: ignore[no-untyped-def]
        if kwargs["model_id"] != self.model_id:
            return None
        return ContentModelSchemaSnapshotOut(
            stage="current_draft",
            revision=self.revision,
            payload={"singularKey": "article", "name": "Article"},
        )

    async def preview_model_update(self, **kwargs):  # type: ignore[no-untyped-def]
        if kwargs["model_id"] != self.model_id:
            return None
        self.preview_payload = kwargs["payload"]
        return ContentModelImpactPreviewResult(
            affected_items_count=3,
            recovery_items_count=0,
            reshape_items_count=1,
            has_blocking_changes=False,
            preview_token="modified-preview-token",
            impact=ContentModelImpactOut(),
            change_plan=ContentModelSchemaChangePlanOut(
                current_snapshot=ContentModelSchemaSnapshotOut(
                    stage="current_draft",
                    revision=self.revision,
                    payload={"singularKey": "article", "name": "Article"},
                )
            ),
        )

    async def update_model(self, **kwargs):  # type: ignore[no-untyped-def]
        if kwargs["model_id"] != self.model_id:
            return None
        self.update_payload = kwargs["payload"]
        return ContentModelMutationResult.model_construct(
            record=cast(
                Any,
                FakeContentModelRecord(
                    id=self.model_id,
                    workspace_id=self.workspace_id,
                    site_id=self.site_id,
                    name=self.update_payload.name or "Article",
                    draft_contract_revision=self.revision + 1,
                ),
            ),
            impact=ContentModelImpactOut(),
        )


@dataclass
class FakeApproval:
    id: UUID
    workspace_id: UUID
    project_id: UUID
    requester_user_id: UUID
    skill_id: str
    tool_name: str | None
    action: str
    target_type: AgentApprovalTargetType
    target_id: UUID | None
    expected_draft_version: int | None
    target_snapshot: JsonObject
    proposed_patch: JsonObject
    dry_run: JsonObject
    expires_at: datetime
    agent_run_id: UUID | None
    created_at: datetime
    updated_at: datetime
    status: AgentApprovalStatus = AgentApprovalStatus.PENDING
    approver_user_id: UUID | None = None
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    expired_at: datetime | None = None
    applied_at: datetime | None = None
    decision_reason: str | None = None


class FakeApprovalRepository(AgentApprovalRepository):
    def __init__(self, *, now: datetime, item: FakeContentItem, draft: FakeContentVersion | None) -> None:
        super().__init__()
        self.now = now
        self.item = item
        self.draft = draft
        self.approvals: dict[UUID, FakeApproval] = {}
        self.approval_reads: list[tuple[object | None, bool]] = []
        self.item_reads: list[tuple[object | None, bool]] = []
        self.approval_writes: list[object | None] = []

    async def create_approval(self, **data: Any) -> AgentApprovalRecord:
        record = FakeApproval(
            id=uuid4(),
            workspace_id=data["workspace_id"],
            project_id=data["project_id"],
            requester_user_id=data["requester_user_id"],
            skill_id=data["skill_id"],
            tool_name=data["tool_name"],
            action=data["action"],
            target_type=data["target_type"],
            target_id=data["target_id"],
            expected_draft_version=data["expected_draft_version"],
            target_snapshot=data["target_snapshot"],
            proposed_patch=data["proposed_patch"],
            dry_run=data["dry_run"],
            expires_at=data["expires_at"],
            agent_run_id=data["agent_run_id"],
            created_at=self.now,
            updated_at=self.now,
        )
        self.approvals[record.id] = record
        return cast(AgentApprovalRecord, record)

    async def list_approvals(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        limit: int = 50,
        status: AgentApprovalStatus | None = None,
    ) -> list[AgentApprovalRecord]:
        _ = workspace_id, project_id, limit
        rows = list(self.approvals.values())
        if status is not None:
            rows = [approval for approval in rows if approval.status == status]
        return cast(list[AgentApprovalRecord], rows)

    async def get_scoped_approval(
        self,
        *,
        approval_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        conn: Any = None,
        for_update: bool = False,
    ) -> AgentApprovalRecord | None:
        _ = workspace_id, project_id
        self.approval_reads.append((conn, for_update))
        return cast(AgentApprovalRecord | None, self.approvals.get(approval_id))

    async def save_approval_fields(
        self,
        approval: AgentApprovalRecord,
        *,
        fields: dict[str, Any],
        conn: Any = None,
    ) -> AgentApprovalRecord:
        self.approval_writes.append(conn)
        for key, value in fields.items():
            setattr(approval, key, value)
        approval.updated_at = self.now  # type: ignore[attr-defined]
        return approval

    async def get_content_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        conn: Any = None,
        for_update: bool = False,
    ) -> ContentItemRecord | None:
        _ = workspace_id, site_id, environment_id
        self.item_reads.append((conn, for_update))
        if item_id != self.item.id:
            return None
        return cast(ContentItemRecord, self.item)

    async def get_content_draft_version(
        self,
        *,
        item_id: UUID,
        draft_version: int,
        conn: Any = None,
    ) -> ContentVersionRecord | None:
        _ = item_id, draft_version, conn
        return cast(ContentVersionRecord | None, self.draft)


class FakeAgentApprovalService(AgentApprovalService):
    def __init__(self, repo: FakeApprovalRepository, *, clock) -> None:  # type: ignore[no-untyped-def]
        super().__init__(repo=repo, clock=clock)
        self.apply_audit_events: list[dict[str, Any]] = []

    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())

    async def _write_apply_activity_event(self, **kwargs: Any) -> None:
        self.apply_audit_events.append(kwargs)


def _service_context() -> tuple[UUID, UUID, UUID, UUID, UUID]:
    return uuid4(), uuid4(), uuid4(), uuid4(), uuid4()


def _item(*, workspace_id: UUID, site_id: UUID, environment_id: UUID, draft_version: int = 2) -> FakeContentItem:
    return FakeContentItem(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        title="Launch note",
        locale="zh-CN",
        status="draft",
        draft_version=draft_version,
        published_version=1,
        model_definition=FakeModelDefinition(),
    )


def _service(repo: FakeApprovalRepository, now: datetime) -> FakeAgentApprovalService:
    return FakeAgentApprovalService(repo=repo, clock=lambda: now)


def _content_service(writer: FakeContentWriter) -> ProjectContentCanonicalItemsService:
    return cast(ProjectContentCanonicalItemsService, writer)


def _model_service(model_service: FakeContentModelService) -> ProjectContentCanonicalModelsService:
    return cast(ProjectContentCanonicalModelsService, model_service)


def _assert_latest_locked_approval_write(repo: FakeApprovalRepository) -> object:
    conn, for_update = repo.approval_reads[-1]
    assert conn is not None
    assert for_update is True
    assert repo.approval_writes[-1] is conn
    return conn


def _impact_preview(*, token: str = "preview-token", revision: int = 4) -> ContentModelImpactPreviewOut:
    return ContentModelImpactPreviewOut(
        preview_token=token,
        change_plan=ContentModelSchemaChangePlanOut(
            current_snapshot=ContentModelSchemaSnapshotOut(
                stage="current_draft",
                revision=revision,
                payload={"singularKey": "article", "name": "Article"},
            )
        ),
    )


@pytest.mark.asyncio
async def test_content_dry_run_binds_current_draft_version_and_patch() -> None:
    workspace_id, project_id, site_id, environment_id, user_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(
        now=now,
        item=item,
        draft=FakeContentVersion(fields_snapshot={"title": "Old", "body": "Keep"}),
    )

    result = await _service(repo, now).create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=user_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New", "body": "Keep"},
            change_summary="Rewrite title",
        ),
    )

    assert result.status == AgentApprovalStatus.PENDING
    assert result.skill_id == "content.writer"
    assert result.tool_name == "content_draft_proposal"
    assert result.action == "content_item.update_draft"
    assert result.expected_draft_version == 2
    assert result.target_snapshot["draftVersion"] == 2
    assert result.proposed_patch["fieldsSnapshot"] == {"title": "New", "body": "Keep"}
    assert result.dry_run["willApply"] is False
    assert result.dry_run["fieldChanges"] == [{"field": "title", "before": "Old", "after": "New"}]


@pytest.mark.asyncio
async def test_content_dry_run_rejects_mismatched_write_contract() -> None:
    workspace_id, project_id, site_id, environment_id, user_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(
        now=now,
        item=item,
        draft=FakeContentVersion(fields_snapshot={"title": "Old"}),
    )

    with pytest.raises(BadRequest) as exc:
        await _service(repo, now).create_content_dry_run(
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            requester_user_id=user_id,
            payload=AgentContentApprovalDryRunRequest(
                skill_id="content.modeler",
                tool_name="content_model_draft_proposal",
                action="content_model.update_schema",
                target_id=item.id,
                fields_snapshot={"title": "New"},
            ),
        )

    assert exc.value.error == "AGENT_APPROVAL_CONTRACT_MISMATCH"
    assert exc.value.meta == {
        "expected": {
            "skillId": "content.writer",
            "toolName": "content_draft_proposal",
            "action": "content_item.update_draft",
            "targetType": "content_item",
        },
        "received": {
            "skillId": "content.modeler",
            "toolName": "content_model_draft_proposal",
            "action": "content_model.update_schema",
        },
    }
    assert repo.approvals == {}
    assert repo.item_reads == []


@pytest.mark.asyncio
async def test_content_model_dry_run_binds_revision_patch_and_preview() -> None:
    workspace_id, project_id, site_id, environment_id, user_id = _service_context()
    _ = site_id, environment_id
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    model_id = uuid4()

    result = await _service(repo, now).create_content_model_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        requester_user_id=user_id,
        payload=AgentContentModelApprovalDryRunRequest(
            target_id=model_id,
            expected_draft_revision=4,
            model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
            impact_preview=_impact_preview(token="signed-preview-token", revision=4),
            change_summary="Rename model",
        ),
    )

    assert result.status == AgentApprovalStatus.PENDING
    assert result.skill_id == "content.modeler"
    assert result.tool_name == "content_model_draft_proposal"
    assert result.action == "content_model.update_schema"
    assert result.target_type == AgentApprovalTargetType.CONTENT_MODEL
    assert result.expected_draft_version == 4
    assert result.proposed_patch["modelPatch"] == {"name": "Article Plus"}
    assert result.proposed_patch["impactPreviewToken"] == "signed-preview-token"
    assert result.target_snapshot["draftRevision"] == 4
    assert result.dry_run["operation"] == "content_model.update_schema"
    assert result.dry_run["expectedDraftRevision"] == 4


@pytest.mark.asyncio
async def test_content_model_dry_run_rejects_mismatched_write_contract() -> None:
    workspace_id, project_id, site_id, environment_id, user_id = _service_context()
    _ = site_id, environment_id
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    model_id = uuid4()

    with pytest.raises(BadRequest) as exc:
        await _service(repo, now).create_content_model_dry_run(
            workspace_id=workspace_id,
            project_id=project_id,
            requester_user_id=user_id,
            payload=AgentContentModelApprovalDryRunRequest(
                skill_id="content.writer",
                tool_name="content_draft_proposal",
                action="content_item.update_draft",
                target_id=model_id,
                expected_draft_revision=4,
                model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
                impact_preview=_impact_preview(token="signed-preview-token", revision=4),
            ),
        )

    assert exc.value.error == "AGENT_APPROVAL_CONTRACT_MISMATCH"
    assert exc.value.meta == {
        "expected": {
            "skillId": "content.modeler",
            "toolName": "content_model_draft_proposal",
            "action": "content_model.update_schema",
            "targetType": "content_model",
        },
        "received": {
            "skillId": "content.writer",
            "toolName": "content_draft_proposal",
            "action": "content_item.update_draft",
        },
    }
    assert repo.approvals == {}


@pytest.mark.asyncio
async def test_modify_pending_content_approval_recomputes_patch_and_dry_run() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(
        now=now,
        item=item,
        draft=FakeContentVersion(fields_snapshot={"title": "Old", "body": "Keep"}),
    )
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "Draft", "body": "Keep"},
            presentations=[ContentPresentationIn(kind="seo", payload={"title": "Old SEO"})],
        ),
    )

    modified = await service.modify_content_approval(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        payload=AgentContentApprovalModifyRequest(
            change_summary="Reviewer adjusted title",
            fields_snapshot={"title": "Better", "body": "Keep"},
        ),
    )

    assert modified.status == AgentApprovalStatus.PENDING
    assert modified.proposed_patch["changeSummary"] == "Reviewer adjusted title"
    assert modified.proposed_patch["fieldsSnapshot"] == {"title": "Better", "body": "Keep"}
    assert modified.proposed_patch["presentations"] == [{"kind": "seo", "payload": {"title": "Old SEO"}}]
    assert modified.dry_run["fieldChanges"] == [{"field": "title", "before": "Old", "after": "Better"}]
    decision_conn = _assert_latest_locked_approval_write(repo)
    assert repo.item_reads[-1] == (decision_conn, False)


@pytest.mark.asyncio
async def test_modify_content_approval_fails_when_draft_version_changed() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "Draft"}),
    )
    item.draft_version = 3

    with pytest.raises(Conflict) as exc:
        await service.modify_content_approval(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            payload=AgentContentApprovalModifyRequest(fields_snapshot={"title": "Better"}),
        )

    assert exc.value.error == "AGENT_APPROVAL_STALE_TARGET"


@pytest.mark.asyncio
async def test_modify_pending_content_model_approval_recomputes_impact_preview() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    model_id = uuid4()
    model_service = FakeContentModelService(
        model_id=model_id,
        workspace_id=workspace_id,
        site_id=site_id,
        revision=4,
    )
    pending = await service.create_content_model_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        requester_user_id=requester_id,
        payload=AgentContentModelApprovalDryRunRequest(
            target_id=model_id,
            expected_draft_revision=4,
            model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
            impact_preview=_impact_preview(token="initial-preview-token", revision=4),
            change_summary="Rename model",
        ),
    )

    modified = await service.modify_content_approval(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        payload=AgentContentApprovalModifyRequest(
            change_summary="Reviewer adjusted schema",
            model_patch=ContentModelDefinitionPatchContract(name="Article Reviewed"),
        ),
        model_service=_model_service(model_service),
    )

    assert modified.status == AgentApprovalStatus.PENDING
    assert modified.proposed_patch["changeSummary"] == "Reviewer adjusted schema"
    assert modified.proposed_patch["modelPatch"] == {"name": "Article Reviewed"}
    assert modified.proposed_patch["impactPreviewToken"] == "modified-preview-token"
    assert modified.dry_run["affectedItemsCount"] == 3
    assert modified.dry_run["reshapeItemsCount"] == 1
    assert model_service.preview_payload is not None
    assert model_service.preview_payload.name == "Article Reviewed"
    _assert_latest_locked_approval_write(repo)


@pytest.mark.asyncio
async def test_modify_content_model_approval_rejects_client_preview_token() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    model_id = uuid4()
    model_service = FakeContentModelService(
        model_id=model_id,
        workspace_id=workspace_id,
        site_id=site_id,
        revision=4,
    )
    pending = await service.create_content_model_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        requester_user_id=requester_id,
        payload=AgentContentModelApprovalDryRunRequest(
            target_id=model_id,
            expected_draft_revision=4,
            model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
            impact_preview=_impact_preview(token="initial-preview-token", revision=4),
        ),
    )

    with pytest.raises(Conflict) as exc:
        await service.modify_content_approval(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            payload=AgentContentApprovalModifyRequest(
                model_patch=ContentModelDefinitionPatchContract(
                    name="Article Reviewed",
                    impact_preview_token="client-token",
                )
            ),
            model_service=_model_service(model_service),
        )

    assert exc.value.error == "AGENT_APPROVAL_PAYLOAD_INVALID"
    assert model_service.preview_payload is None


@pytest.mark.asyncio
async def test_approve_pending_approval_sets_approved_metadata() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    approver_id = uuid4()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "New"}),
    )

    approved = await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=approver_id,
        payload=AgentApprovalDecisionRequest(reason="Looks correct"),
    )

    assert approved.status == AgentApprovalStatus.APPROVED
    assert approved.approver_user_id == approver_id
    assert approved.approved_at == now
    assert approved.decision_reason == "Looks correct"
    decision_conn = _assert_latest_locked_approval_write(repo)
    assert repo.item_reads[-1] == (decision_conn, False)


@pytest.mark.asyncio
async def test_approve_fails_when_content_draft_version_changed() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "New"}),
    )
    item.draft_version = 3

    with pytest.raises(Conflict) as exc:
        await service.approve(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            approver_user_id=uuid4(),
            payload=AgentApprovalDecisionRequest(),
        )

    assert exc.value.error == "AGENT_APPROVAL_STALE_TARGET"
    assert exc.value.meta == {"expectedDraftVersion": 2, "currentDraftVersion": 3}


@pytest.mark.asyncio
async def test_approve_fails_when_approval_is_replayed() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "New"}),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
    )

    with pytest.raises(Conflict) as exc:
        await service.approve(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            approver_user_id=uuid4(),
            payload=AgentApprovalDecisionRequest(),
        )

    assert exc.value.error == "AGENT_APPROVAL_REPLAY"


@pytest.mark.asyncio
async def test_expired_approval_cannot_be_approved() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            expires_in_seconds=60,
        ),
    )
    later = now + timedelta(seconds=61)
    service.clock = lambda: later
    repo.now = later

    with pytest.raises(Conflict) as exc:
        await service.approve(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            approver_user_id=uuid4(),
            payload=AgentApprovalDecisionRequest(),
        )

    assert exc.value.error == "AGENT_APPROVAL_EXPIRED"
    assert repo.approvals[pending.id].status == AgentApprovalStatus.EXPIRED


@pytest.mark.asyncio
async def test_pending_approval_list_marks_expired_rows_and_omits_from_pending_filter() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            expires_in_seconds=60,
        ),
    )
    later = now + timedelta(seconds=61)
    service.clock = lambda: later
    repo.now = later

    result = await service.list_approvals(
        workspace_id=workspace_id,
        project_id=project_id,
        status=AgentApprovalStatus.PENDING,
    )

    assert result.approvals == []
    assert repo.approvals[pending.id].status == AgentApprovalStatus.EXPIRED
    assert repo.approvals[pending.id].expired_at == later


@pytest.mark.asyncio
async def test_get_approval_marks_expired_pending_checkpoint() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            expires_in_seconds=60,
        ),
    )
    later = now + timedelta(seconds=61)
    service.clock = lambda: later
    repo.now = later

    result = await service.get_approval(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
    )

    assert result.status == AgentApprovalStatus.EXPIRED
    assert result.expired_at == later
    assert repo.approvals[pending.id].status == AgentApprovalStatus.EXPIRED


@pytest.mark.asyncio
async def test_rejected_approval_cannot_later_be_approved() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "New"}),
    )
    rejected = await service.reject(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        rejecter_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(reason="Needs review"),
    )

    assert rejected.status == AgentApprovalStatus.REJECTED
    _assert_latest_locked_approval_write(repo)
    with pytest.raises(Conflict) as exc:
        await service.approve(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            approver_user_id=uuid4(),
            payload=AgentApprovalDecisionRequest(),
        )

    assert exc.value.error == "AGENT_APPROVAL_REPLAY"


@pytest.mark.asyncio
async def test_apply_approved_approval_writes_through_canonical_draft_service() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    approver_id = uuid4()
    applier_id = uuid4()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            presentations=[ContentPresentationIn(kind="rich_text_document", payload={"body": "New body"})],
            change_summary="Apply AI update",
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=approver_id,
        payload=AgentApprovalDecisionRequest(reason="Looks correct"),
    )
    writer = FakeContentWriter()

    applied = await service.apply(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=applier_id,
        content_service=_content_service(writer),
    )

    assert applied.approval.status == AgentApprovalStatus.APPLIED
    assert applied.approval.applied_at == now
    assert applied.version is not None
    assert applied.version.version_number == 3
    assert writer.saved_payload is not None
    assert writer.saved_payload.expected_version == 2
    assert writer.saved_payload.fields_snapshot == {"title": "New"}
    assert writer.saved_payload.presentations[0].kind == "rich_text_document"
    assert writer.saved_conn is not None
    assert repo.approval_reads[-1] == (writer.saved_conn, True)
    assert repo.item_reads[-1] == (writer.saved_conn, True)
    assert repo.approval_writes[-1] is writer.saved_conn
    assert len(service.apply_audit_events) == 1
    audit_event = service.apply_audit_events[0]
    assert audit_event["approval"].id == pending.id
    assert audit_event["workspace_id"] == workspace_id
    assert audit_event["project_id"] == project_id
    assert audit_event["actor_user_id"] == applier_id
    assert audit_event["conn"] is writer.saved_conn


@pytest.mark.asyncio
async def test_apply_approved_content_model_approval_writes_through_canonical_model_service() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    approver_id = uuid4()
    applier_id = uuid4()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    model_id = uuid4()
    model_service = FakeContentModelService(
        model_id=model_id,
        workspace_id=workspace_id,
        site_id=site_id,
        revision=4,
    )
    pending = await service.create_content_model_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        requester_user_id=requester_id,
        payload=AgentContentModelApprovalDryRunRequest(
            target_id=model_id,
            expected_draft_revision=4,
            model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
            impact_preview=_impact_preview(token="signed-preview-token", revision=4),
            change_summary="Rename model",
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=approver_id,
        payload=AgentApprovalDecisionRequest(reason="Looks correct"),
        model_service=_model_service(model_service),
    )

    applied = await service.apply(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=applier_id,
        content_service=_content_service(FakeContentWriter()),
        model_service=_model_service(model_service),
    )

    assert applied.approval.status == AgentApprovalStatus.APPLIED
    assert applied.approval.applied_at == now
    assert applied.version is None
    assert applied.model is not None
    assert applied.model.draft_contract_revision == 5
    assert model_service.update_payload is not None
    assert model_service.update_payload.name == "Article Plus"
    assert model_service.update_payload.impact_preview_token == "signed-preview-token"
    assert len(service.apply_audit_events) == 1
    audit_event = service.apply_audit_events[0]
    assert audit_event["approval"].id == pending.id
    assert audit_event["workspace_id"] == workspace_id
    assert audit_event["project_id"] == project_id
    assert audit_event["actor_user_id"] == applier_id


@pytest.mark.asyncio
async def test_apply_content_model_approval_fails_when_draft_revision_changed() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    model_id = uuid4()
    model_service = FakeContentModelService(
        model_id=model_id,
        workspace_id=workspace_id,
        site_id=site_id,
        revision=4,
    )
    pending = await service.create_content_model_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        requester_user_id=requester_id,
        payload=AgentContentModelApprovalDryRunRequest(
            target_id=model_id,
            expected_draft_revision=4,
            model_patch=ContentModelDefinitionPatchContract(name="Article Plus"),
            impact_preview=_impact_preview(token="signed-preview-token", revision=4),
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
        model_service=_model_service(model_service),
    )
    model_service.revision = 5

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(FakeContentWriter()),
            model_service=_model_service(model_service),
        )

    assert exc.value.error == "AGENT_APPROVAL_STALE_TARGET"
    assert exc.value.meta == {"expectedDraftVersion": 4, "currentDraftVersion": 5}
    assert model_service.update_payload is None


@pytest.mark.asyncio
async def test_apply_requires_approved_approval() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            presentations=[],
        ),
    )

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(FakeContentWriter()),
        )

    assert exc.value.error == "AGENT_APPROVAL_APPLY_NOT_APPROVED"


@pytest.mark.asyncio
async def test_apply_expired_approval_marks_expired_without_writing_content() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            presentations=[],
            expires_in_seconds=60,
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
    )
    later = now + timedelta(seconds=61)
    service.clock = lambda: later
    repo.now = later
    writer = FakeContentWriter()

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(writer),
        )

    assert exc.value.error == "AGENT_APPROVAL_EXPIRED"
    assert repo.approvals[pending.id].status == AgentApprovalStatus.EXPIRED
    assert repo.approvals[pending.id].expired_at == later
    assert writer.saved_payload is None


@pytest.mark.asyncio
async def test_apply_fails_when_approved_payload_is_incomplete() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(target_id=item.id, fields_snapshot={"title": "New"}),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
    )

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(FakeContentWriter()),
        )

    assert exc.value.error == "AGENT_APPROVAL_PAYLOAD_INVALID"


@pytest.mark.asyncio
async def test_apply_fails_when_content_draft_version_changed() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            presentations=[],
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
    )
    item.draft_version = 3

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(FakeContentWriter()),
        )

    assert exc.value.error == "AGENT_APPROVAL_STALE_TARGET"


@pytest.mark.asyncio
async def test_apply_fails_when_approval_was_already_applied() -> None:
    workspace_id, project_id, site_id, environment_id, requester_id = _service_context()
    now = datetime(2026, 6, 26, 8, 0, tzinfo=UTC)
    item = _item(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
    repo = FakeApprovalRepository(now=now, item=item, draft=None)
    service = _service(repo, now)
    pending = await service.create_content_dry_run(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        requester_user_id=requester_id,
        payload=AgentContentApprovalDryRunRequest(
            target_id=item.id,
            fields_snapshot={"title": "New"},
            presentations=[],
        ),
    )
    await service.approve(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        approver_user_id=uuid4(),
        payload=AgentApprovalDecisionRequest(),
    )
    await service.apply(
        approval_id=pending.id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        content_service=_content_service(FakeContentWriter()),
    )

    with pytest.raises(Conflict) as exc:
        await service.apply(
            approval_id=pending.id,
            workspace_id=workspace_id,
            project_id=project_id,
            site_id=site_id,
            environment_id=environment_id,
            actor_user_id=uuid4(),
            content_service=_content_service(FakeContentWriter()),
        )

    assert exc.value.error == "AGENT_APPROVAL_REPLAY"
