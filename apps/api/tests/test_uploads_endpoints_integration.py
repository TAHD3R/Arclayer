from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.authz import AUTHZ_EXTENSION_POINT
from apps.api.core.registry import create_app
from apps.api.plugin.registry import registry
from apps.api.routers.v1.auth.deps import get_current_user

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_uploads_resumable_flow(prepared_db, plugin_root, tmp_path: Path, monkeypatch) -> None:
    """
    Minimal resumable upload flow:
    - init -> status (missing) -> put part(s) -> status -> complete -> idempotent complete
    """

    _ = prepared_db
    _ = plugin_root

    # Isolate storage under test temp dir (no writes to repo data/).
    root = tmp_path / "uploads"
    tmp = tmp_path / "uploads_tmp"
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(root))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp))
    monkeypatch.setenv("STORAGE__UPLOAD_CHUNK_SIZE_MB", "1")  # 1MiB so we can test multipart.
    monkeypatch.setenv("STORAGE__UPLOAD_MAX_FILE_SIZE_MB", "10")

    # Settings are cached via lru_cache; clear to make env overrides effective in this test run.
    get_settings.cache_clear()

    app = create_app()

    from apps.api.core.rbac.constants import CORE_PERMISSION_OWNER
    from apps.api.core.rbac.engine import RBACAuthorizationEngine

    prev = registry.get_extension(AUTHZ_EXTENSION_POINT)
    registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, _AllowAllEngine())

    transport = ASGITransport(app=app)
    try:
        async with app.router.lifespan_context(app):
            from apps.api.core.organization.repository import OrganizationRepository
            from apps.api.routers.v1.auth.repository import UserRepository
            from apps.api.routers.v1.auth.security import hash_password

            settings = get_settings()
            user_repo = UserRepository()
            org_repo = OrganizationRepository()

            user = await user_repo.create_user(
                username=f"u_{uuid4().hex}",
                email=None,
                display_name="U",
                password_hash=hash_password("password_123", settings.auth),
            )
            org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
            await org_repo.ensure_membership(user_id=user.id, organization_id=org.id)

            async def _fake_user():
                return SimpleNamespace(id=user.id)

            app.dependency_overrides[get_current_user] = _fake_user

            # Prepare a 2-part payload: 1MiB + 3 bytes.
            part1 = b"a" * (1024 * 1024)
            part2 = b"xyz"
            total = len(part1) + len(part2)

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                init = await client.post(
                    "/api/v1/admin/uploads/init",
                    headers={"X-Org-Id": str(org.id)},
                    json={
                        "purpose": "avatar",
                        "filename": "demo.png",
                        "mime": "image/png",
                        "sizeBytes": total,
                    },
                )
                assert init.status_code == 200
                upload = init.json()["data"]
                upload_id = upload["uploadId"]
                assert upload["chunkSize"] == 1024 * 1024
                assert upload["totalParts"] == 2

                status = await client.get(
                    f"/api/v1/admin/uploads/{upload_id}",
                    headers={"X-Org-Id": str(org.id)},
                )
                assert status.status_code == 200
                assert status.json()["data"]["missingParts"] == [1, 2]

                resp = await client.put(
                    f"/api/v1/admin/uploads/{upload_id}/parts/1",
                    headers={"X-Org-Id": str(org.id), "Content-Length": str(len(part1))},
                    content=part1,
                )
                assert resp.status_code == 200

                status = await client.get(
                    f"/api/v1/admin/uploads/{upload_id}",
                    headers={"X-Org-Id": str(org.id)},
                )
                assert status.status_code == 200
                assert status.json()["data"]["missingParts"] == [2]

                resp = await client.put(
                    f"/api/v1/admin/uploads/{upload_id}/parts/2",
                    headers={"X-Org-Id": str(org.id), "Content-Length": str(len(part2))},
                    content=part2,
                )
                assert resp.status_code == 200

                complete = await client.post(
                    f"/api/v1/admin/uploads/{upload_id}/complete",
                    headers={"X-Org-Id": str(org.id)},
                )
                assert complete.status_code == 200
                asset_id = complete.json()["data"]["assetId"]

                # Idempotent complete returns the same asset id.
                complete2 = await client.post(
                    f"/api/v1/admin/uploads/{upload_id}/complete",
                    headers={"X-Org-Id": str(org.id)},
                )
                assert complete2.status_code == 200
                assert complete2.json()["data"]["assetId"] == asset_id

            # Verify file content on disk (local provider).
            from uuid import UUID

            from apps.api.common.utils.assets import build_asset_object_key
            from apps.api.infra.storage.local import safe_object_key_to_path

            key = build_asset_object_key(org_id=org.id, asset_id=UUID(asset_id), ext="png")
            out_path = safe_object_key_to_path(root, key)
            assert out_path.is_file()
            assert out_path.read_bytes() == part1 + part2
    finally:
        if prev is None:
            registry.unregister_extensions(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT)
        else:
            registry.register_extension(CORE_PERMISSION_OWNER, AUTHZ_EXTENSION_POINT, prev or RBACAuthorizationEngine())


class _AllowAllEngine:
    async def has_permission(self, user_id, permission: str) -> bool:  # pragma: no cover
        return True
