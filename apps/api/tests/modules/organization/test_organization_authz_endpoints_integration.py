from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.common.utils.public_ids import encode_uuid
from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_app
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.modules.auth.http.service import get_current_user, get_current_user_id
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_organization_authz_and_action_contracts(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        org_repo = OrganizationRepository()
        user_repo = UserRepository()

        org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org")
        owner = await user_repo.create_user(
            username=f"owner_{uuid4().hex[:8]}",
            email=f"owner_{uuid4().hex[:8]}@example.com",
            display_name="Owner",
            password_hash=hash_password("owner_pass_123", settings.auth),
        )
        member = await user_repo.create_user(
            username=f"member_{uuid4().hex[:8]}",
            email=f"member_{uuid4().hex[:8]}@example.com",
            display_name="Member",
            password_hash=hash_password("member_pass_123", settings.auth),
        )
        await OrgMembership.create(
            organization_id=org.id,
            user_id=owner.id,
            role=OrgRole.OWNER,
            role_code=OrgRole.OWNER.value,
            status="active",
        )
        await OrgMembership.create(
            organization_id=org.id,
            user_id=member.id,
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
            status="active",
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

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            owner_authz = await client.get("/api/v1/organizations/me/authz")
            assert owner_authz.status_code == 200, owner_authz.text
            owner_data = owner_authz.json()["data"]
            assert owner_data["scope"] == "organization"
            assert owner_data["organizationId"] == encode_uuid(org.id)
            assert owner_data["userId"] == encode_uuid(owner.id)
            assert owner_data["roleCodes"] == ["owner"]
            assert "org.settings.delete" in owner_data["permissionCodes"]
            assert "org.settings.assign-default-role" in owner_data["permissionCodes"]

            actions_resp = await client.get("/api/v1/organizations/me/actions")
            assert actions_resp.status_code == 200, actions_resp.text
            actions = actions_resp.json()["data"]
            settings_delete = next((item for item in actions if item["code"] == "org.settings.delete"), None)
            assert settings_delete is not None
            assert settings_delete["permissionCodes"] == ["org.settings.delete"]
            assert settings_delete["subjectKinds"] == ["organization_member"]

            current_user = member
            member_authz = await client.get("/api/v1/organizations/me/authz")
            assert member_authz.status_code == 200, member_authz.text
            member_data = member_authz.json()["data"]
            assert member_data["scope"] == "organization"
            assert member_data["organizationId"] == encode_uuid(org.id)
            assert member_data["userId"] == encode_uuid(member.id)
            assert member_data["roleCodes"] == ["member"]
            assert "org.members.read" in member_data["permissionCodes"]
            assert "org.settings.delete" not in member_data["permissionCodes"]
