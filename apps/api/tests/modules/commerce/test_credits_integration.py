from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.connectors.inbox import ConnectorEventInbox
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.billing_connector import ProviderSubscription
from src.modules.commerce.billing_provider_application_service import (
    BillingProviderSubscriptionApplicationService,
    VerifiedBillingProviderEvent,
)
from src.modules.commerce.credits import CreditsExceededError, reserve_workspace_credits
from src.modules.commerce.service import build_commerce_service
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def _create_owner(label: str) -> User:
    suffix = uuid4().hex[:12]
    return await User.create(
        username=f"commerce-{label}-{suffix}",
        email=f"commerce-{label}-{suffix}@example.com",
        display_name=f"Commerce {label.title()} Owner",
    )


async def _create_published_revision(
    *,
    code: str,
    credit_grant_amount: int,
    credit_refresh_interval: CreditRefreshInterval,
    is_selling: bool = True,
) -> tuple[CommercePlan, CommercePlanRevision]:
    plan = await CommercePlan.create(code=code, is_active=True, sort_order=10)
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_{code.upper()}_NAME",
        description_i18n_key=f"commerce:PLAN_{code.upper()}_DESCRIPTION",
        credit_grant_amount=credit_grant_amount,
        credit_refresh_interval=credit_refresh_interval,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=is_selling,
    )
    return plan, revision


async def _initialize_free_workspace(*, workspace_id: UUID):
    service = build_commerce_service(get_settings())
    async with in_transaction() as conn:
        return await service.initialize_free_workspace_in_transaction(workspace_id=workspace_id, conn=conn)


async def test_concurrent_workspace_billing_initialization_creates_one_account(db_schema) -> None:
    _ = db_schema
    _, free_revision = await _create_published_revision(
        code="free",
        credit_grant_amount=70,
        credit_refresh_interval=CreditRefreshInterval.DAILY,
    )
    owner = await _create_owner("initialization")
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce initialization concurrency",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce initialization concurrency",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    start = asyncio.Event()

    async def initialize():
        await start.wait()
        return await _initialize_free_workspace(workspace_id=workspace.id)

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
    assert subscriptions[0].plan_revision_id == free_revision.id
    assert accounts[0].plan_revision_id == free_revision.id
    assert grants[0].plan_revision_id == free_revision.id
    assert grants[0].subscription_id == subscriptions[0].id


async def test_workspace_billing_requires_explicit_published_revision(db_schema) -> None:
    _ = db_schema
    owner = await _create_owner("uninitialized")
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce explicit initialization",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce explicit initialization",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )

    with pytest.raises(Conflict) as captured:
        await build_commerce_service(get_settings()).ensure_workspace_billing(workspace_id=workspace.id)

    assert captured.value.error == "WORKSPACE_COMMERCIAL_UNINITIALIZED"
    assert await CommercePlan.all().count() == 0
    assert await CommercePlanRevision.all().count() == 0


async def test_provider_subscription_event_applies_once_and_persists_external_authority(db_schema) -> None:
    _ = db_schema
    _, free_revision = await _create_published_revision(
        code="free",
        credit_grant_amount=70,
        credit_refresh_interval=CreditRefreshInterval.DAILY,
    )
    premium_plan, premium_revision = await _create_published_revision(
        code="premium",
        credit_grant_amount=10_000,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
    )
    external_price_id = "price_premium_monthly_v1"
    await CommercePlanRevisionPrice.create(
        plan_revision_id=premium_revision.id,
        provider="stripe",
        provider_mode="test",
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=19_000_000,
        external_price_id=external_price_id,
    )
    owner = await _create_owner("provider-event")
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce provider event",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce provider event",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    initial_subscription, initial_account, _ = await _initialize_free_workspace(workspace_id=workspace.id)
    assert initial_subscription.plan_revision_id == free_revision.id
    assert initial_account.plan_revision_id == free_revision.id
    period_start = datetime.now(UTC).replace(microsecond=0)
    period_end = period_start + timedelta(days=30)
    provider_event_id = "evt_checkout_complete"
    await ConnectorEventInbox.create(
        provider="stripe",
        provider_mode="test",
        provider_account_id="acct_test",
        provider_event_id=provider_event_id,
        connector_key="billing.stripe",
        connector_version="1.0.0",
        event_type="customer.subscription.updated",
        signature_timestamp=period_start,
        payload_sha256="a" * 64,
        encrypted_payload="encrypted",
        retention_deadline=period_end,
    )
    provider_subscription = ProviderSubscription(
        event_id=provider_event_id,
        workspace_id=workspace.id,
        plan_id=premium_plan.id,
        plan_revision_id=premium_revision.id,
        external_price_id=external_price_id,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        customer_id="cus_test",
        subscription_id="sub_test",
        status=SubscriptionStatus.ACTIVE,
        current_period_start=period_start,
        current_period_end=period_end,
        cancel_at_period_end=False,
    )
    verified_event = VerifiedBillingProviderEvent(
        provider_event_id=provider_event_id,
        payload_sha256="a" * 64,
        signature_reference="test-signature-reference",
    )
    applicator = BillingProviderSubscriptionApplicationService()

    for _ in range(2):
        await applicator.apply_provider_subscription(
            subscription=provider_subscription,
            provider="stripe",
            provider_mode="test",
            provider_account_id="acct_test",
            verified_event=verified_event,
        )

    subscription = await WorkspaceSubscription.get(workspace_id=workspace.id)
    account = await WorkspaceCreditAccount.get(workspace_id=workspace.id)
    applications = await CommerceProviderEventApplication.filter(
        provider="stripe",
        provider_mode="test",
        provider_account_id="acct_test",
        provider_event_id=provider_event_id,
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=premium_revision.id,
    ).all()
    assert subscription.plan_revision_id == premium_revision.id
    assert subscription.billing_provider == "stripe"
    assert subscription.external_customer_id == "cus_test"
    assert subscription.external_subscription_id == "sub_test"
    assert subscription.current_period_start == period_start
    assert subscription.current_period_end == period_end
    assert account.plan_revision_id == premium_revision.id
    assert account.subscription_id == subscription.id
    assert account.period_identity == (f"provider:stripe:sub_test:{premium_revision.id}:{period_end.isoformat()}")
    assert len(applications) == 1
    assert applications[0].result_code == "applied"
    assert await ConnectorEventInbox.filter(provider_event_id=provider_event_id).count() == 1


async def test_concurrent_credit_reservations_cannot_make_available_balance_negative(db_schema) -> None:
    _ = db_schema
    _, free_revision = await _create_published_revision(
        code="free",
        credit_grant_amount=70,
        credit_refresh_interval=CreditRefreshInterval.DAILY,
    )
    owner = await _create_owner("reservation")
    organization = await OrganizationRepository().create_organization(
        slug=f"commerce-{uuid4().hex}",
        name="Commerce concurrency",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Commerce concurrency",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    settings = get_settings()
    service = build_commerce_service(settings)
    subscription, account, _ = await _initialize_free_workspace(workspace_id=workspace.id)
    account.balance_credits = 5
    account.reserved_credits = 0
    await account.save(update_fields=["balance_credits", "reserved_credits", "updated_at"])

    async def reserve(request_id: UUID):
        async with in_transaction() as connection:
            return await reserve_workspace_credits(
                commerce=service,
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

    assert sum(not isinstance(result, BaseException) for result in results) == 1, results
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
    assert reservation_entries[0].subscription_id == subscription.id
    assert reservation_entries[0].plan_revision_id == free_revision.id
