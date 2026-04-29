from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.core.http.pagination import PageParams
from src.modules.projects.content.history import ContentHistoryService
from src.modules.projects.content.items.read_service import (
    ProjectContentCanonicalItemReadService,
)
from src.modules.projects.content.runtime import (
    DocumentMutationContext,
    DocumentPreviewDiagnosticsReadModel,
    DocumentPublishedReadModel,
    DocumentReadContext,
    DocumentRuntimeBoundary,
    DocumentRuntimeItemFields,
)


def _build_item(*, title: str = "Stored Title", slug: str = "stored-slug") -> SimpleNamespace:
    item_id = uuid4()
    workspace_id = uuid4()
    site_id = uuid4()
    model_id = uuid4()
    now = "2026-04-19T00:00:00Z"
    model_definition = SimpleNamespace(
        id=model_id,
        key="article",
        singular_key="article",
        category="content_library",
        default_editor="form",
        capabilities=["queryable"],
        name="Article",
    )
    return SimpleNamespace(
        id=item_id,
        workspace_id=workspace_id,
        site_id=site_id,
        model_definition=model_definition,
        slug=slug,
        title=title,
        status="draft",
        visibility="public",
        locale="en-US",
        bootstrap_preset_key=None,
        bootstrap_preset_state="none",
        capability_pack_ids=[],
        resolved_role="article",
        resolved_posture="structured",
        resolved_surface="structured",
        shape_state="ready",
        shape_reason_code=None,
        shape_reason_meta=None,
        created_by_user_id=None,
        updated_by_user_id=None,
        draft_version=2,
        published_version=1,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_document_read_context_resolves_active_item_fields() -> None:
    item = _build_item()
    repo = SimpleNamespace(
        list_versions_for_items=AsyncMock(
            return_value=[
                SimpleNamespace(
                    item_id=item.id,
                    version=2,
                    fields_snapshot={
                        "title": " Runtime Title ",
                        "summary": " Runtime Summary ",
                        "slug": "runtime-slug",
                        "visibility": "private",
                    },
                )
            ]
        )
    )

    context = DocumentReadContext(repo=repo)
    fields = await context.resolve_active_item_fields([item])

    assert fields[item.id] == DocumentRuntimeItemFields(
        title="Runtime Title",
        summary="Runtime Summary",
        slug="runtime-slug",
        visibility="private",
    )
    repo.list_versions_for_items.assert_awaited_once()


@pytest.mark.asyncio
async def test_document_read_context_resolves_published_and_preview_models() -> None:
    item = _build_item()
    context = DocumentReadContext(repo=SimpleNamespace())

    published = context.resolve_published_read_model(item)
    diagnostics = context.resolve_preview_diagnostics(item)

    assert published == DocumentPublishedReadModel(
        current_version_number=1,
        has_published_version=True,
    )
    assert diagnostics == DocumentPreviewDiagnosticsReadModel(
        current_draft_version_number=2,
        current_published_version_number=1,
        has_unpublished_changes=True,
    )


@pytest.mark.asyncio
async def test_read_service_list_items_paginated_uses_document_runtime_boundary_fields() -> None:
    item = _build_item(title="Stored Title", slug="stored-slug")
    resolve_active_item_fields = cast(
        Any,
        AsyncMock(
            return_value={
                item.id: DocumentRuntimeItemFields(
                    title="Boundary Title",
                    slug="boundary-slug",
                    summary="Boundary Summary",
                    visibility="private",
                )
            }
        ),
    )
    repo = SimpleNamespace(
        get_model_definition_by_key=AsyncMock(return_value=None),
        list_items=AsyncMock(return_value=[item]),
    )
    runtime_boundary = DocumentRuntimeBoundary(
        reads=cast(Any, SimpleNamespace(resolve_active_item_fields=resolve_active_item_fields)),
        mutations=DocumentMutationContext(repo=repo),
    )
    service = ProjectContentCanonicalItemReadService(repo=repo, runtime_boundary=runtime_boundary)

    page = await service.list_items_paginated(
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        params=PageParams(page=1, size=20),
        model_key=None,
    )

    assert len(page.items) == 1
    assert page.items[0].title == "Boundary Title"
    assert page.items[0].slug == "boundary-slug"
    assert page.items[0].summary == "Boundary Summary"
    assert page.items[0].visibility == "private"
    resolve_active_item_fields.assert_awaited_once_with([item])
    repo.list_items.assert_awaited_once()


@pytest.mark.asyncio
async def test_content_history_service_lists_version_system_objects() -> None:
    item = _build_item()
    version = SimpleNamespace(
        id=uuid4(),
        item_id=item.id,
        version=2,
        state="draft",
        created_at="2026-04-19T00:00:00Z",
        created_by_user_id=None,
        last_transition_by_user_id=None,
        fields_snapshot={"title": "Version title"},
        change_summary="Updated title",
    )
    repo = SimpleNamespace(
        get_item_with_model=AsyncMock(return_value=item),
        list_versions_for_item=AsyncMock(return_value=[version]),
        list_presentations=AsyncMock(return_value=[SimpleNamespace(kind="seo", payload={"metaTitle": "SEO title"})]),
    )
    history = ContentHistoryService(repo=repo)

    system_objects = await history.list_versions(
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        item_id=item.id,
    )
    page = system_objects.to_contract_page(params=PageParams(page=1, size=20))

    assert len(system_objects.items) == 1
    assert page.items[0].version_number == 2
    assert page.items[0].presentations[0].kind == "seo"
    repo.get_item_with_model.assert_awaited_once()
    repo.list_versions_for_item.assert_awaited_once_with(item_id=item.id)
    repo.list_presentations.assert_awaited_once_with(version_id=version.id, conn=None)


@pytest.mark.asyncio
async def test_read_service_get_item_uses_document_runtime_boundary_fields() -> None:
    item = _build_item(title="Stored Title", slug="stored-slug")
    resolve_active_item_fields = cast(
        Any,
        AsyncMock(
            return_value={
                item.id: DocumentRuntimeItemFields(
                    title="Boundary Detail Title",
                    slug="boundary-detail-slug",
                    summary="Boundary Detail Summary",
                    visibility="public",
                )
            }
        ),
    )
    repo = SimpleNamespace(
        get_item_with_model=AsyncMock(return_value=item),
    )
    runtime_boundary = DocumentRuntimeBoundary.for_items_repo(repo)
    runtime_boundary = DocumentRuntimeBoundary(
        reads=cast(Any, SimpleNamespace(resolve_active_item_fields=resolve_active_item_fields)),
        mutations=runtime_boundary.mutations,
    )
    service = ProjectContentCanonicalItemReadService(repo=repo, runtime_boundary=runtime_boundary)

    out = await service.get_item(
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        item_id=item.id,
    )

    assert out.title == "Boundary Detail Title"
    assert out.slug == "boundary-detail-slug"
    assert out.summary == "Boundary Detail Summary"
    assert out.visibility == "public"
    resolve_active_item_fields.assert_awaited_once_with([item])
    repo.get_item_with_model.assert_awaited_once()


@pytest.mark.asyncio
async def test_read_service_list_versions_paginated_uses_history_service() -> None:
    item = _build_item()
    version = SimpleNamespace(
        id=uuid4(),
        item_id=item.id,
        version=3,
        state="draft",
        created_at="2026-04-19T00:00:00Z",
        created_by_user_id=None,
        last_transition_by_user_id=None,
        fields_snapshot={"title": "Draft v3"},
        change_summary="Draft update",
    )
    repo = SimpleNamespace(
        get_item_with_model=AsyncMock(return_value=item),
        list_versions_for_item=AsyncMock(return_value=[version]),
        list_presentations=AsyncMock(return_value=[]),
    )
    service = ProjectContentCanonicalItemReadService(repo=repo)

    page = await service.list_versions_paginated(
        workspace_id=item.workspace_id,
        site_id=item.site_id,
        item_id=item.id,
        params=PageParams(page=1, size=20),
    )

    assert len(page.items) == 1
    assert page.items[0].version_number == 3
    assert page.items[0].change_summary == "Draft update"
    repo.get_item_with_model.assert_awaited_once()
    repo.list_versions_for_item.assert_awaited_once_with(item_id=item.id)
    repo.list_presentations.assert_awaited_once_with(version_id=version.id, conn=None)
