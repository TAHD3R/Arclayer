from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.analytics.audit_event import AuditEvent
from src.models.projects.environment import ProjectEnvironmentRecord
from src.modules.projects.content.transfer.service import ProjectContentTransferService
from src.modules.projects.environments import service as environments_service_module
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode
from tests.modules.projects.helpers import (
    bind_project_route,
    create_project_page_model,
    create_project_publishable_page_item,
    publish_project_item_version,
)
from tests.modules.sites.test_sites_delivery_integration import _publish_release, _runtime_id_and_preview_token
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.utils.project_context import project_site_id

pytestmark = pytest.mark.integration


async def _environment_map(client, project_id: str) -> dict[str, dict]:
    response = await client.get(f"/api/v1/projects/{project_id}/environments")
    assert response.status_code == 200, response.text
    return {item["key"]: item for item in response.json()["data"]["items"]}


async def _transfer_service(workspace_id: str, project_id: str, site_id: str) -> ProjectContentTransferService:
    registry = await WorkspaceTenantRegistryService().get_by_workspace_id(decode_public_id(workspace_id))
    assert registry is not None
    return ProjectContentTransferService(
        TenantContext(
            identity=TenantIdentity(
                organization_id=registry.organization_id,
                workspace_id=registry.workspace_id,
                project_id=decode_public_id(project_id),
                site_id=decode_public_id(site_id),
                schema_name=registry.schema_name,
                isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
            )
        )
    )


@pytest.mark.asyncio
async def test_new_project_bootstraps_three_environments_and_lists_in_predictable_order(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        response = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert response.status_code == 200, response.text

        items = response.json()["data"]["items"]
        aliases = response.json()["data"]["aliases"]
        assert [item["key"] for item in items] == ["development", "staging", "production"]
        assert [item["isProduction"] for item in items] == [False, False, True]
        assert [item["isDefaultPreview"] for item in items] == [True, False, False]
        assert aliases[0]["key"] == "master"
        assert aliases[0]["targetEnvironmentKey"] == "production"

        db_rows = (
            await ProjectEnvironmentRecord
            .filter(project_id=decode_public_id(project_id))
            .order_by("created_at", "id")
            .all()
        )
        assert len(db_rows) == 3

        second_project_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Project",
                "slug": "second-project",
            },
        )
        assert second_project_res.status_code == 201, second_project_res.text
        second_project_id = second_project_res.json()["data"]["id"]

        second_response = await client.get(f"/api/v1/projects/{second_project_id}/environments")
        assert second_response.status_code == 200, second_response.text
        assert [item["key"] for item in second_response.json()["data"]["items"]] == [
            "development",
            "staging",
            "production",
        ]


@pytest.mark.asyncio
async def test_project_environment_patch_updates_name_and_default_preview(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        initial = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert initial.status_code == 200, initial.text
        staging = next(item for item in initial.json()["data"]["items"] if item["key"] == "staging")
        development = next(item for item in initial.json()["data"]["items"] if item["key"] == "development")

        patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/environments/{staging['id']}",
            json={"name": "QA", "isDefaultPreview": True},
        )
        assert patch_res.status_code == 200, patch_res.text
        assert patch_res.json()["data"]["name"] == "QA"
        assert patch_res.json()["data"]["isDefaultPreview"] is True

        refreshed = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert refreshed.status_code == 200, refreshed.text
        rows = refreshed.json()["data"]["items"]
        assert [item["key"] for item in rows if item["isDefaultPreview"]] == ["staging"]

        staging_uuid = decode_public_id(staging["id"])
        project_uuid = decode_public_id(project_id)
        workspace_uuid = decode_public_id(workspace_id)
        event = await AuditEvent.filter(
            event_name="project.environment.updated",
            workspace_id=workspace_uuid,
            entity_type="project_environment",
            entity_id=staging_uuid,
        ).first()
        assert event is not None
        assert event.properties["project_id"] == str(project_uuid)
        assert event.properties["environment_id"] == str(staging_uuid)
        assert event.properties["environment_key"] == "staging"
        assert event.properties["updated_fields"] == ["is_default_preview", "name"]
        assert "QA" not in str(event.properties)

        original_write_required_activity_event = environments_service_module.write_required_activity_event

        async def _failing_environment_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
            if payload.event_name == "project.environment.updated":
                raise RuntimeError("forced activity write failure: project.environment.updated")
            return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

        monkeypatch.setattr(
            "src.modules.projects.environments.service.write_required_activity_event",
            _failing_environment_activity_event,
        )
        event_count_before = await AuditEvent.filter(event_name="project.environment.updated").count()
        development_uuid = decode_public_id(development["id"])
        rollback_res = await client.patch(
            f"/api/v1/projects/{project_id}/environments/{development['id']}",
            json={"name": "Rolled Back Dev", "isDefaultPreview": True},
        )
        assert rollback_res.status_code == 500, rollback_res.text

        assert await AuditEvent.filter(event_name="project.environment.updated").count() == event_count_before
        development_row = await ProjectEnvironmentRecord.get(id=development_uuid)
        staging_row = await ProjectEnvironmentRecord.get(id=staging_uuid)
        assert development_row.name == "Development"
        assert development_row.is_default_preview is False
        assert staging_row.is_default_preview is True


