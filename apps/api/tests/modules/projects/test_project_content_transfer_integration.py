from __future__ import annotations

import pytest

from src.common.utils.public_ids import decode_public_id
from src.modules.projects.content.transfer.schema import ContentTransferBundle
from src.modules.projects.content.transfer.service import ProjectContentTransferService
from src.modules.tenancy.registry import WorkspaceTenantRegistryService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode
from tests.modules.projects.helpers import (
    create_project_page_model,
    create_project_publishable_page_item,
    publish_project_item_version,
)
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client
from tests.utils.project_context import project_site_id

pytestmark = pytest.mark.integration


async def _transfer_service(workspace_id: str, project_id: str, site_id: str) -> ProjectContentTransferService:
    workspace_uuid = decode_public_id(workspace_id)
    registry = await WorkspaceTenantRegistryService().get_by_workspace_id(workspace_uuid)
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


async def _prepared_bundle(client, workspace_id: str, project_id: str) -> ContentTransferBundle:
    await create_project_page_model(client, project_id)
    item_id = await create_project_publishable_page_item(client, project_id, title="Home")
    await publish_project_item_version(client, project_id, item_id, version=2, title="Home", path="/")
    site_id = await project_site_id(client, project_id)
    service = await _transfer_service(workspace_id, project_id, site_id)
    result = await service.export_project(
        workspace_id=decode_public_id(workspace_id),
        project_id=decode_public_id(project_id),
        site_id=decode_public_id(site_id),
    )
    return result.bundle


@pytest.mark.asyncio
async def test_content_transfer_export_manifest_is_deterministic(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        bundle = await _prepared_bundle(client, workspace_id, project_id)
        site_id = await project_site_id(client, project_id)
        service = await _transfer_service(workspace_id, project_id, site_id)

        second = await service.export_project(
            workspace_id=decode_public_id(workspace_id),
            project_id=decode_public_id(project_id),
            site_id=decode_public_id(site_id),
        )

        manifest = bundle.manifest
        assert manifest.schema_version == 1
        assert manifest.project_identity.project_id == str(decode_public_id(project_id))
        assert manifest.resource_counts["content_models"] == 1
        assert manifest.resource_counts["content_items"] == 1
        assert manifest.resource_counts["content_versions"] == 2
        assert manifest.integrity_checks["content_models"] == second.bundle.manifest.integrity_checks["content_models"]
        assert manifest.integrity_checks["content_items"] == second.bundle.manifest.integrity_checks["content_items"]
        assert {diagnostic.code for diagnostic in manifest.diagnostics} == {"CONTENT_TRANSFER_ASSET_METADATA_ONLY"}


@pytest.mark.asyncio
async def test_content_transfer_validate_import_reports_manifest_count_mismatch(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        bundle = await _prepared_bundle(client, workspace_id, project_id)
        payload = bundle.model_dump(mode="json")
        payload["manifest"]["resource_counts"]["content_items"] = 99
        mutated = ContentTransferBundle.model_validate(payload)
        site_id = await project_site_id(client, project_id)
        service = await _transfer_service(workspace_id, project_id, site_id)

        diagnostics = await service.validate_import(
            workspace_id=decode_public_id(workspace_id),
            project_id=decode_public_id(project_id),
            site_id=decode_public_id(site_id),
            bundle=mutated,
        )

        codes = {diagnostic.code for diagnostic in diagnostics}
        assert "CONTENT_TRANSFER_RESOURCE_COUNT_MISMATCH" in codes
        assert "CONTENT_TRANSFER_TARGET_NOT_EMPTY" in codes


@pytest.mark.asyncio
async def test_content_transfer_import_blocks_non_empty_target(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        bundle = await _prepared_bundle(client, workspace_id, project_id)
        site_id = await project_site_id(client, project_id)
        service = await _transfer_service(workspace_id, project_id, site_id)

        with pytest.raises(Exception) as exc_info:
            await service.import_project(
                workspace_id=decode_public_id(workspace_id),
                project_id=decode_public_id(project_id),
                site_id=decode_public_id(site_id),
                bundle=bundle,
            )

        error = getattr(exc_info.value, "error", None)
        meta = getattr(exc_info.value, "meta", {})
        assert error == "CONTENT_TRANSFER_IMPORT_BLOCKED"
        assert any(item["code"] == "CONTENT_TRANSFER_TARGET_NOT_EMPTY" for item in meta["diagnostics"])


@pytest.mark.asyncio
async def test_content_transfer_validate_import_reports_checksum_mismatch(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        bundle = await _prepared_bundle(client, workspace_id, project_id)
        payload = bundle.model_dump(mode="json")
        payload["resources"]["content_items"][0]["title"] = "Changed outside manifest"
        mutated = ContentTransferBundle.model_validate(payload)
        site_id = await project_site_id(client, project_id)
        service = await _transfer_service(workspace_id, project_id, site_id)

        diagnostics = await service.validate_import(
            workspace_id=decode_public_id(workspace_id),
            project_id=decode_public_id(project_id),
            site_id=decode_public_id(site_id),
            bundle=mutated,
        )

        assert "CONTENT_TRANSFER_CHECKSUM_MISMATCH" in {diagnostic.code for diagnostic in diagnostics}
