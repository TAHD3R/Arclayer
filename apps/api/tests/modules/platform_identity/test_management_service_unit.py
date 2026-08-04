from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.organization.user import UserStatus
from src.models.platform_identity.identity import PlatformInstanceOwnership, PlatformOperatorStatus
from src.models.platform_identity.operations import PlatformVerificationAssurance
from src.modules.platform_identity.management_schema import (
    PlatformInvitationRevokeRequest,
    PlatformMfaTotpBeginRequest,
    PlatformOperatorMfaResetRequest,
    PlatformOperatorOffboardingRequest,
    PlatformRoleAssignmentReplaceRequest,
    PlatformRoleCatalogItemOut,
    PlatformStepUpTotpCompleteRequest,
    PlatformStepUpWebAuthnCompleteRequest,
)
from src.modules.platform_identity.management_service import PlatformIdentityManagementService
from src.modules.platform_identity.mfa_schema import PlatformMfaAssurance, PlatformMfaVerification
from src.modules.platform_identity.repository import INVITATION_CANDIDATE_LIMIT, PlatformIdentityRepository
from src.modules.platform_identity.schema import PlatformIdentitySnapshot, PlatformMutationReceipt
from src.modules.platform_identity.step_up_schema import PlatformStepUpProofIssueRequest
from src.modules.platform_identity.webauthn_schema import PlatformWebAuthnAuthenticationCredential


def _webauthn_credential() -> PlatformWebAuthnAuthenticationCredential:
    return PlatformWebAuthnAuthenticationCredential.model_validate({
        "id": "credential-id",
        "raw_id": "credential-id",
        "type": "public-key",
        "response": {
            "client_data_json": "client-data",
            "authenticator_data": "authenticator-data",
            "signature": "signature",
            "user_handle": None,
        },
    })


class _Repository:
    def __init__(self, snapshot: PlatformIdentitySnapshot, candidates: list[SimpleNamespace]) -> None:
        self.snapshot = snapshot
        self.candidates = candidates
        self.candidate_query: str | None = None

    async def get_identity_snapshot(self, *, user_id, at):  # type: ignore[no-untyped-def]
        return self.snapshot

    async def list_invitation_candidates(self, *, q, at):  # type: ignore[no-untyped-def]
        self.candidate_query = q
        return self.candidates


class _CandidateQuery:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self.rows = rows
        self.excluded_user_ids: list[object] | None = None
        self.ordering: tuple[str, ...] | None = None
        self.limit_value: int | None = None

    def exclude(self, **kwargs: list[object]) -> _CandidateQuery:
        self.excluded_user_ids = kwargs["id__in"]
        return self

    def filter(self, *args: object) -> _CandidateQuery:
        raise AssertionError(f"q=null must not add a search filter: {args}")

    def order_by(self, *fields: str) -> _CandidateQuery:
        self.ordering = fields
        return self

    def limit(self, value: int) -> _CandidateQuery:
        self.limit_value = value
        return self

    def __await__(self):
        async def resolve() -> list[SimpleNamespace]:
            return self.rows

        return resolve().__await__()


class _CandidateUserModel:
    query: _CandidateQuery
    status: UserStatus | None = None

    @classmethod
    def filter(cls, **kwargs: UserStatus) -> _CandidateQuery:
        cls.status = kwargs["status"]
        return cls.query


class _CandidateRepository(PlatformIdentityRepository):
    def __init__(self, owner_user_id: UUID) -> None:
        self._owner_user_id = owner_user_id

    async def get_instance_ownership(
        self, *, conn: BaseDBAsyncClient | None = None, for_update: bool = False
    ) -> PlatformInstanceOwnership | None:
        _ = conn, for_update
        return cast(PlatformInstanceOwnership, SimpleNamespace(owner_user_id=self._owner_user_id))


@pytest.mark.asyncio
async def test_invitation_options_exposes_only_delegable_roles_and_invite_candidates() -> None:
    allowed_role = PlatformRoleCatalogItemOut(
        role_id=uuid4(),
        code="support",
        kind="custom",
        name="Support",
        description=None,
        revision_id=uuid4(),
        revision_sequence=1,
        permission_codes=("platform:tenant-workspaces:read",),
    )
    blocked_role = allowed_role.model_copy(
        update={
            "role_id": uuid4(),
            "code": "billing",
            "permission_codes": ("platform:commerce-provider-manage",),
            "revision_id": uuid4(),
        }
    )
    candidate = SimpleNamespace(id=uuid4(), username="ada", display_name="Ada Operator")
    service = object.__new__(PlatformIdentityManagementService)
    service._repository = _Repository(
        PlatformIdentitySnapshot(
            user_id=uuid4(),
            is_instance_owner=False,
            operator_id=uuid4(),
            operator_status=PlatformOperatorStatus.ACTIVE,
            operator_revision=1,
            effective_permissions=frozenset({"platform:access-team:invite"}),
            delegable_permissions=frozenset({"platform:tenant-workspaces:read"}),
        ),
        [candidate],
    )
    service.list_roles = AsyncMock(return_value=(allowed_role, blocked_role))

    result = await service.invitation_options(inviter_user_id=uuid4(), q="Ada")

    assert result.candidates[0].user_id == candidate.id
    assert result.roles == (allowed_role,)
    assert service._repository.candidate_query == "Ada"


