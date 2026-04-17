from __future__ import annotations

import pytest

from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _personal_payload() -> dict:
    return {
        "name": "CLI Personal Key",
        "description": "Used by local scripts",
        "scopes": ["content.read", "settings.read"],
    }


def _workspace_payload() -> dict:
    return {
        "family": "workspace_service",
        "name": "Deploy Worker",
        "description": "Used by deployment worker",
        "scopes": ["content.read", "content.write", "keys.read"],
    }


@pytest.mark.asyncio
async def test_personal_api_key_management_flow(
    monkeypatch, tmp_path, prepared_db, integration_valkey_settings
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id):
        create_res = await client.post("/api/v1/me/api-keys", json=_personal_payload())
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()["data"]
        key_id = created["key"]["id"]
        assert created["secretToken"].startswith("ark_mgmt_")
        assert created["key"]["family"] == "personal_management"

        list_res = await client.get("/api/v1/me/api-keys")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["id"] == key_id
        assert "secretToken" not in items[0]

        detail_res = await client.get(f"/api/v1/me/api-keys/{key_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["tokenMask"].startswith("ark_mgmt_")

        rotate_res = await client.post(f"/api/v1/me/api-keys/{key_id}/rotate")
        assert rotate_res.status_code == 200, rotate_res.text
        rotated = rotate_res.json()["data"]
        assert rotated["key"]["id"] == key_id
        assert rotated["secretToken"].startswith("ark_mgmt_")
        assert rotated["key"]["tokenPublicId"] != created["key"]["tokenPublicId"]

        revoke_res = await client.post(f"/api/v1/me/api-keys/{key_id}/revoke")
        assert revoke_res.status_code == 200, revoke_res.text
        assert revoke_res.json()["data"]["revokedAt"] is not None

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_workspace_api_key_management_flow(
    monkeypatch, tmp_path, prepared_db, integration_valkey_settings
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_res = await client.post(f"/api/v1/workspaces/{workspace_id}/api-keys", json=_workspace_payload())
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()["data"]
        key_id = created["key"]["id"]
        assert created["secretToken"].startswith("ark_ws_")
        assert created["key"]["family"] == "workspace_service"
        assert created["key"]["workspaceId"] == workspace_id

        list_res = await client.get(f"/api/v1/workspaces/{workspace_id}/api-keys")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        assert len(items) == 1
        assert items[0]["id"] == key_id

        detail_res = await client.get(f"/api/v1/workspaces/{workspace_id}/api-keys/{key_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["tokenMask"].startswith("ark_ws_")

        rotate_res = await client.post(f"/api/v1/workspaces/{workspace_id}/api-keys/{key_id}/rotate")
        assert rotate_res.status_code == 200, rotate_res.text
        rotated = rotate_res.json()["data"]
        assert rotated["key"]["id"] == key_id
        assert rotated["secretToken"].startswith("ark_ws_")

        revoke_res = await client.post(f"/api/v1/workspaces/{workspace_id}/api-keys/{key_id}/revoke")
        assert revoke_res.status_code == 200, revoke_res.text
        assert revoke_res.json()["data"]["revokedAt"] is not None

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_workspace_delivery_key_requires_delivery_scope_and_perspective(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        missing_perspective_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview Runtime",
                "scopes": ["delivery.read"],
            },
        )
        assert missing_perspective_res.status_code == 400, missing_perspective_res.text
        assert missing_perspective_res.json()["error"] == "DELIVERY_KEY_PERSPECTIVE_REQUIRED"

        valid_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/api-keys",
            json={
                "family": "delivery",
                "name": "Preview Runtime",
                "scopes": ["delivery.read", "graphql.read"],
                "deliveryPerspective": "preview",
            },
        )
        assert valid_res.status_code == 200, valid_res.text
        created = valid_res.json()["data"]
        assert created["secretToken"].startswith("ark_deliv_")
        assert created["key"]["deliveryPerspective"] == "preview"

    get_settings.cache_clear()
