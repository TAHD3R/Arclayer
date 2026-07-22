from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import decode_public_id, encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User
from src.models.projects.project import ProjectRecord
from src.models.system.rbac import SystemRole
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.workspaces.rbac.service import WorkspaceRBACService

pytestmark = pytest.mark.integration


async def _user(*, label: str) -> User:
    settings = get_settings()
    return await UserRepository().create_user(
        username=f"agent_catalog_{label}_{uuid4().hex[:8]}",
        email=f"agent_catalog_{label}_{uuid4().hex[:8]}@example.com",
        display_name=f"Agent Catalog {label.title()}",
        password_hash=hash_password("agent_catalog_password_123", settings.auth),
    )


async def test_workspace_agent_catalog_http_contract_scope_and_rbac(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        owner = await _user(label="owner")
        denied_user = await _user(label="denied")
        organization = await Organization.create(
            slug=f"agent-catalog-http-{uuid4().hex[:10]}",
            name="Agent Catalog HTTP Org",
            kind=OrganizationKind.TEAM,
            owner_user_id=owner.id,
            is_active=True,
        )
        await OrgMembership.create(
            organization_id=organization.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        workspace = await Workspace.create(
            organization_id=organization.id,
            name="Agent Catalog HTTP Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        project = await ProjectRecord.create(
            workspace_id=workspace.id,
            slug=f"agent-catalog-http-project-{uuid4().hex[:8]}",
            name="Agent Catalog HTTP Project",
            is_active=True,
            created_by_user_id=owner.id,
        )
        other_workspace = await Workspace.create(
            organization_id=organization.id,
            name="Other Agent Catalog Workspace",
            is_active=True,
            created_by_user_id=owner.id,
        )
        other_project = await ProjectRecord.create(
            workspace_id=other_workspace.id,
            slug=f"other-agent-catalog-project-{uuid4().hex[:8]}",
            name="Other Agent Catalog Project",
            is_active=True,
            created_by_user_id=owner.id,
        )

        await WorkspaceRBACService(settings).ensure_workspace_rbac_ready(workspace_id=workspace.id)
        owner_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        denied_membership = await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=denied_user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        owner_role = await SystemRole.get(workspace_id=workspace.id, code="owner")
        await WorkspaceMembershipRole.create(membership_id=owner_membership.id, role_id=owner_role.id)
        assert not await WorkspaceMembershipRole.filter(membership_id=denied_membership.id).exists()

        current_user: User = owner

        async def _get_user() -> User:
            return current_user

        async def _get_user_id() -> UUID:
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id
        workspace_id = encode_uuid(workspace.id)
        project_id = encode_uuid(project.id)
        catalog_url = f"/api/v1/workspaces/{workspace_id}/agents"

        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(catalog_url, params={"projectId": project_id})
                assert response.status_code == 200, response.text
                data = response.json()["data"]
                assert len(data["agents"]) == 6
                assert len(data["defaultAgentId"]) == 22
                assert decode_public_id(data["defaultAgentId"])
                assert [agent["slug"] for agent in data["agents"]] == [
                    "arclayer-coordinator",
                    "site-architect",
                    "visual-designer",
                    "content-writer",
                    "seo-strategist",
                    "data-analyst",
                ]
                assert all(len(agent["agentId"]) == 22 for agent in data["agents"])
                assert all(len(agent["versionId"]) == 22 for agent in data["agents"])
                assert all(len(agent["assignmentId"]) == 22 for agent in data["agents"])
                assert all(agent["available"] is True for agent in data["agents"])
                assert all(agent["unavailableReason"] is None for agent in data["agents"])

                wrong_project = await client.get(
                    catalog_url,
                    params={"projectId": encode_uuid(other_project.id)},
                )
                assert wrong_project.status_code == 404, wrong_project.text
                assert wrong_project.json()["error"] == "AGENT_PROJECT_NOT_FOUND"

                current_user = denied_user
                denied = await client.get(catalog_url, params={"projectId": project_id})
                assert denied.status_code == 403, denied.text
                assert denied.json()["error"] == "PERMISSION_DENIED"
        finally:
            app.dependency_overrides.clear()
