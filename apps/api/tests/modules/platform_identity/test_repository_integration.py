from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import Conflict, Forbidden
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.user import User
from src.models.platform_identity.identity import (
    PlatformInstanceOwnership,
    PlatformInvitationStatus,
    PlatformOperator,
    PlatformOperatorSetupReason,
    PlatformOperatorStatus,
)
from src.models.platform_identity.mfa import (
    PlatformMfaMethod,
    PlatformMfaMethodKind,
    PlatformMfaMethodStatus,
    PlatformMfaRecoveryCode,
)
from src.models.platform_identity.operations import (
    PlatformActionPolicy,
    PlatformSession,
    PlatformVerificationAssurance,
)
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
    PlatformInvitationAcceptanceCommand,
    PlatformOffboardingCommand,
    PlatformOperatorInvitationCommand,
    PlatformOwnershipAcceptanceCommand,
    PlatformOwnershipNominationCommand,
    PlatformRoleBinding,
)

pytestmark = pytest.mark.integration

LOCK_PROBE_TIMEOUT_SECONDS = 0.1


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


async def _create_test_role(*, label: str) -> PlatformRoleBinding:
    permission = await PlatformPermission.create(
        code=f"platform:test-role-{label}-{uuid4().hex[:8]}",
        owner_domain="access",
        name_i18n="Test role permission",
        description_i18n="Test role permission",
        is_delegable=True,
    )
    role = await PlatformRole.create(
        code=f"platform-test-role-{label}-{uuid4().hex[:8]}",
        kind=PlatformRoleKind.CUSTOM,
        name=f"Test role {label}",
    )
    revision = await PlatformRoleRevision.create(role_id=role.id, sequence=1, is_current=True)
    await PlatformRoleRevisionPermission.create(role_revision_id=revision.id, permission_id=permission.id)
    return PlatformRoleBinding(
        role_id=role.id,
        role_revision_id=revision.id,
        permission_codes=frozenset({permission.code}),
    )


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


