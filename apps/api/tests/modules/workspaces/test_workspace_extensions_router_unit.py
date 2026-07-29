from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.config import Settings
from src.core.exceptions import init_exception_handlers
from src.core.extensions.manager import ExtensionManager
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.extensions.router import router as workspace_extensions_router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access


def _write_extension(root: Path, name: str = "test-ext") -> None:
    ext_dir = root / "plugins" / name
    (ext_dir / "src").mkdir(parents=True)
    (ext_dir / "extension.json").write_text(
        json.dumps({
            "name": name,
            "version": "1.0.0",
            "provides": {
                "services": ["health"],
                "middlewares": [],
                "providers": [],
                "content_types": ["profile"],
            },
        }),
        encoding="utf-8",
    )
    (ext_dir / "src" / "plugin.py").write_text(
        """
def create_plugin():
    class Plugin:
        def arclayer_register(self, registry):
            registry.services.register("health", object())
            registry.content_types.register("profile", {"key": "profile"})
    return Plugin()
""",
        encoding="utf-8",
    )


async def _build_manager(tmp_path: Path) -> ExtensionManager:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    await manager.load_all()
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    return manager


def _workspace_context(workspace_id):
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=uuid4(),
        access_type=WorkspaceAccessType.MEMBER,
        org_membership_id=uuid4(),
        is_org_owner=False,
        workspace_membership_id=uuid4(),
        visible_only=False,
        is_creator_admin=False,
    )


def _build_app(manager: ExtensionManager, ctx: WorkspaceContext, monkeypatch) -> FastAPI:
    async def _ctx_override():
        return ctx

    async def _user_override():
        return uuid4()

    async def _permission_override(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "src.modules.workspaces.authz.http.service.ensure_workspace_permission_granted",
        _permission_override,
    )
    monkeypatch.setattr(
        "src.modules.workspaces.extensions.router._current_workspace_revision",
        AsyncMock(return_value=7),
    )

    app = FastAPI()
    init_exception_handlers(app, Settings(app_env="test"))
    app.state.extension_manager = manager
    app.include_router(workspace_extensions_router, prefix="/api/v1")
    app.dependency_overrides[require_workspace_manage_access] = _ctx_override
    app.dependency_overrides[get_current_user_id] = _user_override
    return app


@pytest.mark.asyncio
async def test_list_workspace_extensions_returns_loaded_extensions(tmp_path, monkeypatch) -> None:
    workspace_id = uuid4()
    manager = await _build_manager(tmp_path)
    app = _build_app(manager, _workspace_context(workspace_id), monkeypatch)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/workspaces/{workspace_id}/extensions")

    assert res.status_code == 200, res.text
    payload = res.json()["data"]
    assert payload[0]["name"] == "test-ext"
    assert payload[0]["version"] == "1.0.0"
    assert payload[0]["active"] is False
    assert payload[0]["extensionRevision"] == 7
    assert payload[0]["provides"]["services"] == ["health"]
    assert payload[0]["provides"]["contentTypes"] == ["profile"]


@pytest.mark.asyncio
async def test_activate_workspace_extension_returns_activation_state(tmp_path, monkeypatch) -> None:
    workspace_id = uuid4()
    manager = await _build_manager(tmp_path)
    activate_mock = AsyncMock(return_value=8)
    app = _build_app(manager, _workspace_context(workspace_id), monkeypatch)

    with patch.object(manager, "activate", activate_mock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.put(f"/api/v1/workspaces/{workspace_id}/extensions/test-ext/activation")

    assert res.status_code == 200, res.text
    assert res.json()["data"] == {
        "name": "test-ext",
        "active": True,
        "extensionRevision": 8,
    }
    activate_mock.assert_awaited_once_with("test-ext", workspace_id)


@pytest.mark.asyncio
async def test_deactivate_workspace_extension_returns_activation_state(tmp_path, monkeypatch) -> None:
    workspace_id = uuid4()
    manager = await _build_manager(tmp_path)
    deactivate_mock = AsyncMock(return_value=9)
    app = _build_app(manager, _workspace_context(workspace_id), monkeypatch)

    with patch.object(manager, "deactivate", deactivate_mock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.delete(f"/api/v1/workspaces/{workspace_id}/extensions/test-ext/activation")

    assert res.status_code == 200, res.text
    assert res.json()["data"] == {
        "name": "test-ext",
        "active": False,
        "extensionRevision": 9,
    }
    deactivate_mock.assert_awaited_once_with("test-ext", workspace_id)


@pytest.mark.asyncio
async def test_get_workspace_extension_returns_not_found_for_unknown_extension(tmp_path, monkeypatch) -> None:
    workspace_id = uuid4()
    manager = await _build_manager(tmp_path)
    app = _build_app(manager, _workspace_context(workspace_id), monkeypatch)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/workspaces/{workspace_id}/extensions/missing")

    assert res.status_code == 404, res.text
    assert res.json()["error"] == "EXTENSION_NOT_FOUND"
