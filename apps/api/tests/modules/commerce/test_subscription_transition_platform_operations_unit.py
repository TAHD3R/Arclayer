from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.common.utils.public_ids import encode_uuid
from src.models.commerce.billing import (
    SubscriptionRevisionTransition,
    SubscriptionRevisionTransitionItem,
    SubscriptionTransitionStatus,
)
from src.modules.commerce.platform_operations_schema import SubscriptionTransitionCancelRequest
from src.modules.commerce.subscription_transitions.platform_operations import (
    PlatformSubscriptionTransitionOperations,
    _detail,
    _TransitionItemRelation,
    _TransitionRelations,
)


def test_transition_relation_values_are_immutable_and_preserve_exact_identity() -> None:
    item = cast(SubscriptionRevisionTransitionItem, SimpleNamespace())
    subscription_id = uuid4()
    convergence_id = uuid4()
    relation = _TransitionItemRelation(
        item=item,
        subscription_id=subscription_id,
        convergence_id=convergence_id,
    )
    relations = _TransitionRelations(
        source_plan_revision_id=uuid4(),
        target_plan_revision_id=uuid4(),
        items=(relation,),
    )

    assert relation.item is item
    assert relation == _TransitionItemRelation(
        item=item,
        subscription_id=subscription_id,
        convergence_id=convergence_id,
    )
    assert relations.items == (relation,)

    with pytest.raises(AttributeError):
        object.__setattr__(relation, "subscription_id", uuid4())


def test_detail_preserves_per_subscription_result_serialization() -> None:
    transition_id = uuid4()
    source_plan_revision_id = uuid4()
    target_plan_revision_id = uuid4()
    subscription_id = uuid4()
    convergence_id = uuid4()
    requested_at = datetime(2026, 8, 2, 9, 30, tzinfo=UTC)
    effective_at = datetime(2026, 8, 3, 9, 30, tzinfo=UTC)
    correlation_id = uuid4()
    transition = cast(
        SubscriptionRevisionTransition,
        SimpleNamespace(
            id=transition_id,
            actor_user_id=None,
            reason="provider price correction",
            requested_at=requested_at,
            status=SubscriptionTransitionStatus.SCHEDULED,
            revision=4,
            correlation_id=correlation_id,
        ),
    )
    item = cast(
        SubscriptionRevisionTransitionItem,
        SimpleNamespace(
            effective_at=effective_at,
            provider_schedule_id="provider-schedule-1",
            status=SubscriptionTransitionStatus.SCHEDULED,
            result_code=None,
        ),
    )
    relations = _TransitionRelations(
        source_plan_revision_id=source_plan_revision_id,
        target_plan_revision_id=target_plan_revision_id,
        items=(
            _TransitionItemRelation(
                item=item,
                subscription_id=subscription_id,
                convergence_id=convergence_id,
            ),
        ),
    )

    detail = _detail(transition=transition, relations=relations)

    assert detail.model_dump(mode="json") == {
        "id": encode_uuid(transition_id),
        "source_plan_revision_id": encode_uuid(source_plan_revision_id),
        "target_plan_revision_id": encode_uuid(target_plan_revision_id),
        "actor_user_id": None,
        "reason": "provider price correction",
        "requested_at": "2026-08-02T09:30:00Z",
        "status": "scheduled",
        "revision": 4,
        "correlation_id": encode_uuid(correlation_id),
        "items": [
            {
                "subscription_id": encode_uuid(subscription_id),
                "effective_at": "2026-08-03T09:30:00Z",
                "provider_schedule_id": "provider-schedule-1",
                "status": "scheduled",
                "result_code": None,
                "convergence_id": encode_uuid(convergence_id),
            }
        ],
    }


@pytest.mark.asyncio
async def test_cancel_releases_provider_schedule_before_local_state_and_writes_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    transition_id = uuid4()
    actor_user_id = uuid4()
    transition = SimpleNamespace(
        id=transition_id,
        actor_user_id=uuid4(),
        reason="renewal transition",
        requested_at=datetime(2026, 8, 2, 9, 30, tzinfo=UTC),
        status=SubscriptionTransitionStatus.SCHEDULED,
        revision=3,
        correlation_id=uuid4(),
        save=AsyncMock(),
    )
    item = SimpleNamespace(
        effective_at=datetime(2026, 9, 2, 9, 30, tzinfo=UTC),
        provider_schedule_id="sub_sched_123",
        status=SubscriptionTransitionStatus.SCHEDULED,
        result_code=None,
        save=AsyncMock(),
    )
    relations = _TransitionRelations(
        source_plan_revision_id=uuid4(),
        target_plan_revision_id=uuid4(),
        items=(
            _TransitionItemRelation(
                item=cast(SubscriptionRevisionTransitionItem, item),
                subscription_id=uuid4(),
                convergence_id=None,
            ),
        ),
    )
    provider_calls = []
    audits = []

    class _CancellationPort:
        async def cancel_schedules(self, *, provider_schedule_ids, idempotency_key):  # type: ignore[no-untyped-def]
            provider_calls.append((provider_schedule_ids, idempotency_key))

    async def write_audit(*, settings, payload, conn):  # type: ignore[no-untyped-def]
        audits.append((settings, payload, conn))
        return SimpleNamespace(id=uuid4())

    service = PlatformSubscriptionTransitionOperations(
        settings=SimpleNamespace(),  # type: ignore[arg-type]
        cancellation_port=_CancellationPort(),
        activity_writer=write_audit,
    )

    @asynccontextmanager
    async def transaction():
        yield object()

    service.tx = transaction  # type: ignore[method-assign]
    monkeypatch.setattr(service, "_load", AsyncMock(return_value=transition))
    monkeypatch.setattr(service, "_load_relations", AsyncMock(return_value=relations))

    result = await service.cancel(
        transition_id=transition_id,
        request=SubscriptionTransitionCancelRequest(
            expected_revision=3,
            idempotency_key="transition-cancel-1",
        ),
        actor_user_id=actor_user_id,
    )

    assert provider_calls == [(("sub_sched_123",), "transition-cancel-1")]
    assert transition.status == SubscriptionTransitionStatus.CANCELED
    assert transition.revision == 4
    assert item.status == SubscriptionTransitionStatus.CANCELED
    assert item.result_code == "provider_schedule_canceled"
    transition.save.assert_awaited_once()
    item.save.assert_awaited_once()
    assert audits[0][1].actor_user_id == actor_user_id
    assert result.status == SubscriptionTransitionStatus.CANCELED
