from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

from fastapi import Response
from fastapi.routing import APIRoute

from src.modules.projects.builder.router import get_project_builder_page_render_document, router
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.http.schema import ProjectRequestContext


def _render_route() -> APIRoute:
    return next(
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/projects/{project_id}/builder/revisions/{revision_id}/pages/{page_item_id}/render-document"
        and "GET" in route.methods
    )


def test_render_document_route_has_stable_read_contract() -> None:
    route = _render_route()
    query_by_alias = {parameter.alias: parameter for parameter in route.dependant.query_params}

    assert route.summary == "Get a strict revision-pinned page renderer document"
    assert set(query_by_alias) == {"locale", "theme"}
    assert query_by_alias["locale"].field_info.is_required() is True
    assert query_by_alias["theme"].field_info.is_required() is False
    _, empty_locale_errors = query_by_alias["locale"].validate("", {}, loc=("query", "locale"))
    _, long_theme_errors = query_by_alias["theme"].validate("x" * 65, {}, loc=("query", "theme"))
    assert empty_locale_errors
    assert long_theme_errors
    assert len(route.dependencies) == 1


async def test_render_document_route_forwards_exact_identity_and_disables_cache() -> None:
    workspace_id, project_id, revision_id, page_item_id = (uuid4() for _ in range(4))
    sentinel = {"renderable": True}
    get_render_document = AsyncMock(return_value=sentinel)
    service = cast(
        SiteBuilderService,
        SimpleNamespace(get_page_render_document=get_render_document),
    )
    response = Response()
    context = cast(
        ProjectRequestContext,
        SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
    )

    result = await get_project_builder_page_render_document(
        revision_id=revision_id,
        page_item_id=page_item_id,
        response=response,
        ctx=context,
        service=service,
        locale="en-US",
        theme="light",
    )

    assert response.headers["Cache-Control"] == "private, no-store"
    assert cast(Any, result.data) == sentinel
    get_render_document.assert_awaited_once_with(
        workspace_id=workspace_id,
        project_id=project_id,
        revision_id=revision_id,
        page_item_id=page_item_id,
        locale="en-US",
        theme_key="light",
    )
