from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.models.projects.deployment import (
    ProjectDeploymentRecord,
    ProjectDeploymentRuntimeKind,
    ProjectDeploymentSourceType,
    ProjectDeploymentStatus,
)
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.organization.repository import OrganizationRepository
from tests.modules.projects.helpers import (
    prepare_project_publishable_tree,
    project_context_ids,
    publish_project_item_version,
)

pytestmark = pytest.mark.integration


@asynccontextmanager
async def _project_members_client(prepared_db, integration_valkey_settings):
    _ = prepared_db
    _ = integration_valkey_settings

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    current_user_ref: dict[str, User] = {}

    async with app.router.lifespan_context(app):
        await verify_db_ready(get_settings())
        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Test Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:10]}",
            email="owner@example.com",
            display_name="Owner",
            password_hash="x",
        )
        viewer = await user_repo.create_user(
            username=f"viewer_{uuid4().hex[:10]}",
            email="viewer@example.com",
            display_name="Viewer",
            password_hash="x",
        )
        await OrgMembership.create(organization_id=org.id, user_id=owner.id, role=OrgRole.OWNER, status="active")
        workspace = await Workspace.create(
            organization_id=org.id,
            name="Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=viewer.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        current_user_ref["user"] = owner

        async def _get_user() -> User:
            return current_user_ref["user"]

        async def _get_user_id() -> UUID:
            return current_user_ref["user"].id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            workspace_id = encode_uuid(workspace.id)
            project_id, runtime_id = await project_context_ids(client, workspace_id)
            await ProjectMembership.filter(project_id=decode_public_id(project_id), user_id=viewer.id).update(
                role=ProjectMemberRole.VIEWER
            )
            yield app, client, current_user_ref, workspace_id, project_id, runtime_id, owner, viewer

        app.dependency_overrides.clear()


async def _publish_release(
    client: AsyncClient,
    project_id: str,
    *,
    version: int,
    title_prefix: str,
    root_item_id: str,
    child_item_id: str,
) -> dict:
    await publish_project_item_version(
        client,
        project_id,
        root_item_id,
        version=version,
        title=f"{title_prefix} Home",
        path="/",
    )
    await publish_project_item_version(
        client,
        project_id,
        child_item_id,
        version=version,
        title=f"{title_prefix} About",
        path="/about",
    )
    publish_res = await client.post(f"/api/v1/projects/{project_id}/releases/publish", json={})
    assert publish_res.status_code == 200, publish_res.text
    return publish_res.json()["data"]["release"]


@pytest.mark.asyncio
async def test_project_publish_creates_environment_deployments_and_public_runtime_reads_production_deployment(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _project_members_client(prepared_db, integration_valkey_settings) as (
        _app,
        client,
        _current_user_ref,
        _workspace_id,
        project_id,
        runtime_id,
        _owner,
        _viewer,
    ):
        root_item_id, child_item_id = await prepare_project_publishable_tree(client, project_id)
        release = await _publish_release(
            client,
            project_id,
            version=1,
            title_prefix="First",
            root_item_id=root_item_id,
            child_item_id=child_item_id,
        )

        environments_res = await client.get(f"/api/v1/projects/{project_id}/environments")
        assert environments_res.status_code == 200, environments_res.text
        environments = {item["key"]: item for item in environments_res.json()["data"]["items"]}

        deployments_res = await client.get(f"/api/v1/projects/{project_id}/deployments")
        assert deployments_res.status_code == 200, deployments_res.text
        items = deployments_res.json()["data"]["items"]
        assert len(items) == 2
        assert {item["environmentKey"] for item in items} == {"development", "production"}

        production = next(item for item in items if item["environmentKey"] == "production")
        development = next(item for item in items if item["environmentKey"] == "development")
        assert production["isActive"] is True
        assert production["status"] == "promoted"
        assert production["sourceRef"] == release["id"]
        assert development["status"] == "ready"
        assert development["sourceRef"] == release["id"]

        preview_contract_res = await client.get(f"/api/v1/projects/{project_id}/publish/preview-contract")
        assert preview_contract_res.status_code == 200, preview_contract_res.text
        assert len(preview_contract_res.json()["data"]["routePointers"]) == 2

        public_route_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/routes/resolve", params={"path": "/"}
        )
        assert public_route_res.status_code == 200, public_route_res.text
        assert public_route_res.json()["data"]["document"]["path"] == "/"

        filtered_res = await client.get(
            f"/api/v1/projects/{project_id}/deployments",
            params={"environmentId": environments["production"]["id"], "status": "promoted"},
        )
        assert filtered_res.status_code == 200, filtered_res.text
        filtered = filtered_res.json()["data"]["items"]
        assert len(filtered) == 1
        assert filtered[0]["id"] == production["id"]

        staging_promote_res = await client.post(
            f"/api/v1/projects/{project_id}/deployments/{development['id']}/promote",
            json={"environmentId": environments["staging"]["id"]},
        )
        assert staging_promote_res.status_code == 200, staging_promote_res.text
        assert staging_promote_res.json()["data"]["deployment"]["environmentKey"] == "staging"
        assert staging_promote_res.json()["data"]["deployment"]["sourceRef"] == release["id"]


@pytest.mark.asyncio
async def test_project_deployment_rollback_cancel_and_permission_gating(
    prepared_db,
    integration_valkey_settings,
) -> None:
    async with _project_members_client(prepared_db, integration_valkey_settings) as (
        _app,
        client,
        current_user_ref,
        _workspace_id,
        project_id,
        runtime_id,
        owner,
        viewer,
    ):
        root_item_id, child_item_id = await prepare_project_publishable_tree(client, project_id)
        first_release = await _publish_release(
            client,
            project_id,
            version=1,
            title_prefix="First",
            root_item_id=root_item_id,
            child_item_id=child_item_id,
        )
        second_release = await _publish_release(
            client,
            project_id,
            version=2,
            title_prefix="Second",
            root_item_id=root_item_id,
            child_item_id=child_item_id,
        )

        list_res = await client.get(f"/api/v1/projects/{project_id}/deployments")
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["data"]["items"]
        first_production = next(
            item
            for item in items
            if item["environmentKey"] == "production" and item["sourceRef"] == first_release["id"]
        )

        rollback_res = await client.post(
            f"/api/v1/projects/{project_id}/deployments/{first_production['id']}/rollback",
            json={},
        )
        assert rollback_res.status_code == 200, rollback_res.text
        assert rollback_res.json()["data"]["deployment"]["environmentKey"] == "production"
        assert rollback_res.json()["data"]["deployment"]["sourceRef"] == first_release["id"]

        public_route_res = await client.get(
            f"/content-api/v1/runtimes/{runtime_id}/routes/resolve", params={"path": "/"}
        )
        assert public_route_res.status_code == 200, public_route_res.text

        environments_res = await client.get(f"/api/v1/projects/{project_id}/environments")
        environments = {item["key"]: item for item in environments_res.json()["data"]["items"]}
        queued = await ProjectDeploymentRecord.create(
            project_id=decode_public_id(project_id),
            runtime_id=decode_public_id(runtime_id),
            environment_id=decode_public_id(environments["staging"]["id"]),
            source_type=ProjectDeploymentSourceType.UPLOADED_BUNDLE,
            source_ref="bundle:queued",
            status=ProjectDeploymentStatus.QUEUED,
            runtime_kind=ProjectDeploymentRuntimeKind.STATIC,
            artifact_key="bundle:queued",
            is_active=False,
            created_by_user_id=owner.id,
        )
        cancel_res = await client.post(f"/api/v1/projects/{project_id}/deployments/{encode_uuid(queued.id)}/cancel")
        assert cancel_res.status_code == 200, cancel_res.text
        assert cancel_res.json()["data"]["deployment"]["status"] == "canceled"

        current_user_ref["user"] = viewer
        forbidden_res = await client.post(
            f"/api/v1/projects/{project_id}/deployments/{encode_uuid(queued.id)}/promote",
            json={"environmentId": environments["production"]["id"]},
        )
        assert forbidden_res.status_code == 403, forbidden_res.text
        current_user_ref["user"] = owner

        release_detail_res = await client.get(f"/api/v1/projects/{project_id}/releases/{first_release['id']}")
        assert release_detail_res.status_code == 200, release_detail_res.text
        assert release_detail_res.json()["data"]["id"] == first_release["id"]
        assert second_release["id"] != first_release["id"]
