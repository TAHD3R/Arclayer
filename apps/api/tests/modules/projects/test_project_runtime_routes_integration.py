from __future__ import annotations

import pytest

from src.config import get_settings
from src.settings.crypto import ensure_master_key
from tests.modules.projects.helpers import (
    create_project_page_model,
    project_context_ids,
)
from tests.modules.sites.test_sites_delivery_integration import _site_id_and_preview_token
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _workspace_client,
)
from tests.modules.workspaces.content.test_content_presentations_integration import (
    _draft_payload as _page_draft_payload,
)
from tests.modules.workspaces.content.test_content_presentations_integration import (
    _item_payload as _page_item_payload,
)
from tests.modules.workspaces.test_workspace_api_keys_management_integration import (
    _project_api_key_payload,
)

pytestmark = pytest.mark.integration


async def _project_context_ids(client, workspace_id: str) -> tuple[str, str]:
    return await project_context_ids(client, workspace_id)


async def _project_site_id(client, project_id: str) -> str:
    project_site_res = await client.get(f"/api/v1/projects/{project_id}/site")
    assert project_site_res.status_code == 200, project_site_res.text
    return project_site_res.json()["data"]["siteId"]


async def _create_project_page_item(
    client,
    project_id: str,
    *,
    title: str,
    path: str,
) -> str:
    item_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items",
        json={
            **_page_item_payload(),
            "title": title,
        },
    )
    assert item_res.status_code == 201, item_res.text
    item_id = item_res.json()["data"]["id"]

    shape_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/bootstrap-shape",
        json=_bootstrap_shape_payload(
            preset_key="page",
            capability_pack_ids=["publishable", "routable", "treeable"],
        ),
    )
    assert shape_res.status_code == 200, shape_res.text

    draft_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/draft",
        json=_page_draft_payload(title),
    )
    assert draft_res.status_code == 201, draft_res.text

    workflow_res = await client.patch(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/workflow",
        json={"stage": "approved", "summary": f"{title} approved for publish"},
    )
    assert workflow_res.status_code == 200, workflow_res.text

    publish_res = await client.post(
        f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/1/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text

    route_res = await client.put(
        f"/api/v1/projects/{project_id}/content/routing/bindings/{item_id}",
        json={"locale": "en-US", "path": path, "isActive": True},
    )
    assert route_res.status_code == 200, route_res.text
    return item_id


async def _prepare_project_published_site(client, workspace_id: str) -> None:
    project_id, _runtime_id = await _project_context_ids(client, workspace_id)
    await create_project_page_model(client, project_id)
    await _create_project_page_item(client, project_id, title="Home", path="/")
    await _create_project_page_item(client, project_id, title="About", path="/about")

    publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_runtime_routes_resolve_same_delivery_and_runtime_contract_as_project_primary_runtime(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, _project_id):
        await _prepare_project_published_site(client, workspace_id)

        project_id, runtime_id = await _project_context_ids(client, workspace_id)
        preview_runtime_id, preview_token = await _site_id_and_preview_token(client, project_id)
        project_site_id = await _project_site_id(client, project_id)

        runtime_res = await client.get(f"/api/v1/runtimes/{runtime_id}/runtime")
        assert runtime_res.status_code == 200, runtime_res.text
        assert runtime_res.json()["data"]["siteId"] == project_site_id
        assert preview_runtime_id == runtime_id

        route_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/routes/resolve",
            params={"path": "/", "mode": "preview", "token": preview_token},
        )
        assert route_res.status_code == 200, route_res.text
        assert route_res.json()["data"]["document"]["path"] == "/"

        delivery_res = await client.get(
            f"/api/v1/runtimes/{runtime_id}/delivery/pages/resolve",
            params={"path": "/about"},
        )
        assert delivery_res.status_code == 200, delivery_res.text
        assert delivery_res.json()["data"]["document"]["path"] == "/about"

        project_site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert project_site_res.status_code == 200, project_site_res.text
        assert project_site_res.json()["data"]["siteId"] == project_site_id


