from __future__ import annotations

from datetime import date
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.commerce.billing import WorkspaceCreditAccount, WorkspaceSubscription
from src.modules.commerce.repository import CommerceRepository, WorkspaceUsageAggregate


class _RowLockQuery:
    def __init__(self, *, row: object) -> None:
        self.row = row
        self.filter: dict[str, object] = {}
        self.connection: object | None = None
        self.relations: tuple[str, ...] = ()
        self.lock_options: dict[str, object] = {}

    def using_db(self, connection: object) -> _RowLockQuery:
        self.connection = connection
        return self

    def select_related(self, *relations: str) -> _RowLockQuery:
        self.relations = relations
        return self

    def select_for_update(self, **options: object) -> _RowLockQuery:
        self.lock_options = options
        return self

    async def first(self) -> object:
        return self.row


class _LockedRow:
    def __init__(self) -> None:
        self.loaded_relations: list[tuple[str, ...]] = []

    async def fetch_related(self, *relations: str) -> None:
        self.loaded_relations.append(relations)


def test_usage_aggregate_is_an_immutable_revision_independent_projection() -> None:
    aggregate = WorkspaceUsageAggregate(
        period_cost_micros=100,
        requests=2,
        prompt_tokens=3,
        completion_tokens=4,
        observed_from=date(2026, 7, 1),
        observed_to=date(2026, 7, 2),
    )

    assert aggregate.period_cost_micros == 100


@pytest.mark.asyncio
async def test_lock_subscription_locks_before_loading_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    connection = object()
    subscription = _LockedRow()
    query = _RowLockQuery(row=subscription)

    def fake_filter(**filters: object) -> _RowLockQuery:
        query.filter = filters
        return query

    monkeypatch.setattr(WorkspaceSubscription, "filter", fake_filter)

    result = await CommerceRepository().lock_subscription(
        workspace_id=workspace_id,
        conn=cast(BaseDBAsyncClient, connection),
    )

    assert result is subscription
    assert query.filter == {"workspace_id": workspace_id}
    assert query.connection is connection
    assert query.relations == ()
    assert query.lock_options == {}
    assert subscription.loaded_relations == [("plan_revision__plan",)]


@pytest.mark.asyncio
async def test_lock_credit_account_by_workspace_locks_before_loading_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    connection = object()
    account = _LockedRow()
    query = _RowLockQuery(row=account)

    def fake_filter(**filters: object) -> _RowLockQuery:
        query.filter = filters
        return query

    monkeypatch.setattr(WorkspaceCreditAccount, "filter", fake_filter)

    result = await CommerceRepository().lock_credit_account_by_workspace(
        workspace_id=workspace_id,
        conn=cast(BaseDBAsyncClient, connection),
    )

    assert result is account
    assert query.filter == {"workspace_id": workspace_id}
    assert query.connection is connection
    assert query.relations == ()
    assert query.lock_options == {}
    assert account.loaded_relations == [("plan_revision",)]


@pytest.mark.asyncio
async def test_lock_credit_account_by_id_locks_before_loading_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account_id = uuid4()
    connection = object()
    account = _LockedRow()
    query = _RowLockQuery(row=account)

    def fake_filter(**filters: object) -> _RowLockQuery:
        query.filter = filters
        return query

    monkeypatch.setattr(WorkspaceCreditAccount, "filter", fake_filter)

    result = await CommerceRepository().lock_credit_account_by_id(
        account_id=account_id,
        conn=cast(BaseDBAsyncClient, connection),
    )

    assert result is account
    assert query.filter == {"id": account_id}
    assert query.connection is connection
    assert query.relations == ()
    assert query.lock_options == {}
    assert account.loaded_relations == [("plan_revision",)]
