from __future__ import annotations

import pytest

from apps.api.src.common.utils.public_ids import decode_public_id
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.hierarchy_node import HierarchyNodeRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.presentation_document import PresentationDocumentRecord
from apps.api.src.models.content.route_binding import RouteBindingRecord
from apps.api.src.modules.workspaces.content.migration.import_from_legacy import WorkspaceLegacyContentImportService
from apps.api.tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


async def _get_site_id(client, workspace_id: str) -> str:
    site_res = await client.get(f"/api/v1/workspaces/{workspace_id}/site")
    assert site_res.status_code == 200, site_res.text
    return site_res.json()["data"]["siteId"]


async def _create_legacy_type(client, workspace_id: str, *, scalar: str = "text") -> str:
    payload = {
        "code": "page",
        "name": "Page",
        "kind": "page",
        "fieldSchema": {"fields": [{"key": "title", "label": "Title", "scalar": scalar, "required": True}]},
        "workflowPolicy": {"states": ["draft", "published"], "initialState": "draft"},
    }
    type_res = await client.post(f"/api/v1/workspaces/{workspace_id}/legacy-content/types", json=payload)
    assert type_res.status_code == 201, type_res.text
    return type_res.json()["data"]["id"]


async def _create_legacy_entry(client, workspace_id: str, *, slug: str, path: str, parent_entry_id: str | None) -> str:
    payload = {
        "typeCode": "page",
        "slug": slug,
        "title": slug.title(),
        "locale": "en-US",
        "visibility": "public",
        "path": path,
        "parentEntryId": parent_entry_id,
        "sortOrder": 10 if parent_entry_id else 0,
    }
    entry_res = await client.post(f"/api/v1/workspaces/{workspace_id}/legacy-content/entries", json=payload)
    assert entry_res.status_code == 201, entry_res.text
    return entry_res.json()["data"]["id"]


async def _save_and_publish_legacy_revision(client, workspace_id: str, entry_id: str, title: str) -> None:
    draft_payload = {
        "pageBlueprint": {"kind": "legacy-page", "title": title},
        "fieldValues": {"title": title},
    }
    draft_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/legacy-content/entries/{entry_id}/draft",
        json=draft_payload,
    )
    assert draft_res.status_code == 201, draft_res.text
    publish_res = await client.post(
        f"/api/v1/workspaces/{workspace_id}/legacy-content/entries/{entry_id}/publish",
        json={},
    )
    assert publish_res.status_code == 200, publish_res.text


@pytest.mark.asyncio
async def test_legacy_import_populates_rebuilt_kernel_records(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        _ = await _create_legacy_type(client, workspace_id)
        root_entry_id = await _create_legacy_entry(client, workspace_id, slug="home", path="/", parent_entry_id=None)
        child_entry_id = await _create_legacy_entry(
            client,
            workspace_id,
            slug="about",
            path="/about",
            parent_entry_id=root_entry_id,
        )
        await _save_and_publish_legacy_revision(client, workspace_id, root_entry_id, "Home")
        await _save_and_publish_legacy_revision(client, workspace_id, child_entry_id, "About")
        site_id = await _get_site_id(client, workspace_id)

        report = await WorkspaceLegacyContentImportService().import_workspace_legacy_content(
            workspace_id=decode_public_id(workspace_id),
            site_id=decode_public_id(site_id),
        )

        assert report.models_imported == 1
        assert report.items_imported == 2
        assert report.versions_imported == 2
        assert report.route_bindings_imported == 2
        assert report.hierarchy_nodes_imported == 2
        assert report.unsupported_payloads == []

        workspace_uuid = decode_public_id(workspace_id)
        site_uuid = decode_public_id(site_id)
        assert await ContentModelDefinitionRecord.filter(workspace_id=workspace_uuid, site_id=site_uuid).count() == 1
        assert await ContentItemRecord.filter(workspace_id=workspace_uuid, site_id=site_uuid).count() == 2
        assert (
            await ContentVersionRecord.filter(item__workspace_id=workspace_uuid, item__site_id=site_uuid).count() == 2
        )
        assert (
            await PresentationDocumentRecord.filter(
                version__item__workspace_id=workspace_uuid,
                version__item__site_id=site_uuid,
            ).count()
            == 4
        )
        assert await RouteBindingRecord.filter(workspace_id=workspace_uuid, site_id=site_uuid).count() == 2
        assert await HierarchyNodeRecord.filter(workspace_id=workspace_uuid, site_id=site_uuid).count() == 2


@pytest.mark.asyncio
async def test_legacy_import_reports_unsupported_field_scalar(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id):
        _ = await _create_legacy_type(client, workspace_id, scalar="markdown")
        entry_id = await _create_legacy_entry(client, workspace_id, slug="home", path="/", parent_entry_id=None)
        await _save_and_publish_legacy_revision(client, workspace_id, entry_id, "Home")
        site_id = await _get_site_id(client, workspace_id)

        report = await WorkspaceLegacyContentImportService().import_workspace_legacy_content(
            workspace_id=decode_public_id(workspace_id),
            site_id=decode_public_id(site_id),
        )

        codes = {issue.code for issue in report.unsupported_payloads}
        assert "LEGACY_FIELD_TYPE_UNSUPPORTED" in codes
