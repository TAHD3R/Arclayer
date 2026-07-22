from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.entity_manager.manager import EntityAfterCommitHook
from src.core.exceptions import Conflict
from src.core.lifecycles.specs import LifecycleAction
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.items.transaction_commands import ProjectContentItemTransactionCommands
from src.modules.projects.content.items.wireframe_transaction_command import (
    ProjectContentWireframeTransactionCommand,
)


def _rename_fixture() -> tuple[SimpleNamespace, SimpleNamespace, list[tuple[str, dict[str, Any]]]]:
    item = SimpleNamespace(
        id=uuid4(),
        draft_version=1,
        model_definition=SimpleNamespace(singular_key="page"),
        locale="en-US",
        status="draft",
        published_version=None,
    )
    presentations = [
        (
            "visual",
            {"sections": [{"component": "hero"}]},
        ),
        (
            "seo",
            {
                "metaTitle": "About Arclayer",
                "metaDescription": "Platform overview",
            },
        ),
        (
            "slot_mapping",
            {
                "bindings": [
                    {
                        "componentKey": "hero",
                        "bindingKey": "heading",
                        "payload": {"field": "title"},
                    }
                ]
            },
        ),
    ]
    previous = SimpleNamespace(
        id=uuid4(),
        version=1,
        fields_snapshot={"title": "About", "summary": "Our story", "path": "/about"},
        presentation_documents=[SimpleNamespace(kind=kind, payload=payload) for kind, payload in presentations],
    )
    return item, previous, presentations


def _commands(
    *,
    monkeypatch: pytest.MonkeyPatch,
    item: SimpleNamespace,
    previous: SimpleNamespace,
    component_binding_error: Exception | None = None,
) -> tuple[ProjectContentItemTransactionCommands, SimpleNamespace, SimpleNamespace, SimpleNamespace]:
    repo = SimpleNamespace(
        get_item_with_model=AsyncMock(return_value=item),
        get_version_by_number=AsyncMock(return_value=previous),
        update_item_fields=AsyncMock(return_value=item),
        replace_presentations=AsyncMock(),
        replace_seo_profile=AsyncMock(),
        replace_component_bindings=AsyncMock(side_effect=component_binding_error),
        list_component_bindings=AsyncMock(return_value=[]),
    )
    new_version = SimpleNamespace(id=uuid4(), version=2)
    hook = EntityAfterCommitHook(
        action=LifecycleAction.AFTER_UPDATE,
        model_key="page",
        workspace_id=uuid4(),
        site_id=uuid4(),
        item_id=item.id,
        result=cast(Any, new_version),
        actor_id=uuid4(),
        state={},
    )

    async def update_in_transaction(**kwargs: Any) -> SimpleNamespace:
        new_version.fields_snapshot = kwargs["data"]
        await kwargs["before_commit"](item, new_version, kwargs["conn"])
        return SimpleNamespace(
            result=SimpleNamespace(version=new_version),
            after_commit=hook,
        )

    entity_manager = SimpleNamespace(
        update_in_transaction=AsyncMock(side_effect=update_in_transaction),
        dispatch_after_commit=AsyncMock(),
    )
    commands = ProjectContentItemTransactionCommands(
        repo=cast(Any, repo),
        entity_manager=cast(Any, entity_manager),
        organization_id=uuid4(),
    )
    monkeypatch.setattr(commands, "_write_activity", AsyncMock())
    monkeypatch.setattr(
        "src.modules.projects.content.items.transaction_commands.tenant_payload_from_context",
        lambda: {},
    )
    return commands, repo, entity_manager, new_version


