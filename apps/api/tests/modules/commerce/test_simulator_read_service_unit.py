from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.modules.commerce.platform_read_service import PlatformCommerceReadService
from src.modules.commerce.simulator_read_repository import SimulatorStateRows


class _SimulatorRepository:
    def __init__(self, rows: SimulatorStateRows) -> None:
        self.rows = rows

    async def get_workspace_state(self, *, workspace_id):  # type: ignore[no-untyped-def]
        assert workspace_id == self.rows.checkouts[0].workspace_id
        return self.rows


@pytest.mark.asyncio
async def test_simulator_state_projects_durable_rows_without_raw_payloads() -> None:
    now = datetime.now(UTC)
    workspace_id = uuid4()
    checkout_id = uuid4()
    transaction_id = uuid4()
    rows = SimulatorStateRows(
        checkouts=(
            SimpleNamespace(
                id=checkout_id,
                workspace_id=workspace_id,
                external_session_id="cs_sim_1",
                kind="top_up",
                provider="simulated",
                provider_mode="test",
                provider_account_id="platform",
                status="pending",
                currency="USD",
                amount_micros=10_000,
                credit_amount=100,
                external_price_id="price_sim_1",
                actor_user_id=uuid4(),
                revision=1,
                expires_at=now,
                completed_at=None,
            ),
        ),
        commands=(),
        inboxes=(),
        jobs=(),
        transactions=(
            SimpleNamespace(
                id=transaction_id,
                external_transaction_id="sim_tx_1",
                provider="simulated",
                provider_mode="test",
                kind="top_up",
                status="succeeded",
                currency="USD",
                amount_micros=10_000,
                credit_amount=100,
                checkout_session_id=checkout_id,
                invoice_id=None,
                occurred_at=now,
            ),
        ),
        invoices=(),
        refunds=(),
        applications=(),
        corrections=(),
    )
    service = PlatformCommerceReadService(
        catalog=cast(object, SimpleNamespace()),
        commerce=cast(object, SimpleNamespace()),
        simulator=cast(object, _SimulatorRepository(rows)),
    )

    result = await service.get_simulator_state(workspace_id=workspace_id)

    assert result.workspace_id == workspace_id
    assert result.checkouts[0].external_session_id == "cs_sim_1"
    assert result.transactions[0].external_transaction_id == "sim_tx_1"
    assert not hasattr(result.checkouts[0], "encrypted_payload")
