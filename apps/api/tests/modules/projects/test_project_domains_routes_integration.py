from __future__ import annotations

from uuid import uuid4

import pytest

from src.common.utils.public_ids import decode_public_id
from src.models.sites.site_domain import SiteDomainRecord
from tests.modules.workspaces.content.test_content_items_integration import _workspace_client

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_project_domains_routes_are_scoped_to_project_runtime_site(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _workspace_client(prepared_db, integration_valkey_settings) as (client, workspace_id, project_id):
        first_site_res = await client.get(f"/api/v1/projects/{project_id}/site")
        assert first_site_res.status_code == 200, first_site_res.text
        first_site_id = first_site_res.json()["data"]["siteId"]
        first_site_uuid = decode_public_id(first_site_id)

        second_project_res = await client.post(
            "/api/v1/projects",
            json={
                "workspaceId": workspace_id,
                "name": "Second Domains Project",
                "slug": f"second-domains-project-{uuid4().hex[:8]}",
            },
        )
        assert second_project_res.status_code == 201, second_project_res.text
        second_project_id = second_project_res.json()["data"]["id"]

        second_site_res = await client.get(f"/api/v1/projects/{second_project_id}/site")
        assert second_site_res.status_code == 200, second_site_res.text
        second_site_id = second_site_res.json()["data"]["siteId"]
        second_site_uuid = decode_public_id(second_site_id)

        second_hostname = f"project2-domains-{uuid4().hex[:8]}.example.test"
        second_create_res = await client.post(
            f"/api/v1/projects/{second_project_id}/domains",
            json={"hostname": second_hostname},
        )
        assert second_create_res.status_code == 201, second_create_res.text
        second_domain = second_create_res.json()["data"]["domain"]
        second_domain_id = second_domain["domainId"]
        assert second_domain["siteId"] == second_site_id
        assert second_domain["hostname"] == second_hostname
        assert second_domain["isVerified"] is False
        assert second_domain["isActive"] is True

        first_list_res = await client.get(f"/api/v1/projects/{project_id}/domains")
        assert first_list_res.status_code == 200, first_list_res.text
        assert first_list_res.json()["data"]["items"] == []

        first_verify_res = await client.post(
            f"/api/v1/projects/{project_id}/domains/{second_domain_id}/verify",
        )
        assert first_verify_res.status_code == 404, first_verify_res.text
        assert first_verify_res.json()["error"] == "SITE_DOMAIN_NOT_FOUND"

        first_patch_res = await client.patch(
            f"/api/v1/projects/{project_id}/domains/{second_domain_id}",
            json={"isActive": True},
        )
        assert first_patch_res.status_code == 404, first_patch_res.text
        assert first_patch_res.json()["error"] == "SITE_DOMAIN_NOT_FOUND"

        first_delete_res = await client.delete(f"/api/v1/projects/{project_id}/domains/{second_domain_id}")
        assert first_delete_res.status_code == 404, first_delete_res.text
        assert first_delete_res.json()["error"] == "SITE_DOMAIN_NOT_FOUND"

        db_second = await SiteDomainRecord.filter(id=decode_public_id(second_domain_id)).values("site_id")
        assert db_second == [{"site_id": second_site_uuid}]
        assert db_second[0]["site_id"] != first_site_uuid
