from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import orjson
import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.models.builder._enums import BuilderApprovalClass, BuilderProvenanceSource
from src.modules.projects.builder.change_set_apply_context import BuilderChangeSetApplyContext
from src.modules.projects.builder.change_set_apply_operations import AppliedBuilderOperations
from src.modules.projects.builder.change_set_apply_persistence import (
    persist_builder_change_set_apply,
    replay_builder_change_set_apply,
)
from src.modules.projects.builder.change_set_context import ResolvedBuilderAgentProvenance
from src.modules.projects.builder.change_set_persistence import (
    persist_builder_change_set_preview,
    replay_builder_change_set_preview,
)
from src.modules.projects.builder.change_set_preview import BuilderChangeSetAnalysis
from src.modules.projects.builder.change_set_revision import AppliedBuilderRevision
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetAffectedTargetV1,
    BuilderChangeSetPreviewRequest,
    BuilderGlobalSectionCreateOperationV1,
    BuilderPageReorderOperationV1,
)
from src.modules.projects.builder.change_set_token import builder_change_set_preview_token_hash
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    ContentStructureRevisionOut,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.builder.snapshot import canonical_hash


@pytest.mark.asyncio
async def test_preview_persistence_hashes_token_and_replay_rebuilds_it() -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    actor_user_id, base_revision_id, item_id = uuid4(), uuid4(), uuid4()
    operation = BuilderPageReorderOperationV1(
        type="page.reorder",
        operation_id="reorder-home",
        item_id=item_id,
        sort_order=10,
    )
    payload = BuilderChangeSetPreviewRequest(
        base_revision_id=base_revision_id,
        base_etag=canonical_hash({"base": 1}),
        operations=(operation,),
    )
    manifest = _manifest(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_id=base_revision_id,
        manifest_hash=payload.base_etag,
    )
    analysis = BuilderChangeSetAnalysis(
        operations=(operation,),
        affected_targets=(
            BuilderChangeSetAffectedTargetV1(
                kind="hierarchy",
                target_id=item_id,
                operation_ids=(operation.operation_id,),
            ),
        ),
        issues=(),
        required_permissions=("project:content:site-builder:write",),
        approval_class=BuilderApprovalClass.NONE,
        summary_params={"operationCount": 1, "affectedTargetCount": 1, "warningCount": 0},
    )
    repository = SimpleNamespace(
        create_change_set=AsyncMock(),
        create_change_set_command=AsyncMock(),
        get_change_set=AsyncMock(),
    )
    activity_writer = AsyncMock()
    settings = Settings(app_env="test", auth={"jwt_secret": "builder-preview-test-secret"})
    conn = cast(BaseDBAsyncClient, object())

    result = await persist_builder_change_set_preview(
        repository=cast(SiteBuilderRepository, repository),
        settings=settings,
        activity_writer=activity_writer,
        organization_id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        idempotency_key="preview-1",
        fingerprint="f" * 64,
        payload=payload,
        manifest=manifest,
        provenance=BuilderProvenanceSource.HUMAN,
        agent_provenance=None,
        analysis=analysis,
        conn=conn,
    )

    change_values = repository.create_change_set.await_args.kwargs["values"]
    command_values = repository.create_change_set_command.await_args.kwargs["values"]
    serialized_change = orjson.dumps(change_values, default=str).decode()
    assert result.preview_token not in serialized_change
    assert change_values["preview_token_hash"] == builder_change_set_preview_token_hash(result.preview_token)
    assert change_values["agent_run_id"] is None
    assert change_values["agent_id"] is None
    assert change_values["agent_version_id"] is None
    assert change_values["agent_assignment_id"] is None
    assert "previewToken" not in command_values["result_snapshot"]
    assert "preview_token" not in command_values["result_snapshot"]
    activity_writer.assert_awaited_once()

    repository.get_change_set.return_value = SimpleNamespace(**change_values)
    replay = await replay_builder_change_set_preview(
        repository=cast(SiteBuilderRepository, repository),
        settings=settings,
        project_id=project_id,
        change_set_id=UUID(str(result.change_set_id)),
        snapshot=command_values["result_snapshot"],
        conn=conn,
    )
    assert replay == result
    assert replay.preview_token == result.preview_token


