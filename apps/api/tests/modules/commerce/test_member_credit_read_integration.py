from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.http.pagination import PageParams
from src.core.services import ServiceContractError
from src.models.commerce.billing import (
    CommercePlan,
    CommercePlanRevision,
    CreditRefreshInterval,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import (
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.member_credit_composition import build_member_credit_read_service
from src.modules.commerce.member_credit_read_service import MemberCreditReadScope
from src.modules.commerce.service import build_commerce_service
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def _create_workspace() -> tuple[Workspace, tuple[WorkspaceMembership, ...]]:
    suffix = uuid4().hex[:12]
    users = [
        await User.create(
            username=f"member-credit-read-{label}-{suffix}",
            email=f"member-credit-read-{label}-{suffix}@example.com",
            display_name=f"Member Credit {label.title()}",
        )
        for label in ("owner", "limited", "inherited", "disabled")
    ]
    organization = await OrganizationRepository().create_organization(
        slug=f"member-credit-read-{suffix}",
        name="Member Credit Read",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Member Credit Read",
        owner_user_id=users[0].id,
        created_by_user_id=users[0].id,
        is_active=True,
    )
    membership_rows: list[WorkspaceMembership] = []
    for index, user in enumerate(users):
        membership_rows.append(
            await WorkspaceMembership.create(
                workspace_id=workspace.id,
                user_id=user.id,
                status=WorkspaceMembershipStatus.DISABLED if index == 3 else WorkspaceMembershipStatus.ACTIVE,
            )
        )
    return workspace, tuple(membership_rows)


async def _initialize_billing(workspace: Workspace) -> tuple[datetime, datetime]:
    now = datetime.now(UTC).replace(microsecond=0)
    plan = await CommercePlan.create(code="free", is_active=True, sort_order=10)
    await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_FREE_NAME",
        description_i18n_key="commerce:PLAN_FREE_DESCRIPTION",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
        is_selling=True,
    )
    service = build_commerce_service(get_settings())
    async with in_transaction() as conn:
        _, account, _ = await service.initialize_free_workspace_in_transaction(workspace_id=workspace.id, conn=conn)
    period_start = now - timedelta(days=3)
    period_end = now + timedelta(days=27)
    account.period_start = period_start
    account.period_end = period_end
    await account.save(update_fields=["period_start", "period_end", "updated_at"])
    return period_start, period_end


async def test_member_credit_reads_use_account_period_effective_limits_and_visibility(db_schema) -> None:
    _ = db_schema
    workspace, memberships = await _create_workspace()
    owner, limited, inherited, disabled = memberships
    period_start, period_end = await _initialize_billing(workspace)
    policy = await WorkspaceMemberCreditPolicy.get(workspace_id=workspace.id)
    policy.default_limit_kind = "limited"
    policy.default_limit_credits = 10
    policy.revision = 4
    await policy.save(update_fields=["default_limit_kind", "default_limit_credits", "revision", "updated_at"])
    await WorkspaceMemberCreditLimitOverride.create(
        workspace_id=workspace.id,
        membership_id=owner.id,
        limit_kind="unlimited",
        limit_credits=None,
        revision=2,
    )
    await WorkspaceMemberCreditLimitOverride.create(
        workspace_id=workspace.id,
        membership_id=limited.id,
        limit_kind="limited",
        limit_credits=5,
        revision=3,
    )
    await WorkspaceMemberCreditUsagePeriod.create(
        workspace_id=workspace.id,
        membership_id=limited.id,
        period_start=period_start,
        period_end=period_end,
        reserved_credits=2,
        committed_credits=4,
    )
    await WorkspaceMemberCreditUsagePeriod.create(
        workspace_id=workspace.id,
        membership_id=limited.id,
        period_start=period_start - timedelta(days=30),
        period_end=period_start,
        reserved_credits=90,
        committed_credits=90,
    )
    await WorkspaceMemberCreditUsagePeriod.create(
        workspace_id=workspace.id,
        membership_id=disabled.id,
        period_start=period_start,
        period_end=period_end,
        reserved_credits=1,
        committed_credits=1,
    )
    before_counts = (
        await WorkspaceSubscription.filter(workspace_id=workspace.id).count(),
        await WorkspaceCreditAccount.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditPolicy.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditLimitOverride.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditUsagePeriod.filter(workspace_id=workspace.id).count(),
    )
    service = build_member_credit_read_service(get_settings())

    usage_page = await service.list_usage(
        workspace_id=workspace.id,
        params=PageParams(page=1, size=20),
        scope=MemberCreditReadScope.ALL,
        actor_membership_id=UUID(str(owner.id)),
    )
    limits_page = await service.list_limits(workspace_id=workspace.id, params=PageParams(page=1, size=20))
    self_page = await service.list_usage(
        workspace_id=workspace.id,
        params=PageParams(page=1, size=20),
        scope=MemberCreditReadScope.SELF,
        actor_membership_id=UUID(str(limited.id)),
    )
    empty_page = await service.list_limits(workspace_id=workspace.id, params=PageParams(page=2, size=20))

    usage_by_membership = {UUID(str(item.membership_id)): item for item in usage_page.items}
    limits_by_membership = {UUID(str(item.membership_id)): item for item in limits_page.items}
    assert usage_page.total == 3
    assert usage_page.period_start == period_start
    assert usage_page.period_end == period_end
    assert disabled.id not in usage_by_membership
    assert usage_by_membership[owner.id].is_owner is True
    assert usage_by_membership[owner.id].available_credits is None
    assert usage_by_membership[limited.id].reserved_credits == 2
    assert usage_by_membership[limited.id].committed_credits == 4
    assert usage_by_membership[limited.id].available_credits == 0
    assert usage_by_membership[inherited.id].reserved_credits == 0
    assert usage_by_membership[inherited.id].committed_credits == 0
    assert usage_by_membership[inherited.id].available_credits == 10
    assert limits_page.default_limit.limit_credits == 10
    assert limits_page.configuration_revision == 4
    owner_override = limits_by_membership[owner.id].override_limit
    assert owner_override is not None
    assert owner_override.limit_kind == "unlimited"
    assert limits_by_membership[inherited.id].override_limit is None
    assert [UUID(str(item.membership_id)) for item in self_page.items] == [limited.id]
    assert empty_page.items == []
    assert empty_page.prev == 1
    policy.default_limit_kind = "unlimited"
    policy.default_limit_credits = None
    policy.revision = 5
    await policy.save(update_fields=["default_limit_kind", "default_limit_credits", "revision", "updated_at"])
    unlimited_default_page = await service.list_usage(
        workspace_id=workspace.id,
        params=PageParams(),
        scope=MemberCreditReadScope.SELF,
        actor_membership_id=UUID(str(inherited.id)),
    )
    assert unlimited_default_page.items[0].effective_limit.limit_kind == "unlimited"
    assert unlimited_default_page.items[0].available_credits is None
    assert (
        await WorkspaceSubscription.filter(workspace_id=workspace.id).count(),
        await WorkspaceCreditAccount.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditPolicy.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditLimitOverride.filter(workspace_id=workspace.id).count(),
        await WorkspaceMemberCreditUsagePeriod.filter(workspace_id=workspace.id).count(),
    ) == before_counts


async def test_member_credit_read_fails_when_required_policy_is_missing(db_schema) -> None:
    _ = db_schema
    workspace, memberships = await _create_workspace()
    await _initialize_billing(workspace)
    await WorkspaceMemberCreditPolicy.filter(workspace_id=workspace.id).delete()

    with pytest.raises(ServiceContractError, match="policy is missing"):
        await build_member_credit_read_service(get_settings()).list_usage(
            workspace_id=workspace.id,
            params=PageParams(),
            scope=MemberCreditReadScope.SELF,
            actor_membership_id=UUID(str(memberships[0].id)),
        )

    assert not await WorkspaceMemberCreditPolicy.filter(workspace_id=workspace.id).exists()
