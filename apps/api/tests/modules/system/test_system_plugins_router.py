from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI

from src.config import Settings
from src.core.exceptions import init_exception_handlers
from src.core.extensions.manager import ExtensionManager
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.plugins.router import router as system_plugins_router
from tests.utils.asgi_client import asgi_client


def _write_extension(project_root: Path) -> None:
    extension_dir = project_root / "plugins" / "catalog-test"
    (extension_dir / "src").mkdir(parents=True)
    (extension_dir / "extension.json").write_text(
        json.dumps({
            "name": "catalog-test",
            "version": "1.2.3",
            "entry": "src/plugin.py",
            "provides": {
                "services": ["catalog-service"],
                "middlewares": ["catalog-middleware"],
                "providers": ["catalog-provider"],
                "connectors": ["catalog.test"],
                "content_types": ["catalog-entry"],
            },
            "permissions": ["catalog:read"],
            "config_schema": {"enabled": {"type": "boolean"}},
            "admin": {
                "label_key": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_NAME",
                "description_key": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_DESC",
                "settings_path": "/system/settings/catalog-test",
            },
        }),
        encoding="utf-8",
    )
    (extension_dir / "src" / "plugin.py").write_text(
        """from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel

def create_plugin():
    class Plugin:
        def arclayer_register(self, registry):
            registry.services.register("catalog-service", object())
            registry.middlewares.register("catalog-middleware", object())
            registry.providers.register("catalog-provider", object())
            registry.connectors.register(
                extension="catalog-test",
                definition=ConnectorDefinition(
                    key="catalog.test",
                    kind=ConnectorKind.ANALYTICS,
                    version="1.0.0",
                    trust_level=ConnectorTrustLevel.THIRD_PARTY,
                ),
                factory=object,
            )
            registry.content_types.register("catalog-entry", {"key": "catalog-entry"})
    return Plugin()
""",
        encoding="utf-8",
    )


def _build_app(*, manager: ExtensionManager | None, is_super_admin: bool) -> FastAPI:
    app = FastAPI()
    init_exception_handlers(app, Settings(app_env="test"))
    if manager is not None:
        app.state.extension_manager = manager
    app.include_router(system_plugins_router, prefix="/api/v1/system/plugins")

    async def _user_override():
        return SimpleNamespace(is_super_admin=is_super_admin)

    app.dependency_overrides[get_current_user] = _user_override
    if is_super_admin:
        app.dependency_overrides[require_super_admin] = _user_override
    return app


async def test_system_plugins_require_super_admin() -> None:
    app = _build_app(manager=None, is_super_admin=False)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 403
    assert response.json()["error"] == "SUPER_ADMIN_REQUIRED"


async def test_system_plugins_report_unavailable_runtime() -> None:
    app = _build_app(manager=None, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 503
    assert response.json()["error"] == "EXTENSION_RUNTIME_UNAVAILABLE"


async def test_system_plugins_map_runtime_manifest(tmp_path: Path) -> None:
    _write_extension(tmp_path)
    manager = ExtensionManager(tmp_path)
    await manager.load_all()
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    app = _build_app(manager=manager, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 200, response.text
    assert response.json()["data"] == {
        "plugins": [
            {
                "name": "catalog-test",
                "version": "1.2.3",
                "packageState": "installed",
                "processState": "ready",
                "provides": {
                    "services": ["catalog-service"],
                    "middlewares": ["catalog-middleware"],
                    "providers": ["catalog-provider"],
                    "connectors": ["catalog.test"],
                    "contentTypes": ["catalog-entry"],
                },
                "permissions": ["catalog:read"],
                "configSchema": {"enabled": {"type": "boolean"}},
                "admin": {
                    "labelKey": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_NAME",
                    "descriptionKey": "settings:SETTINGS_SYSTEM_PLUGIN_CATALOG_TEST_DESC",
                    "settingsPath": "/system/settings/catalog-test",
                },
                "connectorDefinitions": [
                    {
                        "key": "catalog.test",
                        "kind": "analytics",
                        "version": "1.0.0",
                        "trustLevel": "third_party",
                        "capabilities": [],
                        "configSchema": {},
                        "secretSchema": {},
                        "scopes": [],
                        "webhookEvents": [],
                        "healthContract": [],
                        "admin": None,
                    }
                ],
            }
        ]
    }


async def test_system_plugins_expose_official_posthog_connector() -> None:
    project_root = Path(__file__).resolve().parents[5]
    manager = ExtensionManager(project_root)
    await manager.load_extension(project_root / "plugins" / "arclayer-posthog")
    await manager.register_all(app=None)
    await manager.bootstrap_all(app=None)
    app = _build_app(manager=manager, is_super_admin=True)

    async with asgi_client(app) as client:
        response = await client.get("/api/v1/system/plugins")

    assert response.status_code == 200, response.text
    plugin = response.json()["data"]["plugins"][0]
    assert plugin["name"] == "arclayer-posthog"
    assert plugin["processState"] == "ready"
    assert plugin["provides"]["connectors"] == ["analytics.posthog"]
    assert plugin["connectorDefinitions"][0]["key"] == "analytics.posthog"
    assert plugin["connectorDefinitions"][0]["kind"] == "analytics"
    assert plugin["connectorDefinitions"][0]["trustLevel"] == "official"
