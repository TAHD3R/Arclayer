from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.modules.projects.builder.change_set_apply_operations import apply_revision_restore_operation
from src.modules.projects.builder.change_set_schema import BuilderRevisionRestoreOperationV1
from src.modules.projects.builder.restore_change_set_context import ResolvedBuilderRestoreTarget
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.content.items.transaction_commands import (
    ContentItemAfterCommitEffect,
    ProjectContentItemTransactionCommands,
)


def _restore_effect() -> ContentItemAfterCommitEffect:
    return ContentItemAfterCommitEffect.model_construct(
        lifecycle=None,
        event_name="content.item.updated",
        payload={},
        actor_user_id=None,
    )


@pytest.mark.asyncio
async def test_revision_restore_passes_one_caller_connection_to_every_mutation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id, project_id, site_id, environment_id = (uuid4() for _ in range(4))
    root_id, child_id = uuid4(), uuid4()
    structure = ContentStructureSnapshotV1.model_construct(
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        pages=(
            SimpleNamespace(
                item_id=root_id,
                parent_item_id=None,
                sort_order=0,
                routes=(),
                purpose=None,
                section_intents=(),
            ),
            SimpleNamespace(
                item_id=child_id,
                parent_item_id=root_id,
                sort_order=10,
                routes=(),
                purpose=None,
                section_intents=(),
            ),
        ),
        global_references=(),
    )
    root_version, child_version = uuid4(), uuid4()
    manifest = SiteRevisionManifestV1.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        project_id=project_id,
        site_id=site_id,
        environment_id=environment_id,
        page_versions=(
            SimpleNamespace(item_id=root_id, version_number=2, content_version_id=root_version),
            SimpleNamespace(item_id=child_id, version_number=3, content_version_id=child_version),
        ),
        global_section_versions=(),
    )
    target = ResolvedBuilderRestoreTarget.model_construct(
        manifest=manifest,
        structure=structure,
        live_item_ids=frozenset({root_id, child_id}),
        retained_item_ids=frozenset(),
        version_ids=frozenset({root_version, child_version}),
        missing_model_definition_item_ids=frozenset(),
    )
    effect = _restore_effect()
    restore_version = AsyncMock(return_value=SimpleNamespace(after_commit=effect))
    commands = cast(Any, SimpleNamespace(restore_version_to_draft=restore_version))
    upsert_hierarchy = AsyncMock()
    upsert_route = AsyncMock()
    monkeypatch.setattr(
        "src.modules.projects.builder.change_set_apply_operations.upsert_hierarchy_node_record",
        upsert_hierarchy,
    )
    monkeypatch.setattr(
        "src.modules.projects.builder.change_set_apply_operations.upsert_route_binding_record",
        upsert_route,
    )
    conn = cast(BaseDBAsyncClient, object())
    operation = BuilderRevisionRestoreOperationV1(
        type="revision.restore",
        operation_id="restore-1",
        target_revision_id=manifest.id,
    )

    result = await apply_revision_restore_operation(
        commands=cast(ProjectContentItemTransactionCommands, commands),
        current_manifest=manifest,
        current_structure=structure,
        target=target,
        operation=operation,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=uuid4(),
        site_id=site_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        conn=conn,
    )

    assert len(result.after_commit_effects) == 2
    assert [call.kwargs["conn"] for call in restore_version.await_args_list] == [conn, conn]
    assert all(call.kwargs["item_id"] in {root_id, child_id} for call in restore_version.await_args_list)
    assert all(call.kwargs["conn"] is conn for call in upsert_hierarchy.await_args_list)
    assert upsert_route.await_count == 0
