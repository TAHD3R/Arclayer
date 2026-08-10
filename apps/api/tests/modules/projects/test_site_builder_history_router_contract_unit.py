from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.router import list_project_builder_history, router
from src.modules.projects.builder.schema import BuilderRevisionHistoryOut, SiteRevisionManifestV1
from src.modules.projects.builder.service import SiteBuilderService
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry


def test_builder_history_route_is_read_only_and_paginates_by_public_cursor() -> None:
    route = next(
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/projects/{project_id}/builder/history"
        and "GET" in route.methods
    )
    assert route.summary == "List immutable Builder revision history"
    query_aliases = {parameter.alias for parameter in route.dependant.query_params}
    assert query_aliases == {"limit", "cursor"}


def test_builder_draft_checkpoint_optional_responses_keep_explicit_null_data() -> None:
    checkpoint_routes = [
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/projects/{project_id}/builder/draft-checkpoint"
    ]

    assert {
        method: route.response_model_exclude_none
        for route in checkpoint_routes
        for method in route.methods
    } == {"GET": False, "PUT": False, "DELETE": False}


async def test_builder_history_route_passes_project_scope_and_cursor_to_service() -> None:
    project_id = uuid4()
    cursor = uuid4()
    service = SimpleNamespace(get_revision_history=AsyncMock(return_value=BuilderRevisionHistoryOut()))

    await list_project_builder_history(
        ctx=cast(
            ProjectRequestContext,
            SimpleNamespace(workspace_id=uuid4(), project_id=project_id, runtime_id=uuid4()),
        ),
        service=cast(SiteBuilderService, service),
        limit=25,
        cursor=cursor,
    )

    service.get_revision_history.assert_awaited_once()
    call = service.get_revision_history.await_args
    assert call is not None
    assert call.kwargs["project_id"] == project_id
    assert call.kwargs["cursor"] == cursor


@pytest.mark.asyncio
async def test_builder_history_rejects_a_cursor_from_another_site_scope() -> None:
    project_id, site_id, environment_id = uuid4(), uuid4(), uuid4()
    current = SiteRevisionManifestV1.model_construct(
        id=uuid4(),
        site_id=site_id,
        environment_id=environment_id,
    )
    repository = SimpleNamespace(
        get_site_revision=AsyncMock(
            return_value=SimpleNamespace(site_id=site_id, environment_id=uuid4()),
        ),
    )
    service = SiteBuilderService(
        repository=cast(SiteBuilderRepository, repository),
        design_system_repository=cast(ProjectDesignSystemsRepository, SimpleNamespace()),
        component_catalog_resolver=get_official_component_catalog_registry(),
    )
    cast(Any, service).get_projection = AsyncMock(
        return_value=SimpleNamespace(current_site_revision=current),
    )

    @asynccontextmanager
    async def transaction():
        yield cast(BaseDBAsyncClient, object())

    cast(Any, service).tx = transaction

    with pytest.raises(NotFound, match="Builder history cursor not found"):
        await service.get_revision_history(
            workspace_id=uuid4(),
            project_id=project_id,
            runtime_id=uuid4(),
            limit=25,
            cursor=uuid4(),
        )
