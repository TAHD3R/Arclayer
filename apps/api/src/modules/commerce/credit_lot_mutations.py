from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.models.commerce.credit_allocation import WorkspaceCreditGrantLot
from src.modules.commerce.credit_lot_ordering import credit_lot_reversal_key


@dataclass(frozen=True, slots=True)
class CreditLotDebit:
    lot_id: UUID
    credits: int


async def deplete_unreserved_credit_lots(
    *, account_id: UUID, credits: int, conn: BaseDBAsyncClient
) -> tuple[CreditLotDebit, ...]:
    now = datetime.now(UTC)
    lots = await (
        WorkspaceCreditGrantLot
        .filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            account_id=account_id,
            remaining_credits__gt=0,
        )
        .using_db(conn)
        .select_for_update()
        .all()
    )
    lots.sort(key=credit_lot_reversal_key)
    remaining = credits
    debits: list[CreditLotDebit] = []
    for lot in lots:
        available = max(int(lot.remaining_credits) - int(lot.reserved_credits), 0)
        debit = min(available, remaining)
        if debit == 0:
            continue
        lot.remaining_credits -= debit
        await lot.save(using_db=conn, update_fields=["remaining_credits", "updated_at"])
        debits.append(CreditLotDebit(lot_id=UUID(str(lot.id)), credits=debit))
        remaining -= debit
        if remaining == 0:
            return tuple(debits)
    raise RuntimeError("Credit account balance is not backed by sufficient unreserved grant lots")
