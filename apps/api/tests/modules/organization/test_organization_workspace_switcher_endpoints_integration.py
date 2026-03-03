from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.security import hash_password
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.organization.models.user import User
from apps.api.src.modules.organization.repository import OrganizationRepository
from apps.api.src.modules.workspaces.models.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipStatus,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_workspace_switcher_endpoints_support_explicit_organization_scope(
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

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org_alpha = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org Alpha")
        org_beta = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org Beta")

        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:8]}",
            email=f"owner_{uuid4().hex[:8]}@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        collaborator = await user_repo.create_user(
            username=f"collab_{uuid4().hex[:8]}",
            email=f"collab_{uuid4().hex[:8]}@example.com",
            display_name="Collaborator",
            password_hash=hash_password("collab_pass_123", settings.auth),
        )

        await OrgMembership.create(
            organization_id=org_alpha.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            status="active",
        )
        await OrgMembership.create(
            organization_id=org_beta.id,
            user_id=owner.id,
            role=OrgRole.ADMIN,
            status="active",
        )

        workspace_owned = await Workspace.create(
            organization_id=org_alpha.id,
            slug="owned",
            name="Owned",
            is_active=True,
            created_by_user_id=owner.id,
        )
        workspace_other = await Workspace.create(
            organization_id=org_alpha.id,
            slug="other",
            name="Other",
            is_active=True,
            created_by_user_id=collaborator.id,
        )

        await WorkspaceMembership.create(
            workspace_id=workspace_owned.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
            invited_by_user_id=None,
        )

        current_user: User | None = owner

        async def _get_user() -> User:
            assert current_user is not None
            return current_user

        async def _get_user_id() -> UUID:
            assert current_user is not None
            return current_user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        org_alpha_id = encode_uuid(org_alpha.id)
        org_beta_id = encode_uuid(org_beta.id)

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            my_orgs_resp = await client.get("/api/v1/me/organizations")
            assert my_orgs_resp.status_code == 200, my_orgs_resp.text
            my_orgs_payload = my_orgs_resp.json()["data"]
            assert my_orgs_payload["total"] == 2

            by_org_id = {item["organization"]["id"]: item for item in my_orgs_payload["items"]}
            assert by_org_id[org_alpha_id]["membership"]["role"] == "owner"
            assert by_org_id[org_beta_id]["membership"]["role"] == "admin"
            assert by_org_id[org_alpha_id]["memberCount"] == 1
            assert len(by_org_id[org_alpha_id]["membersPreview"]) == 1

            list_resp = await client.get(f"/api/v1/organizations/{org_alpha_id}/workspaces")
            assert list_resp.status_code == 200, list_resp.text
            listed_items = list_resp.json()["data"]["items"]
            assert len(listed_items) == 2

            listed_by_workspace = {item["workspaceId"]: item for item in listed_items}
            assert listed_by_workspace[encode_uuid(workspace_owned.id)]["enterable"] is True
            assert listed_by_workspace[encode_uuid(workspace_other.id)]["enterable"] is False

            enterable_only_resp = await client.get(
                f"/api/v1/organizations/{org_alpha_id}/workspaces",
                params={"enterable_only": "true"},
            )
            assert enterable_only_resp.status_code == 200, enterable_only_resp.text
            enterable_only_items = enterable_only_resp.json()["data"]["items"]
            assert len(enterable_only_items) == 1
            assert enterable_only_items[0]["workspaceId"] == encode_uuid(workspace_owned.id)
            assert enterable_only_items[0]["enterable"] is True

            legacy_enterable_only_resp = await client.get(
                "/api/v1/organizations/me/workspaces",
                params={"enterable_only": "true"},
            )
            assert legacy_enterable_only_resp.status_code == 200, legacy_enterable_only_resp.text
            legacy_enterable_only_items = legacy_enterable_only_resp.json()["data"]["items"]
            assert len(legacy_enterable_only_items) == 1
            assert legacy_enterable_only_items[0]["workspaceId"] == encode_uuid(workspace_owned.id)

            forbidden_resp = await client.get(f"/api/v1/organizations/{encode_uuid(uuid4())}/workspaces")
            assert forbidden_resp.status_code == 403, forbidden_resp.text
            assert forbidden_resp.json().get("error") == "ORG_MEMBERSHIP_REQUIRED"


@pytest.mark.asyncio
async def test_my_organizations_support_empty_state_and_create(
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

        user_repo = UserRepository()

        user = await user_repo.create_user(
            username=f"user_{uuid4().hex[:8]}",
            email=f"user_{uuid4().hex[:8]}@example.com",
            display_name="User",
            password_hash=hash_password("user_pass_123", settings.auth),
        )

        async def _get_user() -> User:
            return user

        async def _get_user_id() -> UUID:
            return user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            empty_resp = await client.get("/api/v1/me/organizations")
            assert empty_resp.status_code == 200, empty_resp.text
            empty_payload = empty_resp.json()["data"]
            assert empty_payload["total"] == 0
            assert empty_payload["items"] == []

            created_resp = await client.post(
                "/api/v1/me/organizations",
                json={"name": "New Organization", "slug": "new-org"},
            )
            assert created_resp.status_code == 200, created_resp.text
            created_payload = created_resp.json()["data"]
            assert created_payload["organization"]["name"] == "New Organization"
            assert created_payload["organization"]["slug"] == "new-org"
            assert created_payload["membership"]["role"] == "owner"
            assert created_payload["memberCount"] == 1
            assert len(created_payload["membersPreview"]) == 1

            duplicate_slug_resp = await client.post(
                "/api/v1/me/organizations",
                json={"name": "Another Organization", "slug": "new-org"},
            )
            assert duplicate_slug_resp.status_code == 200, duplicate_slug_resp.text
            duplicate_payload = duplicate_slug_resp.json()["data"]
            assert duplicate_payload["organization"]["slug"].startswith("new-org")
            assert duplicate_payload["organization"]["slug"] != "new-org"

            listed_resp = await client.get("/api/v1/me/organizations")
            assert listed_resp.status_code == 200, listed_resp.text
            listed_payload = listed_resp.json()["data"]
            assert listed_payload["total"] == 2
