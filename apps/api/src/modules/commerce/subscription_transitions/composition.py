"""Provider scheduler composition for Subscription Revision Transitions."""

from __future__ import annotations

from typing import Protocol, cast, runtime_checkable

from src.config import Settings
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.modules.commerce.subscription_transitions.repository import TortoiseSubscriptionTransitionRepository
from src.modules.commerce.subscription_transitions.schema import RenewalTransitionPreview
from src.modules.commerce.subscription_transitions.service import (
    SubscriptionTransitionRepository,
    SubscriptionTransitionService,
)


@runtime_checkable
class ProviderRevisionSchedulingConnector(Protocol):
    async def schedule_subscription_revision(
        self, *, preview: RenewalTransitionPreview, idempotency_key: str
    ) -> str: ...


class ConnectorRenewalScheduler:
    def __init__(self, *, settings: Settings, connectors: ConnectorRegistry) -> None:
        self._settings = settings
        self._connectors = connectors

    async def schedule_renewal(self, *, preview: RenewalTransitionPreview, idempotency_key: str) -> str:
        provider = self._settings.billing.provider
        if provider == "disabled":
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")
        registration = self._connectors.resolve(f"billing.{provider}")
        if registration is None:
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")
        connector = registration.factory()
        if not isinstance(connector, ProviderRevisionSchedulingConnector):
            raise ServiceUnavailable(error="SUBSCRIPTION_TRANSITION_PROVIDER_SCHEDULING_UNAVAILABLE")
        return await connector.schedule_subscription_revision(preview=preview, idempotency_key=idempotency_key)


def build_subscription_transition_service(
    settings: Settings, connectors: ConnectorRegistry
) -> SubscriptionTransitionService:
    return SubscriptionTransitionService(
        repository=cast(SubscriptionTransitionRepository, TortoiseSubscriptionTransitionRepository(settings)),
        provider_scheduler=ConnectorRenewalScheduler(settings=settings, connectors=connectors),
    )
