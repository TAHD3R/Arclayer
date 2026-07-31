from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.commerce.billing import SubscriptionRevisionTransitionItem, SubscriptionTransitionStatus
from src.modules.commerce.subscription_transitions.provider_confirmation import (
    TortoiseProviderConfirmedConvergenceResolver,
)
from src.modules.commerce.subscription_transitions.schema import ProviderConfirmedTransitionEvidence


class _TransitionItemQuery:
    def __init__(self, item: object) -> None:
        self.item = item
        self.filters: dict[str, object] = {}
        self.connection: object | None = None
        self.related: tuple[str, ...] = ()
        self.locked = False

    def using_db(self, connection: object) -> _TransitionItemQuery:
        self.connection = connection
        return self

    def select_for_update(self) -> _TransitionItemQuery:
        self.locked = True
        return self

    def select_related(self, *relations: str) -> _TransitionItemQuery:
        self.related = relations
        return self

    async def first(self) -> object:
        return self.item


class _TransitionItem:
    def __init__(self, *, workspace_id, target_revision_id, convergence_id, effective_at) -> None:
        self.requires_convergence = True
        self.convergence_id = convergence_id
        self.status = SubscriptionTransitionStatus.SCHEDULED
        self.effective_at = effective_at
        self.subscription = SimpleNamespace(workspace_id=workspace_id)
        self.transition = SimpleNamespace(target_plan_revision_id=target_revision_id)
        self.loaded_relations: list[tuple[str, ...]] = []

    async def fetch_related(self, *relations: str, using_db: object | None = None) -> None:
        _ = using_db
        self.loaded_relations.append(relations)


@pytest.mark.asyncio
async def test_resolver_locks_transition_item_before_loading_nullable_relations(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    target_revision_id = uuid4()
    convergence_id = uuid4()
    effective_at = datetime.now(UTC)
    item = _TransitionItem(
        workspace_id=workspace_id,
        target_revision_id=target_revision_id,
        convergence_id=convergence_id,
        effective_at=effective_at,
    )
    query = _TransitionItemQuery(item)
    connection = object()

    def fake_filter(**filters: object) -> _TransitionItemQuery:
        query.filters = filters
        return query

    monkeypatch.setattr(SubscriptionRevisionTransitionItem, "filter", fake_filter)

    result = await TortoiseProviderConfirmedConvergenceResolver().resolve(
        workspace_id=workspace_id,
        evidence=ProviderConfirmedTransitionEvidence(
            provider_schedule_id="provider-schedule-1",
            target_revision_id=target_revision_id,
            effective_at=effective_at,
        ),
        provider_event_id="evt_1",
        correlation_id=uuid4(),
        conn=cast(BaseDBAsyncClient, connection),
    )

    assert result.preview_id == convergence_id
    assert query.filters == {"provider_schedule_id": "provider-schedule-1"}
    assert query.connection is connection
    assert query.locked is True
    assert query.related == ()
    assert item.loaded_relations == [("subscription", "transition")]
