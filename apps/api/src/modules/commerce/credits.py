from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.config import Settings
from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.commerce.billing import (
    CreditLedgerEntryType,
    SubscriptionStatus,
    WorkspaceCreditAccount,
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
    settings: Settings,
    conn: BaseDBAsyncClient,
    workspace_id: UUID,
    request_id: UUID,
    estimated_cost_micros: int,
) -> CreditReservationDetails:
    service = CommerceService(settings)
    subscription, account, plan = await service.ensure_workspace_billing_in_transaction(
        workspace_id=workspace_id,
        conn=conn,
    )
    if subscription.status not in {SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE}:
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
    await account.save(using_db=conn)
    await service.write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=CreditLedgerEntryType.RESERVATION,
        delta_balance=0,
        delta_reserved=requested,
        reference_type="ai_request",
        reference_id=request_id,
        idempotency_key=f"ai-credit-reserve:{request_id}",
        actor_user_id=None,
        description_key="LEDGER_AI_RESERVATION",
        details={
            "estimatedCostMicros": estimated_cost_micros,
            "creditValueMicros": credit_value,
            "reservedCredits": requested,
        },
    )
    return CreditReservationDetails(
        account_id=account.id,
        credit_value_micros=credit_value,
        reserved_credits=requested,
    )


async def commit_workspace_credits(
    *,
    settings: Settings,
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
    account = (
        await WorkspaceCreditAccount.filter(id=reservation.credit_account_id).using_db(conn).select_for_update().first()
    )
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
    account.lifetime_spent_credits += actual_credits
    account.period_spent_credits += actual_credits
    await account.save(using_db=conn)
    await CommerceService(settings).write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=CreditLedgerEntryType.COMMIT,
        delta_balance=-actual_credits,
        delta_reserved=-reserved,
        reference_type="ai_request",
        reference_id=reservation.request_id,
        idempotency_key=f"ai-credit-commit:{reservation.request_id}",
        actor_user_id=None,
        description_key="LEDGER_AI_COMMIT",
        details={
            "actualCostMicros": actual_cost_micros,
            "creditValueMicros": credit_value,
            "reservedCredits": reserved,
            "actualCredits": actual_credits,
        },
    )
    reservation.actual_credits = actual_credits
    reservation.credits_reconciled_at = datetime.now(UTC)
    await reservation.save(
        using_db=conn,
        update_fields=["actual_credits", "credits_reconciled_at", "updated_at"],
    )
    return actual_credits


async def release_workspace_credits(
    *,
    settings: Settings,
    conn: BaseDBAsyncClient,
    reservation: AIBudgetReservation,
    reason: str,
    entry_type: CreditLedgerEntryType = CreditLedgerEntryType.RELEASE,
) -> None:
    if reservation.credit_account_id is None or reservation.reserved_credits is None:
        return
    account = (
        await WorkspaceCreditAccount.filter(id=reservation.credit_account_id).using_db(conn).select_for_update().first()
    )
    if account is None:
        raise RuntimeError(f"Credit account {reservation.credit_account_id} not found")
    reserved = int(reservation.reserved_credits)
    if int(account.reserved_credits) < reserved:
        raise RuntimeError("Credit account reserved balance is inconsistent with the AI reservation")
    account.reserved_credits -= reserved
    await account.save(using_db=conn)
    await CommerceService(settings).write_credit_ledger_entry(
        conn=conn,
        account=account,
        entry_type=entry_type,
        delta_balance=0,
        delta_reserved=-reserved,
        reference_type="ai_request",
        reference_id=reservation.request_id,
        idempotency_key=f"ai-credit-release:{reservation.request_id}:{reason}",
        actor_user_id=None,
        description_key=(
            "LEDGER_AI_EXPIRATION" if entry_type == CreditLedgerEntryType.EXPIRATION else "LEDGER_AI_RELEASE"
        ),
        details={"reason": reason, "reservedCredits": reserved},
    )
    reservation.credits_reconciled_at = datetime.now(UTC)
    await reservation.save(using_db=conn, update_fields=["credits_reconciled_at", "updated_at"])
