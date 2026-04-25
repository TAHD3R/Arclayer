from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.models.system.setting import SettingRecord
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.router import router as system_router
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_storage_profiles_crud_and_runtime_reference(prepared_db, tmp_path, monkeypatch) -> None:
    _ = prepared_db
    monkeypatch.setenv("STORAGE__LOCAL_ROOT_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("STORAGE__LOCAL_TMP_DIR", str(tmp_path / ".tmp"))
    get_settings.cache_clear()

    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    async def _super_admin():
        return SimpleNamespace(id=SYSTEM_SCOPE_ID, is_super_admin=True)

    app.dependency_overrides[get_current_user] = _super_admin
    app.dependency_overrides[require_super_admin] = _super_admin

    async with asgi_client(app) as client:
        create = await client.post(
            "/api/v1/system/storage-profiles",
            json={
                "profileKey": "local-main",
                "provider": "local",
                "displayName": "Local Main",
                "config": {
                    "publicDeliveryMode": "auto",
                    "publicBaseUrl": "https://cdn.example.com",
                },
                "isActive": True,
                "isDefault": True,
            },
        )
        assert create.status_code == 200
        created = create.json()["data"]
        assert created["profileKey"] == "local-main"
        assert created["isDefault"] is True
        profile_id = created["id"]

        listed = await client.get("/api/v1/system/storage-profiles")
        assert listed.status_code == 200
        items = listed.json()["data"]["items"]
        assert any(item["profileKey"] == "local-main" for item in items)

        patched = await client.patch(
            f"/api/v1/system/storage-profiles/{profile_id}",
            json={
                "displayName": "Local Primary",
                "config": {
                    "publicDeliveryMode": "direct",
                    "publicBaseUrl": "https://cdn-2.example.com",
                    "secretAccessKey": "hidden-value",
                },
            },
        )
        assert patched.status_code == 200
        patched_data = patched.json()["data"]
        assert patched_data["displayName"] == "Local Primary"
        assert patched_data["config"]["publicDeliveryMode"] == "direct"
        assert patched_data["secrets"]["secretAccessKey"] is True

        tested = await client.post(f"/api/v1/system/storage-profiles/{profile_id}/test")
        assert tested.status_code == 200
        assert tested.json()["data"]["ok"] is True

        blocked = await client.delete(f"/api/v1/system/storage-profiles/{profile_id}")
        assert blocked.status_code == 400
        assert blocked.json()["error"] == "STORAGE_PROFILE_IN_USE"

        runtime_record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        assert runtime_record is not None
        assert runtime_record.value["storage"]["default_profile_key"] == "local-main"

        cleared = await client.patch(
            f"/api/v1/system/storage-profiles/{profile_id}",
            json={"isDefault": False},
        )
        assert cleared.status_code == 200

        deleted = await client.delete(f"/api/v1/system/storage-profiles/{profile_id}")
        assert deleted.status_code == 200
        assert deleted.json()["data"]["deleted"] is True
