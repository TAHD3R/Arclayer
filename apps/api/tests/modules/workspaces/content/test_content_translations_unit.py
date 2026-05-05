from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.core.entity_manager.manager import EntityManager
from src.models.content._enums import ContentWorkflowStage
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import ContentItemCreateIn, ContentTranslationCreateIn
from src.modules.projects.content.items.repository import ProjectContentItemsRepository


class _FakeTransaction:
    def __init__(self, conn: object) -> None:
        self.conn = conn

    async def __aenter__(self) -> object:
        return self.conn

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None


def _model_definition(*, model_id):
    return SimpleNamespace(
        id=model_id,
        key="article",
        singular_key="article",
        category="content_library",
        default_editor="form",
        model_kind="collection_type",
        protocol_key="article",
        capabilities=["queryable"],
        name="Article",
    )


def _content_item(
    *,
    item_id,
    workspace_id,
    site_id,
    model,
    locale: str,
    translation_group_id=None,
):
    return SimpleNamespace(
        id=item_id,
        workspace_id=workspace_id,
        site_id=site_id,
        model_definition=model,
        model_definition_id=model.id,
        translation_group_id=translation_group_id,
        slug="launch-memo",
        title="Launch memo",
        status="draft",
        visibility="public",
        locale=locale,
        bootstrap_preset_key=None,
        bootstrap_preset_state="none",
        capability_pack_ids=[],
        resolved_role="article",
        resolved_posture="structured",
        resolved_surface="structured",
        shape_state="ready",
        shape_reason_code=None,
        shape_reason_meta=None,
        workflow_stage=str(ContentWorkflowStage.DRAFTING),
        workflow_assignee_user_id=None,
        workflow_summary=None,
        workflow_notes=[],
        created_by_user_id=None,
        updated_by_user_id=None,
        draft_version=0,
        published_version=None,
        updated_at="2026-05-02T00:00:00Z",
    )


@pytest.mark.asyncio
async def test_create_translation_links_new_locale_to_source_translation_group(monkeypatch) -> None:
    workspace_id = uuid4()
    site_id = uuid4()
    actor_user_id = uuid4()
    model = _model_definition(model_id=uuid4())
    group_id = uuid4()
    source_item = _content_item(
        item_id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        model=model,
        locale="en-US",
    )
    translated_item = _content_item(
        item_id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        model=model,
        locale="fr-FR",
        translation_group_id=group_id,
    )
    group = SimpleNamespace(id=group_id, primary_item_id=source_item.id, primary_locale="en-US")
    conn = object()
    repo = SimpleNamespace(
        get_item_with_model=AsyncMock(return_value=source_item),
        ensure_translation_group_for_item=AsyncMock(return_value=group),
        get_translation_item_by_locale=AsyncMock(return_value=None),
        create_item=AsyncMock(return_value=translated_item),
        list_translation_items=AsyncMock(return_value=[source_item, translated_item]),
    )
    service = ProjectContentCanonicalItemsService(
        repo=cast(ProjectContentItemsRepository, repo),
        entity_manager=cast(EntityManager, SimpleNamespace()),
    )
    monkeypatch.setattr(service, "tx", lambda: _FakeTransaction(conn))
    out = await service.create_translation(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=None,
        item_id=source_item.id,
        actor_user_id=actor_user_id,
        payload=ContentTranslationCreateIn(target_locale=" fr-FR "),
    )

    repo.ensure_translation_group_for_item.assert_awaited_once_with(item=source_item, conn=conn)
    repo.get_translation_item_by_locale.assert_awaited_once_with(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=None,
        translation_group_id=group_id,
        locale="fr-FR",
        conn=conn,
    )
    repo.create_item.assert_awaited_once()
    create_call = repo.create_item.await_args.kwargs
    assert create_call["translation_group_id"] == group_id
    assert create_call["locale"] == "fr-FR"
    assert create_call["slug"] == source_item.slug
    assert create_call["title"] == source_item.title
    assert create_call["actor_user_id"] == actor_user_id
    assert out.locale == "fr-FR"
    assert out.translation_group_id == group_id
    assert out.translation_status is not None
    assert out.translation_status.locales == ["en-US", "fr-FR"]


def test_content_translation_payload_normalizes_locale_codes() -> None:
    item_payload = ContentItemCreateIn(title="Launch memo", model_key="article", locale=" en-US ")
    translation_payload = ContentTranslationCreateIn(target_locale=" fr-FR ")

    assert item_payload.locale == "en-US"
    assert translation_payload.target_locale == "fr-FR"


def test_content_translation_payload_rejects_blank_locale_codes() -> None:
    with pytest.raises(ValidationError):
        ContentTranslationCreateIn(target_locale="  ")
