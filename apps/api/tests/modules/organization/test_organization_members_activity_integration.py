from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_invitation import OrganizationEmailInvite
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.members import service as org_members_service_module
from src.modules.organization.members.schema import OrganizationMemberInviteRequest
from src.modules.organization.members.service import OrganizationMemberService
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def test_organization_member_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = OrganizationMemberService(settings)
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
    owner_orgm = await OrgMembership.create(
        organization_id=org.id,
        user_id=owner.id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )
    member_orgm = await OrgMembership.create(
        organization_id=org.id,
        user_id=member.id,
        role=OrgRole.MEMBER,
        role_code=OrgRole.MEMBER.value,
        status="active",
    )
    workspace = await Workspace.create(
        organization_id=org.id,
        name="Default",
        is_active=True,
        created_by_user_id=owner.id,
    )
    member_workspace_membership = await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=member.id,
        status=WorkspaceMembershipStatus.ACTIVE,
        invited_by_user_id=owner.id,
    )

    invite_email = f"invite_{uuid4().hex[:8]}@example.com"
    invite = await service.invite_member(
        organization_id=org.id,
        actor_membership=owner_orgm,
        payload=OrganizationMemberInviteRequest(email=invite_email, role_code=OrgRole.MEMBER.value),
    )
    invited_event = await AuditEvent.filter(
        event_name="organization.member.invited",
        organization_id=org.id,
        actor_user_id=owner.id,
        entity_type="organization_email_invite",
        entity_id=invite.invitation_id,
    ).first()
    assert invited_event is not None
    assert invited_event.properties["email"] == invite_email
    assert invited_event.properties["role_code"] == OrgRole.MEMBER.value

    original_write_required_activity_event = org_members_service_module.write_required_activity_event

    async def _failing_invite_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "organization.member.invited":
            raise RuntimeError("forced activity write failure: organization.member.invited")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="organization.member.").count()
    rollback_invite_email = f"rollback_{uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        _failing_invite_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.invite_member(
            organization_id=org.id,
            actor_membership=owner_orgm,
            payload=OrganizationMemberInviteRequest(email=rollback_invite_email, role_code=OrgRole.MEMBER.value),
        )
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        original_write_required_activity_event,
    )
    assert await AuditEvent.filter(event_name__startswith="organization.member.").count() == event_count_before
    assert not await OrganizationEmailInvite.filter(organization_id=org.id, email=rollback_invite_email).exists()

    updated = await service.update_member_role(
        organization_id=org.id,
        actor_membership=owner_orgm,
        target_membership_id=member_orgm.id,
        role_code=OrgRole.ADMIN.value,
    )
    role_event = await AuditEvent.filter(
        event_name="organization.member.role_updated",
        organization_id=org.id,
        actor_user_id=owner.id,
        subject_user_id=member.id,
        entity_type="organization_membership",
        entity_id=member_orgm.id,
    ).first()
    assert updated.role == OrgRole.ADMIN
    assert role_event is not None
    assert role_event.properties["previous_role_code"] == OrgRole.MEMBER.value
    assert role_event.properties["role_code"] == OrgRole.ADMIN.value

    async def _failing_role_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "organization.member.role_updated":
            raise RuntimeError("forced activity write failure: organization.member.role_updated")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="organization.member.").count()
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        _failing_role_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.update_member_role(
            organization_id=org.id,
            actor_membership=owner_orgm,
            target_membership_id=member_orgm.id,
            role_code=OrgRole.MEMBER.value,
        )
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        original_write_required_activity_event,
    )
    refetched_member = await OrgMembership.get(id=member_orgm.id)
    assert await AuditEvent.filter(event_name__startswith="organization.member.").count() == event_count_before
    assert refetched_member.role == OrgRole.ADMIN
    assert refetched_member.role_code == OrgRole.ADMIN.value

    async def _failing_remove_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == "organization.member.removed":
            raise RuntimeError("forced activity write failure: organization.member.removed")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    event_count_before = await AuditEvent.filter(event_name__startswith="organization.member.").count()
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        _failing_remove_activity_event,
    )
    with pytest.raises(RuntimeError, match="forced activity write failure"):
        await service.remove_member(
            organization_id=org.id,
            actor_membership=owner_orgm,
            target_membership_id=member_orgm.id,
        )
    monkeypatch.setattr(
        "src.modules.organization.members.service.write_required_activity_event",
        original_write_required_activity_event,
    )
    refetched_member = await OrgMembership.get(id=member_orgm.id)
    refetched_workspace_membership = await WorkspaceMembership.get(id=member_workspace_membership.id)
    assert await AuditEvent.filter(event_name__startswith="organization.member.").count() == event_count_before
    assert refetched_member.status == "active"
    assert refetched_workspace_membership.status == WorkspaceMembershipStatus.ACTIVE

    removed = await service.remove_member(
        organization_id=org.id,
        actor_membership=owner_orgm,
        target_membership_id=member_orgm.id,
    )
    removed_event = await AuditEvent.filter(
        event_name="organization.member.removed",
        organization_id=org.id,
        actor_user_id=owner.id,
        subject_user_id=member.id,
        entity_type="organization_membership",
        entity_id=member_orgm.id,
    ).first()
    assert removed.removed is True
    assert removed_event is not None
    assert removed_event.properties["target_user_id"] == str(member.id)
    assert not await OrgMembership.filter(id=member_orgm.id).exists()
    removed_workspace_membership = await WorkspaceMembership.get(id=member_workspace_membership.id)
    assert removed_workspace_membership.status == WorkspaceMembershipStatus.DISABLED