@pytest.mark.asyncio
async def test_invitation_revoke_forwards_revision_and_idempotency_to_atomic_repository() -> None:
    actor_user_id = uuid4()
    invitation_id = uuid4()
    request = PlatformInvitationRevokeRequest(
        expected_invitation_revision=2,
        idempotency_key="revoke-invitation",
        correlation_id=uuid4(),
    )
    receipt = PlatformMutationReceipt(
        entity_id=invitation_id,
        mutation="revoke_operator_invitation",
        correlation_id=request.correlation_id,
    )
    repository = SimpleNamespace(revoke_operator_invitation=AsyncMock(return_value=receipt))
    service = object.__new__(PlatformIdentityManagementService)
    service._repository = repository

    result = await service.revoke_invitation(
        actor_user_id=actor_user_id,
        invitation_id=invitation_id,
        request=request,
    )

    assert result == receipt
    repository.revoke_operator_invitation.assert_awaited_once_with(
        actor_user_id=actor_user_id,
        invitation_id=invitation_id,
        expected_invitation_revision=2,
        idempotency_key="revoke-invitation",
        correlation_id=request.correlation_id,
    )


@pytest.mark.asyncio
async def test_role_replacement_consumes_bound_step_up_and_forwards_the_complete_role_set() -> None:
    actor_user_id = uuid4()
    actor_session_id = uuid4()
    target_user_id = uuid4()
    role_ids = frozenset({uuid4(), uuid4()})
    request = PlatformRoleAssignmentReplaceRequest(
        expected_operator_revision=4,
        role_ids=role_ids,
        idempotency_key="replace-operator-roles",
        correlation_id=uuid4(),
        step_up_proof="step-up-proof",
    )
    receipt = PlatformMutationReceipt(
        entity_id=target_user_id,
        mutation="replace_platform_roles",
        correlation_id=request.correlation_id,
    )
    repository = SimpleNamespace(replace_operator_roles=AsyncMock(return_value=receipt))
    step_up = SimpleNamespace(consume=AsyncMock())
    service = object.__new__(PlatformIdentityManagementService)
    service._repository = repository
    service._step_up = step_up

    result = await service.replace_operator_roles(
        actor_user_id=actor_user_id,
        actor_session_id=actor_session_id,
        target_user_id=target_user_id,
        request=request,
    )

    assert result == receipt
    consume_request = step_up.consume.await_args.kwargs["request"]
    assert consume_request.action_code == "platform.access.change_role"
    assert consume_request.target_id == target_user_id
    assert consume_request.scope == {
        "expected_operator_revision": 4,
        "role_ids": sorted(map(str, role_ids)),
    }
    repository.replace_operator_roles.assert_awaited_once_with(
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        expected_operator_revision=4,
        role_ids=role_ids,
        idempotency_key=request.idempotency_key,
        correlation_id=request.correlation_id,
    )


@pytest.mark.asyncio
async def test_offboarding_consumes_remove_operator_step_up_before_authority_apply() -> None:
    actor_user_id = uuid4()
    actor_session_id = uuid4()
    target_user_id = uuid4()
    request = PlatformOperatorOffboardingRequest(
        expected_operator_revision=3,
        reason="Operator left the infrastructure team",
        idempotency_key="offboard-operator",
        correlation_id=uuid4(),
        step_up_proof="step-up-proof",
    )
    receipt = PlatformMutationReceipt(
        entity_id=target_user_id,
        mutation="offboard_operator",
        correlation_id=request.correlation_id,
    )
    authority = SimpleNamespace(offboard_operator=AsyncMock(return_value=receipt))
    step_up = SimpleNamespace(consume=AsyncMock())
    service = object.__new__(PlatformIdentityManagementService)
    service._authority = authority
    service._step_up = step_up

    result = await service.offboard_operator(
        actor_user_id=actor_user_id,
        actor_session_id=actor_session_id,
        target_user_id=target_user_id,
        request=request,
    )

    assert result == receipt
    consume_request = step_up.consume.await_args.kwargs["request"]
    assert consume_request.action_code == "platform.access.remove_operator"
    assert consume_request.target_id == target_user_id
    assert consume_request.scope == {
        "expected_operator_revision": 3,
        "reason": request.reason,
    }
    command = authority.offboard_operator.await_args.kwargs["command"]
    assert command.actor_user_id == actor_user_id
    assert command.target_user_id == target_user_id
    assert command.expected_operator_revision == 3


