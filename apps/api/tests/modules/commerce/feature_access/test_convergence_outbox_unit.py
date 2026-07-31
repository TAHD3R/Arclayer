from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.models.commerce.feature_access import FeatureAccessConvergenceOutboxRecord
from src.modules.commerce.feature_access.contracts import FeatureAccessConvergenceResult
from src.modules.commerce.feature_access.convergence_outbox import (
    TortoiseFeatureAccessConvergenceOutbox,
    feature_access_convergence_fingerprint,
    feature_access_convergence_payload,
)


class _Query:
    def __init__(self, row: object | None) -> None:
        self._row = row

    def using_db(self, _conn: BaseDBAsyncClient) -> _Query:
        return self

    def select_for_update(self) -> _Query:
        return self

    async def first(self) -> object | None:
        return self._row


def _result() -> FeatureAccessConvergenceResult:
    return FeatureAccessConvergenceResult(
        convergence_id=uuid4(),
        workspace_id=uuid4(),
        target_revision_id=uuid4(),
        effective_at=datetime.now(UTC),
        reviewed_assignment_ids=(),
        retained_assignment_ids=(),
        ended_assignment_ids=(),
        scopes=(),
        replayed=False,
    )


async def test_outbox_creates_canonical_fact_in_callers_transaction(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _result()
    conn = cast(BaseDBAsyncClient, object())
    created: dict[str, object] = {}

    monkeypatch.setattr(FeatureAccessConvergenceOutboxRecord, "filter", lambda **_kwargs: _Query(None))

    async def create(**kwargs):  # type: ignore[no-untyped-def]
        created.update(kwargs)

    monkeypatch.setattr(FeatureAccessConvergenceOutboxRecord, "create", create)

    await TortoiseFeatureAccessConvergenceOutbox().append_feature_access_convergence(
        result=result,
        conn=conn,
    )

    payload = feature_access_convergence_payload(result)
    assert created["using_db"] is conn
    assert created["convergence_id"] == result.convergence_id
    assert created["workspace_id"] == result.workspace_id
    assert created["payload"] == payload
    assert created["fingerprint"] == feature_access_convergence_fingerprint(payload)


async def test_outbox_replays_exact_fact_and_rejects_identity_conflict(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _result()
    payload = feature_access_convergence_payload(result)
    fingerprint = feature_access_convergence_fingerprint(payload)
    row = SimpleNamespace(payload=payload, fingerprint=fingerprint)
    monkeypatch.setattr(FeatureAccessConvergenceOutboxRecord, "filter", lambda **_kwargs: _Query(row))

    await TortoiseFeatureAccessConvergenceOutbox().append_feature_access_convergence(
        result=result,
        conn=cast(BaseDBAsyncClient, object()),
    )

    row.payload = {**payload, "workspaceId": str(uuid4())}
    with pytest.raises(Conflict) as exc:
        await TortoiseFeatureAccessConvergenceOutbox().append_feature_access_convergence(
            result=result,
            conn=cast(BaseDBAsyncClient, object()),
        )

    assert exc.value.error == "FEATURE_ACCESS_CONVERGENCE_OUTBOX_CONFLICT"
