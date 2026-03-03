from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.registry import create_app
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.tokens.service import build_access_token, hash_password
from apps.api.src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


def _set_test_env(monkeypatch, *, base_dir: Path) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-secret")

    monkeypatch.setenv("SETUP__SIGNING_PRIVATE_KEY_PATH", str(base_dir / "signing.ed25519"))
    monkeypatch.setenv("SETUP__SIGNING_PUBLIC_KEY_PATH", str(base_dir / "signing.ed25519.pub"))
    monkeypatch.setenv("SETUP__MASTER_KEY_PATH", str(base_dir / "master.key"))
    # Ensure sys-config revision tests are deterministic and do not depend on repo write permissions.
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(base_dir / "uploads"))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(base_dir / "uploads" / ".tmp"))
    get_settings.cache_clear()


async def _auth_header_for_user(*, settings, user) -> dict[str, str]:
    token, _ttl = build_access_token(
        user_id=user.id, token_version=int(user.token_version or 0), settings=settings.auth
    )
    return {"Authorization": f"Bearer {token}"}


async def test_sys_settings_requires_super_admin_and_step_up(prepared_db, monkeypatch, tmp_path) -> None:
    _ = prepared_db
    _set_test_env(monkeypatch, base_dir=tmp_path)
    settings = get_settings()

    user_repo = UserRepository()

    # Non-super admin.
    normal_user = await user_repo.create_user(
        username=f"user_{uuid4().hex}",
        email=None,
        display_name="User",
        password_hash=hash_password("pass1234", settings.auth),
    )

    # Super admin.
    admin_user = await user_repo.create_user(
        username=f"admin_{uuid4().hex}",
        email=None,
        display_name="Admin",
        password_hash=hash_password("pass1234", settings.auth),
    )
    admin_user.is_super_admin = True
    await admin_user.save(update_fields=["is_super_admin"])

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Normal user cannot access /sys.
            res = await client.get(
                "/api/v1/sys/settings", headers=await _auth_header_for_user(settings=settings, user=normal_user)
            )
            assert res.status_code == 403
            assert res.json().get("error") == "SUPER_ADMIN_REQUIRED"

            # Super admin without step-up token is blocked.
            res = await client.get(
                "/api/v1/sys/settings", headers=await _auth_header_for_user(settings=settings, user=admin_user)
            )
            assert res.status_code == 403
            assert res.json().get("error") == "SYS_STEP_UP_REQUIRED"

            # Step-up issues a sys token.
            res_step = await client.post(
                "/api/v1/sys/auth/step-up",
                json={"password": "pass1234"},
                headers=await _auth_header_for_user(settings=settings, user=admin_user),
            )
            assert res_step.status_code == 200
            step_data = res_step.json().get("data") or {}
            sys_token = step_data.get("token")
            assert isinstance(sys_token, str) and sys_token

            sys_headers = {"Authorization": f"Bearer {sys_token}"}

            # Sys token can access namespaces.
            res = await client.get("/api/v1/sys/settings", headers=sys_headers)
            assert res.status_code == 200
            payload = res.json()
            assert payload.get("error") is None
            items = ((payload.get("data") or {}).get("items")) or []
            namespaces = {i.get("namespace") for i in items if isinstance(i, dict)}
            assert "storage" in namespaces
            assert "mail" in namespaces


async def test_sys_config_revision_flow_with_step_up(prepared_db, monkeypatch, tmp_path) -> None:
    _ = prepared_db
    _set_test_env(monkeypatch, base_dir=tmp_path)
    settings = get_settings()

    user_repo = UserRepository()
    admin_user = await user_repo.create_user(
        username=f"admin_{uuid4().hex}",
        email=None,
        display_name="Admin",
        password_hash=hash_password("pass1234", settings.auth),
    )
    admin_user.is_super_admin = True
    await admin_user.save(update_fields=["is_super_admin"])

    app = create_app()
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res_step = await client.post(
                "/api/v1/sys/auth/step-up",
                json={"password": "pass1234"},
                headers=await _auth_header_for_user(settings=settings, user=admin_user),
            )
            sys_token = (res_step.json().get("data") or {}).get("token")
            assert isinstance(sys_token, str) and sys_token
            sys_headers = {"Authorization": f"Bearer {sys_token}"}

            # Create a revision without activating it (draft).
            res_patch = await client.patch(
                "/api/v1/sys/settings/storage",
                json={"patch": {"storage": {"provider": "local"}}, "activate": False},
                headers=sys_headers,
            )
            assert res_patch.status_code == 200
            patch_data = res_patch.json().get("data") or {}
            rev_id = patch_data.get("revisionId")
            assert isinstance(rev_id, str) and rev_id

            # Revisions list should include the newly created revision.
            res_revs = await client.get("/api/v1/sys/settings/storage/revisions?page=1&size=20", headers=sys_headers)
            assert res_revs.status_code == 200
            items = ((res_revs.json().get("data") or {}).get("items")) or []
            assert any(i.get("id") == rev_id for i in items)

            # Test the revision before activation.
            res_test = await client.post(
                "/api/v1/sys/settings/storage/test", json={"revisionId": rev_id}, headers=sys_headers
            )
            assert res_test.status_code == 200
            assert (res_test.json().get("data") or {}).get("ok") is True

            # Activate the revision.
            res_activate = await client.post(
                "/api/v1/sys/settings/storage/activate",
                json={"revisionId": rev_id},
                headers=sys_headers,
            )
            assert res_activate.status_code == 200
            active_id = (res_activate.json().get("data") or {}).get("activeRevisionId")
            assert active_id == rev_id

            # Legacy runtime store should be updated for compatibility.
            record = await SettingRecord.get_or_none(
                scope_type=SCOPE_TYPE_SYSTEM,
                scope_id=SYSTEM_SCOPE_ID,
                namespace=CORE_SETTINGS_NAMESPACE,
            )
            assert record is not None
            assert isinstance(record.value, dict)
            storage = record.value.get("storage")
            assert isinstance(storage, dict)
            assert storage.get("provider") == "local"

            # New revision detail endpoint should work and should not leak secrets.
            res_detail = await client.get(f"/api/v1/sys/settings/storage/revisions/{rev_id}", headers=sys_headers)
            assert res_detail.status_code == 200
            detail = res_detail.json().get("data") or {}
            assert detail.get("namespace") == "storage"
            assert detail.get("id") == rev_id
            assert isinstance(detail.get("value"), dict)
            assert isinstance(detail.get("secrets"), dict)
