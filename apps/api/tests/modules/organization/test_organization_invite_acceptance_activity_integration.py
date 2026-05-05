from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from src.common.invitations.tokens import build_invite_token
from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_invitation import OrganizationEmailInvite
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.user import User
from src.modules.auth.invitations.acceptance import service as acceptance_service_module
from src.modules.auth.invitations.acceptance.service import AuthInvitationAcceptanceService
from src.modules.auth.repository import UserRepository
from src.modules.auth.schema import AcceptInvitationRequest, TokenPair
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def test_organization_email_invite_acceptance_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = AuthInvitationAcceptanceService(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Invite Org")
    inviter = await user_repo.create_user(
        username=f"inviter_{uuid4().hex[:8]}",
        email=f"inviter_{uuid4().hex[:8]}@example.com",
        display_name="Inviter",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )
    await OrgMembership.create(
        organization_id=org.id,
        user_id=inviter.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )

    invite = await OrganizationEmailInvite.create(
        organization_id=org.id,
        email=f"accepted_{uuid4().hex[:8]}@example.com",
        role_code=OrgRole.ADMIN.value,
        code=f"oi_{uuid4().hex}",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        created_by_user_id=inviter.id,
    )
    token = build_invite_token(settings, code=invite.code)

    def _ensure_password_strength(_password: str) -> None:
        return None

    async def _issue_tokens(**_kwargs) -> TokenPair:  # type: ignore[no-untyped-def]
        return TokenPair(access_token="access", refresh_token="refresh", expires_in=3600, refresh_expires_in=7200)

    async def _ensure_role_codes_have_admin_access(**_kwargs) -> None:  # type: ignore[no-untyped-def]
        return None

    await service.accept_invitation(
        payload=AcceptInvitationRequest(
            token=token,
            username=f"accepted_{uuid4().hex[:8]}",
            password="accepted_pass_123",
            confirm_password="accepted_pass_123",
            display_name="Accepted User",
        ),
        ensure_password_strength=_ensure_password_strength,
        issue_tokens=_issue_tokens,
        ensure_role_codes_have_admin_access=_ensure_role_codes_have_admin_access,
    )

    accepted_user = await User.get(email=invite.email)
    membership = await OrgMembership.get(organization_id=org.id, user_id=accepted_user.id)
    await invite.refresh_from_db()
    assert membership.role == OrgRole.ADMIN
    assert membership.role_code == OrgRole.ADMIN.value
    assert invite.accepted_by_user_id == accepted_user.id
    assert invite.accepted_at is not None

    event = await AuditEvent.filter(
        event_name="organization.invite.accepted",
        organization_id=org.id,
        actor_user_id=accepted_user.id,
        subject_user_id=accepted_user.id,
        entity_type="organization",
        entity_id=org.id,
    ).first()
    assert event is not None
    assert event.properties["invite_kind"] == "email"
    assert event.properties["inviter_user_id"] == str(inviter.id)
    assert invite.email not in str(event.properties)

    rollback_invite = await OrganizationEmailInvite.create(
        organization_id=org.id,
        email=f"rollback_{uuid4().hex[:8]}@example.com",
        role_code=OrgRole.MEMBER.value,
        code=f"oi_{uuid4().hex}",
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        created_by_user_id=inviter.id,
    )
    rollback_token = build_invite_token(settings, code=rollback_invite.code)
    original_write_required_activity_event = acceptance_service_module.write_required_activity_event

    async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "organization.invite.accepted":
            raise RuntimeError("forced activity write failure: organization.invite.accepted")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.auth.invitations.acceptance.service.write_required_activity_event",
        _failing_write_required_activity_event,
    )

    event_count_before = await AuditEvent.filter(event_name="organization.invite.accepted").count()
    with pytest.raises(RuntimeError, match="forced activity write failure: organization.invite.accepted"):
        await service.accept_invitation(
            payload=AcceptInvitationRequest(
                token=rollback_token,
                username=f"rollback_{uuid4().hex[:8]}",
                password="rollback_pass_123",
                confirm_password="rollback_pass_123",
                display_name="Rollback User",
            ),
            ensure_password_strength=_ensure_password_strength,
            issue_tokens=_issue_tokens,
            ensure_role_codes_have_admin_access=_ensure_role_codes_have_admin_access,
        )

    await rollback_invite.refresh_from_db()
    assert await AuditEvent.filter(event_name="organization.invite.accepted").count() == event_count_before
    assert rollback_invite.accepted_by_user_id is None
    assert rollback_invite.accepted_at is None
    assert not await User.filter(email=rollback_invite.email).exists()
