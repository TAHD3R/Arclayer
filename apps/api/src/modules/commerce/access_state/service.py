from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.modules.commerce.access_state.schema import (
    CommercialAccessProjection,
    CommercialAccessState,
    CommercialAccessStateApplyResult,
    CommercialAccessTransitionFact,
    CommercialAccessTransitionWrite,
    CommercialLifecycleNotificationFact,
    HostingCommercialAccessHandoffFact,
    ProviderDunningFact,
    ProviderDunningFactKind,
    ProviderDunningTransitionRequest,
    VerifiedProviderDunningFact,
)


class ProviderDunningFactVerifier(Protocol):
    async def verify(self, *, source: ProviderDunningFact) -> VerifiedProviderDunningFact: ...


class CommercialAccessStatePersistence(Protocol):
    async def get_transition_receipt(
        self, *, provider: str, provider_event_id: str
    ) -> CommercialAccessStateApplyResult | None: ...

    async def get_projection(self, *, workspace_id) -> CommercialAccessProjection | None: ...

    async def compare_and_append(
        self, *, write: CommercialAccessTransitionWrite
    ) -> CommercialAccessStateApplyResult: ...


class CommercialAccessStateService(BaseService):
    """Transforms verified provider dunning facts into durable access facts."""

    def __init__(
        self,
        *,
        persistence: CommercialAccessStatePersistence,
        verifier: ProviderDunningFactVerifier,
        settings: Settings | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        super().__init__(settings)
        self._persistence = persistence
        self._verifier = verifier
        self._now = now or (lambda: datetime.now(UTC))

    async def apply_provider_fact(
        self, *, request: ProviderDunningTransitionRequest
    ) -> CommercialAccessStateApplyResult:
        source = await self._verifier.verify(source=request.source)
        receipt = await self._persistence.get_transition_receipt(
            provider=source.provider,
            provider_event_id=source.provider_event_id,
        )
        if receipt is not None:
            return receipt
        current = await self._persistence.get_projection(workspace_id=source.workspace_id)
        if current is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        if current.access_revision != request.expected_access_revision:
            raise Conflict(error="COMMERCIAL_ACCESS_STATE_REVISION_STALE")
        self._require_source_matches_projection(source=source, projection=current)
        result = self._build_result(source=source, current=current)
        write = CommercialAccessTransitionWrite(
            source=source,
            expected_access_revision=request.expected_access_revision,
            idempotency_key=request.idempotency_key,
            projection=result.projection,
            result=result,
        )
        return await self._persistence.compare_and_append(write=write)

    @staticmethod
    def _require_source_matches_projection(
        *, source: VerifiedProviderDunningFact, projection: CommercialAccessProjection
    ) -> None:
        if source.subscription_revision_id != projection.subscription_revision_id:
            raise Conflict(error="COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED")
        if source.provider != projection.provider:
            raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_CHANGED")

    def _build_result(
        self,
        *,
        source: VerifiedProviderDunningFact,
        current: CommercialAccessProjection,
    ) -> CommercialAccessStateApplyResult:
        state, deadline, milestone, handoff_cause = self._transition_shape(source=source)
        effective_at = self._now()
        identity = f"provider:{source.provider}:{source.provider_event_id}"
        projection = CommercialAccessProjection(
            workspace_id=current.workspace_id,
            subscription_revision_id=current.subscription_revision_id,
            provider=current.provider,
            provider_period_id=source.provider_period_id,
            state=state,
            recovery_deadline=deadline,
            access_revision=current.access_revision + 1,
            source_event_id=source.provider_event_id,
            effective_at=effective_at,
        )
        transition = CommercialAccessTransitionFact(
            workspace_id=current.workspace_id,
            transition_identity=identity,
            source_event_id=source.provider_event_id,
            from_state=current.state,
            to_state=state,
            effective_at=effective_at,
            recovery_deadline=deadline,
        )
        notification = CommercialLifecycleNotificationFact(
            workspace_id=current.workspace_id,
            transition_identity=identity,
            milestone=milestone,
            effective_at=effective_at,
            recovery_deadline=deadline,
        )
        hosting_handoff = (
            HostingCommercialAccessHandoffFact(
                workspace_id=current.workspace_id,
                transition_identity=identity,
                state=state,
                cause=handoff_cause,
                effective_at=effective_at,
            )
            if handoff_cause is not None
            else None
        )
        return CommercialAccessStateApplyResult(
            projection=projection,
            transition=transition,
            notification=notification,
            hosting_handoff=hosting_handoff,
        )

    @staticmethod
    def _transition_shape(
        *, source: VerifiedProviderDunningFact
    ) -> tuple[CommercialAccessState, datetime | None, str, str | None]:
        if source.kind == ProviderDunningFactKind.PAYMENT_FAILURE:
            return CommercialAccessState.PAYMENT_GRACE, source.recovery_deadline, "payment_grace_started", None
        if source.kind == ProviderDunningFactKind.PAYMENT_RECOVERED:
            return CommercialAccessState.NORMAL, None, "payment_recovered", "provider_payment_recovered"
        if source.kind == ProviderDunningFactKind.FINAL_UNPAID:
            return CommercialAccessState.PAYMENT_RESTRICTED, None, "payment_restricted", "provider_final_unpaid"
        raise ValueError(f"unsupported provider dunning fact kind: {source.kind}")
