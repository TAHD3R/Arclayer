from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.models.ai.ai_budget import AIBudget, BudgetSourceType
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.commerce.billing import (
    CommercePlan,
    CommercePlanRevision,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
)
from src.models.commerce.credit_allocation import (
    CreditGrantSource,
    CreditLotAllocationStatus,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotAllocation,
    WorkspaceCreditUsageEvent,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.credits import commit_workspace_credits, release_workspace_credits
from src.modules.commerce.service import build_commerce_service
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


@dataclass(frozen=True, slots=True)
class _LegacyReservationFixture:
    account_id: UUID
    lot_id: UUID
    reservation_id: UUID


async def _seed_legacy_reservation(*, label: str) -> _LegacyReservationFixture:
    suffix = uuid4().hex[:12]
    owner = await User.create(
        username=f"legacy-credit-{label}-{suffix}",
        email=f"legacy-credit-{label}-{suffix}@example.com",
        display_name="Legacy Credit Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"legacy-credit-{label}-{suffix}",
        name="Legacy Credit settlement",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Legacy Credit settlement",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    plan = await CommercePlan.create(code="free", is_active=True, sort_order=10)
    await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_LEGACY_NAME",
        description_i18n_key="commerce:PLAN_LEGACY_DESCRIPTION",
        credit_grant_amount=20,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )
    commerce = build_commerce_service(get_settings())
    async with in_transaction() as conn:
        _, account, _ = await commerce.initialize_free_workspace_in_transaction(
            workspace_id=workspace.id,
            conn=conn,
        )
        lot = await WorkspaceCreditGrantLot.filter(account_id=account.id).using_db(conn).select_for_update().get()
        lot.source = CreditGrantSource.LEGACY_UNATTRIBUTED
        lot.source_identity = f"migration:unattributed-credit-account:{account.id}"
        lot.expires_at = None
        lot.reserved_credits = 5
        lot.description_key = "LEDGER_MIGRATION_UNATTRIBUTED"
        await lot.save(
            using_db=conn,
            update_fields=[
                "source",
                "source_identity",
                "expires_at",
                "reserved_credits",
                "description_key",
                "updated_at",
            ],
        )
        account.reserved_credits = 5
        await account.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        budget = await AIBudget.create(
            source_type=BudgetSourceType.WORKSPACE,
            source_id=workspace.id,
            limit_micros=1_000_000,
            reserved_micros=5_000,
            period_start=datetime.now(UTC).date(),
            using_db=conn,
        )
        reservation = await AIBudgetReservation.create(
            budget_id=budget.id,
            request_id=uuid4(),
            estimated_cost_micros=5_000,
            reserved_cost_micros=5_000,
            credit_account_id=account.id,
            credit_attribution_version=0,
            credit_value_micros=1_000,
            reserved_credits=5,
            status=ReservationStatus.RESERVED,
            expires_at=datetime.now(UTC) + timedelta(minutes=5),
            using_db=conn,
        )
        await WorkspaceCreditLotAllocation.create(
            lot_id=lot.id,
            reservation_id=reservation.id,
            request_id=reservation.request_id,
            reserved_credits=5,
            using_db=conn,
        )
    return _LegacyReservationFixture(account_id=account.id, lot_id=lot.id, reservation_id=reservation.id)


async def test_legacy_credit_commit_settles_exact_lot_without_inventing_usage(db_schema) -> None:
    _ = db_schema
    fixture = await _seed_legacy_reservation(label="commit")
    commerce = build_commerce_service(get_settings())
    async with in_transaction() as conn:
        reservation = (
            await AIBudgetReservation.filter(id=fixture.reservation_id).using_db(conn).select_for_update().get()
        )
        committed = await commit_workspace_credits(
            commerce=commerce,
            conn=conn,
            reservation=reservation,
            actual_cost_micros=3_000,
        )

    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    lot = await WorkspaceCreditGrantLot.get(id=fixture.lot_id)
    allocation = await WorkspaceCreditLotAllocation.get(reservation_id=fixture.reservation_id)
    ledger = await WorkspaceCreditLedger.get(
        account_id=fixture.account_id,
        entry_type=CreditLedgerEntryType.COMMIT,
    )
    assert committed == 3
    assert account.balance_credits == 17
    assert account.reserved_credits == 0
    assert lot.remaining_credits == 17
    assert lot.reserved_credits == 0
    assert allocation.status == CreditLotAllocationStatus.SETTLED
    assert allocation.committed_credits == 3
    assert allocation.released_credits == 2
    assert ledger.actor_user_id is None
    assert await WorkspaceCreditUsageEvent.filter(reservation_id=fixture.reservation_id).count() == 0


async def test_legacy_credit_release_returns_exact_lot_without_inventing_usage(db_schema) -> None:
    _ = db_schema
    fixture = await _seed_legacy_reservation(label="release")
    commerce = build_commerce_service(get_settings())
    async with in_transaction() as conn:
        reservation = (
            await AIBudgetReservation.filter(id=fixture.reservation_id).using_db(conn).select_for_update().get()
        )
        await release_workspace_credits(
            commerce=commerce,
            conn=conn,
            reservation=reservation,
            reason="migration-legacy-release",
        )

    account = await WorkspaceCreditAccount.get(id=fixture.account_id)
    lot = await WorkspaceCreditGrantLot.get(id=fixture.lot_id)
    allocation = await WorkspaceCreditLotAllocation.get(reservation_id=fixture.reservation_id)
    ledger = await WorkspaceCreditLedger.get(
        account_id=fixture.account_id,
        entry_type=CreditLedgerEntryType.RELEASE,
    )
    assert account.balance_credits == 20
    assert account.reserved_credits == 0
    assert lot.remaining_credits == 20
    assert lot.reserved_credits == 0
    assert allocation.status == CreditLotAllocationStatus.SETTLED
    assert allocation.committed_credits == 0
    assert allocation.released_credits == 5
    assert ledger.actor_user_id is None
    assert await WorkspaceCreditUsageEvent.filter(reservation_id=fixture.reservation_id).count() == 0
