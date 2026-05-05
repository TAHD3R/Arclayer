from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.analytics.audit_event import AuditEvent
from src.modules.projects.content.models import canonical_service as content_model_service_module
from tests.modules.workspaces.content.test_content_models_integration import (
    _blank_first_create_payload,
    _workspace_client,
)

pytestmark = pytest.mark.integration


def _model_payload(singular_key: str, plural_key: str, name: str, *, model_kind: str) -> dict:
    capabilities = [] if model_kind == "component" else ["queryable"]
    return {
        "singularKey": singular_key,
        "pluralKey": plural_key,
        "name": name,
        "modelKind": model_kind,
        "fields": [
            {
                "key": "title",
                "label": "Title",
                "scalar": "text",
                "required": True,
            }
        ],
        "relations": [],
        "capabilities": capabilities,
        "routing": {"mode": "none"},
        "workflow": {"states": ["draft"], "initialState": "draft"},
        "views": [],
    }


@pytest.mark.asyncio
async def test_project_content_model_builder_creates_collection_single_and_component(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        for payload in (
            _model_payload("article", "articles", "Article", model_kind="collection_type"),
            _model_payload("homepage", "homepages", "Homepage", model_kind="single_type"),
            _model_payload("seoCard", "seoCards", "SEO Card", model_kind="component"),
        ):
            response = await client.post(
                f"/api/v1/projects/{project_id}/content/models",
                json=payload,
            )
            assert response.status_code == 201, response.text
            data = response.json()["data"]
            assert data["modelKind"] == payload["modelKind"]
            assert data["singularKey"] == payload["singularKey"]
            assert data["pluralKey"] == payload["pluralKey"]
            assert data["systemManaged"] is False
            assert "protocolKey" not in data

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        rows = {item["singularKey"]: item for item in list_response.json()["data"]["items"]}
        assert rows["article"]["modelKind"] == "collection_type"
        assert rows["homepage"]["modelKind"] == "single_type"
        assert rows["seoCard"]["modelKind"] == "component"


@pytest.mark.asyncio
async def test_project_content_model_json_preview_returns_current_draft_schema(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload("product", "products", "Product", model_kind="collection_type"),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        preview_response = await client.get(
            f"/api/v1/projects/{project_id}/content/models/{model_id}/json-preview",
        )
        assert preview_response.status_code == 200, preview_response.text
        preview = preview_response.json()["data"]
        assert preview["stage"] == "current_draft"
        assert preview["payload"]["model_kind"] == "collection_type"
        assert preview["payload"]["singular_key"] == "product"
        assert preview["payload"]["plural_key"] == "products"
        assert preview["payload"]["fields"][0]["key"] == "title"


@pytest.mark.asyncio
async def test_project_content_model_delete_removes_custom_model(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload("product", "products", "Product", model_kind="collection_type"),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        delete_response = await client.delete(f"/api/v1/projects/{project_id}/content/models/{model_id}")
        assert delete_response.status_code == 200, delete_response.text

        list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert list_response.status_code == 200, list_response.text
        assert "product" not in {item["singularKey"] for item in list_response.json()["data"]["items"]}

        deleted_event = await AuditEvent.filter(
            event_name="content.model.deleted",
            workspace_id=decode_public_id(workspace_id),
            entity_type="content_model",
            entity_id=decode_public_id(model_id),
        ).first()
        assert deleted_event is not None
        assert deleted_event.properties["model_key"] == "product"
        assert deleted_event.properties["deleted"] is True
        assert "Product" not in str(deleted_event.properties)

        rollback_create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_model_payload(
                "rollbackProduct", "rollbackProducts", "Rollback Product", model_kind="collection_type"
            ),
        )
        assert rollback_create_response.status_code == 201, rollback_create_response.text
        rollback_model_id = rollback_create_response.json()["data"]["id"]

        original_write_required_activity_event = content_model_service_module.write_required_activity_event

        async def _failing_content_model_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "content.model.deleted":
                raise RuntimeError("forced activity write failure: content.model.deleted")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            content_model_service_module,
            "write_required_activity_event",
            _failing_content_model_activity_event,
        )
        event_count_before = await AuditEvent.filter(event_name="content.model.deleted").count()

        rollback_delete_response = await client.delete(
            f"/api/v1/projects/{project_id}/content/models/{rollback_model_id}"
        )
        assert rollback_delete_response.status_code == 500, rollback_delete_response.text
        assert await AuditEvent.filter(event_name="content.model.deleted").count() == event_count_before
        rollback_list_response = await client.get(f"/api/v1/projects/{project_id}/content/models")
        assert rollback_list_response.status_code == 200, rollback_list_response.text
        assert "rollbackProduct" in {item["singularKey"] for item in rollback_list_response.json()["data"]["items"]}


@pytest.mark.asyncio
async def test_project_content_model_delete_rejects_system_managed_model(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, _workspace_id, project_id):
        create_response = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            json=_blank_first_create_payload(),
        )
        assert create_response.status_code == 201, create_response.text
        model_id = create_response.json()["data"]["id"]

        delete_response = await client.delete(f"/api/v1/projects/{project_id}/content/models/{model_id}")
        assert delete_response.status_code == 409, delete_response.text
        assert delete_response.json()["error"] == "CONTENT_MODEL_DELETE_SYSTEM_MANAGED"
