from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.infra.storage.local import safe_object_key_to_path
from apps.api.src.models.assets.asset import AssetPurpose, AssetRecord, AssetVisibility
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.user import User
from apps.api.src.models.sites.site import SiteRecord
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.assets.naming.service import build_asset_object_key
from apps.api.src.modules.auth.http.service import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.tokens.service import hash_password

pytestmark = pytest.mark.integration


def _write_theme_zip(path: Path) -> bytes:
    manifest = {
        "themeId": "@arclayer/theme-modern",
        "name": "Modern",
        "version": "0.1.0",
        "entrypoints": {"tokensCss": "styles/tokens.css"},
        "variants": [
            {"variantId": "home-a", "name": "Home A", "path": "variants/home.json"},
        ],
        "presets": [],
    }
    variant = {
        "pageBlueprint": {
            "version": 1,
            "rootId": "page",
            "nodesById": {
                "page": {
                    "id": "page",
                    "type": "page_root",
                    "name": "Page",
                    "children": ["h1"],
                    "seo": {"title": {"en-US": "Hi"}},
                    "layout": {
                        "children": {
                            "mode": "auto",
                            "direction": "column",
                            "gap": 0,
                            "padding": 0,
                            "alignItems": "start",
                            "justifyContent": "start",
                            "wrap": "nowrap",
                        }
                    },
                },
                "h1": {
                    "id": "h1",
                    "type": "text",
                    "name": "Title",
                    "text": {"en-US": "Hi"},
                    "tag": "h1",
                    "layout": {
                        "self": {
                            "rect": {"x": 0, "y": 0, "width": 720, "height": 0},
                            "alignX": "start",
                            "alignY": "start",
                        },
                        "children": {"mode": "absolute"},
                    },
                    "style": {"typography": {"fontSize": 32, "lineHeight": 40, "fontWeight": 700}},
                },
            },
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
        from apps.api.src.modules.organization.repository import OrganizationRepository

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_password_123", settings.auth),
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")

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
            ws_pid = encode_uuid(ws.id)
            site_pid = encode_uuid(site.id)
            zip_asset_pid = encode_uuid(zip_asset_id)

            # Import theme package from uploaded zip asset.
            resp = await client.post(
                f"/api/v1/workspaces/{ws_pid}/themes/import",
                json={"assetId": zip_asset_pid},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            assert data["themeId"] == "@arclayer/theme-modern"
            assert data["version"] == "0.1.0"
            assert isinstance(data["tokensCssAssetId"], str) and data["tokensCssAssetId"]

            # Create preview token so we can write site settings.
            resp = await client.post(f"/api/v1/sites/{site_pid}/preview-tokens", json={"ttlSeconds": 600})
            assert resp.status_code == 201, resp.text
            token = resp.json()["data"]["token"]

            # Bind theme to site via SiteSettings namespaces.
            resp = await client.put(
                f"/api/v1/sites/{site_pid}/settings",
                params={"namespace": "theme.active", "token": token},
                json={"value": {"themeId": "@arclayer/theme-modern", "version": "0.1.0"}},
            )
            assert resp.status_code == 200, resp.text

            resp = await client.put(
                f"/api/v1/sites/{site_pid}/settings",
                params={"namespace": "theme.vars", "token": token},
                json={"value": {"cssVars": {"--color-primary": "#123456"}}},
            )
            assert resp.status_code == 200, resp.text

            resp = await client.put(
                f"/api/v1/sites/{site_pid}/settings",
                params={"namespace": "theme.config", "token": token},
                json={"value": {"secretToken": "should-not-leak", "radius": 12}},
            )
            assert resp.status_code == 200, resp.text

            # Runtime should include theme metadata + entrypoint URLs.
            resp = await client.get(f"/api/v1/sites/{site_pid}/runtime", params={"mode": "public"})
            assert resp.status_code == 200, resp.text
            runtime = resp.json()["data"]
            theme = runtime["theme"]
            assert theme["themeId"] == "@arclayer/theme-modern"
            assert theme["version"] == "0.1.0"
            assert theme["cssVars"]["--color-primary"] == "#123456"
            assert isinstance(theme.get("tokensCssUrl"), str) and theme["tokensCssUrl"].startswith("/assets/")
            assert theme["tokensCssUrl"].endswith(".css")
            assert theme.get("config") is None

            # Preview runtime can include theme.config (permission-protected by preview token).
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/runtime",
                params={"mode": "preview", "token": token},
            )
            assert resp.status_code == 200, resp.text
            runtime = resp.json()["data"]
            theme = runtime["theme"]
            assert isinstance(theme.get("config"), dict)
            assert theme["config"]["secretToken"] == "should-not-leak"
