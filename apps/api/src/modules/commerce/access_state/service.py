from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from json import dumps
from typing import Protocol
from uuid import NAMESPACE_URL, uuid5

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.modules.commerce.access_state.schema import (
    CommercialAccessApplyDisposition,
    CommercialAccessProjection,
    CommercialAccessState,
    CommercialAccessStateApplyOutcome,
    CommercialAccessStateApplyResult,
    CommercialAccessTransitionFact,
    CommercialAccessTransitionWrite,
    CommercialLifecycleNotificationFact,
    HostingCommercialAccessHandoffFact,
    ProviderDunningFact,
    ProviderDunningFactKind,
    ProviderDunningTransitionRequest,
    ResolvedDunningPolicy,
    VerifiedProviderDunningFact,
)


class ProviderDunningFactVerifier(Protocol):
    async def verify(self, *, source: ProviderDunningFact) -> VerifiedProviderDunningFact: ...


class CommercialAccessStatePersistence(Protocol):
    async def get_transition_receipt(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyResult | None: ...

    async def get_projection(
        self,
        *,
        workspace_id,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> CommercialAccessProjection | None: ...

    async def get_current_result(
        self,
        *,
        workspace_id,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyResult | None: ...

    async def compare_and_append(
        self,
        *,
        write: CommercialAccessTransitionWrite,
        conn: BaseDBAsyncClient | None = None,
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
        self,
        *,
        request: ProviderDunningTransitionRequest,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercialAccessStateApplyOutcome:
        source = await self._verifier.verify(source=request.source)
        receipt = await self._persistence.get_transition_receipt(
            provider=source.provider,
            provider_mode=source.provider_mode,
            provider_account_id=source.provider_account_id,
            provider_event_id=source.provider_event_id,
            conn=conn,
        )
        if receipt is not None:
            return CommercialAccessStateApplyOutcome(
                result=receipt,
                disposition=CommercialAccessApplyDisposition.REPLAYED,
            )
        current = await self._persistence.get_projection(
            workspace_id=source.workspace_id,
            conn=conn,
            for_update=True,
        )
        if current is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        if current.access_revision != request.expected_access_revision:
            raise Conflict(error="COMMERCIAL_ACCESS_STATE_REVISION_STALE")
        self._require_source_matches_projection(
            source=source,
            projection=current,
            policy=request.policy,
        )
        ignored = self._ignored_disposition(source=source, current=current)
        if ignored is not None:
            current_result = await self._persistence.get_current_result(
                workspace_id=source.workspace_id,
                conn=conn,
            )
            if current_result is None:
                raise ServiceUnavailable(error="COMMERCIAL_ACCESS_CURRENT_TRANSITION_UNAVAILABLE")
            return CommercialAccessStateApplyOutcome(result=current_result, disposition=ignored)
        result = self._build_result(source=source, current=current, policy=request.policy)
        write = CommercialAccessTransitionWrite(
            source=source,
            policy=request.policy,
            expected_access_revision=request.expected_access_revision,
            idempotency_key=request.idempotency_key,
            projection=result.projection,
            result=result,
        )
        applied = await self._persistence.compare_and_append(write=write, conn=conn)
        return CommercialAccessStateApplyOutcome(
            result=applied,
            disposition=CommercialAccessApplyDisposition.TRANSITIONED,
        )

    @staticmethod
    def _require_source_matches_projection(
        *,
        source: VerifiedProviderDunningFact,
        projection: CommercialAccessProjection,
        policy: ResolvedDunningPolicy,
    ) -> None:
        if source.subscription_revision_id != projection.subscription_revision_id:
            raise Conflict(error="COMMERCIAL_ACCESS_SUBSCRIPTION_REVISION_CHANGED")
        if source.provider != projection.provider:
            raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_CHANGED")
        if source.provider_mode != projection.provider_mode:
            raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_MODE_CHANGED")
        if source.provider != policy.provider or source.provider_mode != policy.provider_mode:
            raise Conflict(error="COMMERCIAL_DUNNING_POLICY_SCOPE_CHANGED")

    @staticmethod
    def _ignored_disposition(
        *,
        source: VerifiedProviderDunningFact,
        current: CommercialAccessProjection,
    ) -> CommercialAccessApplyDisposition | None:
        if current.source_occurred_at is not None and source.occurred_at < current.source_occurred_at:
            return CommercialAccessApplyDisposition.STALE_IGNORED
        if current.provider_period_start is not None and current.provider_period_end is not None:
            if source.provider_period_end < current.provider_period_end:
                return CommercialAccessApplyDisposition.STALE_IGNORED
            if source.provider_period_id == current.provider_period_id and (
                source.provider_period_start != current.provider_period_start
                or source.provider_period_end != current.provider_period_end
            ):
                raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_PERIOD_CHANGED")
            if (
                current.source_occurred_at is not None
                and source.provider_period_start == current.provider_period_start
                and source.provider_period_end == current.provider_period_end
                and source.provider_period_id != current.provider_period_id
            ):
                raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_PERIOD_CHANGED")
        if current.state != CommercialAccessState.NORMAL and source.provider_period_id != current.provider_period_id:
            raise Conflict(error="COMMERCIAL_ACCESS_PROVIDER_PERIOD_CHANGED")
        if (
            current.state == CommercialAccessState.NORMAL
            and current.source_occurred_at is not None
            and source.provider_period_id == current.provider_period_id
            and source.kind in {ProviderDunningFactKind.PAYMENT_FAILURE, ProviderDunningFactKind.FINAL_UNPAID}
        ):
            return CommercialAccessApplyDisposition.STATE_REGRESSION_IGNORED
        if source.kind == ProviderDunningFactKind.PAYMENT_FAILURE:
            if current.state == CommercialAccessState.PAYMENT_RESTRICTED:
                return CommercialAccessApplyDisposition.STATE_REGRESSION_IGNORED
            if current.state == CommercialAccessState.PAYMENT_GRACE:
                return CommercialAccessApplyDisposition.STATE_REPEAT_IGNORED
        if (
            source.kind == ProviderDunningFactKind.FINAL_UNPAID
            and current.state == CommercialAccessState.PAYMENT_RESTRICTED
        ):
            return CommercialAccessApplyDisposition.STATE_REPEAT_IGNORED
        return None

    def _build_result(
        self,
        *,
        source: VerifiedProviderDunningFact,
        current: CommercialAccessProjection,
        policy: ResolvedDunningPolicy,
    ) -> CommercialAccessStateApplyResult:
        state, deadline, milestone, handoff_cause = self._transition_shape(source=source)
        effective_at = self._now()
        identity = self._provider_event_identity(source=source)
        projection = CommercialAccessProjection(
            workspace_id=current.workspace_id,
            subscription_revision_id=current.subscription_revision_id,
            provider=current.provider,
            provider_mode=current.provider_mode,
            provider_period_id=source.provider_period_id,
            provider_period_start=source.provider_period_start,
            provider_period_end=source.provider_period_end,
            state=state,
            recovery_deadline=deadline,
            access_revision=current.access_revision + 1,
            source_event_id=source.provider_event_id,
            source_occurred_at=source.occurred_at,
            dunning_policy_revision=policy.revision,
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

    @staticmethod
    def _provider_event_identity(*, source: VerifiedProviderDunningFact) -> str:
        canonical = dumps(
            [source.provider, source.provider_mode, source.provider_account_id, source.provider_event_id],
            separators=(",", ":"),
        )
        return f"provider-event:{uuid5(NAMESPACE_URL, canonical)}"
