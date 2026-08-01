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
from src.modules.platform_identity.management_schema import PlatformRoleCatalogItemOut
from src.modules.platform_identity.management_service import PlatformIdentityManagementService
from src.modules.platform_identity.repository import INVITATION_CANDIDATE_LIMIT, PlatformIdentityRepository
from src.modules.platform_identity.schema import PlatformIdentitySnapshot


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
