from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.entity_manager.manager import EntityAfterCommitHook
from src.core.exceptions import Conflict
from src.core.lifecycles.specs import LifecycleAction
from src.models.builder._enums import BuilderApprovalClass, BuilderApprovalStatus, BuilderProvenanceSource
from src.models.builder.change_set import BuilderChangeSetRecord
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.projects.builder.change_set_apply_context import (
    _require_agent_apply_authority,
    _require_approval,
    _require_token_identity,
)
from src.modules.projects.builder.change_set_apply_operations import apply_sitemap_operations
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApplyRequest,
    BuilderGlobalSectionCreateOperationV1,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderPageIntentReplaceOperationV1,
)
from src.modules.projects.builder.change_set_token import builder_change_set_preview_token_hash
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderGlobalSectionNodeSnapshotV1,
    BuilderPageNodeSnapshotV1,
    BuilderSectionIntentV1,
    ContentStructureSnapshotV1,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.content.items.transaction_commands import (
    ContentItemAfterCommitEffect,
    ProjectContentItemTransactionCommands,
)


def _token_binding() -> tuple[BuilderChangeSetRecord, SimpleNamespace, str]:
    raw_token = "signed-preview-token"
    values = {
        "change_set_id": uuid4(),
        "workspace_id": uuid4(),
        "project_id": uuid4(),
        "site_id": uuid4(),
        "environment_id": uuid4(),
        "actor_user_id": uuid4(),
        "base_revision_id": uuid4(),
        "base_etag": canonical_hash({"revision": 1}),
        "operations_hash": canonical_hash([{"type": "page.reorder"}]),
        "expires_at": datetime(2026, 7, 21, 2, tzinfo=UTC),
    }
    change_set = SimpleNamespace(
        site_id=values["site_id"],
        environment_id=values["environment_id"],
        actor_user_id=values["actor_user_id"],
        base_site_revision_id=values["base_revision_id"],
        base_manifest_hash=values["base_etag"],
        operations_hash=values["operations_hash"],
        expires_at=values["expires_at"],
        preview_token_hash=builder_change_set_preview_token_hash(raw_token),
    )
    return cast(BuilderChangeSetRecord, change_set), SimpleNamespace(**values), raw_token


def _content_effect(*, item_id: UUID, event_name: str) -> ContentItemAfterCommitEffect:
    return ContentItemAfterCommitEffect(
        lifecycle=EntityAfterCommitHook(
            action=LifecycleAction.AFTER_CREATE,
            model_key="reusable-section",
            workspace_id=uuid4(),
            site_id=uuid4(),
            item_id=item_id,
            result=cast(Any, SimpleNamespace(id=uuid4())),
            actor_id=uuid4(),
            state={},
        ),
        event_name=event_name,
        payload={},
        actor_user_id=uuid4(),
    )


