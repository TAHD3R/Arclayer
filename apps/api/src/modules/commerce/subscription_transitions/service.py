from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.services import BaseService
from src.modules.commerce.subscription_transitions.schema import (
    CommercialCorrectionApplyRequest,
    CommercialCorrectionPreview,
    CommercialCorrectionRequest,
    RenewalTransitionPreview,
    RenewalTransitionScheduleOut,
    RenewalTransitionScheduleRequest,
    SubscriptionTransitionAuditEvent,
)


class ProviderRenewalScheduler(Protocol):
    async def schedule_renewal(self, *, preview: RenewalTransitionPreview, idempotency_key: str) -> str: ...


class SubscriptionTransitionRepository(Protocol):
    """Atomic transition persistence with revision/idempotency replay and audit."""

    async def load_renewal_preview_for_update(
        self, *, preview_id, conn: BaseDBAsyncClient
    ) -> RenewalTransitionPreview: ...

    async def mark_provider_scheduled(
        self,
        *,
        preview: RenewalTransitionPreview,
        provider_schedule_id: str,
        request: RenewalTransitionScheduleRequest,
        actor_user_id: UUID,
        audit: SubscriptionTransitionAuditEvent,
        conn: BaseDBAsyncClient,
    ) -> RenewalTransitionScheduleOut: ...

    async def create_correction_preview(
        self, *, request: CommercialCorrectionRequest, audit: SubscriptionTransitionAuditEvent, conn: BaseDBAsyncClient
    ) -> CommercialCorrectionPreview: ...

    async def load_correction_preview_for_update(
        self, *, preview_id, conn: BaseDBAsyncClient
    ) -> CommercialCorrectionPreview: ...

    async def apply_provider_confirmed_correction(
        self,
        *,
        preview: CommercialCorrectionPreview,
        request: CommercialCorrectionApplyRequest,
        audit: SubscriptionTransitionAuditEvent,
        conn: BaseDBAsyncClient,
    ) -> CommercialCorrectionPreview: ...


class SubscriptionTransitionService(BaseService):
    """Provider-first renewal scheduling and single-Workspace corrections."""

    def __init__(
        self, *, repository: SubscriptionTransitionRepository, provider_scheduler: ProviderRenewalScheduler
    ) -> None:
        super().__init__()
        self._repository = repository
        self._provider_scheduler = provider_scheduler

    async def schedule_renewal(
        self, *, request: RenewalTransitionScheduleRequest, actor_user_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> RenewalTransitionScheduleOut:
        async with self.tx(conn=conn) as tx_conn:
            preview = await self._repository.load_renewal_preview_for_update(
                preview_id=request.preview_id, conn=tx_conn
            )
            if preview.preview_revision != request.expected_preview_revision:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_PREVIEW_STALE")
            if preview.requires_convergence and request.convergence_id != preview.convergence_id:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_CONVERGENCE_REQUIRED")
            if not preview.requires_convergence and request.convergence_id is not None:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_CONVERGENCE_UNEXPECTED")
            if preview.incompatible_lifecycle_states:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_LIFECYCLE_INCOMPATIBLE")
            if not preview.provider_price_covered:
                raise Conflict(error="SUBSCRIPTION_TRANSITION_PROVIDER_PRICE_MISSING")
            provider_schedule_id = await self._provider_scheduler.schedule_renewal(
                preview=preview,
                idempotency_key=request.idempotency_key,
            )
            return await self._repository.mark_provider_scheduled(
                preview=preview,
                provider_schedule_id=provider_schedule_id,
                request=request,
                actor_user_id=actor_user_id,
                audit=_renewal_audit(
                    "commerce.subscription_renewal.scheduled", preview, request.idempotency_key, actor_user_id
                ),
                conn=tx_conn,
            )

    async def create_commercial_correction_preview(
        self, *, request: CommercialCorrectionRequest, conn: BaseDBAsyncClient
    ) -> CommercialCorrectionPreview:
        return await self._repository.create_correction_preview(
            request=request,
            audit=SubscriptionTransitionAuditEvent(
                event_name="commerce.commercial_correction.previewed",
                workspace_id=request.workspace_id,
                correlation_id=request.correlation_id,
                idempotency_key=request.idempotency_key,
            ),
            conn=conn,
        )

    async def apply_provider_confirmed_correction(
        self, *, request: CommercialCorrectionApplyRequest, conn: BaseDBAsyncClient
    ) -> CommercialCorrectionPreview:
        preview = await self._repository.load_correction_preview_for_update(preview_id=request.preview_id, conn=conn)
        if preview.preview_revision != request.expected_preview_revision:
            raise Conflict(error="COMMERCIAL_CORRECTION_PREVIEW_STALE")
        return await self._repository.apply_provider_confirmed_correction(
            preview=preview,
            request=request,
            audit=SubscriptionTransitionAuditEvent(
                event_name="commerce.commercial_correction.applied",
                workspace_id=preview.workspace_id,
                correlation_id=request.correlation_id,
                idempotency_key=request.idempotency_key,
            ),
            conn=conn,
        )


def _renewal_audit(
    event_name: str, preview: RenewalTransitionPreview, idempotency_key: str, actor_user_id: UUID
) -> SubscriptionTransitionAuditEvent:
    return SubscriptionTransitionAuditEvent(
        event_name=event_name,
        workspace_id=preview.workspace_id,
        correlation_id=preview.correlation_id,
        idempotency_key=idempotency_key,
        actor_user_id=actor_user_id,
    )