@pytest.mark.asyncio
async def test_operator_mfa_reset_consumes_target_bound_step_up_before_repository_apply() -> None:
    actor_user_id = uuid4()
    actor_session_id = uuid4()
    operator_id = uuid4()
    request = PlatformOperatorMfaResetRequest(
        expected_operator_revision=5,
        reason="Operator lost every enrolled method",
        idempotency_key="reset-operator-mfa",
        correlation_id=uuid4(),
        step_up_proof="step-up-proof",
    )
    receipt = PlatformMutationReceipt(
        entity_id=operator_id,
        mutation="reset_platform_operator_mfa",
        correlation_id=request.correlation_id,
    )
    repository = SimpleNamespace(reset_operator_mfa=AsyncMock(return_value=receipt))
    step_up = SimpleNamespace(consume=AsyncMock())
    service = object.__new__(PlatformIdentityManagementService)
    service._repository = repository
    service._step_up = step_up

    result = await service.reset_operator_mfa(
        actor_user_id=actor_user_id,
        actor_session_id=actor_session_id,
        operator_id=operator_id,
        request=request,
    )

    assert result == receipt
    consume_request = step_up.consume.await_args.kwargs["request"]
    assert consume_request.action_code == "platform.access.reset_operator_mfa"
    assert consume_request.target_type == "platform_operator"
    assert consume_request.target_id == operator_id
    assert consume_request.scope == {
        "expected_operator_revision": 5,
        "reason": request.reason,
    }
    repository.reset_operator_mfa.assert_awaited_once_with(
        actor_user_id=actor_user_id,
        operator_id=operator_id,
        expected_operator_revision=5,
        reason=request.reason,
        idempotency_key=request.idempotency_key,
        correlation_id=request.correlation_id,
    )


@pytest.mark.asyncio
async def test_totp_enrollment_step_up_binds_the_replaced_method() -> None:
    actor_user_id = uuid4()
    actor_session_id = uuid4()
    replaced_method_id = uuid4()
    request = PlatformMfaTotpBeginRequest(
        issuer="Arclayer",
        account_label="operator@example.test",
        replace_method_id=replaced_method_id,
        idempotency_key="replace-totp",
        correlation_id=uuid4(),
        step_up_proof="step-up-proof",
    )
    step_up = SimpleNamespace(consume=AsyncMock())
    mfa = SimpleNamespace(begin_totp_setup=AsyncMock(return_value=SimpleNamespace()))
    service = object.__new__(PlatformIdentityManagementService)
    service._step_up = step_up
    service._mfa = mfa
    service._repository = SimpleNamespace(
        list_verified_mfa_methods=AsyncMock(return_value=[SimpleNamespace(id=replaced_method_id, kind="totp")])
    )

    await service.begin_current_totp_method(
        actor_user_id=actor_user_id,
        actor_session_id=actor_session_id,
        request=request,
    )

    consume_request = step_up.consume.await_args.kwargs["request"]
    assert consume_request.target_type == "platform_mfa_actor"
    assert consume_request.target_id == actor_user_id
    assert consume_request.action_code == "platform.access.manage_current_mfa"
    assert consume_request.scope == {
        "operation": "totp_enrollment",
        "replace_method_id": str(replaced_method_id),
    }


@pytest.mark.asyncio
async def test_totp_step_up_issues_only_local_mfa_assurance() -> None:
    actor_user_id = uuid4()
    session_id = uuid4()
    method_id = uuid4()
    request = PlatformStepUpTotpCompleteRequest(
        actor_user_id=actor_user_id,
        session_id=session_id,
        action_code="platform.access.manage_current_mfa",
        target_type="platform_mfa_actor",
        target_id=actor_user_id,
        scope={"operation": "webauthn_enrollment", "replace_method_id": None},
        idempotency_key="enroll-first-security-key",
        method_id=method_id,
        code="123456",
    )
    proof = object()
    mfa = SimpleNamespace(verify_totp_for_baseline=AsyncMock())
    step_up = SimpleNamespace(issue=AsyncMock(return_value=proof))
    service = object.__new__(PlatformIdentityManagementService)
    service._mfa = mfa
    service._step_up = step_up

    result = await service.complete_step_up_totp(
        actor_user_id=actor_user_id,
        session_id=session_id,
        request=request,
    )

    assert result is proof
    mfa.verify_totp_for_baseline.assert_awaited_once_with(
        user_id=actor_user_id,
        method_id=method_id,
        code="123456",
    )
    assert step_up.issue.await_args.kwargs["verified_assurance"] == PlatformVerificationAssurance.LOCAL_MFA


