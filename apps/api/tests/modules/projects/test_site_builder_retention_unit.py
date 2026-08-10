from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_item_deletion import ContentItemDeletionRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.content.items.retention import (
    _restore_routes_and_hierarchy,
    _restore_versions,
    restore_retained_content_item,
)


@pytest.mark.asyncio
async def test_restore_retained_aggregate_recreates_routes_and_hierarchy(monkeypatch: pytest.MonkeyPatch) -> None:
    route_create = AsyncMock()
    hierarchy_create = AsyncMock()
    monkeypatch.setattr(RouteBindingRecord, "create", route_create)
    monkeypatch.setattr(HierarchyNodeRecord, "create", hierarchy_create)

    item_id = uuid4()
    route_id = uuid4()
    hierarchy_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    await _restore_routes_and_hierarchy(
        snapshot={
            "routes": [
                {
                    "id": str(route_id),
                    "workspace_id": str(workspace_id),
                    "site_id": str(site_id),
                    "environment_id": str(environment_id),
                    "item_id": str(item_id),
                    "locale": "en-US",
                    "path": "/about",
                    "route_contract": {"kind": "page"},
                    "is_active": True,
                    "created_at": "2026-08-10T00:00:00+00:00",
                    "updated_at": "2026-08-10T00:00:00+00:00",
                },
            ],
            "hierarchy": {
                "id": str(hierarchy_id),
                "workspace_id": str(workspace_id),
                "site_id": str(site_id),
                "item_id": str(item_id),
                "parent_item_id": None,
                "sort_order": 2,
                "created_at": "2026-08-10T00:00:00+00:00",
                "updated_at": "2026-08-10T00:00:00+00:00",
            },
        },
        item_id=item_id,
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    route_create.assert_awaited_once()
    route_call = route_create.await_args
    assert route_call is not None
    assert route_call.kwargs["id"] == route_id
    assert route_call.kwargs["item_id"] == item_id
    hierarchy_create.assert_awaited_once()
    hierarchy_call = hierarchy_create.await_args
    assert hierarchy_call is not None
    assert hierarchy_call.kwargs["id"] == hierarchy_id
    assert hierarchy_call.kwargs["item_id"] == item_id
    assert hierarchy_call.kwargs["sort_order"] == 2


@pytest.mark.asyncio
async def test_restore_retained_aggregate_recreates_versions_and_presentations(monkeypatch: pytest.MonkeyPatch) -> None:
    version_create = AsyncMock()
    presentation_create = AsyncMock()
    binding_create = AsyncMock()
    seo_create = AsyncMock()
    monkeypatch.setattr(ContentVersionRecord, "create", version_create)
    monkeypatch.setattr(PresentationDocumentRecord, "create", presentation_create)
    monkeypatch.setattr(ComponentBindingRecord, "create", binding_create)
    monkeypatch.setattr(SEOProfileRecord, "create", seo_create)

    item_id = uuid4()
    version_id = uuid4()
    actor_id = uuid4()
    timestamp = "2026-08-10T00:00:00+00:00"
    await _restore_versions(
        snapshot={
            "versions": [
                {
                    "id": str(version_id),
                    "version": 3,
                    "state": "draft",
                    "fields_snapshot": {"title": "About"},
                    "change_summary": "Initial",
                    "created_by_user_id": str(actor_id),
                    "last_transition_by_user_id": str(actor_id),
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            ],
            "presentations": [
                {
                    "id": str(uuid4()),
                    "version_id": str(version_id),
                    "kind": "page",
                    "payload": {"sections": []},
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            ],
            "componentBindings": [
                {
                    "id": str(uuid4()),
                    "version_id": str(version_id),
                    "component_key": "hero",
                    "binding_key": "title",
                    "binding_payload": {"kind": "field", "fieldKey": "title"},
                    "sort_order": 0,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            ],
            "seoProfiles": [
                {
                    "id": str(uuid4()),
                    "version_id": str(version_id),
                    "meta_title": "About",
                    "meta_description": "About us",
                    "canonical_url": None,
                    "robots_directive": None,
                    "payload": {},
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            ],
        },
        item_id=item_id,
        conn=cast(BaseDBAsyncClient, SimpleNamespace()),
    )

    assert version_create.await_args is not None
    assert presentation_create.await_args is not None
    assert binding_create.await_args is not None
    assert seo_create.await_args is not None
    assert version_create.await_args.kwargs["item_id"] == item_id
    assert presentation_create.await_args.kwargs["version_id"] == version_id
    assert binding_create.await_args.kwargs["version_id"] == version_id
    assert seo_create.await_args.kwargs["version_id"] == version_id


@pytest.mark.asyncio
async def test_restore_retained_content_item_rejects_existing_item(monkeypatch: pytest.MonkeyPatch) -> None:
    item_id = uuid4()
    record = SimpleNamespace(deletion_sequence=4)
    existing = SimpleNamespace(id=item_id)

    class Query:
        def __init__(self, value: object) -> None:
            self.value = value

        def using_db(self, _conn: BaseDBAsyncClient) -> Query:
            return self

        def select_for_update(self) -> Query:
            return self

        def order_by(self, *_fields: str) -> Query:
            return self

        async def first(self) -> object:
            return self.value

    monkeypatch.setattr(ContentItemDeletionRecord, "filter", lambda **_kwargs: Query(record))
    monkeypatch.setattr(ContentItemRecord, "filter", lambda **_kwargs: Query(existing))

    with pytest.raises(Conflict, match="retained content item conflicts"):
        await restore_retained_content_item(
            workspace_id=uuid4(),
            site_id=uuid4(),
            environment_id=uuid4(),
            item_id=item_id,
            actor_user_id=uuid4(),
            conn=cast(BaseDBAsyncClient, SimpleNamespace()),
        )