async def test_planning_only_apply_records_snapshot_override_without_content_mutation() -> None:
    workspace_id, project_id, site_id, environment_id, page_id = (uuid4() for _ in range(5))
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(BuilderPageNodeSnapshotV1(item_id=page_id, sort_order=0),),
    )
    operation = BuilderPageIntentReplaceOperationV1(
        type="page.intent.replace",
        operation_id="plan-page",
        item_id=page_id,
        purpose="Explain the product",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.hero",
                label="Hero",
                goal="Establish the primary value proposition",
            ),
        ),
    )

    result = await apply_sitemap_operations(
        commands=cast(ProjectContentItemTransactionCommands, SimpleNamespace()),
        structure=structure,
        operations=(operation,),
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=uuid4(),
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    assert result.client_page_ids == {}
    assert result.after_commit_effects == ()
    assert result.planning_overrides[page_id].purpose == "Explain the product"
    assert result.planning_overrides[page_id].section_intents[0].id == "intent.hero"


async def test_global_section_planning_apply_records_snapshot_override_without_content_mutation() -> None:
    workspace_id, project_id, site_id, environment_id, global_id = (uuid4() for _ in range(5))
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
        global_references=(
            BuilderGlobalSectionNodeSnapshotV1(
                item_id=global_id,
                locale="en-US",
                slug="site-header",
            ),
        ),
    )
    operation = BuilderGlobalSectionIntentReplaceOperationV1(
        type="global_section.intent.replace",
        operation_id="plan-site-header",
        item_id=global_id,
        purpose="Keep primary navigation consistent",
        section_intents=(
            BuilderSectionIntentV1(
                id="intent.navigation",
                label="Navigation",
                goal="Expose primary destinations",
            ),
        ),
    )

    result = await apply_sitemap_operations(
        commands=cast(ProjectContentItemTransactionCommands, SimpleNamespace()),
        structure=structure,
        operations=(operation,),
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=uuid4(),
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    assert result.client_page_ids == {}
    assert result.after_commit_effects == ()
    assert result.planning_overrides[global_id].purpose == "Keep primary navigation consistent"
    assert result.planning_overrides[global_id].section_intents[0].id == "intent.navigation"


async def test_global_section_create_apply_uses_canonical_content_command_and_returns_identity() -> None:
    workspace_id, project_id, site_id, environment_id, global_id = (uuid4() for _ in range(5))
    runtime_id, actor_user_id = uuid4(), uuid4()
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
    )
    operation = BuilderGlobalSectionCreateOperationV1(
        type="global_section.create",
        operation_id="create-site-header",
        client_global_section_id="site-header",
        title="Site header",
        slug="site-header",
        locale="en-US",
        fields_snapshot={"title": "Site header", "section_key": "site-header"},
        purpose="Keep primary navigation consistent",
    )
    effect = _content_effect(item_id=global_id, event_name="content.item.created")
    commands = SimpleNamespace(
        create_item=AsyncMock(
            return_value=SimpleNamespace(item_id=global_id, after_commit=effect),
        )
    )
    conn = cast(BaseDBAsyncClient, SimpleNamespace())

    result = await apply_sitemap_operations(
        commands=cast(ProjectContentItemTransactionCommands, commands),
        structure=structure,
        operations=(operation,),
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert result.client_global_section_ids == {"site-header": global_id}
    assert result.client_page_ids == {}
    assert result.after_commit_effects == (effect,)
    assert result.planning_overrides[global_id].purpose == "Keep primary navigation consistent"
    commands.create_item.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        model_key="reusable-section",
        title="Site header",
        slug="site-header",
        locale="en-US",
        fields_snapshot={"title": "Site header", "section_key": "site-header"},
        conn=conn,
    )


async def test_global_section_delete_apply_uses_exact_canonical_content_command() -> None:
    workspace_id, project_id, site_id, environment_id, global_id = (uuid4() for _ in range(5))
    runtime_id, actor_user_id = uuid4(), uuid4()
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
        global_references=(
            BuilderGlobalSectionNodeSnapshotV1(
                item_id=global_id,
                locale="en-US",
                slug="site-footer",
            ),
        ),
    )
    operation = BuilderGlobalSectionDeleteOperationV1(
        type="global_section.delete",
        operation_id="delete-site-footer",
        item_id=global_id,
        expected_draft_version=5,
    )
    effect = _content_effect(item_id=global_id, event_name="content.item.deleted")
    commands = SimpleNamespace(delete_item=AsyncMock(return_value=SimpleNamespace(after_commit=effect)))
    conn = cast(BaseDBAsyncClient, SimpleNamespace())

    result = await apply_sitemap_operations(
        commands=cast(ProjectContentItemTransactionCommands, commands),
        structure=structure,
        operations=(operation,),
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert result.client_global_section_ids == {}
    assert result.after_commit_effects == (effect,)
    commands.delete_item.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=global_id,
        expected_draft_version=5,
        actor_user_id=actor_user_id,
        conn=conn,
    )


def test_apply_token_identity_accepts_exact_binding() -> None:
    change_set, claims, raw_token = _token_binding()

    _require_token_identity(
        change_set=change_set,
        claims=claims,
        workspace_id=claims.workspace_id,
        project_id=claims.project_id,
        actor_user_id=claims.actor_user_id,
        change_set_id=claims.change_set_id,
        raw_token=raw_token,
    )


