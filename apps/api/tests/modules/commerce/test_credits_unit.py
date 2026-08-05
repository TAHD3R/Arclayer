from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.commerce.billing import CreditRefreshInterval, SubscriptionStatus
from src.modules.commerce.credit_allocation import CreditAllocationResult
from src.modules.commerce.credits import (
    CreditsExceededError,
    commit_workspace_credits,
    credits_for_cost,
    reserve_workspace_credits,
)
from src.modules.commerce.service import _credit_period


@pytest.mark.parametrize(
    ("cost_micros", "credit_value_micros", "expected"),
    [(0, 1_000, 0), (1, 1_000, 1), (1_000, 1_000, 1), (1_001, 1_000, 2)],
)
def test_credits_for_cost_rounds_up(
    cost_micros: int,
    credit_value_micros: int,
    expected: int,
) -> None:
    assert (
        credits_for_cost(
            cost_micros=cost_micros,
            credit_value_micros=credit_value_micros,
        )
        == expected
    )


def test_credit_period_supports_every_configured_refresh_interval() -> None:
    now = datetime(2026, 7, 12, 15, 30, tzinfo=UTC)
    subscription_end = datetime(2026, 8, 12, tzinfo=UTC)

    assert _credit_period(now, CreditRefreshInterval.DAILY, subscription_end=subscription_end) == (
        datetime(2026, 7, 12, tzinfo=UTC),
        datetime(2026, 7, 13, tzinfo=UTC),
    )
    assert _credit_period(now, CreditRefreshInterval.MONTHLY, subscription_end=subscription_end) == (
        datetime(2026, 7, 1, tzinfo=UTC),
        datetime(2026, 8, 1, tzinfo=UTC),
    )
    assert _credit_period(now, CreditRefreshInterval.YEARLY, subscription_end=subscription_end) == (
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2027, 1, 1, tzinfo=UTC),
    )
    assert _credit_period(
        now,
        CreditRefreshInterval.NONE,
        subscription_end=subscription_end,
    ) == (now, subscription_end)


@pytest.mark.asyncio
async def test_reserve_workspace_credits_rejects_insufficient_available_balance() -> None:
    workspace_id = uuid4()
    account = SimpleNamespace(balance_credits=10, reserved_credits=8)
    subscription = SimpleNamespace(status=SubscriptionStatus.ACTIVE)
    plan = SimpleNamespace(credit_value_micros=1_000)
    service = MagicMock()
    service.ensure_workspace_billing_in_transaction = AsyncMock(
        return_value=(subscription, account, plan),
    )

    with pytest.raises(CreditsExceededError) as exc_info:
        await reserve_workspace_credits(
            commerce=service,
            conn=MagicMock(),
            reservation=cast(AIBudgetReservation, SimpleNamespace()),
            workspace_id=workspace_id,
            actor_user_id=uuid4(),
            project_id=None,
            agent_run_id=None,
            capability_key="ai.agents",
            estimated_cost_micros=2_001,
        )

    assert exc_info.value.available == 2
    assert exc_info.value.requested == 3


@pytest.mark.asyncio
async def test_reserve_workspace_credits_updates_hold_and_immutable_ledger() -> None:
    workspace_id = uuid4()
    request_id = uuid4()
    membership_id = uuid4()
    account = SimpleNamespace(
        id=uuid4(),
        balance_credits=100,
        reserved_credits=10,
        save=AsyncMock(),
    )
    subscription = SimpleNamespace(status=SubscriptionStatus.ACTIVE)
    plan = SimpleNamespace(credit_value_micros=1_000)
    service = MagicMock()
    service.ensure_workspace_billing_in_transaction = AsyncMock(
        return_value=(subscription, account, plan),
    )
    service.save_credit_account = AsyncMock()
    service.write_credit_ledger_entry = AsyncMock()
    reservation = cast(
        AIBudgetReservation,
        SimpleNamespace(
            id=uuid4(),
            request_id=request_id,
            credit_account_id=None,
            workspace_membership_id=None,
            actor_user_id=None,
            project_id=None,
            capability_key=None,
            credit_value_micros=None,
            reserved_credits=None,
            save=AsyncMock(),
        ),
    )

    with patch(
        "src.modules.commerce.credit_allocation.reserve_member_credits",
        new=AsyncMock(return_value=CreditAllocationResult(membership_id=membership_id, reserved_credits=3)),
    ):
        details = await reserve_workspace_credits(
            commerce=service,
            conn=MagicMock(),
            reservation=reservation,
            workspace_id=workspace_id,
            actor_user_id=uuid4(),
            project_id=None,
            agent_run_id=None,
            capability_key="ai.agents",
            estimated_cost_micros=2_001,
        )

    assert details.reserved_credits == 3
    assert account.reserved_credits == 13
    service.save_credit_account.assert_awaited_once()
    service.write_credit_ledger_entry.assert_awaited_once()
    assert service.write_credit_ledger_entry.await_args is not None
    ledger = service.write_credit_ledger_entry.await_args.kwargs
    assert ledger["idempotency_key"] == f"ai-credit-reserve:{request_id}"
    assert ledger["description_key"] == "LEDGER_AI_RESERVATION"
    assert ledger["request_id"] == request_id
    assert ledger["estimated_cost_micros"] == 2_001
    assert ledger["reserved_credits"] == 3
    assert ledger["applied_credit_value_micros"] == 1_000


@pytest.mark.asyncio
async def test_commit_rejects_additional_usage_when_workspace_has_no_available_credits() -> None:
    workspace_id = uuid4()
    account = SimpleNamespace(id=uuid4(), workspace_id=workspace_id, reserved_credits=2, balance_credits=2)
    reservation = cast(
        AIBudgetReservation,
        SimpleNamespace(
            credit_account_id=account.id,
            reserved_credits=2,
            credit_value_micros=1_000,
            request_id=uuid4(),
        ),
    )
    service = MagicMock()
    service.lock_credit_account = AsyncMock(return_value=account)

    with pytest.raises(CreditsExceededError) as exc_info:
        await commit_workspace_credits(
            commerce=service,
            conn=MagicMock(),
            reservation=reservation,
            actual_cost_micros=2_001,
        )

    assert exc_info.value.workspace_id == workspace_id
    assert exc_info.value.available == 0
    assert exc_info.value.requested == 1