@pytest.mark.asyncio
async def test_invitation_candidate_query_caps_the_initial_picker_and_excludes_ineligible_users(monkeypatch) -> None:
    operator_user_id = uuid4()
    pending_invitee_user_id = uuid4()
    owner_user_id = uuid4()
    candidate = SimpleNamespace(id=uuid4(), username="ada", display_name="Ada Operator")
    _CandidateUserModel.query = _CandidateQuery([candidate])
    monkeypatch.setattr("src.modules.platform_identity.repository.User", _CandidateUserModel)
    monkeypatch.setattr(
        "src.modules.platform_identity.repository.PlatformOperator",
        SimpleNamespace(all=lambda: SimpleNamespace(values_list=AsyncMock(return_value=[operator_user_id]))),
    )
    monkeypatch.setattr(
        "src.modules.platform_identity.repository.PlatformOperatorInvitation",
        SimpleNamespace(
            filter=lambda **_kwargs: SimpleNamespace(values_list=AsyncMock(return_value=[pending_invitee_user_id]))
        ),
    )
    repository = _CandidateRepository(owner_user_id)

    result = await repository.list_invitation_candidates(q=None, at=datetime.now(UTC))

    assert result == [candidate]
    assert _CandidateUserModel.status == UserStatus.ACTIVE
    assert set(_CandidateUserModel.query.excluded_user_ids or []) == {
        operator_user_id,
        pending_invitee_user_id,
        owner_user_id,
    }
    assert _CandidateUserModel.query.ordering == ("username", "id")
    assert _CandidateUserModel.query.limit_value == INVITATION_CANDIDATE_LIMIT


def test_current_session_webauthn_enrollment_binding_changes_with_the_platform_session() -> None:
    actor_user_id = uuid4()
    correlation_id = uuid4()
    first = PlatformIdentityManagementService._mfa_enrollment_binding(
        actor_user_id=actor_user_id,
        actor_session_id=uuid4(),
        idempotency_key="enroll-key-1",
        correlation_id=correlation_id,
        replace_method_id=None,
    )
    second = PlatformIdentityManagementService._mfa_enrollment_binding(
        actor_user_id=actor_user_id,
        actor_session_id=uuid4(),
        idempotency_key="enroll-key-1",
        correlation_id=correlation_id,
        replace_method_id=None,
    )

    assert first != second


def test_step_up_binding_uses_only_the_reviewed_action_context() -> None:
    request = PlatformStepUpProofIssueRequest(
        actor_user_id=uuid4(),
        session_id=uuid4(),
        action_code="platform.access.change_sign_in_settings",
        target_type="platform_sign_in_settings",
        scope={"operation": "update_policy"},
        expected_revision=7,
        idempotency_key="sign-in-settings-update",
    )
    completion = PlatformStepUpWebAuthnCompleteRequest(
        **request.model_dump(),
        challenge_id=uuid4(),
        credential=_webauthn_credential(),
    )

    assert PlatformIdentityManagementService._step_up_binding(
        request=request
    ) == PlatformIdentityManagementService._step_up_binding(request=completion)
    assert PlatformIdentityManagementService._step_up_binding(
        request=request.model_copy(update={"expected_revision": 8})
    ) != PlatformIdentityManagementService._step_up_binding(request=request)


@pytest.mark.asyncio
async def test_complete_step_up_webauthn_accepts_serialized_phishing_resistant_assurance() -> None:
    actor_user_id = uuid4()
    session_id = uuid4()
    request = PlatformStepUpWebAuthnCompleteRequest(
        actor_user_id=actor_user_id,
        session_id=session_id,
        action_code="platform.access.change_sign_in_settings",
        target_type="platform_sign_in_settings",
        scope={"operation": "update_policy"},
        expected_revision=7,
        idempotency_key="sign-in-settings-update",
        challenge_id=uuid4(),
        credential=_webauthn_credential(),
    )
    verification = PlatformMfaVerification(
        method_id=uuid4(),
        assurance=PlatformMfaAssurance.PHISHING_RESISTANT,
    )
    proof = object()
    service = object.__new__(PlatformIdentityManagementService)
    service._webauthn = SimpleNamespace(complete_authentication=AsyncMock(return_value=verification))
    service._step_up = SimpleNamespace(issue=AsyncMock(return_value=proof))

    result = await service.complete_step_up_webauthn(
        actor_user_id=actor_user_id,
        session_id=session_id,
        request=request,
    )

    assert isinstance(verification.assurance, str)
    assert result is proof
    service._step_up.issue.assert_awaited_once_with(
        request=request,
        verified_assurance=PlatformVerificationAssurance.PHISHING_RESISTANT,
    )
