from __future__ import annotations

import pytest

from src.models.system.setting import SettingRecord
from src.settings.scopes import SCOPE_TYPE_USER, SCOPE_TYPE_WORKSPACE
from tests.modules.workspaces.content.test_content_models_integration import (
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _view_payload(name: str, *, visibility: str, pinned: bool = False, is_default: bool = False) -> dict:
    return {
        "name": name,
        "baseViewId": "draft",
        "query": "home",
        "filters": {"status": "draft", "role": "page"},
        "sorting": [{"id": "updatedAt", "desc": True}],
        "viewMode": "table",
        "columns": {
            "visibility": {"status": True, "locale": False},
            "order": ["name", "status", "updatedAt"],
            "rowHeight": "medium",
            "wrapHeaders": False,
        },
        "visibility": visibility,
        "pinned": pinned,
        "isDefault": is_default,
    }


@pytest.mark.asyncio
async def test_content_library_views_persist_private_and_workspace_state(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        empty_res = await client.get(f"/api/v1/workspaces/{workspace_id}/content/library/views")
        assert empty_res.status_code == 200, empty_res.text
        assert empty_res.json()["data"]["items"] == []
        assert empty_res.json()["data"].get("defaultViewId") is None

        private_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/library/views",
            json=_view_payload("Editorial queue", visibility="private", pinned=True, is_default=True),
        )
        assert private_res.status_code == 201, private_res.text
        private_payload = private_res.json()["data"]
        assert private_payload["defaultViewId"] is not None
        assert private_payload["items"] == [
            {
                "id": private_payload["defaultViewId"],
                "name": "Editorial queue",
                "baseViewId": "draft",
                "query": "home",
                "filters": {"status": "draft", "role": "page"},
                "sorting": [{"id": "updatedAt", "desc": True}],
                "viewMode": "table",
                "columns": {
                    "visibility": {"status": True, "locale": False},
                    "order": ["name", "status", "updatedAt"],
                    "rowHeight": "medium",
                    "wrapHeaders": False,
                },
                "visibility": "private",
                "pinned": True,
                "isDefault": True,
            }
        ]

        shared_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/library/views",
            json=_view_payload("Shared launch queue", visibility="workspace"),
        )
        assert shared_res.status_code == 201, shared_res.text
        shared_payload = shared_res.json()["data"]
        assert [item["visibility"] for item in shared_payload["items"]] == ["workspace", "private"]
        shared_view_id = shared_payload["items"][0]["id"]
        private_view_id = shared_payload["items"][1]["id"]

        rename_private_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/library/views/{private_view_id}",
            json={"name": "My editorial queue", "pinned": False},
        )
        assert rename_private_res.status_code == 200, rename_private_res.text
        renamed_private = rename_private_res.json()["data"]["items"][1]
        assert renamed_private["name"] == "My editorial queue"
        assert renamed_private["pinned"] is False
        assert renamed_private["isDefault"] is True

        rename_shared_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/library/views/{shared_view_id}",
            json={"name": "Shared launch board", "pinned": True},
        )
        assert rename_shared_res.status_code == 200, rename_shared_res.text
        renamed_shared = rename_shared_res.json()["data"]["items"][0]
        assert renamed_shared["name"] == "Shared launch board"
        assert renamed_shared["pinned"] is True

        delete_private_res = await client.delete(
            f"/api/v1/workspaces/{workspace_id}/content/library/views/{private_view_id}",
        )
        assert delete_private_res.status_code == 200, delete_private_res.text
        deleted_payload = delete_private_res.json()["data"]
        assert deleted_payload["defaultViewId"] == shared_view_id
        assert deleted_payload["items"] == [
            {
                "id": shared_view_id,
                "name": "Shared launch board",
                "baseViewId": "draft",
                "query": "home",
                "filters": {"status": "draft", "role": "page"},
                "sorting": [{"id": "updatedAt", "desc": True}],
                "viewMode": "table",
                "columns": {
                    "visibility": {"status": True, "locale": False},
                    "order": ["name", "status", "updatedAt"],
                    "rowHeight": "medium",
                    "wrapHeaders": False,
                },
                "visibility": "workspace",
                "pinned": True,
                "isDefault": True,
            }
        ]

        user_setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            namespace__startswith="content_library.library_views.user.",
        )
        assert user_setting is not None
        assert user_setting.value == {
            "items": [],
            "pinnedViewIds": [shared_view_id],
            "defaultViewId": shared_view_id,
        }

        workspace_setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            namespace="content_library.library_views",
        )
        assert workspace_setting is not None
        assert workspace_setting.value == {
            "items": [
                {
                    "id": shared_view_id,
                    "name": "Shared launch board",
                    "baseViewId": "draft",
                    "query": "home",
                    "filters": {"status": "draft", "role": "page"},
                    "sorting": [{"id": "updatedAt", "desc": True}],
                    "viewMode": "table",
                    "columns": {
                        "visibility": {"status": True, "locale": False},
                        "order": ["name", "status", "updatedAt"],
                        "rowHeight": "medium",
                        "wrapHeaders": False,
                    },
                }
            ]
        }


@pytest.mark.asyncio
async def test_content_library_views_update_saved_definition_and_visibility(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        create_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/library/views",
            json=_view_payload("Editorial queue", visibility="private", pinned=True, is_default=False),
        )
        assert create_res.status_code == 201, create_res.text
        created_view = create_res.json()["data"]["items"][0]

        update_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/library/views/{created_view['id']}",
            json={
                "name": "Shared launch board",
                "baseViewId": "published",
                "query": "launch",
                "filters": {"status": "published", "role": "article"},
                "sorting": [{"id": "updatedAt", "desc": False}],
                "viewMode": "card",
                "columns": {
                    "visibility": {"status": False},
                    "order": ["name", "updatedAt"],
                    "rowHeight": "tall",
                    "wrapHeaders": True,
                },
                "visibility": "workspace",
                "pinned": False,
                "isDefault": True,
            },
        )
        assert update_res.status_code == 200, update_res.text
        payload = update_res.json()["data"]
        assert payload["defaultViewId"] == created_view["id"]
        assert payload["items"] == [
            {
                "id": created_view["id"],
                "name": "Shared launch board",
                "baseViewId": "published",
                "query": "launch",
                "filters": {"status": "published", "role": "article"},
                "sorting": [{"id": "updatedAt", "desc": False}],
                "viewMode": "card",
                "columns": {
                    "visibility": {"status": False},
                    "order": ["name", "updatedAt"],
                    "rowHeight": "tall",
                    "wrapHeaders": True,
                },
                "visibility": "workspace",
                "pinned": False,
                "isDefault": True,
            }
        ]

        user_setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            namespace__startswith="content_library.library_views.user.",
        )
        assert user_setting is not None
        assert user_setting.value == {
            "items": [],
            "pinnedViewIds": [],
            "defaultViewId": created_view["id"],
        }

        workspace_setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            namespace="content_library.library_views",
        )
        assert workspace_setting is not None
        assert workspace_setting.value == {
            "items": [
                {
                    "id": created_view["id"],
                    "name": "Shared launch board",
                    "baseViewId": "published",
                    "query": "launch",
                    "filters": {"status": "published", "role": "article"},
                    "sorting": [{"id": "updatedAt", "desc": False}],
                    "viewMode": "card",
                    "columns": {
                        "visibility": {"status": False},
                        "order": ["name", "updatedAt"],
                        "rowHeight": "tall",
                        "wrapHeaders": True,
                    },
                }
            ]
        }