@pytest.mark.parametrize(
    "mismatch",
    [
        "change_set_id",
        "workspace_id",
        "project_id",
        "site_id",
        "environment_id",
        "actor_user_id",
        "base_revision_id",
        "base_etag",
        "operations_hash",
        "expires_at",
        "raw_token",
    ],
)
def test_apply_token_identity_rejects_every_mismatched_binding(mismatch: str) -> None:
    change_set, claims, raw_token = _token_binding()
    request_values = {
        "workspace_id": claims.workspace_id,
        "project_id": claims.project_id,
        "actor_user_id": claims.actor_user_id,
        "change_set_id": claims.change_set_id,
        "raw_token": raw_token,
    }
    if mismatch in request_values:
        request_values[mismatch] = "different-token" if mismatch == "raw_token" else uuid4()
    elif mismatch in {"base_etag", "operations_hash"}:
        setattr(claims, mismatch, canonical_hash({"different": mismatch}))
    elif mismatch == "expires_at":
        claims.expires_at += timedelta(seconds=1)
    else:
        setattr(claims, mismatch, uuid4())

    with pytest.raises(Conflict) as exc_info:
        _require_token_identity(change_set=change_set, claims=claims, **request_values)

    assert exc_info.value.error == "CHANGE_SET_PREVIEW_REQUIRED"


def _approval_state() -> tuple[BuilderChangeSetRecord, SimpleNamespace, UUID, datetime]:
    actor_user_id = uuid4()
    expires_at = datetime(2026, 7, 21, 2, tzinfo=UTC)
    operations_hash = canonical_hash([{"type": "page.delete"}])
    change_set = SimpleNamespace(
        id=uuid4(),
        approval_class=BuilderApprovalClass.DESTRUCTIVE,
        operations_hash=operations_hash,
        actor_user_id=actor_user_id,
        expires_at=expires_at,
    )
    approval = SimpleNamespace(
        id=uuid4(),
        approval_class=BuilderApprovalClass.DESTRUCTIVE,
        status=BuilderApprovalStatus.PENDING,
        operations_hash=operations_hash,
        requested_by_user_id=actor_user_id,
        expires_at=expires_at,
    )
    return cast(BuilderChangeSetRecord, change_set), approval, actor_user_id, expires_at


def _approval_payload(approval_id: UUID) -> BuilderChangeSetApplyRequest:
    return BuilderChangeSetApplyRequest.model_validate({
        "previewToken": "signed-preview-token",
        "approval": {
            "approvalId": approval_id,
            "decision": "approve",
            "expectedApprovalClass": "destructive",
        },
    })


