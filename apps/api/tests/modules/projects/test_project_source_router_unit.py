from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute

from src.models.workspaces.workspace import WorkspaceKind
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.source.router import (
    delete_project_source_file,
    get_project_source_file,
    get_project_source_manifest,
    upsert_project_source_file,
)
from src.modules.projects.source.router import (
    router as project_source_router,
)
from src.modules.projects.source.schema import (
    ProjectSourceFileDeleteOut,
    ProjectSourceFileOut,
    ProjectSourceFileUpsertIn,
    ProjectSourceManifestOut,
)
from src.modules.projects.source.service import ProjectSourceService
from src.modules.workspaces.http.schema import WorkspaceAccessType


def _project_context() -> ProjectRequestContext:
    return ProjectRequestContext(
        project_id=uuid4(),
        workspace_id=uuid4(),
        organization_id=uuid4(),
        runtime_id=uuid4(),
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        is_org_owner=True,
        workspace_membership_id=uuid4(),
        visible_only=False,
        is_creator_admin=True,
    )


def _find_api_route(*, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in project_source_router.routes:
        if isinstance(route, APIRoute) and route.path == path and method_norm in route.methods:
            return route
    raise AssertionError(f"Route not found: {method_norm} {path}")


def test_project_source_manifest_route_is_mounted_with_read_permission() -> None:
    route = _find_api_route(path="/projects/{project_id}/source/manifest", method="GET")

    assert route.summary == "Get project source manifest"
    assert route.response_model is not None
    assert route.dependant.dependencies


def test_project_source_file_write_routes_are_mounted_with_manage_permission() -> None:
    read_route = _find_api_route(path="/projects/{project_id}/source/files/{file_path:path}", method="GET")
    upsert_route = _find_api_route(path="/projects/{project_id}/source/files/{file_path:path}", method="PUT")
    delete_route = _find_api_route(path="/projects/{project_id}/source/files/{file_path:path}", method="DELETE")

    assert read_route.summary == "Get project source file"
    assert upsert_route.summary == "Upsert project source file"
    assert delete_route.summary == "Delete project source file"
    assert read_route.dependant.dependencies
    assert upsert_route.dependant.dependencies
    assert delete_route.dependant.dependencies


@pytest.mark.asyncio
async def test_project_source_manifest_route_returns_manifest() -> None:
    ctx = _project_context()
    expected = ProjectSourceManifestOut(
        project_id=ctx.project_id,
        framework="react_vite",
        source_provider="managed",
        package_manager="pnpm",
        root_directory=".",
        build_command="pnpm build",
        output_directory="dist",
        artifact_strategy="object_storage",
        files=[],
    )

    class FakeProjectSourceService:
        async def get_source_manifest(self, *, project_id):
            assert project_id == ctx.project_id
            return expected

    response = await get_project_source_manifest(
        ctx=ctx,
        service=cast(ProjectSourceService, FakeProjectSourceService()),
    )

    assert response.data == expected


@pytest.mark.asyncio
async def test_project_source_file_route_returns_file() -> None:
    ctx = _project_context()
    expected = ProjectSourceFileOut(
        path="src/App.tsx",
        role="entry",
        language="typescriptreact",
        contents="export function App() { return null; }\n",
    )

    class FakeProjectSourceService:
        async def get_source_file(self, *, project_id, path):
            assert project_id == ctx.project_id
            assert path == "src/App.tsx"
            return expected

    response = await get_project_source_file(
        ctx=ctx,
        service=cast(ProjectSourceService, FakeProjectSourceService()),
        file_path="src/App.tsx",
    )

    assert response.data == expected


@pytest.mark.asyncio
async def test_project_source_file_route_upserts_file() -> None:
    ctx = _project_context()
    current_user_id = uuid4()
    expected = ProjectSourceFileOut(
        path="src/App.tsx",
        role="entry",
        language="typescriptreact",
        contents="export function App() { return null; }\n",
    )

    class FakeProjectSourceService:
        async def upsert_source_file(self, *, project_id, path, payload, actor_user_id):
            assert project_id == ctx.project_id
            assert path == "src/App.tsx"
            assert payload.contents == expected.contents
            assert actor_user_id == current_user_id
            return expected

    response = await upsert_project_source_file(
        payload=ProjectSourceFileUpsertIn(contents=expected.contents),
        ctx=ctx,
        service=cast(ProjectSourceService, FakeProjectSourceService()),
        actor_user_id=current_user_id,
        file_path="src/App.tsx",
    )

    assert response.data == expected


@pytest.mark.asyncio
async def test_project_source_file_route_deletes_file() -> None:
    ctx = _project_context()
    current_user_id = uuid4()
    expected = ProjectSourceFileDeleteOut(project_id=ctx.project_id, path="src/App.tsx", deleted=True)

    class FakeProjectSourceService:
        async def delete_source_file(self, *, project_id, path, actor_user_id):
            assert project_id == ctx.project_id
            assert path == "src/App.tsx"
            assert actor_user_id == current_user_id
            return expected

    response = await delete_project_source_file(
        ctx=ctx,
        service=cast(ProjectSourceService, FakeProjectSourceService()),
        actor_user_id=current_user_id,
        file_path="src/App.tsx",
    )

    assert response.data == expected
