from __future__ import annotations

import pytest

from apps.api.scripts.reset_content_dev_baseline import reset_workspace_content_dev_baseline
from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.config import get_settings
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.tests.modules.workspaces.content.test_content_items_integration import (
    _bootstrap_shape_payload,
    _create_article_model,
    _workspace_client,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_content_dev_reset_baseline_clears_invalid_items_and_seeds_typed_models(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_public_id):
        workspace_id = decode_public_id(workspace_public_id)
        site_payload = (await client.get(f"/api/v1/workspaces/{workspace_public_id}/site")).json()["data"]
        site_id = decode_public_id(site_payload["siteId"])

        await _create_article_model(client, workspace_public_id)
        create_res = await client.post(
            f"/api/v1/workspaces/{workspace_public_id}/content/items",
            json={
                "title": "Typed article",
                "locale": "en-US",
                "modelKey": "article",
            },
        )
        assert create_res.status_code == 201, create_res.text
        typed_item_id = create_res.json()["data"]["id"]

        shape_res = await client.patch(
            f"/api/v1/workspaces/{workspace_public_id}/content/items/{typed_item_id}/bootstrap-shape",
            json=_bootstrap_shape_payload(),
        )
        assert shape_res.status_code == 200, shape_res.text

        draft_res = await client.post(
            f"/api/v1/workspaces/{workspace_public_id}/content/items/{typed_item_id}/versions/draft",
            json={
                "expectedVersion": 0,
                "changeSummary": "seed typed draft",
                "fieldsSnapshot": {"title": "Typed article", "body": "Hello"},
                "presentations": [
                    {"kind": "form_data", "payload": {"title": "Typed article", "body": "Hello"}},
                    {"kind": "rich_text_document", "payload": {"type": "doc", "content": []}},
                ],
            },
        )
        assert draft_res.status_code == 201, draft_res.text

        await ContentItemRecord.create(
            workspace_id=workspace_id,
            site_id=site_id,
            model_definition_id=None,
            slug="legacy-model-less-item",
            title="Legacy Model-less Item",
            locale="en-US",
            status="draft",
            visibility="public",
            bootstrap_preset_key=None,
            bootstrap_preset_state="none",
            capability_pack_ids=[],
            resolved_role=None,
            resolved_posture=None,
            resolved_surface=None,
            shape_state="unshaped",
            shape_reason_code="CONTINUATION_TRUTH_MISSING",
            shape_reason_meta={"source": "legacy-test"},
            draft_version=0,
            published_version=None,
            created_by_user_id=None,
            updated_by_user_id=None,
        )

        result = await reset_workspace_content_dev_baseline(
            settings=get_settings(),
            workspace_id=workspace_id,
            actor_user_id=None,
            seed_default_models=True,
        )

        assert result.deleted_items == 2
        assert result.deleted_model_less_items == 1
        assert tuple(result.seeded_model_keys) == ("article", "landing-page", "structured-entry")

        assert await ContentItemRecord.filter(workspace_id=workspace_id, site_id=site_id).count() == 0
        assert await ContentVersionRecord.all().count() == 0

        models = await ContentModelDefinitionRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
        ).order_by("key")
        assert [str(model.key) for model in models] == ["article", "landing-page", "structured-entry"]
        assert [str(model.default_surface) for model in models] == ["writing", "canvas", "structured"]
