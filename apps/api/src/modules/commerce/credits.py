from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.commerce.billing import (
    CreditLedgerEntryType,
    SubscriptionStatus,
)
from src.modules.commerce.service import CommerceService


class CreditsExceededError(Exception):
    def __init__(self, *, workspace_id: UUID, available: int, requested: int) -> None:
        self.workspace_id = workspace_id
        self.available = available
        self.requested = requested
        super().__init__(f"Workspace {workspace_id} AI credits exhausted: available={available}, requested={requested}")


class CreditsUnavailableError(Exception):
    def __init__(self, *, workspace_id: UUID, subscription_status: str) -> None:
        self.workspace_id = workspace_id
        self.subscription_status = subscription_status
        super().__init__(f"Workspace {workspace_id} subscription status is {subscription_status}")


class CreditReservationDetails(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    account_id: UUID
    credit_value_micros: int
    reserved_credits: int


def credits_for_cost(*, cost_micros: int, credit_value_micros: int) -> int:
    if cost_micros < 0:
        raise ValueError("cost_micros must be non-negative")
    if credit_value_micros <= 0:
        raise ValueError("credit_value_micros must be positive")
    if cost_micros == 0:
        return 0
    return (cost_micros + credit_value_micros - 1) // credit_value_micros


async def reserve_workspace_credits(
    *,
    commerce: CommerceService,
    conn: BaseDBAsyncClient,
    workspace_id: UUID,
    request_id: UUID,
    estimated_cost_micros: int,
) -> CreditReservationDetails:
    subscription, account, plan = await commerce.ensure_workspace_billing_in_transaction(
        workspace_id=workspace_id,
        conn=conn,
    )
    if subscription.status is not SubscriptionStatus.ACTIVE:
        raise CreditsUnavailableError(
            workspace_id=workspace_id,
            subscription_status=str(subscription.status),
        )

    credit_value = int(plan.credit_value_micros)
    requested = credits_for_cost(
        cost_micros=estimated_cost_micros,
        credit_value_micros=credit_value,
    )
    available = max(int(account.balance_credits) - int(account.reserved_credits), 0)
    if available < requested:
        raise CreditsExceededError(workspace_id=workspace_id, available=available, requested=requested)

    account.reserved_credits += requested
    await commerce.save_credit_account(account=account, conn=conn)
    await commerce.write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=CreditLedgerEntryType.RESERVATION,
        delta_balance=0,
        delta_reserved=requested,
        idempotency_key=f"ai-credit-reserve:{request_id}",
        actor_user_id=None,
        description_key="LEDGER_AI_RESERVATION",
        request_id=request_id,
        estimated_cost_micros=estimated_cost_micros,
        reserved_credits=requested,
        applied_credit_value_micros=credit_value,
    )
    return CreditReservationDetails(
        account_id=account.id,
        credit_value_micros=credit_value,
        reserved_credits=requested,
    )


async def commit_workspace_credits(
    *,
    commerce: CommerceService,
    conn: BaseDBAsyncClient,
    reservation: AIBudgetReservation,
    actual_cost_micros: int,
) -> int:
    if reservation.credit_account_id is None or reservation.reserved_credits is None:
        return 0
    credit_value = int(reservation.credit_value_micros or 0)
    actual_credits = credits_for_cost(
        cost_micros=actual_cost_micros,
        credit_value_micros=credit_value,
    )
    account = await commerce.lock_credit_account(account_id=reservation.credit_account_id, conn=conn)
    if account is None:
        raise RuntimeError(f"Credit account {reservation.credit_account_id} not found")
    reserved = int(reservation.reserved_credits)
    if actual_credits > reserved:
        raise RuntimeError(
            "Actual AI credit usage exceeds the reserved amount; the reservation estimate must be an upper bound"
        )
    if int(account.reserved_credits) < reserved:
        raise RuntimeError("Credit account reserved balance is inconsistent with the AI reservation")

    account.reserved_credits -= reserved
    account.balance_credits -= actual_credits
    await commerce.save_credit_account(account=account, conn=conn)
    await commerce.write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=CreditLedgerEntryType.COMMIT,
        delta_balance=-actual_credits,
        delta_reserved=-reserved,
        idempotency_key=f"ai-credit-commit:{reservation.request_id}",
        actor_user_id=None,
        description_key="LEDGER_AI_COMMIT",
        request_id=reservation.request_id,
        actual_cost_micros=actual_cost_micros,
        reserved_credits=reserved,
        committed_credits=actual_credits,
        applied_credit_value_micros=credit_value,
    )
    await commerce.save_budget_reservation_reconciliation(
        reservation=reservation,
        actual_credits=actual_credits,
        reconciled_at=datetime.now(UTC),
        conn=conn,
    )
    return actual_credits


async def release_workspace_credits(
    *,
    commerce: CommerceService,
    conn: BaseDBAsyncClient,
    reservation: AIBudgetReservation,
    reason: str,
    entry_type: CreditLedgerEntryType = CreditLedgerEntryType.RELEASE,
) -> None:
    if reservation.credit_account_id is None or reservation.reserved_credits is None:
        return
    credit_value = int(reservation.credit_value_micros or 0)
    if credit_value <= 0:
        raise RuntimeError("Credit reservation is missing its applied credit value")
    account = await commerce.lock_credit_account(account_id=reservation.credit_account_id, conn=conn)
    if account is None:
        raise RuntimeError(f"Credit account {reservation.credit_account_id} not found")
    reserved = int(reservation.reserved_credits)
    if int(account.reserved_credits) < reserved:
        raise RuntimeError("Credit account reserved balance is inconsistent with the AI reservation")
    account.reserved_credits -= reserved
    await commerce.save_credit_account(account=account, conn=conn)
    await commerce.write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=entry_type,
        delta_balance=0,
        delta_reserved=-reserved,
        idempotency_key=f"ai-credit-release:{reservation.request_id}:{reason}",
        actor_user_id=None,
        description_key=(
            "LEDGER_AI_EXPIRATION" if entry_type == CreditLedgerEntryType.EXPIRATION else "LEDGER_AI_RELEASE"
        ),
        request_id=reservation.request_id,
        reserved_credits=reserved,
        applied_credit_value_micros=credit_value,
    )
    await commerce.save_budget_reservation_reconciliation(
        reservation=reservation,
        actual_credits=None,
        reconciled_at=datetime.now(UTC),
        conn=conn,
    )
