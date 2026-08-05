from datetime import UTC, datetime, timedelta
from uuid import uuid4

from src.models.commerce.credit_allocation import CreditGrantSource, WorkspaceCreditGrantLot
from src.modules.commerce.credit_lot_ordering import credit_lot_depletion_key, credit_lot_reversal_key


def _lot(*, source: CreditGrantSource, issued_at: datetime, expires_at: datetime | None = None):
    return WorkspaceCreditGrantLot(
        id=uuid4(),
        workspace_id=uuid4(),
        account_id=uuid4(),
        subscription_id=uuid4(),
        plan_revision_id=uuid4(),
        source=source,
        source_identity=uuid4().hex,
        granted_credits=100,
        remaining_credits=100,
        reserved_credits=0,
        issued_at=issued_at,
        expires_at=expires_at,
        actor_user_id=None,
        description_key="TEST",
    )


def test_credit_depletion_uses_plan_then_expiring_grants_then_top_up() -> None:
    now = datetime(2026, 8, 5, tzinfo=UTC)
    lots = [
        _lot(source=CreditGrantSource.TOP_UP, issued_at=now - timedelta(days=10)),
        _lot(source=CreditGrantSource.PROMOTIONAL, issued_at=now, expires_at=now + timedelta(days=2)),
        _lot(source=CreditGrantSource.ADJUSTMENT, issued_at=now, expires_at=now + timedelta(days=1)),
        _lot(source=CreditGrantSource.PLAN_PERIOD, issued_at=now),
        _lot(source=CreditGrantSource.LEGACY_UNATTRIBUTED, issued_at=now - timedelta(days=20)),
    ]

    assert [lot.source for lot in sorted(lots, key=credit_lot_depletion_key)] == [
        CreditGrantSource.PLAN_PERIOD,
        CreditGrantSource.ADJUSTMENT,
        CreditGrantSource.PROMOTIONAL,
        CreditGrantSource.LEGACY_UNATTRIBUTED,
        CreditGrantSource.TOP_UP,
    ]


def test_credit_reversal_protects_purchased_top_up_credits_until_last() -> None:
    now = datetime(2026, 8, 5, tzinfo=UTC)
    lots = [
        _lot(source=CreditGrantSource.TOP_UP, issued_at=now),
        _lot(source=CreditGrantSource.PLAN_PERIOD, issued_at=now),
        _lot(source=CreditGrantSource.PROMOTIONAL, issued_at=now),
        _lot(source=CreditGrantSource.ADJUSTMENT, issued_at=now),
        _lot(source=CreditGrantSource.LEGACY_UNATTRIBUTED, issued_at=now),
    ]

    assert [lot.source for lot in sorted(lots, key=credit_lot_reversal_key)] == [
        CreditGrantSource.ADJUSTMENT,
        CreditGrantSource.PROMOTIONAL,
        CreditGrantSource.PLAN_PERIOD,
        CreditGrantSource.LEGACY_UNATTRIBUTED,
        CreditGrantSource.TOP_UP,
    ]
