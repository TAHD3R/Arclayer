from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute

from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.domains.router import project_domains_router
from src.modules.projects.builder.router import router as builder_router
from src.modules.projects.deployments.router import router as deployments_router
from src.modules.projects.http import router_helpers
from src.modules.projects.releases.router import router as releases_router


def _commercial_effect_guard(route: APIRoute):
    dependency = next(
        dependency
        for dependency in route.dependant.dependencies
        if getattr(dependency.call, "__module__", None) == router_helpers.__name__
        and getattr(dependency.call, "__name__", None) == "authorize"
    )
    assert dependency.call is not None
    return dependency.call


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("router", "path", "method", "effect"),
    [
        (builder_router, "/projects/{project_id}/builder/initializations", "POST", "content_mutation"),
        (builder_router, "/projects/{project_id}/builder/change-sets/preview", "POST", "content_mutation"),
        (
            builder_router,
            "/projects/{project_id}/builder/change-sets/{change_set_id}/apply",
            "POST",
            "content_mutation",
        ),
        (builder_router, "/projects/{project_id}/builder/composition-sagas", "POST", "metered_external_effect"),
        (builder_router, "/projects/{project_id}/builder/generations", "POST", "metered_external_effect"),
        (releases_router, "/projects/{project_id}/releases/publish", "POST", "metered_external_effect"),
        (releases_router, "/projects/{project_id}/releases/{release_id}/rollback", "POST", "metered_external_effect"),
        (
            deployments_router,
            "/projects/{project_id}/deployments/{deployment_id}/promote",
            "POST",
            "metered_external_effect",
        ),
        (
            deployments_router,
            "/projects/{project_id}/deployments/{deployment_id}/rollback",
            "POST",
            "metered_external_effect",
        ),
        (project_domains_router, "/projects/{project_id}/domains", "POST", "metered_external_effect"),
        (
            project_domains_router,
            "/projects/{project_id}/domains/{binding_id}/verify",
            "POST",
            "metered_external_effect",
        ),
        (project_domains_router, "/projects/{project_id}/domains/{binding_id}", "PATCH", "metered_external_effect"),
        (project_domains_router, "/projects/{project_id}/domains/{binding_id}", "DELETE", "metered_external_effect"),
    ],
)
async def test_project_mutation_routes_authorize_their_commercial_effect_before_dispatch(
    monkeypatch,
    router,
    path: str,
    method: str,
    effect: str,
) -> None:
    policy = SimpleNamespace(authorize=AsyncMock())
    monkeypatch.setattr(router_helpers, "build_restricted_recovery_command_policy", lambda: policy)
    route = next(
        route
        for route in router.routes
        if isinstance(route, APIRoute) and route.path == path and method in route.methods
    )
    workspace_id = uuid4()

    await _commercial_effect_guard(route)(ctx=SimpleNamespace(workspace_id=workspace_id))

    policy.authorize.assert_awaited_once_with(
        workspace_id=workspace_id,
        effects={RestrictedRecoveryEffect(effect)},
    )


def test_builder_recovery_read_route_has_no_commercial_effect_guard() -> None:
    route = next(
        route
        for route in builder_router.routes
        if isinstance(route, APIRoute)
        and route.path == "/projects/{project_id}/builder/composition-sagas/recovery"
        and "GET" in route.methods
    )

    assert not [
        dependency
        for dependency in route.dependant.dependencies
        if getattr(dependency.call, "__module__", None) == router_helpers.__name__
        and getattr(dependency.call, "__name__", None) == "authorize"
    ]