@pytest.mark.asyncio
async def test_project_runtime_publish_and_preview_contract_resolve_through_runtime_context(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, _project_id):
        await _prepare_project_published_site(client, workspace_id)
        project_id, _runtime_id = await _project_context_ids(client, workspace_id)

        releases_res = await client.get(f"/api/v1/projects/{project_id}/releases")
        assert releases_res.status_code == 200, releases_res.text
        releases = releases_res.json()["data"]["items"]
        assert len(releases) == 1
        assert releases[0]["isActive"] is True
        assert releases[0]["releaseNumber"] == 1

        impact_res = await client.get(f"/api/v1/projects/{project_id}/publish/impact")
        assert impact_res.status_code == 200, impact_res.text
        assert impact_res.json()["data"]["blockedItems"] == []

        contract_res = await client.get(f"/api/v1/projects/{project_id}/publish/preview-contract")
        assert contract_res.status_code == 200, contract_res.text
        contract = contract_res.json()["data"]
        assert len(contract["routePointers"]) == 2
        assert any(pointer["path"] == "/about" for pointer in contract["routePointers"])


@pytest.mark.asyncio
async def test_project_api_keys_bind_to_runtime_site_bridge(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, _project_id):
        project_id, runtime_id = await _project_context_ids(client, workspace_id)
        preview_runtime_id, _preview_token = await _site_id_and_preview_token(client, project_id)
        project_site_id = await _project_site_id(client, project_id)

        create_res = await client.post(
            f"/api/v1/projects/{project_id}/api-keys",
            json=_project_api_key_payload(),
        )
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()["data"]
        key_id = created["key"]["id"]
        assert created["key"]["workspaceId"] == workspace_id
        assert created["key"]["siteId"] == project_site_id
        assert preview_runtime_id == runtime_id

        list_res = await client.get(f"/api/v1/projects/{project_id}/api-keys")
        assert list_res.status_code == 200, list_res.text
        assert [item["id"] for item in list_res.json()["data"]["items"]] == [key_id]

        detail_res = await client.get(f"/api/v1/projects/{project_id}/api-keys/{key_id}")
        assert detail_res.status_code == 200, detail_res.text
        assert detail_res.json()["data"]["siteId"] == project_site_id

        runtime_preview_res = await client.post(
            f"/api/v1/projects/{project_id}/site/preview-tokens",
            json={"ttlSeconds": 600},
        )
        assert runtime_preview_res.status_code == 201, runtime_preview_res.text
        assert runtime_preview_res.json()["data"]["siteId"] == project_site_id

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_project_api_keys_are_isolated_per_project_runtime_site(
    monkeypatch,
    tmp_path,
    prepared_db,
    integration_valkey_settings,
) -> None:
    monkeypatch.setenv("SECURITY__MASTER_KEY_PATH", str(tmp_path / "master.key"))
    get_settings.cache_clear()
    ensure_master_key(get_settings().security.master_key_path)

    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, first_project_id):
        second_create_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Test Project",
                "slug": "second-test-project",
            },
        )
        assert second_create_res.status_code == 201, second_create_res.text
        second_project_id = second_create_res.json()["data"]["id"]

        first_create_res = await client.post(
            f"/api/v1/projects/{first_project_id}/api-keys",
            json={
                **_project_api_key_payload(),
                "name": "First Project Key",
            },
        )
        assert first_create_res.status_code == 200, first_create_res.text
        first_key = first_create_res.json()["data"]["key"]

        second_create_res = await client.post(
            f"/api/v1/projects/{second_project_id}/api-keys",
            json={
                **_project_api_key_payload(),
                "name": "Second Project Key",
            },
        )
        assert second_create_res.status_code == 200, second_create_res.text
        second_key = second_create_res.json()["data"]["key"]

        first_list_res = await client.get(f"/api/v1/projects/{first_project_id}/api-keys")
        assert first_list_res.status_code == 200, first_list_res.text
        assert [item["id"] for item in first_list_res.json()["data"]["items"]] == [first_key["id"]]

        second_list_res = await client.get(f"/api/v1/projects/{second_project_id}/api-keys")
        assert second_list_res.status_code == 200, second_list_res.text
        assert [item["id"] for item in second_list_res.json()["data"]["items"]] == [second_key["id"]]

        forbidden_detail = await client.get(f"/api/v1/projects/{first_project_id}/api-keys/{second_key['id']}")
        assert forbidden_detail.status_code == 404, forbidden_detail.text

    get_settings.cache_clear()
