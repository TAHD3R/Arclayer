from __future__ import annotations

from datetime import UTC, datetime

from src.models.commerce.credit_allocation import CreditGrantSource, WorkspaceCreditGrantLot


def credit_lot_depletion_key(lot: WorkspaceCreditGrantLot) -> tuple[int, datetime, datetime, str]:
    far_future = datetime.max.replace(tzinfo=UTC)
    if lot.source is CreditGrantSource.PLAN_PERIOD:
        return 0, lot.expires_at or far_future, lot.issued_at, str(lot.id)
    if lot.source in {CreditGrantSource.PROMOTIONAL, CreditGrantSource.ADJUSTMENT}:
        return 1, lot.expires_at or far_future, lot.issued_at, str(lot.id)
    if lot.source is CreditGrantSource.LEGACY_UNATTRIBUTED:
        return 2, far_future, lot.issued_at, str(lot.id)
    return 3, far_future, lot.issued_at, str(lot.id)


def credit_lot_reversal_key(lot: WorkspaceCreditGrantLot) -> tuple[int, float, str]:
    source_priority = {
        CreditGrantSource.ADJUSTMENT: 0,
        CreditGrantSource.PROMOTIONAL: 1,
        CreditGrantSource.PLAN_PERIOD: 2,
        CreditGrantSource.LEGACY_UNATTRIBUTED: 3,
        CreditGrantSource.TOP_UP: 4,
    }
    return source_priority[lot.source], -lot.issued_at.timestamp(), str(lot.id)
