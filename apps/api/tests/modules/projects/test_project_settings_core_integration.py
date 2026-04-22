from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.system.setting import SettingRecord
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_PROJECT, SCOPE_TYPE_WORKSPACE
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_project_core_settings_are_persisted_per_project_scope(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (
        client,
        workspace_id,
        project_id,
    ):
        project_uuid = decode_public_id(project_id)
        workspace_uuid = decode_public_id(workspace_id)

        patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/settings/core",
            json={
                "patch": {
                    "site": {"url": "https://project-one.example.test"},
                    "site_localization": {"default_locale": "en-US"},
                }
            },
        )
        assert patch_res.status_code == 200, patch_res.text
        payload = patch_res.json()["data"]
        assert payload["namespace"] == CORE_SETTINGS_NAMESPACE
        assert payload["value"]["site"]["url"] == "https://project-one.example.test"
        assert payload["value"]["site_localization"]["default_locale"] == "en-US"

        second_project_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Settings Project",
                "slug": f"second-settings-project-{uuid4().hex[:8]}",
            },
        )
        assert second_project_res.status_code == 201, second_project_res.text
        second_project_id = second_project_res.json()["data"]["id"]

        first_record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_PROJECT,
            scope_id=project_uuid,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        assert first_record is not None
        assert first_record.value == {
            "site": {"url": "https://project-one.example.test"},
            "site_localization": {"default_locale": "en-US"},
        }

        workspace_record = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_WORKSPACE,
            scope_id=workspace_uuid,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        assert workspace_record is None

        second_get_res = await client.get(f"/api/v1/projects/{second_project_id}/settings/core")
        assert second_get_res.status_code == 200, second_get_res.text
        second_payload = second_get_res.json()["data"]
        assert second_payload["namespace"] == CORE_SETTINGS_NAMESPACE
        assert second_payload["value"] == {}
        assert second_payload["secrets"]
        assert set(second_payload["secrets"].values()) == {False}