async def test_apply_approval_accepts_exact_checkpoint_when_request_enum_is_string() -> None:
    change_set, approval, actor_user_id, expires_at = _approval_state()
    repository = SimpleNamespace(get_change_set_approval=AsyncMock(return_value=approval))
    payload = _approval_payload(approval.id)

    result = await _require_approval(
        repository=cast(SiteBuilderRepository, repository),
        change_set=change_set,
        payload=payload,
        project_id=uuid4(),
        actor_user_id=actor_user_id,
        now=expires_at - timedelta(seconds=1),
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert result is approval
    assert payload.approval is not None
    assert payload.approval.expected_approval_class == "destructive"


@pytest.mark.parametrize(
    ("mutation", "error"),
    [
        ({"status": BuilderApprovalStatus.CONSUMED}, "CHANGE_SET_APPROVAL_INVALID"),
        ({"approval_class": BuilderApprovalClass.REVIEW}, "CHANGE_SET_APPROVAL_INVALID"),
        ({"operations_hash": canonical_hash([])}, "CHANGE_SET_APPROVAL_INVALID"),
        ({"requested_by_user_id": uuid4()}, "CHANGE_SET_APPROVAL_INVALID"),
        ({"expires_at": datetime(2026, 7, 21, 1, tzinfo=UTC)}, "CHANGE_SET_APPROVAL_INVALID"),
    ],
)
async def test_apply_approval_rejects_checkpoint_binding_drift(mutation: dict[str, object], error: str) -> None:
    change_set, approval, actor_user_id, expires_at = _approval_state()
    for key, value in mutation.items():
        setattr(approval, key, value)
    repository = SimpleNamespace(get_change_set_approval=AsyncMock(return_value=approval))

    with pytest.raises(Conflict) as exc_info:
        await _require_approval(
            repository=cast(SiteBuilderRepository, repository),
            change_set=change_set,
            payload=_approval_payload(approval.id),
            project_id=uuid4(),
            actor_user_id=actor_user_id,
            now=expires_at - timedelta(seconds=1),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == error


async def test_apply_approval_requires_checkpoint_and_rejects_expired_checkpoint() -> None:
    change_set, approval, actor_user_id, expires_at = _approval_state()
    repository = SimpleNamespace(get_change_set_approval=AsyncMock(return_value=approval))
    missing_payload = BuilderChangeSetApplyRequest(preview_token="signed-preview-token")

    with pytest.raises(Conflict) as missing:
        await _require_approval(
            repository=cast(SiteBuilderRepository, repository),
            change_set=change_set,
            payload=missing_payload,
            project_id=uuid4(),
            actor_user_id=actor_user_id,
            now=expires_at - timedelta(seconds=1),
            conn=cast(BaseDBAsyncClient, object()),
        )
    assert missing.value.error == "CHANGE_SET_APPROVAL_REQUIRED"

    with pytest.raises(Conflict) as expired:
        await _require_approval(
            repository=cast(SiteBuilderRepository, repository),
            change_set=change_set,
            payload=_approval_payload(approval.id),
            project_id=uuid4(),
            actor_user_id=actor_user_id,
            now=expires_at,
            conn=cast(BaseDBAsyncClient, object()),
        )
    assert expired.value.error == "CHANGE_SET_APPROVAL_EXPIRED"


async def test_apply_rejects_approval_for_none_class() -> None:
    change_set, approval, actor_user_id, expires_at = _approval_state()
    change_set.approval_class = BuilderApprovalClass.NONE
    repository = SimpleNamespace(get_change_set_approval=AsyncMock())

    with pytest.raises(Conflict) as exc_info:
        await _require_approval(
            repository=cast(SiteBuilderRepository, repository),
            change_set=change_set,
            payload=_approval_payload(approval.id),
            project_id=uuid4(),
            actor_user_id=actor_user_id,
            now=expires_at - timedelta(seconds=1),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == "CHANGE_SET_APPROVAL_NOT_ALLOWED"
    repository.get_change_set_approval.assert_not_awaited()


def _agent_change_set() -> BuilderChangeSetRecord:
    return cast(
        BuilderChangeSetRecord,
        SimpleNamespace(
            agent_run_id=uuid4(),
            tool_name="builder.sitemap.apply",
            workspace_id=uuid4(),
            project_id=uuid4(),
            base_site_revision_id=uuid4(),
        ),
    )


async def test_agent_apply_accepts_string_build_mode_and_exact_tool_grant() -> None:
    change_set = _agent_change_set()
    run = SimpleNamespace(
        site_revision_id=change_set.base_site_revision_id,
        execution_mode="build",
        lead_agent_version_id=uuid4(),
    )
    repository = SimpleNamespace(
        get_agent_run_for_builder=AsyncMock(return_value=run),
        get_agent_version_for_builder=AsyncMock(return_value=SimpleNamespace(tool_grants=[change_set.tool_name])),
    )

    await _require_agent_apply_authority(
        repository=cast(SiteBuilderRepository, repository),
        agent_catalog_service=cast(AgentCatalogService, SimpleNamespace()),
        change_set=change_set,
        provenance=BuilderProvenanceSource.AGENT,
        actor_user_id=uuid4(),
        conn=cast(BaseDBAsyncClient, object()),
    )


@pytest.mark.parametrize(
    ("execution_mode", "tool_grants", "error"),
    [
        ("plan", ["builder.sitemap.apply"], "AGENT_BUILDER_CONTEXT_REQUIRED"),
        ("build", [], "AGENT_BUILDER_TOOL_NOT_GRANTED"),
    ],
)
async def test_agent_apply_rejects_plan_mode_or_missing_tool_grant(
    execution_mode: str,
    tool_grants: list[str],
    error: str,
) -> None:
    change_set = _agent_change_set()
    run = SimpleNamespace(
        site_revision_id=change_set.base_site_revision_id,
        execution_mode=execution_mode,
        lead_agent_version_id=uuid4(),
    )
    repository = SimpleNamespace(
        get_agent_run_for_builder=AsyncMock(return_value=run),
        get_agent_version_for_builder=AsyncMock(return_value=SimpleNamespace(tool_grants=tool_grants)),
    )

    with pytest.raises(Conflict) as exc_info:
        await _require_agent_apply_authority(
            repository=cast(SiteBuilderRepository, repository),
            agent_catalog_service=cast(AgentCatalogService, SimpleNamespace()),
            change_set=change_set,
            provenance=BuilderProvenanceSource.AGENT,
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == error


def _direct_agent_change_set() -> BuilderChangeSetRecord:
    return cast(
        BuilderChangeSetRecord,
        SimpleNamespace(
            agent_run_id=None,
            agent_id=uuid4(),
            agent_version_id=uuid4(),
            agent_assignment_id=uuid4(),
            tool_name="builder.wireframe.apply",
            workspace_id=uuid4(),
            project_id=uuid4(),
            base_site_revision_id=uuid4(),
        ),
    )


def _resolved_direct_agent(change_set: BuilderChangeSetRecord) -> ResolvedAgentAssignment:
    return ResolvedAgentAssignment(
        assignment_id=change_set.agent_assignment_id,
        agent_id=change_set.agent_id,
        version_id=change_set.agent_version_id,
        version_number=4,
        supported_execution_modes=("build",),
        tool_grants=(change_set.tool_name,),
        skill_grant_workspace_id=None,
        skill_installation_ids=(),
        delegation_agent_ids=(),
        instructions="Build the selected page wireframe.",
    )


async def test_direct_agent_apply_revalidates_exact_current_assignment() -> None:
    change_set = _direct_agent_change_set()
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=_resolved_direct_agent(change_set)))
    conn = cast(BaseDBAsyncClient, object())

    await _require_agent_apply_authority(
        repository=cast(SiteBuilderRepository, SimpleNamespace()),
        agent_catalog_service=cast(AgentCatalogService, agents),
        change_set=change_set,
        provenance=BuilderProvenanceSource.AGENT,
        actor_user_id=uuid4(),
        conn=conn,
    )

    agents.resolve_lead.assert_awaited_once_with(
        workspace_id=change_set.workspace_id,
        project_id=change_set.project_id,
        agent_id=change_set.agent_id,
        execution_mode="build",
        conn=conn,
        ensure_catalog=False,
    )


@pytest.mark.parametrize(
    ("drift", "error"),
    [
        ("version", "AGENT_BUILDER_CONTEXT_REQUIRED"),
        ("assignment", "AGENT_BUILDER_CONTEXT_REQUIRED"),
        ("tool", "AGENT_BUILDER_TOOL_NOT_GRANTED"),
    ],
)
async def test_direct_agent_apply_rejects_identity_drift_or_revoked_tool(drift: str, error: str) -> None:
    change_set = _direct_agent_change_set()
    resolved = _resolved_direct_agent(change_set)
    if drift == "version":
        resolved = resolved.model_copy(update={"version_id": uuid4()})
    elif drift == "assignment":
        resolved = resolved.model_copy(update={"assignment_id": uuid4()})
    else:
        resolved = resolved.model_copy(update={"tool_grants": ("builder.wireframe.generate",)})
    agents = SimpleNamespace(resolve_lead=AsyncMock(return_value=resolved))

    with pytest.raises(Conflict) as exc_info:
        await _require_agent_apply_authority(
            repository=cast(SiteBuilderRepository, SimpleNamespace()),
            agent_catalog_service=cast(AgentCatalogService, agents),
            change_set=change_set,
            provenance=BuilderProvenanceSource.AGENT,
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc_info.value.error == error
