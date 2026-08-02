"""Platform read/cancel boundary for durable Subscription Revision Transitions."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import NamedTuple, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, NotFound, ServiceUnavailable
from src.core.services import BaseService
from src.models.commerce.billing import (
    SubscriptionRevisionTransition,
    SubscriptionRevisionTransitionItem,
    SubscriptionTransitionStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.platform_operations_schema import (
    SubscriptionTransitionCancelRequest,
    SubscriptionTransitionDetailOut,
    SubscriptionTransitionItemOut,
)
from src.modules.commerce.subscription_transitions.provider_cancellation import (
    StripeSubscriptionTransitionCancellationPort,
)

ActivityWriter = Callable[..., Awaitable[object]]


class ProviderTransitionCancellationPort(Protocol):
    """Cancels the Provider schedule before Commerce changes durable local state."""

    async def cancel_schedules(self, *, provider_schedule_ids: tuple[str, ...], idempotency_key: str) -> None: ...


class _TransitionItemRelation(NamedTuple):
    item: SubscriptionRevisionTransitionItem
    subscription_id: UUID
    convergence_id: UUID | None


class _TransitionRelations(NamedTuple):
    source_plan_revision_id: UUID
    target_plan_revision_id: UUID
    items: tuple[_TransitionItemRelation, ...]


class PlatformSubscriptionTransitionOperations(BaseService):
    def __init__(
        self,
        *,
        settings: Settings | None = None,
        cancellation_port: ProviderTransitionCancellationPort | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._cancellation_port = cancellation_port
        self._activity_writer = activity_writer

    async def get(self, *, transition_id: UUID) -> SubscriptionTransitionDetailOut:
        transition = await self._load(transition_id=transition_id, conn=None, for_update=False)
        if transition is None:
            raise NotFound(error="SUBSCRIPTION_TRANSITION_NOT_FOUND")
        relations = await self._load_relations(transition=transition, conn=None)
        return _detail(transition=transition, relations=relations)

    async def cancel(
        self,
        *,
        transition_id: UUID,
        request: SubscriptionTransitionCancelRequest,
        actor_user_id: UUID,
    ) -> SubscriptionTransitionDetailOut:
        async with self.tx() as conn:
            transition = await self._load(transition_id=transition_id, conn=conn, for_update=True)
            if transition is None:
                raise NotFound(error="SUBSCRIPTION_TRANSITION_NOT_FOUND")
            relations = await self._load_relations(transition=transition, conn=conn)
            if transition.revision != request.expected_revision:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_REVISION_STALE")
            if transition.status == SubscriptionTransitionStatus.CANCELED:
                return _detail(transition=transition, relations=relations)
            if transition.status != SubscriptionTransitionStatus.SCHEDULED:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_NOT_REVERSIBLE")
            schedule_ids = tuple(
                relation.item.provider_schedule_id
                for relation in relations.items
                if relation.item.provider_schedule_id is not None
            )
            if schedule_ids:
                if self._cancellation_port is None:
                    raise ServiceUnavailable(
                        error="SUBSCRIPTION_TRANSITION_PROVIDER_CANCELLATION_PORT_UNAVAILABLE",
                        details={"protocol": "commerce.subscription-transition.cancel.v1"},
                    )
                await self._cancellation_port.cancel_schedules(
                    provider_schedule_ids=schedule_ids,
                    idempotency_key=request.idempotency_key,
                )
            transition.status = SubscriptionTransitionStatus.CANCELED
            transition.revision += 1
            await transition.save(using_db=conn, update_fields=["status", "revision", "updated_at"])
            for relation in relations.items:
                item = relation.item
                item.status = SubscriptionTransitionStatus.CANCELED
                item.result_code = "provider_schedule_canceled"
                await item.save(using_db=conn, update_fields=["status", "result_code", "updated_at"])
            await self._activity_writer(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.subscription_revision_transition.canceled",
                    actor_user_id=actor_user_id,
                    entity_type="subscription_revision_transition",
                    entity_id=transition.id,
                    properties={
                        "correlation_id": str(transition.correlation_id),
                        "provider_schedule_ids": list(schedule_ids),
                        "idempotency_key": request.idempotency_key,
                        "revision": int(transition.revision),
                    },
                ),
                conn=conn,
            )
            return _detail(transition=transition, relations=relations)

    @staticmethod
    async def _load(
        *, transition_id: UUID, conn: BaseDBAsyncClient | None, for_update: bool
    ) -> SubscriptionRevisionTransition | None:
        query = SubscriptionRevisionTransition.filter(id=transition_id)
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    @staticmethod
    async def _load_relations(
        *, transition: SubscriptionRevisionTransition, conn: BaseDBAsyncClient | None
    ) -> _TransitionRelations:
        transition_query = SubscriptionRevisionTransition.filter(id=transition.id)
        item_query = SubscriptionRevisionTransitionItem.filter(transition_id=transition.id)
        if conn is not None:
            transition_query = transition_query.using_db(conn)
            item_query = item_query.using_db(conn)
        rows = await transition_query.values_list("source_plan_revision_id", "target_plan_revision_id")
        if not rows:
            raise NotFound(error="SUBSCRIPTION_TRANSITION_NOT_FOUND")
        source_plan_revision_id, target_plan_revision_id = rows[0]
        items = tuple(await item_query.all())
        items_by_id = {UUID(str(item.id)): item for item in items}
        item_rows = await item_query.values_list("id", "subscription_id", "convergence_id")
        return _TransitionRelations(
            source_plan_revision_id=UUID(str(source_plan_revision_id)),
            target_plan_revision_id=UUID(str(target_plan_revision_id)),
            items=tuple(
                _TransitionItemRelation(
                    item=items_by_id[UUID(str(item_id))],
                    subscription_id=UUID(str(subscription_id)),
                    convergence_id=None if convergence_id is None else UUID(str(convergence_id)),
                )
                for item_id, subscription_id, convergence_id in item_rows
            ),
        )


def build_platform_subscription_transition_operations(
    settings: Settings,
) -> PlatformSubscriptionTransitionOperations:
    return PlatformSubscriptionTransitionOperations(
        settings=settings,
        cancellation_port=StripeSubscriptionTransitionCancellationPort(settings),
    )


def _detail(
    *, transition: SubscriptionRevisionTransition, relations: _TransitionRelations
) -> SubscriptionTransitionDetailOut:
    return SubscriptionTransitionDetailOut(
        id=transition.id,
        source_plan_revision_id=relations.source_plan_revision_id,
        target_plan_revision_id=relations.target_plan_revision_id,
        actor_user_id=transition.actor_user_id,
        reason=transition.reason,
        requested_at=transition.requested_at,
        status=transition.status,
        revision=int(transition.revision),
        correlation_id=transition.correlation_id,
        items=tuple(
            SubscriptionTransitionItemOut(
                subscription_id=relation.subscription_id,
                effective_at=relation.item.effective_at,
                provider_schedule_id=relation.item.provider_schedule_id,
                status=relation.item.status,
                result_code=relation.item.result_code,
                convergence_id=relation.convergence_id,
            )
            for relation in relations.items
        ),
    )
