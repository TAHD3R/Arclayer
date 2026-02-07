from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.common.utils.public_ids import decode_public_id, encode_uuid
from apps.api.config import get_settings
from apps.api.core.registry import create_app
from apps.api.modules.auth.deps import get_current_user

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

    transport = ASGITransport(app=app)
    async with app.router.lifespan_context(app):
        from apps.api.modules.auth.repository import UserRepository
        from apps.api.modules.auth.security import hash_password
        from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
        from apps.api.modules.organization.repository import OrganizationRepository
        from apps.api.modules.workspaces.models.workspace import Workspace

        settings = get_settings()
        user_repo = UserRepository()
        org_repo = OrganizationRepository()

        user = await user_repo.create_user(
            username=f"u_{uuid4().hex}",
            email="owner@example.com",
            display_name="U",
            password_hash=hash_password("password_123", settings.auth),
        )
        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug=f"ws_{uuid4().hex[:8]}",
            name="Site",
            is_active=True,
            created_by_user_id=user.id,
        )

        async def _fake_user():
            return SimpleNamespace(id=user.id)

        app.dependency_overrides[get_current_user] = _fake_user
        ws_pid = encode_uuid(ws.id)

        # Prepare a 2-part payload: 1MiB + 3 bytes.
        part1 = b"a" * (1024 * 1024)
        part2 = b"xyz"
        total = len(part1) + len(part2)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            init = await client.post(
                f"/api/v1/workspaces/{ws_pid}/uploads/init",
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

            status = await client.get(f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}")
            assert status.status_code == 200
            assert status.json()["data"]["missingParts"] == [1, 2]

            resp = await client.put(
                f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}/parts/1",
                headers={"Content-Length": str(len(part1))},
                content=part1,
            )
            assert resp.status_code == 200

            status = await client.get(f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}")
            assert status.status_code == 200
            assert status.json()["data"]["missingParts"] == [2]

            resp = await client.put(
                f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}/parts/2",
                headers={"Content-Length": str(len(part2))},
                content=part2,
            )
            assert resp.status_code == 200

            complete = await client.post(f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}/complete")
            assert complete.status_code == 200
            asset_pid = complete.json()["data"]["assetId"]
            asset_uuid = decode_public_id(asset_pid)

            # Idempotent complete returns the same asset id.
            complete2 = await client.post(f"/api/v1/workspaces/{ws_pid}/uploads/{upload_id}/complete")
            assert complete2.status_code == 200
            assert complete2.json()["data"]["assetId"] == asset_pid

        # Verify the created asset records uploader.
        from apps.api.modules.assets.models.asset import AssetRecord

        asset = await AssetRecord.get_or_none(id=asset_uuid)
        assert asset is not None
        assert asset.owner_user_id == user.id

        # Verify file content on disk (local provider).
        from apps.api.infra.storage.local import safe_object_key_to_path
        from apps.api.modules.assets.utils import build_asset_object_key

        key = build_asset_object_key(workspace_id=ws.id, asset_id=asset_uuid, ext="png")
        out_path = safe_object_key_to_path(root, key)
        assert out_path.is_file()
        assert out_path.read_bytes() == part1 + part2
