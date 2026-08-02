from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from src.core.exceptions import Forbidden, ServiceUnavailable
from src.models.platform_identity.identity import PlatformOperatorStatus
from src.modules.platform_identity.schema import (
    PlatformIdentitySnapshot,
    PlatformInvitationAcceptanceCommand,
    PlatformInvitationSetupContext,
    PlatformOperatorInvitationCommand,
    PlatformRoleBinding,
)
from src.modules.platform_identity.service import PlatformIdentityAuthorityService


class _EligibilityRepository:
    def __init__(self, snapshot: PlatformIdentitySnapshot) -> None:
        self.snapshot = snapshot

    async def get_identity_snapshot(self, *, user_id, at):  # type: ignore[no-untyped-def]
        assert user_id == self.snapshot.user_id
        assert at.tzinfo is not None
        return self.snapshot


class _InvitationRepository:
    def __init__(self, inviter: PlatformIdentitySnapshot, roles: tuple[PlatformRoleBinding, ...]) -> None:
        self.inviter = inviter
        self.roles = roles
        self.created = False

    async def get_identity_snapshot(self, *, user_id, at):  # type: ignore[no-untyped-def]
        assert user_id == self.inviter.user_id
        return self.inviter

    async def resolve_current_role_bindings(self, *, role_ids, at):  # type: ignore[no-untyped-def]
        assert role_ids == frozenset(role.role_id for role in self.roles)
        return self.roles

    async def create_operator_invitation(self, *, command, audit):  # type: ignore[no-untyped-def]
        self.created = True
        raise AssertionError("combined-role escalation must be rejected before invitation persistence")


class _AcceptanceRepository:
    def __init__(self) -> None:
        self.accepted = False

    async def begin_operator_invitation_acceptance(self, *, command, audit):  # type: ignore[no-untyped-def]
        self.accepted = True
        return PlatformInvitationSetupContext(
            invitation_id=command.invitation_id,
            invitation_revision=command.expected_invitation_revision + 1,
            operator_id=uuid4(),
            requires_phishing_resistant=False,
        )


@pytest.mark.parametrize(
    ("is_instance_owner", "operator_status", "expected"),
    [
        (True, None, True),
        (False, PlatformOperatorStatus.ACTIVE, True),
        (False, PlatformOperatorStatus.MFA_SETUP_REQUIRED, False),
        (False, PlatformOperatorStatus.DEACTIVATED, False),
        (False, None, False),
    ],
)
async def test_entry_eligibility_is_limited_to_owner_or_active_operator(
    is_instance_owner: bool,
    operator_status: PlatformOperatorStatus | None,
    expected: bool,
) -> None:
    user_id = uuid4()
    service = PlatformIdentityAuthorityService(
        repository=_EligibilityRepository(
            PlatformIdentitySnapshot(
                user_id=user_id,
                is_instance_owner=is_instance_owner,
                operator_id=uuid4() if operator_status is not None else None,
                operator_status=operator_status,
                operator_revision=1 if operator_status is not None else None,
                effective_permissions=frozenset(),
                delegable_permissions=frozenset(),
            )
        ),
        clock=lambda: datetime(2026, 7, 30, tzinfo=UTC),
    )

    result = await service.entry_eligibility(user_id=user_id)

    assert result.user_id == user_id
    assert result.eligible is expected


async def test_invitation_rejects_combined_roles_outside_delegable_authority() -> None:
    inviter_user_id = uuid4()
    role = PlatformRoleBinding(
        role_id=uuid4(),
        role_revision_id=uuid4(),
        permission_codes=frozenset({"platform:access-team:read", "platform:access-sessions:revoke"}),
    )
    repository = _InvitationRepository(
        PlatformIdentitySnapshot(
            user_id=inviter_user_id,
            is_instance_owner=False,
            operator_id=uuid4(),
            operator_status=PlatformOperatorStatus.ACTIVE,
            operator_revision=1,
            effective_permissions=frozenset({"platform:access-team:invite"}),
            delegable_permissions=frozenset({"platform:access-team:read"}),
        ),
        (role,),
    )
    service = PlatformIdentityAuthorityService(repository=repository)

    with pytest.raises(Forbidden) as exc:
        await service.send_operator_invitation(
            command=PlatformOperatorInvitationCommand(
                invitation_id=uuid4(),
                inviter_user_id=inviter_user_id,
                recipient_user_id=uuid4(),
                intended_roles=(role,),
                expires_at=datetime(2026, 8, 1, tzinfo=UTC),
                idempotency_key="invite-combined-role",
                correlation_id=uuid4(),
            )
        )

    assert exc.value.error == "PLATFORM_DELEGABLE_AUTHORITY_EXCEEDED"
    assert repository.created is False


async def test_invitation_acceptance_begins_without_premature_mfa_authority() -> None:
    recipient_user_id = uuid4()
    repository = _AcceptanceRepository()
    service = PlatformIdentityAuthorityService(repository=repository)
    command = PlatformInvitationAcceptanceCommand(
        invitation_id=uuid4(),
        accepter_user_id=recipient_user_id,
        expected_invitation_revision=1,
        idempotency_key="invite-accept",
        correlation_id=uuid4(),
    )

    result = await service.begin_operator_invitation_acceptance(command=command)

    assert result.invitation_id == command.invitation_id
    assert result.invitation_revision == 2
    assert repository.accepted is True


def test_ownership_recovery_is_explicitly_unavailable_without_a_deployment_adapter() -> None:
    service = PlatformIdentityAuthorityService(
        repository=_EligibilityRepository(
            PlatformIdentitySnapshot(
                user_id=uuid4(),
                is_instance_owner=False,
                operator_id=None,
                operator_status=None,
                effective_permissions=frozenset(),
                delegable_permissions=frozenset(),
            )
        )
    )

    with pytest.raises(ServiceUnavailable) as exc:
        service.require_recovery_available()

    assert exc.value.error == "PLATFORM_OWNERSHIP_RECOVERY_UNAVAILABLE"
