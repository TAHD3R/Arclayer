from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict, Forbidden
from src.models.organization.user import User
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformInvitationStatus,
    PlatformOperator,
    PlatformOperatorStatus,
)
from src.models.platform_identity.mfa import PlatformMfaMethod, PlatformMfaMethodKind, PlatformMfaMethodStatus
from src.models.platform_identity.roles import (
    PlatformOperatorRoleAssignment,
    PlatformPermission,
    PlatformRole,
    PlatformRoleKind,
    PlatformRoleRevision,
    PlatformRoleRevisionPermission,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.repository import PlatformIdentityRepository
from src.modules.platform_identity.schema import (
    PlatformAuditEvent,
    PlatformOperatorInvitationCommand,
    PlatformOwnershipAcceptanceCommand,
    PlatformOwnershipNominationCommand,
    PlatformRoleBinding,
)

pytestmark = pytest.mark.integration


async def _create_user(label: str) -> User:
    token = uuid4().hex[:10]
    return await User.create(username=f"platform-{label}-{token}", email=f"{label}-{token}@example.com")


async def _create_delegable_role(*, label: str) -> PlatformRoleBinding:
    invite_permission, _created = await PlatformPermission.get_or_create(
        code=PlatformPermissionCode.ACCESS_TEAM_INVITE,
        defaults={
            "owner_domain": "access",
            "name_i18n": "Invite operators",
            "description_i18n": "Invite operators",
            "is_delegable": True,
        },
    )
    granted_permission = await PlatformPermission.create(
        code=f"platform:test-{label}-{uuid4().hex[:8]}",
        owner_domain="access",
        name_i18n="Test permission",
        description_i18n="Test permission",
        is_delegable=True,
    )
    role = await PlatformRole.create(
        code=f"platform-test-{label}-{uuid4().hex[:8]}",
        kind=PlatformRoleKind.CUSTOM,
        name=f"Test {label}",
    )
    revision = await PlatformRoleRevision.create(role_id=role.id, sequence=1, is_current=True)
    await PlatformRoleRevisionPermission.bulk_create([
        PlatformRoleRevisionPermission(role_revision_id=revision.id, permission_id=invite_permission.id),
        PlatformRoleRevisionPermission(role_revision_id=revision.id, permission_id=granted_permission.id),
    ])
    return PlatformRoleBinding(
        role_id=role.id,
        role_revision_id=revision.id,
        permission_codes=frozenset({invite_permission.code, granted_permission.code}),
    )


async def _activate_operator(*, user_id: UUID, role: PlatformRoleBinding) -> PlatformOperator:
    operator = await PlatformOperator.create(
        user_id=user_id, status=PlatformOperatorStatus.ACTIVE, activated_at=datetime.now(UTC)
    )
    await PlatformOperatorRoleAssignment.create(
        operator_id=operator.id,
        role_id=role.role_id,
        assigned_by_user_id=user_id,
        started_at=datetime.now(UTC),
    )
    return operator


def _invitation_command(
    *, inviter_user_id: UUID, recipient_user_id: UUID, role: PlatformRoleBinding
) -> PlatformOperatorInvitationCommand:
    return PlatformOperatorInvitationCommand(
        invitation_id=uuid4(),
        inviter_user_id=inviter_user_id,
        recipient_user_id=recipient_user_id,
        intended_roles=(role,),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        idempotency_key=f"invite-{uuid4().hex}",
        correlation_id=uuid4(),
    )


def _audit(*, event_name: str, actor_user_id: UUID, correlation_id: UUID, idempotency_key: str) -> PlatformAuditEvent:
    return PlatformAuditEvent(
        event_name=event_name,
        actor_user_id=actor_user_id,
        correlation_id=correlation_id,
        idempotency_key=idempotency_key,
    )


async def test_concurrent_invitation_retries_return_one_durable_receipt(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("owner")
    inviter = await _create_user("inviter")
    recipient = await _create_user("recipient")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_delegable_role(label="concurrent")
    command = _invitation_command(inviter_user_id=inviter.id, recipient_user_id=recipient.id, role=role)

    async def create():
        return await repository.create_operator_invitation(
            command=command,
            audit=_audit(
                event_name="platform.operator_invitation.sent",
                actor_user_id=inviter.id,
                correlation_id=command.correlation_id,
                idempotency_key=command.idempotency_key,
            ),
        )

    first, second = await asyncio.gather(create(), create())

    assert first.entity_id == second.entity_id
    assert {first.replayed, second.replayed} == {False, True}
    assert (
        await repository.get_invitation_by_idempotency_key(
            inviter_user_id=inviter.id,
            idempotency_key=command.idempotency_key,
        )
        is not None
    )
    conflicting = command.model_copy(
        update={
            "invitation_id": uuid4(),
            "intended_roles": (await _create_delegable_role(label="concurrent-conflict"),),
        }
    )
    with pytest.raises(Conflict, match="PLATFORM_INVITATION_IDEMPOTENCY_CONFLICT"):
        await repository.create_operator_invitation(
            command=conflicting,
            audit=_audit(
                event_name="platform.operator_invitation.sent",
                actor_user_id=inviter.id,
                correlation_id=conflicting.correlation_id,
                idempotency_key=conflicting.idempotency_key,
            ),
        )


async def test_invitation_acceptance_revalidates_revoked_inviter_authority(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("owner")
    inviter = await _create_user("inviter")
    recipient = await _create_user("recipient")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_delegable_role(label="acceptance")
    inviter_operator = await _activate_operator(user_id=inviter.id, role=role)
    command = _invitation_command(inviter_user_id=inviter.id, recipient_user_id=recipient.id, role=role)
    await repository.create_operator_invitation(
        command=command,
        audit=_audit(
            event_name="platform.operator_invitation.sent",
            actor_user_id=inviter.id,
            correlation_id=command.correlation_id,
            idempotency_key=command.idempotency_key,
        ),
    )
    await PlatformOperatorRoleAssignment.filter(operator_id=inviter_operator.id, ended_at__isnull=True).update(
        ended_at=datetime.now(UTC)
    )
    await PlatformMfaMethod.create(
        user_id=recipient.id,
        kind=PlatformMfaMethodKind.TOTP,
        status=PlatformMfaMethodStatus.VERIFIED,
        totp_secret_enc="test-secret",
        verified_at=datetime.now(UTC),
    )

    with pytest.raises(Forbidden, match="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED"):
        await repository.accept_operator_invitation(
            command=command,
            accepter_user_id=recipient.id,
            audit=_audit(
                event_name="platform.operator_invitation.accepted",
                actor_user_id=recipient.id,
                correlation_id=command.correlation_id,
                idempotency_key=command.idempotency_key,
            ),
        )

    invitation = await repository.get_invitation_by_id(invitation_id=command.invitation_id)
    assert invitation is not None
    assert invitation.status == PlatformInvitationStatus.PENDING
    assert await PlatformOperator.filter(user_id=recipient.id).count() == 0


async def test_transfer_revalidates_each_pending_former_owner_invitation(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    previous_owner = await _create_user("previous-owner")
    next_owner = await _create_user("next-owner")
    recipient = await _create_user("recipient")
    ownership = await PlatformInstanceOwnership.create(
        owner_user_id=previous_owner.id, singleton_key="instance", revision=1
    )
    role = await _create_delegable_role(label="transfer")
    next_owner_operator = await _activate_operator(user_id=next_owner.id, role=role)
    invitation = _invitation_command(inviter_user_id=previous_owner.id, recipient_user_id=recipient.id, role=role)
    await repository.create_operator_invitation(
        command=invitation,
        audit=_audit(
            event_name="platform.operator_invitation.sent",
            actor_user_id=previous_owner.id,
            correlation_id=invitation.correlation_id,
            idempotency_key=invitation.idempotency_key,
        ),
    )
    nomination = PlatformOwnershipNominationCommand(
        transfer_id=uuid4(),
        owner_user_id=previous_owner.id,
        target_user_id=next_owner.id,
        expected_ownership_revision=ownership.revision,
        expected_target_operator_revision=next_owner_operator.revision,
        former_owner_roles=(role,),
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        idempotency_key=f"transfer-{uuid4().hex}",
        correlation_id=uuid4(),
    )
    await repository.nominate_ownership_transfer(
        command=nomination,
        audit=_audit(
            event_name="platform.instance_ownership.nominated",
            actor_user_id=previous_owner.id,
            correlation_id=nomination.correlation_id,
            idempotency_key=nomination.idempotency_key,
        ),
    )
    acceptance = PlatformOwnershipAcceptanceCommand(
        transfer_id=nomination.transfer_id,
        target_user_id=next_owner.id,
        expected_transfer_revision=1,
        idempotency_key=f"accept-{uuid4().hex}",
        correlation_id=uuid4(),
    )
    await repository.accept_ownership_transfer(
        command=acceptance,
        audit=_audit(
            event_name="platform.instance_ownership.accepted",
            actor_user_id=next_owner.id,
            correlation_id=acceptance.correlation_id,
            idempotency_key=acceptance.idempotency_key,
        ),
    )

    persisted = await repository.get_invitation_by_id(invitation_id=invitation.invitation_id)
    assert persisted is not None
    assert persisted.status == PlatformInvitationStatus.PENDING
