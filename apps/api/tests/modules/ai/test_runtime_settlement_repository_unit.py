from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.models.commerce.billing import CreditLedgerEntryType
from src.modules.ai import runtime_settlement_repository
from src.modules.ai.runtime_settlement_repository import AgentRunSettlementRepository


class _LedgerQuery:
    def __init__(self, *, ledger: object) -> None:
        self.ledger = ledger
        self.filters: dict[str, object] = {}

    def using_db(self, _conn: object) -> _LedgerQuery:
        return self

    async def first(self) -> object:
        return self.ledger

    async def all(self) -> list[object]:
        return [self.ledger]


@pytest.mark.asyncio
async def test_credit_commit_proof_uses_revision_aware_ledger_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace_id, account_id, request_id = uuid4(), uuid4(), uuid4()
    ledger = SimpleNamespace(
        workspace_id=workspace_id,
        account_id=account_id,
        request_id=request_id,
        entry_type=CreditLedgerEntryType.COMMIT,
        delta_balance_credits=-2,
        delta_reserved_credits=-5,
        actual_cost_micros=2_000,
        applied_credit_value_micros=1_000,
        reserved_credits=5,
        committed_credits=2,
    )
    query = _LedgerQuery(ledger=ledger)
    monkeypatch.setattr(
        runtime_settlement_repository.WorkspaceCreditLedger,
        "filter",
        lambda **filters: _capture_filters(query=query, filters=filters),
    )
    run = cast(AgentRunV1Record, SimpleNamespace(workspace_id=workspace_id))
    reservation = cast(
        AIBudgetReservation,
        SimpleNamespace(
            request_id=request_id,
            credit_account_id=account_id,
            credit_value_micros=1_000,
            reserved_credits=5,
            actual_credits=2,
            actual_cost_micros=2_000,
            credits_reconciled_at=object(),
        ),
    )

    committed = await AgentRunSettlementRepository()._verify_credit_commit(
        run=run,
        reservation=reservation,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert committed == 2
    assert query.filters == {
        "workspace_id": workspace_id,
        "account_id": account_id,
        "request_id": request_id,
        "entry_type": CreditLedgerEntryType.COMMIT,
        "idempotency_key": f"ai-credit-commit:{request_id}",
    }


@pytest.mark.asyncio
async def test_credit_release_proof_uses_request_identity_and_immutable_credit_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id, account_id, request_id = uuid4(), uuid4(), uuid4()
    ledger = SimpleNamespace(
        workspace_id=workspace_id,
        account_id=account_id,
        request_id=request_id,
        entry_type=CreditLedgerEntryType.RELEASE,
        delta_balance_credits=0,
        delta_reserved_credits=-5,
        actual_cost_micros=None,
        applied_credit_value_micros=1_000,
        reserved_credits=5,
        committed_credits=0,
    )
    query = _LedgerQuery(ledger=ledger)
    monkeypatch.setattr(
        runtime_settlement_repository.WorkspaceCreditLedger,
        "filter",
        lambda **filters: _capture_filters(query=query, filters=filters),
    )
    run = cast(AgentRunV1Record, SimpleNamespace(workspace_id=workspace_id))
    reservation = cast(
        AIBudgetReservation,
        SimpleNamespace(
            status=ReservationStatus.RELEASED,
            request_id=request_id,
            credit_account_id=account_id,
            credit_value_micros=1_000,
            reserved_credits=5,
            actual_credits=None,
            credits_reconciled_at=object(),
        ),
    )

    released = await AgentRunSettlementRepository()._verify_credit_release(
        run=run,
        reservation=reservation,
        conn=cast(BaseDBAsyncClient, object()),
    )

    assert released == 5
    assert query.filters == {
        "workspace_id": workspace_id,
        "account_id": account_id,
        "request_id": request_id,
        "entry_type__in": (CreditLedgerEntryType.RELEASE, CreditLedgerEntryType.EXPIRATION),
    }


def _capture_filters(*, query: _LedgerQuery, filters: dict[str, object]) -> _LedgerQuery:
    query.filters = filters
    return query
