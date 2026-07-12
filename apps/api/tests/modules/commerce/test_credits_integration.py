from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.core.http.pagination import PageParams
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlan,
    CommercePlanTier,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    SubscriptionChangeRequestStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
    WorkspaceSubscriptionChangeRequest,
)
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.credits import CreditsExceededError, reserve_workspace_credits
from src.modules.commerce.schema import CommercePlanUpsertRequest
from src.modules.commerce.service import CommerceService
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


def _free_plan_payload(*, is_active: bool, is_default: bool) -> CommercePlanUpsertRequest:
    return CommercePlanUpsertRequest(
        tier=CommercePlanTier.FREE,
        name="Free",
        description="Default workspace plan",
        credit_grant_amount=70,
        credit_refresh_interval=CreditRefreshInterval.DAILY,
        credit_value_micros=1_000,
        price_monthly_micros=0,
        price_yearly_micros=0,
        currency="USD",
        features=[],
        is_active=is_active,
        is_default=is_default,
        sort_order=10,
    )


async def test_concurrent_workspace_billing_initialization_creates_one_account(db_schema) -> None:
    _ = db_schema
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce initialization concurrency",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce initialization concurrency",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    service = CommerceService(get_settings())
    start = asyncio.Event()

    async def initialize():
        await start.wait()
        return await service.ensure_workspace_billing(workspace_id=workspace.id)

    tasks = [asyncio.create_task(initialize()) for _ in range(4)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)

    assert all(not isinstance(result, BaseException) for result in results), results
    subscriptions = await WorkspaceSubscription.filter(workspace_id=workspace.id).all()
    accounts = await WorkspaceCreditAccount.filter(workspace_id=workspace.id).all()
    grants = await WorkspaceCreditLedger.filter(
        workspace_id=workspace.id,
        entry_type=CreditLedgerEntryType.PERIOD_GRANT,
    ).all()
    assert len(subscriptions) == 1
    assert len(accounts) == 1
    assert len(grants) == 1
    assert {result[0].id for result in results if not isinstance(result, BaseException)} == {
        subscriptions[0].id,
    }
    assert accounts[0].balance_credits == 70


@pytest.mark.parametrize(
    ("is_active", "is_default"),
    [(False, True), (True, False)],
)
async def test_plan_update_cannot_remove_the_active_default_plan(
    db_schema,
    is_active: bool,
    is_default: bool,
) -> None:
    _ = db_schema
    service = CommerceService(get_settings())
    await service.ensure_plan_catalog()

    with pytest.raises(Conflict) as captured:
        await service.upsert_plan(
            code="free",
            payload=_free_plan_payload(is_active=is_active, is_default=is_default),
        )

    assert captured.value.status_code == 409
    assert captured.value.error == "COMMERCE_DEFAULT_PLAN_REQUIRED"
    persisted = await CommercePlan.get(code="free")
    assert persisted.is_active is True
    assert persisted.is_default is True
    assert await CommercePlan.filter(is_active=True, is_default=True).count() == 1


async def test_approve_change_request_rejects_an_inactive_target_plan(db_schema) -> None:
    _ = db_schema
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce inactive approval",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce inactive approval",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    service = CommerceService(get_settings())
    subscription, account, current_plan = await service.ensure_workspace_billing(workspace_id=workspace.id)
    requested_plan = await CommercePlan.get(code="premium")
    request = await WorkspaceSubscriptionChangeRequest.create(
        workspace_id=workspace.id,
        requested_plan_id=requested_plan.id,
        requested_by_user_id=uuid4(),
        billing_cycle=BillingCycle.YEARLY,
    )
    requested_plan.is_active = False
    await requested_plan.save(update_fields=["is_active", "updated_at"])

    with pytest.raises(Conflict) as captured:
        await service.approve_change_request(
            request_id=request.id,
            actor_user_id=uuid4(),
            review_note="Plan retired before approval",
        )

    assert captured.value.status_code == 409
    assert captured.value.error == "SUBSCRIPTION_CHANGE_REQUEST_PLAN_INACTIVE"
    await request.refresh_from_db()
    await subscription.refresh_from_db()
    await account.refresh_from_db()
    assert request.status == SubscriptionChangeRequestStatus.PENDING
    assert subscription.plan_id == current_plan.id
    assert account.balance_credits == 70
    assert not await WorkspaceCreditLedger.filter(
        workspace_id=workspace.id,
        reference_type="subscription_change_request",
        reference_id=request.id,
    ).exists()


async def test_pending_change_request_outputs_include_localized_plan_name(db_schema) -> None:
    _ = db_schema
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce change request",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce change request",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    service = CommerceService(get_settings())
    await service.ensure_workspace_billing(workspace_id=workspace.id)
    premium_plan = await CommercePlan.get(code="premium")
    await WorkspaceSubscriptionChangeRequest.create(
        workspace_id=workspace.id,
        requested_plan_id=premium_plan.id,
        requested_by_user_id=uuid4(),
        billing_cycle=BillingCycle.YEARLY,
    )

    overview = await service.get_overview(workspace_id=workspace.id)
    requests = await service.list_change_requests(
        params=PageParams(page=1, size=20),
        status=SubscriptionChangeRequestStatus.PENDING,
    )

    assert overview.pending_change_request is not None
    assert overview.pending_change_request.plan_code == "premium"
    assert overview.pending_change_request.plan_name == "高级版"
    assert len(requests.items) == 1
    assert requests.items[0].plan_code == "premium"
    assert requests.items[0].plan_name == "高级版"

    overview_payload = overview.model_dump(mode="json", by_alias=True)
    requests_payload = requests.model_dump(mode="json", by_alias=True)
    assert overview_payload["pendingChangeRequest"]["planName"] == "高级版"
    assert requests_payload["items"][0]["planName"] == "高级版"


async def test_concurrent_credit_reservations_cannot_make_available_balance_negative(db_schema) -> None:
    _ = db_schema
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce concurrency",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce concurrency",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    settings = get_settings()
    _, account, _ = await CommerceService(settings).ensure_workspace_billing(workspace_id=workspace.id)
    account.balance_credits = 5
    account.reserved_credits = 0
    await account.save(update_fields=["balance_credits", "reserved_credits", "updated_at"])

    async def reserve(request_id: UUID):
        async with in_transaction() as connection:
            return await reserve_workspace_credits(
                settings=settings,
                conn=connection,
                workspace_id=workspace.id,
                request_id=request_id,
                estimated_cost_micros=5_000,
            )

    results = await asyncio.gather(
        reserve(uuid4()),
        reserve(uuid4()),
        return_exceptions=True,
    )

    assert sum(not isinstance(result, BaseException) for result in results) == 1
    assert sum(isinstance(result, CreditsExceededError) for result in results) == 1
    persisted = await WorkspaceCreditAccount.get(id=account.id)
    assert persisted.balance_credits == 5
    assert persisted.reserved_credits == 5
    assert persisted.balance_credits - persisted.reserved_credits == 0
    reservation_entries = await WorkspaceCreditLedger.filter(
        workspace_id=workspace.id,
        entry_type=CreditLedgerEntryType.RESERVATION,
    ).all()
    assert len(reservation_entries) == 1
    assert reservation_entries[0].balance_after_credits == 5
    assert reservation_entries[0].reserved_after_credits == 5
