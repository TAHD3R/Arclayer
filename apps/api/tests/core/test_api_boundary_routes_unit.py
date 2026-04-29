from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import Depends
from fastapi.routing import APIRoute
from starlette.requests import Request

from src.core.registry import create_app
from src.modules.projects.runtime.router import get_optional_runtime_delivery_credential, get_runtime_context
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.runtime.delivery_kernel import get_site_runtime_delivery_kernel
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from tests.utils.asgi_client import asgi_client


def _runtime_context(*, runtime_id: UUID, site_id: UUID) -> ProjectRuntimeContext:
    workspace_id = uuid4()
    project_id = uuid4()
    return ProjectRuntimeContext(
        runtime_id=runtime_id,
        project_id=project_id,
        workspace_id=workspace_id,
        site_id=site_id,
        tenant_context=TenantContext(
            identity=TenantIdentity(
                organization_id=uuid4(),
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                schema_name="public",
                isolation_mode=TenantIsolationMode.PUBLIC,
            ),
            scope=TenantScope.RUNTIME,
        ),
        kind="production",
        name="Production",
        slug="primary",
        default_locale="en-US",
        fallback_locale="en-US",
        is_active=True,
    )


class _Kernel:
    async def get_delivery_style(self, *, target):
        return {"effective": {"theme": "public"}}


@pytest.mark.asyncio
async def test_api_boundary_routes_are_split_by_admin_and_content_prefixes() -> None:
    app = create_app()
    paths = {route.path for route in app.routes if isinstance(route, APIRoute)}

    assert "/api/v1/projects" in paths
    assert "/content-api/v1/runtimes/{runtime_id}/delivery/style" in paths
    assert "/content-api/v1/runtimes/{runtime_id}/graphql" in paths
    assert "/api/v1/runtimes/{runtime_id}/delivery/style" not in paths


@pytest.mark.asyncio
async def test_content_api_route_uses_content_credential_boundary_without_admin_session() -> None:
    runtime_id = uuid4()
    seen: list[tuple[UUID, str | None]] = []
    app = create_app()

    async def override_runtime_context():
        return _runtime_context(runtime_id=runtime_id, site_id=uuid4())

    async def override_content_credential(
        request: Request,
        runtime_context: ProjectRuntimeContext = Depends(get_runtime_context),
    ):
        seen.append((runtime_context.runtime_id, request.headers.get("x-api-key")))
        return None

    app.dependency_overrides[get_runtime_context] = override_runtime_context
    app.dependency_overrides[get_optional_runtime_delivery_credential] = override_content_credential
    app.dependency_overrides[get_site_runtime_delivery_kernel] = lambda: _Kernel()

    async with asgi_client(app) as client:
        admin_res = await client.get("/api/v1/projects")
        content_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/delivery/style",
            headers={"x-api-key": "ark_deliv_test.secret"},
        )

    assert admin_res.status_code == 401
    assert content_res.status_code == 200, content_res.text
    assert content_res.json()["data"]["effective"] == {"theme": "public"}
    assert seen == [(runtime_id, "ark_deliv_test.secret")]
