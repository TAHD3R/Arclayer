from __future__ import annotations

import textwrap
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.registry import create_app
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.auth.http.service import get_current_user_id

pytestmark = pytest.mark.integration


def _build_demo_plugin_zip(tmp_path: Path, plugin_id: str) -> Path:
    payload_dir = tmp_path / "payload"
    package_name = f"pkg_{plugin_id.replace('-', '_').replace('.', '_')}"
    slug = plugin_id.replace(".", "-").replace("_", "-").lower()
    package_dir = payload_dir / package_name
    package_dir.mkdir(parents=True, exist_ok=True)
    (package_dir / "__init__.py").write_text("", encoding="utf-8")
    (package_dir / "plugin.py").write_text(
        textwrap.dedent(
            """
            from apps.api.src.plugin.types import BasePlugin


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
            slug = "{slug}"
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
        .format(plugin_id=plugin_id, slug=slug, package_name=package_name)
        .lstrip(),
        encoding="utf-8",
    )

    zip_path = tmp_path / "demo.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in payload_dir.rglob("*"):
            archive.write(path, path.relative_to(payload_dir))
    return zip_path


async def test_plugin_management_flow(prepared_db, plugin_root, tmp_path) -> None:
    _ = prepared_db
    plugin_id = f"demo-{uuid4().hex}"
    zip_path = _build_demo_plugin_zip(tmp_path, plugin_id)

    app = create_app()

    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        from apps.api.src.modules.auth.repository import UserRepository
        from apps.api.src.modules.auth.tokens.service import hash_password
        from apps.api.src.modules.organization.repository import OrganizationRepository

        settings = get_settings()
        user_repo = UserRepository()
        org_repo = OrganizationRepository()

        user = await user_repo.create_user(
            username=f"admin_{uuid4().hex}",
            email="owner@example.com",
            display_name="Admin",
            password_hash=hash_password("admin_password_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")

        async def _fake_user_id():
            return user.id

        app.dependency_overrides[get_current_user_id] = _fake_user_id

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            files = {"file": ("demo.zip", zip_path.read_bytes(), "application/zip")}
            response = await client.post(
                "/api/v1/system/plugins-manager/install",
                data={"enable": "false"},
                files=files,
            )
            assert response.status_code == 200
            payload = response.json()
            assert payload["data"]["plugin"]["pluginId"] == plugin_id
            assert payload["data"]["plugin"]["slug"] == plugin_id.lower()
            assert payload["data"]["plugin"]["status"] == "disabled"

            response = await client.get("/api/v1/system/plugins-manager")
            assert response.status_code == 200
            page = response.json()["data"]
            items = page["items"]
            assert any(item["pluginId"] == plugin_id for item in items)

            response = await client.get(f"/api/v1/system/plugins-manager/{plugin_id}")
            assert response.status_code == 200
            detail = response.json()["data"]
            assert detail["pluginId"] == plugin_id
            slug = plugin_id.replace(".", "-").replace("_", "-").lower()
            assert detail["slug"] == slug
            assert detail["status"] == "disabled"

            # Management endpoints accept both plugin id and slug as identifier.
            response = await client.post(f"/api/v1/system/plugins-manager/{slug}/enable")
            assert response.status_code == 200
            assert response.json()["data"]["status"] == "started"

            response = await client.put(
                f"/api/v1/system/plugins-manager/{plugin_id}/config",
                json={"config": {"general": {"enabled": True, "mode": "on"}}},
            )
            assert response.status_code == 200
            config = response.json()["data"]["plugin"]["config"]
            assert config["general"]["enabled"] is True
            assert config["general"]["mode"] == "on"

            response = await client.post(f"/api/v1/system/plugins-manager/{plugin_id}/disable")
            assert response.status_code == 200
            assert response.json()["data"]["status"] == "disabled"

            response = await client.post(f"/api/v1/system/plugins-manager/{plugin_id}/uninstall")
            assert response.status_code == 200
            assert response.json()["data"]["status"] == "disabled"