@pytest.mark.asyncio
async def test_project_environment_clone_alias_and_content_api_targeting(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        environments = await _environment_map(client, project_id)
        production_id = environments["production"]["id"]
        staging_id = environments["staging"]["id"]

        await create_project_page_model(client, project_id)
        item_id = await create_project_publishable_page_item(client, project_id, title="Production Home")
        await publish_project_item_version(
            client,
            project_id,
            item_id,
            version=2,
            title="Production Home",
            path="/",
        )
        await bind_project_route(client, project_id, item_id, path="/")
        await _publish_release(client, project_id)
        runtime_id, _preview_token = await _runtime_id_and_preview_token(client, project_id)

        clone_res = await client.post(
            f"/api/v1/projects/{project_id}/environments/clone",
            json={"source": "production", "target": "staging", "includeContent": True},
        )
        assert clone_res.status_code == 200, clone_res.text
        assert clone_res.json()["data"]["contentModels"] == 1
        assert clone_res.json()["data"]["contentItems"] == 1
        assert clone_res.json()["data"]["contentVersions"] == 2

        staging_items_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items",
            params={"environment": "staging", "modelKey": "page"},
        )
        assert staging_items_res.status_code == 200, staging_items_res.text
        staging_item = staging_items_res.json()["data"]["items"][0]
        assert staging_item["title"] == "Production Home"
        assert staging_item["id"] != item_id

        duplicate_model_res = await client.post(
            f"/api/v1/projects/{project_id}/content/models",
            params={"environment": "staging"},
            json={
                "singularKey": "page",
                "pluralKey": "pages",
                "name": "Staging Page",
                "category": "site_builder",
                "capabilities": ["publishable"],
                "routing": {"mode": "none"},
                "workflow": {"states": []},
                "fields": [],
                "relations": [],
                "views": [],
            },
        )
        assert duplicate_model_res.status_code == 409, duplicate_model_res.text

        alias_res = await client.patch(
            f"/api/v1/projects/{project_id}/environments/aliases/master",
            json={"targetEnvironmentId": staging_id},
        )
        assert alias_res.status_code == 200, alias_res.text
        assert alias_res.json()["data"]["targetEnvironmentId"] == staging_id

        master_items_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items",
            params={"environment": "master", "modelKey": "page"},
        )
        assert master_items_res.status_code == 200, master_items_res.text
        assert master_items_res.json()["data"]["items"][0]["id"] == staging_item["id"]

        wrong_environment_version_res = await client.get(
            f"/api/v1/projects/{project_id}/content/items/{item_id}/versions/2",
            params={"environment": "staging"},
        )
        assert wrong_environment_version_res.status_code == 404, wrong_environment_version_res.text
        assert wrong_environment_version_res.json()["error"] == "CONTENT_ITEM_NOT_FOUND"

        content_api_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/content/page",
            params={"environment": "staging", "locale": "en-US"},
        )
        assert content_api_res.status_code == 200, content_api_res.text
        content_items = content_api_res.json()["data"]["items"]
        assert content_items
        assert content_items[0]["id"] == staging_item["id"]

        promote_res = await client.post(
            f"/api/v1/projects/{project_id}/environments/promote",
            json={"source": "staging", "target": production_id, "includeContent": True},
        )
        assert promote_res.status_code == 200, promote_res.text
        assert promote_res.json()["data"]["targetEnvironmentId"] == production_id

        site_id = await project_site_id(client, project_id)
        transfer_service = await _transfer_service(workspace_id, project_id, site_id)
        exported = await transfer_service.export_project(
            workspace_id=decode_public_id(workspace_id),
            project_id=decode_public_id(project_id),
            site_id=decode_public_id(site_id),
            environment_id=decode_public_id(production_id),
        )
        assert exported.bundle.manifest.project_identity.environment_id == str(decode_public_id(production_id))
        assert exported.bundle.resources.content_models[0]["environment_id"] == str(decode_public_id(production_id))
        assert exported.bundle.resources.content_items[0]["environment_id"] == str(decode_public_id(production_id))
