from __future__ import annotations

import textwrap
import zipfile
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.registry import create_app
from apps.api.plugin.registry import registry
from apps.api.routers.v1.auth.deps import get_current_user

pytestmark = pytest.mark.integration


def _build_demo_plugin_zip(tmp_path: Path, plugin_id: str) -> Path:
    payload_dir = tmp_path / "payload"
    package_name = f"pkg_{plugin_id.replace('-', '_').replace('.', '_')}"
    package_dir = payload_dir / package_name
    package_dir.mkdir(parents=True, exist_ok=True)
    (package_dir / "__init__.py").write_text("", encoding="utf-8")
    (package_dir / "plugin.py").write_text(
        textwrap.dedent(
            """
            from apps.api.plugin.types import BasePlugin


            class DemoPlugin(BasePlugin):
                async def on_start(self) -> None:
                    return None

                async def on_stop(self) -> None:
                    return None
            """
        ).lstrip(),
        encoding="utf-8",
    )

    (payload_dir / "plugin.toml").write_text(
        textwrap
        .dedent(
            """
            [plugin]
            id = "{plugin_id}"
            name = "Demo Plugin"
            description = "Demo plugin for endpoints"
            author = "Test"
            version = "0.1.0"
            requires = ">=2026.01.18-dev"
            entrypoint = "{package_name}.plugin:DemoPlugin"

            [config_schema]

            [[config_schema.sections]]
            id = "general"
            title = "General"

            [[config_schema.sections.fields]]
            key = "enabled"
            type = "bool"
            default = false
            label = "Enabled"

            [[config_schema.sections.fields]]
            key = "mode"
            type = "str"
            default = "off"
            label = "Mode"
            """
        )
        .format(plugin_id=plugin_id, package_name=package_name)
        .lstrip(),
        encoding="utf-8",
    )

    zip_path = tmp_path / "demo.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in payload_dir.rglob("*"):
            archive.write(path, path.relative_to(payload_dir))
    return zip_path


async def _fake_user():
    return SimpleNamespace(id=uuid4())


async def test_plugin_management_flow(prepared_db, plugin_root, tmp_path) -> None:
    _ = prepared_db
    plugin_id = f"demo_{uuid4().hex}"
    zip_path = _build_demo_plugin_zip(tmp_path, plugin_id)

    app = create_app()
    app.dependency_overrides[get_current_user] = _fake_user
    registry.register_extension("test", AUTHZ_EXTENSION_POINT, _AllowAllEngine())

    transport = ASGITransport(app=app)
    try:
        async with app.router.lifespan_context(app):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                files = {"file": ("demo.zip", zip_path.read_bytes(), "application/zip")}
                response = await client.post(
                    "/api/v1/admin/plugins/install",
                    data={"enable": "false"},
                    files=files,
                )
                assert response.status_code == 200
                payload = response.json()
                assert payload["data"]["plugin"]["pluginId"] == plugin_id
                assert payload["data"]["plugin"]["status"] == "disabled"

                response = await client.get("/api/v1/admin/plugins")
                assert response.status_code == 200
                items = response.json()["data"]
                assert any(item["pluginId"] == plugin_id for item in items)

                response = await client.get(f"/api/v1/admin/plugins/{plugin_id}")
                assert response.status_code == 200
                detail = response.json()["data"]
                assert detail["pluginId"] == plugin_id
                assert detail["status"] == "disabled"

                response = await client.post(f"/api/v1/admin/plugins/{plugin_id}/enable")
                assert response.status_code == 200
                assert response.json()["data"]["status"] == "started"

                response = await client.put(
                    f"/api/v1/admin/plugins/{plugin_id}/config",
                    json={"config": {"general": {"enabled": True, "mode": "on"}}},
                )
                assert response.status_code == 200
                config = response.json()["data"]["plugin"]["config"]
                assert config["general"]["enabled"] is True
                assert config["general"]["mode"] == "on"

                response = await client.post(f"/api/v1/admin/plugins/{plugin_id}/disable")
                assert response.status_code == 200
                assert response.json()["data"]["status"] == "disabled"

                response = await client.post(f"/api/v1/admin/plugins/{plugin_id}/uninstall")
                assert response.status_code == 200
                assert response.json()["data"]["status"] == "disabled"
    finally:
        registry.unregister_extensions("test", AUTHZ_EXTENSION_POINT)


class _AllowAllEngine:
    async def has_permission(self, user_id, permission: str) -> bool:
        return True
