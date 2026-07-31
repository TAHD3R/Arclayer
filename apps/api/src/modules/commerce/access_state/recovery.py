from __future__ import annotations

from typing import Protocol

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.modules.commerce.access_state.schema import (
    CommercialAccessProjection,
    CommercialAccessState,
    PaymentRecoveryGrantDecision,
    PaymentRecoveryGrantRequest,
    PaymentRecoveryGrantWrite,
    ProviderDunningFactKind,
)


class PaymentRecoveryGrantPersistence(Protocol):
    async def get_projection(self, *, workspace_id) -> CommercialAccessProjection | None: ...

    async def get_decision(
        self, *, workspace_id, provider: str, provider_period_id: str, subscription_revision_id
    ) -> PaymentRecoveryGrantDecision | None: ...

    async def compare_and_decide(self, *, command: PaymentRecoveryGrantWrite) -> PaymentRecoveryGrantDecision: ...


class PaymentRecoveryGrantService(BaseService):
    """Makes the one durable grant decision for a recovered Provider period."""

    def __init__(
        self,
        *,
        persistence: PaymentRecoveryGrantPersistence,
        settings: Settings | None = None,
    ) -> None:
        super().__init__(settings)
        self._persistence = persistence

    async def decide(self, *, request: PaymentRecoveryGrantRequest) -> PaymentRecoveryGrantDecision:
        source = request.source
        if source.kind != ProviderDunningFactKind.PAYMENT_RECOVERED:
            raise Conflict(error="COMMERCIAL_RECOVERY_GRANT_SOURCE_INVALID")
        existing = await self._persistence.get_decision(
            workspace_id=source.workspace_id,
            provider=source.provider,
            provider_period_id=source.provider_period_id,
            subscription_revision_id=source.subscription_revision_id,
        )
        if existing is not None:
            return existing
        projection = await self._persistence.get_projection(workspace_id=source.workspace_id)
        if projection is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        self._require_recovered_projection(
            projection=projection,
            request=request,
        )
        decision = PaymentRecoveryGrantDecision(
            workspace_id=source.workspace_id,
            provider=source.provider,
            provider_period_id=source.provider_period_id,
            subscription_revision_id=source.subscription_revision_id,
            source_event_id=source.provider_event_id,
            grant_required=True,
            decision_identity=(
                f"provider-period:{source.provider}:{source.provider_period_id}:{source.subscription_revision_id}"
            ),
        )
        return await self._persistence.compare_and_decide(
            command=PaymentRecoveryGrantWrite(
                expected_access_revision=request.expected_access_revision,
                idempotency_key=request.idempotency_key,
                decision=decision,
            )
        )

    @staticmethod
    def _require_recovered_projection(
        *, projection: CommercialAccessProjection, request: PaymentRecoveryGrantRequest
    ) -> None:
        source = request.source
        if projection.access_revision != request.expected_access_revision:
            raise Conflict(error="COMMERCIAL_ACCESS_STATE_REVISION_STALE")
        if projection.state != CommercialAccessState.NORMAL:
            raise Conflict(error="COMMERCIAL_RECOVERY_ACCESS_NOT_RESTORED")
        if projection.subscription_revision_id != source.subscription_revision_id:
            raise Conflict(error="COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED")
        if projection.provider != source.provider or projection.provider_period_id != source.provider_period_id:
            raise Conflict(error="COMMERCIAL_RECOVERY_PERIOD_CHANGED")