async def test_rename_transaction_preserves_fields_presentations_seo_and_component_bindings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item, previous, presentations = _rename_fixture()
    commands, repo, _, new_version = _commands(
        monkeypatch=monkeypatch,
        item=item,
        previous=previous,
    )
    workspace_id, project_id, runtime_id, site_id, environment_id, actor_user_id = (uuid4() for _ in range(6))
    conn = cast(BaseDBAsyncClient, object())

    result = await commands.rename_item(
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=item.id,
        expected_draft_version=1,
        title="  About us  ",
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert new_version.fields_snapshot == {
        "title": "About us",
        "summary": "Our story",
        "path": "/about",
    }
    assert result.item_id == item.id
    assert result.version_id == new_version.id
    assert result.version_number == 2
    repo.update_item_fields.assert_awaited_once_with(
        item,
        fields={"title": "About us", "updated_by_user_id": actor_user_id},
        conn=conn,
    )
    repo.replace_presentations.assert_awaited_once_with(
        version_id=new_version.id,
        presentations=presentations,
        conn=conn,
    )
    repo.replace_seo_profile.assert_awaited_once_with(
        version_id=new_version.id,
        payload={
            "metaTitle": "About Arclayer",
            "metaDescription": "Platform overview",
        },
        conn=conn,
    )
    repo.replace_component_bindings.assert_awaited_once_with(
        version_id=new_version.id,
        bindings=[
            {
                "component_key": "hero",
                "binding_key": "heading",
                "binding_payload": {"field": "title"},
            }
        ],
        conn=conn,
    )


async def test_rename_transaction_surfaces_presentation_copy_failure_without_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item, previous, _ = _rename_fixture()
    commands, repo, entity_manager, _ = _commands(
        monkeypatch=monkeypatch,
        item=item,
        previous=previous,
        component_binding_error=RuntimeError("component binding write failed"),
    )

    with pytest.raises(RuntimeError, match="component binding write failed"):
        await commands.rename_item(
            workspace_id=uuid4(),
            project_id=uuid4(),
            runtime_id=uuid4(),
            site_id=uuid4(),
            environment_id=uuid4(),
            item_id=item.id,
            expected_draft_version=1,
            title="About us",
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )

    repo.replace_presentations.assert_awaited_once()
    repo.replace_seo_profile.assert_awaited_once()
    repo.replace_component_bindings.assert_awaited_once()
    entity_manager.dispatch_after_commit.assert_not_awaited()


async def test_replace_wireframe_creates_one_version_and_copies_complete_presentation_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "src.modules.projects.content.items.wireframe_transaction_command.tenant_payload_from_context",
        lambda: {},
    )
    item, previous, presentations = _rename_fixture()
    _, repo, entity_manager, new_version = _commands(monkeypatch=monkeypatch, item=item, previous=previous)
    commands = ProjectContentWireframeTransactionCommand(
        repo=cast(Any, repo),
        entity_manager=cast(Any, entity_manager),
        organization_id=uuid4(),
    )
    monkeypatch.setattr(commands, "_write_activity", AsyncMock())
    repo.list_component_bindings.return_value = [
        SimpleNamespace(
            component_key="hero",
            binding_key="heading",
            binding_payload={"field": "title"},
            sort_order=7,
        )
    ]
    workspace_id, project_id, runtime_id, site_id, environment_id, actor_user_id = (uuid4() for _ in range(6))
    wireframe = WireframeDocumentV1(
        page_item_id=item.id,
        design_system_version_id=uuid4(),
        component_catalog_version="catalog-v1",
    )
    conn = cast(BaseDBAsyncClient, object())

    result = await commands.replace_wireframe(
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=item.id,
        expected_content_version_id=previous.id,
        expected_draft_version=1,
        wireframe=wireframe,
        actor_user_id=actor_user_id,
        conn=conn,
    )

    assert new_version.fields_snapshot == previous.fields_snapshot
    assert result.version_id == new_version.id
    expected_presentations = [
        *presentations,
        ("wireframe", wireframe.model_dump(mode="json", by_alias=True)),
    ]
    repo.replace_presentations.assert_awaited_once_with(
        version_id=new_version.id,
        presentations=expected_presentations,
        conn=conn,
    )
    repo.replace_component_bindings.assert_awaited_once_with(
        version_id=new_version.id,
        bindings=[
            {
                "component_key": "hero",
                "binding_key": "heading",
                "binding_payload": {"field": "title"},
                "sort_order": 7,
            }
        ],
        conn=conn,
    )


async def test_replace_wireframe_rejects_non_pinned_content_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item, previous, _ = _rename_fixture()
    _, repo, entity_manager, _ = _commands(monkeypatch=monkeypatch, item=item, previous=previous)
    commands = ProjectContentWireframeTransactionCommand(
        repo=cast(Any, repo),
        entity_manager=cast(Any, entity_manager),
        organization_id=uuid4(),
    )
    wireframe = WireframeDocumentV1(
        page_item_id=item.id,
        design_system_version_id=uuid4(),
        component_catalog_version="catalog-v1",
    )

    with pytest.raises(Conflict) as stale:
        await commands.replace_wireframe(
            workspace_id=uuid4(),
            project_id=uuid4(),
            runtime_id=uuid4(),
            site_id=uuid4(),
            environment_id=uuid4(),
            item_id=item.id,
            expected_content_version_id=uuid4(),
            expected_draft_version=1,
            wireframe=wireframe,
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert stale.value.error == "SITE_REVISION_STALE"
    entity_manager.update_in_transaction.assert_not_awaited()