async def test_locked_action_policy_loads_permission_without_locking_an_outer_join(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    permission = await PlatformPermission.create(
        code=f"platform:test-step-up-{uuid4().hex[:8]}",
        owner_domain="access",
        name_i18n="Step-up test permission",
        description_i18n="Step-up test permission",
        is_delegable=False,
    )
    policy = await PlatformActionPolicy.create(
        code=f"platform.test.step-up.{uuid4().hex[:8]}",
        permission_id=permission.id,
        requires_step_up=True,
        required_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
        freshness_seconds=300,
    )

    async with repository.transaction() as conn:
        locked = await repository.get_action_policy(action_code=policy.code, conn=conn, for_update=True)

    assert locked is not None
    assert locked.id == policy.id
    assert locked.permission.code == permission.code


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


async def test_role_replacement_adds_removes_and_can_clear_the_complete_assignment_set(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("replace-role-owner")
    operator_user = await _create_user("replace-role-operator")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    previous_role = await _create_test_role(label="previous")
    replacement_role = await _create_test_role(label="replacement")
    operator = await _activate_operator(user_id=operator_user.id, role=previous_role)

    replaced = await repository.replace_operator_roles(
        actor_user_id=owner.id,
        target_user_id=operator_user.id,
        expected_operator_revision=operator.revision,
        role_ids=frozenset({replacement_role.role_id}),
        idempotency_key=f"replace-roles-{uuid4().hex}",
        correlation_id=uuid4(),
    )

    active_after_replace = await repository.list_active_role_assignments(
        operator_id=operator.id,
        at=datetime.now(UTC),
    )
    assert replaced.mutation == "replace_platform_roles"
    assert {UUID(str(item.role_id)) for item in active_after_replace} == {replacement_role.role_id}
    await operator.refresh_from_db()
    assert operator.revision == 2

    cleared = await repository.replace_operator_roles(
        actor_user_id=owner.id,
        target_user_id=operator_user.id,
        expected_operator_revision=operator.revision,
        role_ids=frozenset(),
        idempotency_key=f"clear-roles-{uuid4().hex}",
        correlation_id=uuid4(),
    )

    active_after_clear = await repository.list_active_role_assignments(
        operator_id=operator.id,
        at=datetime.now(UTC),
    )
    assert cleared.mutation == "replace_platform_roles"
    assert active_after_clear == []
    await operator.refresh_from_db()
    assert operator.revision == 3


async def test_current_actor_security_mutations_do_not_require_administrative_permissions(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("self-security-owner")
    operator_user = await _create_user("self-security-operator")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_test_role(label="self-security")
    operator = await _activate_operator(user_id=operator_user.id, role=role)
    now = datetime.now(UTC)
    current_session = await PlatformSession.create(
        actor_user_id=operator_user.id,
        operator_id=operator.id,
        session_identifier_hash=f"current-{uuid4().hex}",
        recent_activity_at=now,
        inactivity_expires_at=now + timedelta(hours=1),
        absolute_expires_at=now + timedelta(hours=8),
        policy_revision=1,
        assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    other_session = await PlatformSession.create(
        actor_user_id=operator_user.id,
        operator_id=operator.id,
        session_identifier_hash=f"other-{uuid4().hex}",
        recent_activity_at=now,
        inactivity_expires_at=now + timedelta(hours=1),
        absolute_expires_at=now + timedelta(hours=8),
        policy_revision=1,
        assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    first_method = await PlatformMfaMethod.create(
        user_id=operator_user.id,
        kind=PlatformMfaMethodKind.TOTP,
        status=PlatformMfaMethodStatus.VERIFIED,
        totp_secret_enc="encrypted-one",
        verified_at=now,
    )
    await PlatformMfaMethod.create(
        user_id=operator_user.id,
        kind=PlatformMfaMethodKind.TOTP,
        status=PlatformMfaMethodStatus.VERIFIED,
        totp_secret_enc="encrypted-two",
        verified_at=now,
    )

    session_receipt = await repository.revoke_current_actor_sessions(
        actor_user_id=operator_user.id,
        current_session_id=current_session.id,
        session_id=other_session.id,
        all_other=False,
        idempotency_key=f"self-session-{uuid4().hex}",
        correlation_id=uuid4(),
    )
    method_receipt = await repository.remove_current_actor_mfa_method(
        actor_user_id=operator_user.id,
        method_id=first_method.id,
        idempotency_key=f"self-mfa-{uuid4().hex}",
        correlation_id=uuid4(),
    )

    await other_session.refresh_from_db()
    await first_method.refresh_from_db()
    assert session_receipt.mutation == "revoke_platform_session"
    assert other_session.revoked_at is not None
    assert method_receipt.mutation == "remove_platform_mfa_method"
    assert first_method.status == PlatformMfaMethodStatus.REVOKED


async def test_operator_security_management_revokes_sessions_and_starts_mfa_recovery(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("managed-security-owner")
    operator_user = await _create_user("managed-security-operator")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_test_role(label="managed-security")
    operator = await _activate_operator(user_id=operator_user.id, role=role)
    now = datetime.now(UTC)
    first_session = await PlatformSession.create(
        actor_user_id=operator_user.id,
        operator_id=operator.id,
        session_identifier_hash=f"managed-one-{uuid4().hex}",
        recent_activity_at=now,
        inactivity_expires_at=now + timedelta(hours=1),
        absolute_expires_at=now + timedelta(hours=8),
        policy_revision=1,
        assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    second_session = await PlatformSession.create(
        actor_user_id=operator_user.id,
        operator_id=operator.id,
        session_identifier_hash=f"managed-two-{uuid4().hex}",
        recent_activity_at=now,
        inactivity_expires_at=now + timedelta(hours=1),
        absolute_expires_at=now + timedelta(hours=8),
        policy_revision=1,
        assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
    method = await PlatformMfaMethod.create(
        user_id=operator_user.id,
        kind=PlatformMfaMethodKind.WEBAUTHN,
        status=PlatformMfaMethodStatus.VERIFIED,
        credential_id=f"managed-credential-{uuid4().hex}",
        credential_public_key="public-key",
        relying_party_id="platform.example.test",
        verified_at=now,
    )
    recovery_code = await PlatformMfaRecoveryCode.create(
        operator_id=operator.id,
        salt="salt",
        code_hash="hash",
    )

    assert len(await repository.list_active_sessions_for_operator(operator_id=operator.id)) == 2
    revoke_receipt = await repository.revoke_operator_session(
        actor_user_id=owner.id,
        operator_id=operator.id,
        session_id=first_session.id,
        idempotency_key=f"managed-revoke-{uuid4().hex}",
        correlation_id=uuid4(),
    )
    reset_receipt = await repository.reset_operator_mfa(
        actor_user_id=owner.id,
        operator_id=operator.id,
        expected_operator_revision=operator.revision,
        reason="Operator lost every trusted device",
        idempotency_key=f"managed-reset-{uuid4().hex}",
        correlation_id=uuid4(),
    )

    await first_session.refresh_from_db()
    await second_session.refresh_from_db()
    await method.refresh_from_db()
    await recovery_code.refresh_from_db()
    await operator.refresh_from_db()
    assert revoke_receipt.mutation == "revoke_operator_platform_session"
    assert first_session.revoked_at is not None
    assert reset_receipt.mutation == "reset_platform_operator_mfa"
    assert second_session.revoked_at is not None
    assert method.status == PlatformMfaMethodStatus.REVOKED
    assert recovery_code.invalidated_at is not None
    assert operator.status == PlatformOperatorStatus.MFA_SETUP_REQUIRED
    assert operator.setup_reason == PlatformOperatorSetupReason.RECOVERY
    assert operator.revision == 2


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
    acceptance = PlatformInvitationAcceptanceCommand(
        invitation_id=command.invitation_id,
        accepter_user_id=recipient.id,
        expected_invitation_revision=1,
        idempotency_key="accept-revoked-inviter",
        correlation_id=uuid4(),
    )

    with pytest.raises(Forbidden, match="PLATFORM_OPERATOR_INVITATION_PERMISSION_REQUIRED"):
        await repository.begin_operator_invitation_acceptance(
            command=acceptance,
            audit=_audit(
                event_name="platform.operator_invitation.acceptance_started",
                actor_user_id=recipient.id,
                correlation_id=acceptance.correlation_id,
                idempotency_key=acceptance.idempotency_key,
            ),
        )

    invitation = await repository.get_invitation_by_id(invitation_id=command.invitation_id)
    assert invitation is not None
    assert invitation.status == PlatformInvitationStatus.PENDING
    assert await PlatformOperator.filter(user_id=recipient.id).count() == 0


async def test_invitation_mfa_setup_grants_no_authority_then_activation_commits_roles(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("owner-activation")
    recipient = await _create_user("recipient-activation")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_delegable_role(label="activation")
    invitation = _invitation_command(inviter_user_id=owner.id, recipient_user_id=recipient.id, role=role)
    await repository.create_operator_invitation(
        command=invitation,
        audit=_audit(
            event_name="platform.operator_invitation.sent",
            actor_user_id=owner.id,
            correlation_id=invitation.correlation_id,
            idempotency_key=invitation.idempotency_key,
        ),
    )
    acceptance = PlatformInvitationAcceptanceCommand(
        invitation_id=invitation.invitation_id,
        accepter_user_id=recipient.id,
        expected_invitation_revision=1,
        idempotency_key="accept-activation",
        correlation_id=uuid4(),
    )

    setup = await repository.begin_operator_invitation_acceptance(
        command=acceptance,
        audit=_audit(
            event_name="platform.operator_invitation.acceptance_started",
            actor_user_id=recipient.id,
            correlation_id=acceptance.correlation_id,
            idempotency_key=acceptance.idempotency_key,
        ),
    )

    pending = await repository.get_identity_snapshot(user_id=recipient.id, at=datetime.now(UTC))
    operator = await PlatformOperator.get(id=setup.operator_id)
    assert pending.is_active_operator is False
    assert pending.effective_permissions == frozenset()
    assert operator.status == PlatformOperatorStatus.MFA_SETUP_REQUIRED
    assert operator.setup_reason == PlatformOperatorSetupReason.INVITATION

    async with repository.transaction() as conn:
        await PlatformMfaMethod.create(
            using_db=conn,
            user_id=recipient.id,
            kind=PlatformMfaMethodKind.WEBAUTHN,
            status=PlatformMfaMethodStatus.VERIFIED,
            credential_id=f"credential-{uuid4().hex}",
            credential_public_key="test-public-key",
            relying_party_id="platform.example.test",
            verified_at=datetime.now(UTC),
        )
        await repository.activate_operator_invitation(
            user_id=recipient.id,
            operator_id=setup.operator_id,
            invitation_id=setup.invitation_id,
            expected_invitation_revision=setup.invitation_revision,
            correlation_id=uuid4(),
            idempotency_key="activate-invitation",
            conn=conn,
        )

    active = await repository.get_identity_snapshot(user_id=recipient.id, at=datetime.now(UTC))
    invitation_row = await repository.get_invitation_by_id(invitation_id=invitation.invitation_id)
    assert active.is_active_operator is True
    assert PlatformPermissionCode.ACCESS_TEAM_INVITE in active.effective_permissions
    assert invitation_row is not None and invitation_row.status == PlatformInvitationStatus.ACCEPTED


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


async def test_authority_barrier_blocks_offboarding_until_permission_checked_apply_commits(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("barrier-owner")
    operator_user = await _create_user("barrier-operator")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    role = await _create_delegable_role(label="barrier")
    operator = await _activate_operator(user_id=operator_user.id, role=role)
    permission_code = next(code for code in role.permission_codes if code != PlatformPermissionCode.ACCESS_TEAM_INVITE)
    authority_locked = asyncio.Event()
    allow_apply_commit = asyncio.Event()
    revocation_started = asyncio.Event()

    async def apply() -> None:
        async with repository.transaction() as conn:
            await repository.assert_platform_permission_for_update(
                actor_user_id=operator_user.id,
                permission_code=permission_code,
                at=datetime.now(UTC),
                conn=conn,
            )
            authority_locked.set()
            await allow_apply_commit.wait()
            await AuditEvent.create(
                using_db=conn,
                occurred_at=datetime.now(UTC),
                event_name="platform.test.authorized_apply.accepted",
                actor_user_id=operator_user.id,
                entity_type="platform_test_apply",
                entity_id=uuid4(),
                source="platform",
                properties={},
            )

    async def revoke() -> None:
        revocation_started.set()
        await repository.offboard_operator(
            command=PlatformOffboardingCommand(
                actor_user_id=owner.id,
                target_user_id=operator_user.id,
                expected_operator_revision=operator.revision,
                reason="Concurrent authority revocation test",
                idempotency_key=f"offboard-{uuid4().hex}",
                correlation_id=uuid4(),
            ),
            audit=_audit(
                event_name="platform.operator.offboarded",
                actor_user_id=owner.id,
                correlation_id=uuid4(),
                idempotency_key=f"audit-{uuid4().hex}",
            ),
        )

    apply_task = asyncio.create_task(apply())
    revoke_task: asyncio.Task[None] | None = None
    try:
        await asyncio.wait_for(authority_locked.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        revoke_task = asyncio.create_task(revoke())
        await asyncio.wait_for(revocation_started.wait(), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(asyncio.shield(revoke_task), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
        allow_apply_commit.set()
        await asyncio.wait_for(asyncio.gather(apply_task, revoke_task), timeout=LOCK_PROBE_TIMEOUT_SECONDS)
    finally:
        allow_apply_commit.set()
        if revoke_task is not None and not revoke_task.done():
            await revoke_task
        if not apply_task.done():
            await apply_task

    assert await AuditEvent.filter(event_name="platform.test.authorized_apply.accepted").count() == 1
    persisted_operator = await repository.get_operator_by_user_id(user_id=operator_user.id)
    assert persisted_operator is not None
    assert persisted_operator.status == PlatformOperatorStatus.DEACTIVATED


async def test_role_revision_change_is_observed_by_the_next_locked_permission_check(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    operator_user = await _create_user("revision-operator")
    role = await _create_delegable_role(label="revision")
    operator = await _activate_operator(user_id=operator_user.id, role=role)
    removed_permission = next(
        code for code in role.permission_codes if code != PlatformPermissionCode.ACCESS_TEAM_INVITE
    )
    replacement_permission = await PlatformPermission.create(
        code=f"platform:test-revision-replacement-{uuid4().hex[:8]}",
        owner_domain="access",
        name_i18n="Replacement permission",
        description_i18n="Replacement permission",
        is_delegable=True,
    )
    now = datetime.now(UTC)

    async with repository.transaction() as conn:
        locked = await repository.lock_role_revision_authority_for_update(role_id=role.role_id, at=now, conn=conn)
        assert locked is not None
        current_revision = await PlatformRoleRevision.filter(id=role.role_revision_id).using_db(conn).get()
        invite_permission = (
            await PlatformPermission.filter(code=PlatformPermissionCode.ACCESS_TEAM_INVITE).using_db(conn).get()
        )
        await (
            PlatformRoleRevision
            .filter(id=current_revision.id)
            .using_db(conn)
            .update(
                is_current=False,
                superseded_at=now,
            )
        )
        replacement_revision = await PlatformRoleRevision.create(
            using_db=conn,
            role_id=role.role_id,
            sequence=current_revision.sequence + 1,
            is_current=True,
        )
        await PlatformRoleRevisionPermission.bulk_create(
            [
                PlatformRoleRevisionPermission(
                    role_revision_id=replacement_revision.id,
                    permission_id=invite_permission.id,
                ),
                PlatformRoleRevisionPermission(
                    role_revision_id=replacement_revision.id,
                    permission_id=replacement_permission.id,
                ),
            ],
            using_db=conn,
        )

    async with repository.transaction() as conn:
        with pytest.raises(Forbidden, match="PLATFORM_PERMISSION_DENIED"):
            await repository.assert_platform_permission_for_update(
                actor_user_id=operator_user.id,
                permission_code=removed_permission,
                at=datetime.now(UTC),
                conn=conn,
            )
        snapshot = await repository.assert_platform_permission_for_update(
            actor_user_id=operator_user.id,
            permission_code=replacement_permission.code,
            at=datetime.now(UTC),
            conn=conn,
        )

    assert snapshot.operator_id == operator.id
    assert replacement_permission.code in snapshot.effective_permissions


async def test_locked_authority_snapshot_allows_owner_and_denies_inactive_operator(db_schema) -> None:
    _ = db_schema
    repository = PlatformIdentityRepository()
    owner = await _create_user("snapshot-owner")
    inactive_user = await _create_user("snapshot-inactive")
    await PlatformInstanceOwnership.create(owner_user_id=owner.id, singleton_key="instance", revision=1)
    await PlatformOperator.create(user_id=inactive_user.id, status=PlatformOperatorStatus.DEACTIVATED, revision=2)

    async with repository.transaction() as conn:
        owner_snapshot = await repository.assert_platform_permission_for_update(
            actor_user_id=owner.id,
            permission_code="platform:test-owner-only",
            at=datetime.now(UTC),
            conn=conn,
        )
        with pytest.raises(Forbidden, match="PLATFORM_PERMISSION_DENIED"):
            await repository.assert_platform_permission_for_update(
                actor_user_id=inactive_user.id,
                permission_code="platform:test-inactive",
                at=datetime.now(UTC),
                conn=conn,
            )

    assert owner_snapshot.is_instance_owner