@pytest.mark.asyncio
async def test_apply_persistence_replays_exact_global_section_client_identity() -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    actor_user_id, base_revision_id, next_revision_id = (uuid4() for _ in range(3))
    change_set_id, global_section_id, structure_revision_id = (uuid4() for _ in range(3))
    now = datetime(2026, 7, 22, tzinfo=UTC)
    base_manifest = _manifest(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_id=base_revision_id,
        manifest_hash=canonical_hash({"revision": "base"}),
    )
    structure = ContentStructureSnapshotV1(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        locales=("en-US",),
        pages=(),
    )
    structure_hash = canonical_hash(structure.model_dump(mode="json", by_alias=True))
    structure_revision = ContentStructureRevisionOut(
        id=structure_revision_id,
        revision_number=2,
        parent_revision_id=base_manifest.content_structure_revision_id,
        structure_hash=structure_hash,
        snapshot=structure,
        created_at=now,
    )
    next_manifest = base_manifest.model_copy(
        update={
            "id": next_revision_id,
            "base_revision_id": base_revision_id,
            "revision_number": 2,
            "content_structure_revision_id": structure_revision_id,
            "content_structure_hash": structure_hash,
            "manifest_hash": canonical_hash({"revision": "next"}),
            "created_at": now,
        }
    )
    operation = BuilderGlobalSectionCreateOperationV1(
        type="global_section.create",
        operation_id="create-site-header",
        client_global_section_id="site-header",
        title="Site header",
        slug="site-header",
        locale="en-US",
    )
    context = BuilderChangeSetApplyContext(
        change_set=SimpleNamespace(
            id=change_set_id,
            operations_hash=canonical_hash({"operations": 1}),
            approval_class=BuilderApprovalClass.NONE,
        ),
        approval=None,
        site=SimpleNamespace(id=site_id),
        base_manifest=base_manifest,
        base_structure=structure,
        base_structure_revision_number=1,
        operations=(operation,),
        wireframes_by_item={},
        component_catalog=None,
        design_system_refresh=None,
        provenance_source=BuilderProvenanceSource.HUMAN,
        now=now,
    )
    applied_operations = AppliedBuilderOperations(
        client_page_ids={},
        client_global_section_ids={"site-header": global_section_id},
        after_commit_effects=(),
    )
    applied_revision = AppliedBuilderRevision(
        content_structure_revision=structure_revision,
        site_revision=next_manifest,
    )
    repository = SimpleNamespace(
        update_change_set=AsyncMock(),
        create_change_set_command=AsyncMock(),
    )
    activity_writer = AsyncMock()

    result = await persist_builder_change_set_apply(
        repository=cast(SiteBuilderRepository, repository),
        settings=Settings(app_env="test"),
        activity_writer=activity_writer,
        organization_id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        actor_user_id=actor_user_id,
        idempotency_key="apply-global-section-1",
        fingerprint="b" * 64,
        context=context,
        operations=applied_operations,
        revision=applied_revision,
        conn=cast(BaseDBAsyncClient, object()),
    )

    snapshot = repository.create_change_set_command.await_args.kwargs["values"]["result_snapshot"]
    assert snapshot["clientGlobalSectionIds"] == {"site-header": encode_uuid(global_section_id)}
    assert result.client_global_section_ids == {"site-header": global_section_id}
    assert replay_builder_change_set_apply(snapshot) == result
    activity_writer.assert_awaited_once()


@pytest.mark.asyncio
async def test_direct_agent_preview_persists_resolved_exact_provenance() -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    actor_user_id, base_revision_id, item_id, agent_id = (uuid4() for _ in range(4))
    operation = BuilderPageReorderOperationV1(
        type="page.reorder",
        operation_id="reorder-home",
        item_id=item_id,
        sort_order=10,
    )
    payload = BuilderChangeSetPreviewRequest(
        base_revision_id=base_revision_id,
        base_etag=canonical_hash({"base": 1}),
        operations=(operation,),
        provenance_source="agent",
        agent_id=agent_id,
        tool_name="builder.wireframe.apply",
    )
    manifest = _manifest(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_id=base_revision_id,
        manifest_hash=payload.base_etag,
    )
    analysis = BuilderChangeSetAnalysis(
        operations=(operation,),
        affected_targets=(),
        issues=(),
        required_permissions=("project:content:site-builder:write",),
        approval_class=BuilderApprovalClass.REVIEW,
        summary_params={"operationCount": 1, "affectedTargetCount": 0, "warningCount": 0},
    )
    resolved = ResolvedBuilderAgentProvenance(
        agent_run_id=None,
        agent_id=agent_id,
        agent_version_id=uuid4(),
        agent_assignment_id=uuid4(),
        tool_name="builder.wireframe.apply",
    )
    repository = SimpleNamespace(
        create_change_set=AsyncMock(),
        create_change_set_approval=AsyncMock(return_value=SimpleNamespace(id=uuid4())),
        create_change_set_command=AsyncMock(),
    )

    await persist_builder_change_set_preview(
        repository=cast(SiteBuilderRepository, repository),
        settings=Settings(app_env="test", auth={"jwt_secret": "builder-preview-test-secret"}),
        activity_writer=AsyncMock(),
        organization_id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=actor_user_id,
        idempotency_key="preview-agent-1",
        fingerprint="a" * 64,
        payload=payload,
        manifest=manifest,
        provenance=BuilderProvenanceSource.AGENT,
        agent_provenance=resolved,
        analysis=analysis,
        conn=cast(BaseDBAsyncClient, object()),
    )

    change_values = repository.create_change_set.await_args.kwargs["values"]
    assert change_values["agent_run_id"] is None
    assert change_values["agent_id"] == resolved.agent_id
    assert change_values["agent_version_id"] == resolved.agent_version_id
    assert change_values["agent_assignment_id"] == resolved.agent_assignment_id
    assert change_values["tool_name"] == resolved.tool_name


def _manifest(
    *,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    revision_id: UUID,
    manifest_hash: str,
) -> SiteRevisionManifestV1:
    empty_hash = canonical_hash([])
    return SiteRevisionManifestV1(
        id=revision_id,
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        revision_number=1,
        project_authoring_mode="builder_managed",
        content_structure_revision_id=uuid4(),
        content_structure_hash=canonical_hash({"pages": []}),
        page_versions=(),
        presentation_set_hash=empty_hash,
        design_system_id=uuid4(),
        design_system_version_id=uuid4(),
        design_system_manifest_checksum=canonical_hash({"tokens": {}}),
        provenance_source=BuilderProvenanceSource.HUMAN,
        actor_user_id=uuid4(),
        created_at=datetime(2026, 7, 20, tzinfo=UTC),
        manifest_hash=manifest_hash,
    )
