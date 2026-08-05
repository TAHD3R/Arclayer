from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TypedDict
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError

from src.config import Settings
from src.core.http.pagination import PageParams
from src.core.services import BaseService, ServiceContractError
from src.models.commerce.billing import ResourceLimitKind
from src.models.commerce.credit_allocation import (
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.workspaces.workspace import WorkspaceMembership
from src.modules.commerce.member_credit_read_repository import MemberCreditReadStore
from src.modules.commerce.member_credit_schema import (
    MemberCreditLimitItemOut,
    MemberCreditLimitOut,
    MemberCreditLimitsPageOut,
    MemberCreditUsageItemOut,
    MemberCreditUsagePageOut,
)
from src.modules.commerce.service import CommerceService
from src.modules.workspaces.team.schema import WorkspaceTeamUserRefOut


class MemberCreditReadScope(StrEnum):
    ALL = "all"
    SELF = "self"


class _MemberCreditPageSnapshot(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    memberships: tuple[WorkspaceMembership, ...]
    overrides: dict[UUID, WorkspaceMemberCreditLimitOverride]
    usage_periods: dict[UUID, WorkspaceMemberCreditUsagePeriod]
    policy: WorkspaceMemberCreditPolicy
    period_start: datetime
    period_end: datetime
    total: int


class _PageFields(TypedDict):
    total: int
    page: int
    size: int
    pages: int
    next: int | None
    prev: int | None


class MemberCreditReadService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: MemberCreditReadStore,
        commerce: CommerceService,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._commerce = commerce

    async def list_usage(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
        scope: MemberCreditReadScope,
        actor_membership_id: UUID,
    ) -> MemberCreditUsagePageOut:
        snapshot = await self._read_snapshot(
            workspace_id=workspace_id,
            params=params,
            membership_id=actor_membership_id if scope is MemberCreditReadScope.SELF else None,
        )
        return MemberCreditUsagePageOut(
            items=[self._usage_item(row, snapshot) for row in snapshot.memberships],
            **_page_fields(snapshot.total, params),
            period_start=snapshot.period_start,
            period_end=snapshot.period_end,
        )

    async def list_limits(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
    ) -> MemberCreditLimitsPageOut:
        snapshot = await self._read_snapshot(workspace_id=workspace_id, params=params, membership_id=None)
        default_limit = _limit_out(
            snapshot.policy.default_limit_kind,
            snapshot.policy.default_limit_credits,
        )
        return MemberCreditLimitsPageOut(
            items=[self._limit_item(row, snapshot) for row in snapshot.memberships],
            **_page_fields(snapshot.total, params),
            default_limit=default_limit,
            configuration_revision=int(snapshot.policy.revision),
            period_start=snapshot.period_start,
            period_end=snapshot.period_end,
        )

    async def _read_snapshot(
        self,
        *,
        workspace_id: UUID,
        params: PageParams,
        membership_id: UUID | None,
    ) -> _MemberCreditPageSnapshot:
        async with self.tx() as conn:
            _, account, _ = await self._commerce.ensure_workspace_billing_in_transaction(
                workspace_id=workspace_id,
                conn=conn,
            )
            policy = await self._repository.lock_policy(workspace_id=workspace_id, conn=conn)
            if policy is None:
                raise ServiceContractError("Workspace member Credit policy is missing")
            total, memberships = await self._repository.list_active_memberships(
                workspace_id=workspace_id,
                membership_id=membership_id,
                limit=params.limit,
                offset=params.offset,
                conn=conn,
            )
            membership_ids = tuple(UUID(str(row.id)) for row in memberships)
            overrides = await self._repository.list_overrides(
                workspace_id=workspace_id,
                membership_ids=membership_ids,
                conn=conn,
            )
            usage_periods = await self._repository.list_usage_periods(
                workspace_id=workspace_id,
                membership_ids=membership_ids,
                period_start=account.period_start,
                period_end=account.period_end,
                conn=conn,
            )
        return _MemberCreditPageSnapshot(
            memberships=tuple(memberships),
            overrides=overrides,
            usage_periods=usage_periods,
            policy=policy,
            period_start=account.period_start,
            period_end=account.period_end,
            total=total,
        )

    @staticmethod
    def _usage_item(
        membership: WorkspaceMembership,
        snapshot: _MemberCreditPageSnapshot,
    ) -> MemberCreditUsageItemOut:
        membership_id = UUID(str(membership.id))
        override = snapshot.overrides.get(membership_id)
        effective_limit = _effective_limit(snapshot.policy, override)
        usage = snapshot.usage_periods.get(membership_id)
        reserved = 0 if usage is None else int(usage.reserved_credits)
        committed = 0 if usage is None else int(usage.committed_credits)
        return MemberCreditUsageItemOut(
            membership_id=membership_id,
            user=_user_out(membership),
            is_owner=UUID(str(membership.user_id)) == UUID(str(membership.workspace.owner_user_id)),
            effective_limit=effective_limit,
            reserved_credits=reserved,
            committed_credits=committed,
            available_credits=_available_credits(effective_limit, reserved=reserved, committed=committed),
        )

    @classmethod
    def _limit_item(
        cls,
        membership: WorkspaceMembership,
        snapshot: _MemberCreditPageSnapshot,
    ) -> MemberCreditLimitItemOut:
        membership_id = UUID(str(membership.id))
        usage_item = cls._usage_item(membership, snapshot)
        override = snapshot.overrides.get(membership_id)
        return MemberCreditLimitItemOut(
            **usage_item.model_dump(),
            override_limit=None if override is None else _limit_out(override.limit_kind, override.limit_credits),
        )


def _user_out(membership: WorkspaceMembership) -> WorkspaceTeamUserRefOut:
    return WorkspaceTeamUserRefOut(
        user_id=membership.user_id,
        username=membership.user.username,
        email=membership.user.email,
        display_name=membership.user.display_name,
        avatar_url=membership.user.avatar_url,
    )


def _effective_limit(
    policy: WorkspaceMemberCreditPolicy,
    override: WorkspaceMemberCreditLimitOverride | None,
) -> MemberCreditLimitOut:
    if override is not None:
        return _limit_out(override.limit_kind, override.limit_credits)
    return _limit_out(policy.default_limit_kind, policy.default_limit_credits)


def _limit_out(limit_kind: ResourceLimitKind | str, limit_credits: int | None) -> MemberCreditLimitOut:
    try:
        return MemberCreditLimitOut(limit_kind=ResourceLimitKind(limit_kind), limit_credits=limit_credits)
    except (ValueError, ValidationError) as exc:
        raise ServiceContractError("Workspace member Credit limit violates the persistence contract") from exc


def _available_credits(limit: MemberCreditLimitOut, *, reserved: int, committed: int) -> int | None:
    if limit.limit_kind == ResourceLimitKind.UNLIMITED:
        return None
    if limit.limit_credits is None:
        raise ServiceContractError("Limited member Credit allowance is missing its Credit value")
    return max(limit.limit_credits - reserved - committed, 0)


def _page_fields(total: int, params: PageParams) -> _PageFields:
    pages = (total + params.size - 1) // params.size if total else 0
    return {
        "total": total,
        "page": params.page,
        "size": params.size,
        "pages": pages,
        "next": params.page + 1 if params.page < pages else None,
        "prev": min(params.page - 1, pages) if params.page > 1 and pages else None,
    }
