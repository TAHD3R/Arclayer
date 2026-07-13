from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderEventReceipt,
    CommercePlan,
    CommercePlanTier,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
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


async def test_provider_subscription_event_applies_once_and_persists_external_authority(db_schema) -> None:
    _ = db_schema
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce provider event",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce provider event",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    service = CommerceService(get_settings())
    await service.ensure_workspace_billing(workspace_id=workspace.id)
    period_start = datetime.now(UTC).replace(microsecond=0)
    period_end = period_start + timedelta(days=30)
    payload = {
        "workspace_id": workspace.id,
        "plan_code": "premium",
        "status": SubscriptionStatus.ACTIVE,
        "billing_interval": BillingCycle.MONTHLY,
        "current_period_start": period_start,
        "current_period_end": period_end,
        "cancel_at_period_end": False,
        "provider": "stripe",
        "external_customer_id": "cus_test",
        "external_subscription_id": "sub_test",
        "event_id": "evt_checkout_complete",
    }

    await service.apply_provider_subscription(**payload)
    await service.apply_provider_subscription(**payload)

    subscription = await WorkspaceSubscription.get(workspace_id=workspace.id).prefetch_related("plan")
    account = await WorkspaceCreditAccount.get(workspace_id=workspace.id)
    provider_grants = await WorkspaceCreditLedger.filter(
        workspace_id=workspace.id,
        entry_type=CreditLedgerEntryType.PERIOD_GRANT,
        reference_type="provider_event",
    ).all()
    receipts = await BillingProviderEventReceipt.filter(
        provider="stripe",
        event_id="evt_checkout_complete",
    ).all()
    audit_events = await AuditEvent.filter(
        workspace_id=workspace.id,
        event_name="commerce.subscription.provider_updated",
    ).all()
    assert subscription.plan.code == "premium"
    assert subscription.billing_provider == "stripe"
    assert subscription.external_customer_id == "cus_test"
    assert subscription.external_subscription_id == "sub_test"
    assert subscription.current_period_start == period_start
    assert subscription.current_period_end == period_end
    assert account.balance_credits == 10_000
    assert len(provider_grants) == 1
    assert len(receipts) == 1
    assert len(audit_events) == 1


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
