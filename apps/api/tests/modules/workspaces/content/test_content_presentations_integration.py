from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.seo_profile import SEOProfileRecord
from tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_page_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _item_payload() -> dict:
    return {
        "title": "Summer Launch",
        "locale": "en-US",
        "modelKey": "page",
    }


def _draft_payload(title: str, *, path: str = "/summer-launch", headline: str | None = None) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial page draft",
        "fieldsSnapshot": {"title": title, "path": path},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title, "path": path}},
            {
                "kind": "visual_blueprint",
                "payload": {
                    "root": "page",
                    "nodes": {
                        "hero": {
                            "type": "hero",
                            "props": {"headline": headline or title},
                        }
                    },
                },
            },
            {
                "kind": "slot_mapping",
                "payload": {
                    "bindings": [
                        {
                            "componentKey": "hero",
                            "bindingKey": "headline",
                            "payload": {"field": headline or "title"},
                        }
                    ]
                },
            },
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Arclayer",
                    "metaDescription": "Launch landing page",
                    "canonicalUrl": path,
                    "robotsDirective": "index,follow",
                },
            },
        ],
    }


@pytest.mark.asyncio
async def test_draft_save_persists_first_class_seo_profiles_and_component_bindings(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        shape_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(
                preset_key="page",
                capability_pack_ids=["publishable", "visual_editable", "has_slots", "seo_managed"],
            ),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload("Summer Launch"),
        )
        assert draft_res.status_code == 201, draft_res.text

        item_uuid = decode_public_id(item_id)
        version = await ContentVersionRecord.filter(item_id=item_uuid, version=1).first()
        assert version is not None

        seo_profile = await SEOProfileRecord.filter(version_id=version.id).first()
        assert seo_profile is not None
        assert seo_profile.meta_title == "Summer Launch | Arclayer"
        assert seo_profile.canonical_url == "/summer-launch"

        bindings = await ComponentBindingRecord.filter(version_id=version.id).order_by("sort_order")
        assert len(bindings) == 1
        assert bindings[0].component_key == "hero"
        assert bindings[0].binding_key == "headline"


@pytest.mark.asyncio
async def test_content_version_auxiliary_endpoints_expose_presentations_seo_and_bindings(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]
        shape_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(
                preset_key="page",
                capability_pack_ids=["publishable", "visual_editable", "has_slots", "seo_managed"],
            ),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload("Summer Launch"),
        )
        assert draft_res.status_code == 201, draft_res.text

        presentations_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/presentations",
        )
        assert presentations_res.status_code == 200, presentations_res.text
        kinds = {entry["kind"] for entry in presentations_res.json()["data"]["items"]}
        assert {"form_data", "visual_blueprint", "slot_mapping", "seo"} <= kinds

        seo_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/seo",
        )
        assert seo_res.status_code == 200, seo_res.text
        assert seo_res.json()["data"]["metaTitle"] == "Summer Launch | Arclayer"
        assert seo_res.json()["data"]["canonicalUrl"] == "/summer-launch"

        bindings_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/bindings",
        )
        assert bindings_res.status_code == 200, bindings_res.text
        bindings = bindings_res.json()["data"]["items"]
        assert len(bindings) == 1
        assert bindings[0]["componentKey"] == "hero"
        assert bindings[0]["bindingKey"] == "headline"


@pytest.mark.asyncio
async def test_published_page_version_keeps_own_snapshot_after_newer_draft_changes(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        await _create_page_model(client, workspace_id)
        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(
                preset_key="page",
                capability_pack_ids=["publishable", "visual_editable", "has_slots", "seo_managed"],
            ),
        )
        assert shape_res.status_code == 200, shape_res.text

        first_draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json=_draft_payload("Summer Launch", path="/summer-launch"),
        )
        assert first_draft_res.status_code == 201, first_draft_res.text

        publish_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/publish",
            json={},
        )
        assert publish_res.status_code == 200, publish_res.text

        second_draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/draft",
            json={
                **_draft_payload(
                    "Autumn Launch",
                    path="/autumn-launch",
                    headline="headline_v2",
                ),
                "expectedVersion": 1,
                "changeSummary": "second page draft",
            },
        )
        assert second_draft_res.status_code == 201, second_draft_res.text

        version_one_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1",
        )
        assert version_one_res.status_code == 200, version_one_res.text
        version_one = version_one_res.json()["data"]
        assert version_one["fieldsSnapshot"]["title"] == "Summer Launch"
        assert version_one["fieldsSnapshot"]["path"] == "/summer-launch"
        assert {entry["kind"] for entry in version_one["presentations"]} == {
            "form_data",
            "visual_blueprint",
            "slot_mapping",
            "seo",
        }

        version_two_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/2",
        )
        assert version_two_res.status_code == 200, version_two_res.text
        version_two = version_two_res.json()["data"]
        assert version_two["fieldsSnapshot"]["title"] == "Autumn Launch"
        assert version_two["fieldsSnapshot"]["path"] == "/autumn-launch"

        seo_v1 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/seo",
        )
        assert seo_v1.status_code == 200, seo_v1.text
        assert seo_v1.json()["data"]["metaTitle"] == "Summer Launch | Arclayer"
        assert seo_v1.json()["data"]["canonicalUrl"] == "/summer-launch"

        seo_v2 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/2/seo",
        )
        assert seo_v2.status_code == 200, seo_v2.text
        assert seo_v2.json()["data"]["metaTitle"] == "Autumn Launch | Arclayer"
        assert seo_v2.json()["data"]["canonicalUrl"] == "/autumn-launch"

        bindings_v1 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/bindings",
        )
        assert bindings_v1.status_code == 200, bindings_v1.text
        assert bindings_v1.json()["data"]["items"][0]["bindingPayload"] == {"field": "title"}

        bindings_v2 = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/2/bindings",
        )
        assert bindings_v2.status_code == 200, bindings_v2.text
        assert bindings_v2.json()["data"]["items"][0]["bindingPayload"] == {"field": "headline_v2"}
