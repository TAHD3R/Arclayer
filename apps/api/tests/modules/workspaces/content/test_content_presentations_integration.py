from __future__ import annotations

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content.component_binding import ComponentBindingRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.seo_profile import SEOProfileRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


def _model_payload() -> dict:
    return {
        "key": "landing_page",
        "name": "Landing Page",
        "fields": [{"key": "title", "label": "Title", "scalar": "text", "required": True}],
        "relations": [],
        "capabilities": ["versioned", "publishable", "visual_editable", "has_slots", "seo_managed"],
        "routing": {"mode": "single", "slugField": "title"},
        "workflow": {"states": ["draft", "published"], "initialState": "draft"},
        "views": [],
    }


def _item_payload() -> dict:
    return {
        "modelKey": "landing_page",
        "slug": "summer-launch",
        "title": "Summer Launch",
        "locale": "en-US",
        "visibility": "public",
        "status": "draft",
    }


def _draft_payload(title: str) -> dict:
    return {
        "expectedVersion": 0,
        "changeSummary": "initial page draft",
        "fieldsSnapshot": {"title": title},
        "presentations": [
            {"kind": "form_data", "payload": {"title": title}},
            {
                "kind": "slot_mapping",
                "payload": {
                    "bindings": [
                        {
                            "componentKey": "hero",
                            "bindingKey": "headline",
                            "payload": {"field": "title"},
                        }
                    ]
                },
            },
            {
                "kind": "seo",
                "payload": {
                    "metaTitle": f"{title} | Celestial",
                    "metaDescription": "Launch landing page",
                    "canonicalUrl": "/summer-launch",
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
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

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
        assert seo_profile.meta_title == "Summer Launch | Celestial"
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
        model_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/models",
            json=_model_payload(),
        )
        assert model_res.status_code == 201, model_res.text

        item_res = await client.post(
            f"/api/v1/workspaces/{workspace_id}/content/items",
            json=_item_payload(),
        )
        assert item_res.status_code == 201, item_res.text
        item_id = item_res.json()["data"]["id"]

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
        assert {"form_data", "slot_mapping", "seo"} <= kinds

        seo_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/seo",
        )
        assert seo_res.status_code == 200, seo_res.text
        assert seo_res.json()["data"]["metaTitle"] == "Summer Launch | Celestial"
        assert seo_res.json()["data"]["canonicalUrl"] == "/summer-launch"

        bindings_res = await client.get(
            f"/api/v1/workspaces/{workspace_id}/content/items/{item_id}/versions/1/bindings",
        )
        assert bindings_res.status_code == 200, bindings_res.text
        bindings = bindings_res.json()["data"]["items"]
        assert len(bindings) == 1
        assert bindings[0]["componentKey"] == "hero"
        assert bindings[0]["bindingKey"] == "headline"
