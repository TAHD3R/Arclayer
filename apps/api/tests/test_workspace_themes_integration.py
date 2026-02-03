from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.utils.assets import build_asset_object_key
from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.infra.db.orm import verify_db_ready
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.models.asset import AssetPurpose, AssetRecord, AssetVisibility
from apps.api.models.org_membership import OrgMembership
from apps.api.models.site import SiteRecord
from apps.api.models.user import User
from apps.api.models.workspace import Workspace
from apps.api.routers.v1.auth.deps import get_current_user, get_current_user_id
from apps.api.routers.v1.auth.repository import UserRepository
from apps.api.routers.v1.auth.security import hash_password

pytestmark = pytest.mark.integration


def _write_theme_zip(path: Path) -> bytes:
    manifest = {
        "themeId": "@celestial/theme-modern",
        "name": "Modern",
        "version": "0.1.0",
        "entrypoints": {"tokensCss": "styles/tokens.css"},
        "variants": [
            {"variantId": "home-a", "name": "Home A", "path": "variants/home.json"},
        ],
        "presets": [],
    }
    variant = {
        "document": {
            "version": 1,
            "blocks": [
                {
                    "id": "root",
                    "type": "container",
                    "props": {"as": "section"},
                    "children": [{"id": "h1", "type": "heading", "props": {"level": 1, "text": {"en-US": "Hi"}}}],
                }
            ],
        }
    }

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr("styles/tokens.css", ":root{--color-primary:#1677ff;}")
        zf.writestr("variants/home.json", json.dumps(variant))

    data = path.read_bytes()
    return data


@pytest.mark.asyncio
async def test_workspace_theme_import_and_site_runtime_output(
    prepared_db, integration_valkey_settings, tmp_path: Path, monkeypatch
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    # Isolate storage under test temp dir (no writes to repo data/).
    root = tmp_path / "uploads"
    tmp = tmp_path / "uploads_tmp"
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp))
    monkeypatch.setenv("STORAGE__UPLOAD_MAX_FILE_SIZE_MB", "10")
    get_settings.cache_clear()

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        settings = get_settings()
        await verify_db_ready(settings)

        # Bootstrap org/workspace/user (creator-admin path) so workspace RBAC grants work.
        from apps.api.core.organization.repository import OrganizationRepository

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, is_owner=True, status="active")

        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        site = await SiteRecord.create(
            workspace_id=ws.id,
            slug=f"site_{uuid4().hex[:8]}",
            name="Site",
            primary_host=f"{uuid4().hex[:8]}.example.test",
            is_active=True,
            created_by_user_id=owner.id,
        )

        current_user: User | None = owner

        async def _get_user():
            assert current_user is not None
            return current_user

        async def _get_user_id():
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        # Create a zip Asset that points to a real file under the configured local root.
        zip_asset_id = uuid4()
        object_key = build_asset_object_key(workspace_id=ws.id, asset_id=zip_asset_id, ext="zip")
        zip_path = safe_object_key_to_path(root, object_key)
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        zip_bytes = _write_theme_zip(zip_path)
        checksum = hashlib.sha256(zip_bytes).hexdigest()

        await AssetRecord.create(
            id=zip_asset_id,
            workspace_id=ws.id,
            owner_user_id=owner.id,
            purpose=AssetPurpose.LIBRARY,
            visibility=AssetVisibility.PRIVATE,
            indexable=False,
            title="theme.zip",
            slug="theme",
            original_filename="theme.zip",
            mime="application/zip",
            ext="zip",
            size_bytes=len(zip_bytes),
            checksum_sha256=checksum,
            storage_provider="local",
            object_key=object_key,
            variants=None,
            meta={"kind": "test_theme_package"},
            deleted_at=None,
        )

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Import theme package from uploaded zip asset.
            resp = await client.post(
                f"/api/v1/workspaces/{ws.id}/themes/import",
                json={"assetId": str(zip_asset_id)},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["themeId"] == "@celestial/theme-modern"
            assert data["version"] == "0.1.0"
            assert isinstance(data["tokensCssAssetId"], str) and data["tokensCssAssetId"]

            # Create preview token so we can write site settings.
            resp = await client.post(f"/api/v1/sites/{site.id}/preview-tokens", json={"ttl_seconds": 600})
            assert resp.status_code == 201, resp.text
            token = resp.json()["data"]["token"]

            # Bind theme to site via SiteSettings namespaces.
            resp = await client.put(
                f"/api/v1/sites/{site.id}/settings",
                params={"namespace": "theme.active", "token": token},
                json={"value": {"themeId": "@celestial/theme-modern", "version": "0.1.0"}},
            )
            assert resp.status_code == 200, resp.text

            resp = await client.put(
                f"/api/v1/sites/{site.id}/settings",
                params={"namespace": "theme.vars", "token": token},
                json={"value": {"cssVars": {"--color-primary": "#123456"}}},
            )
            assert resp.status_code == 200, resp.text

            # Runtime should include theme metadata + entrypoint URLs.
            resp = await client.get(f"/api/v1/sites/{site.id}/runtime", params={"mode": "public"})
            assert resp.status_code == 200, resp.text
            runtime = resp.json()["data"]
            theme = runtime["theme"]
            assert theme["themeId"] == "@celestial/theme-modern"
            assert theme["version"] == "0.1.0"
            assert theme["cssVars"]["--color-primary"] == "#123456"
            assert isinstance(theme.get("tokensCssUrl"), str) and theme["tokensCssUrl"].startswith("/assets/")
            assert theme["tokensCssUrl"].endswith(".css")
