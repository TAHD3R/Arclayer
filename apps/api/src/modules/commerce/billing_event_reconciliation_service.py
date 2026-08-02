from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID

from src.config import Settings
from src.core.exceptions import Conflict, NotFound, ServiceUnavailable
from src.core.services import BaseService
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.billing_event_job_command import build_billing_event_job_command
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.jobs.schema import BackgroundJobCreateResult
from src.modules.jobs.service import BackgroundJobService


@dataclass(frozen=True)
class BillingEventReconciliationResult:
    inbox: ConnectorEventInbox
    reconciliation_job_id: UUID


class BillingEventReconciliationService(BaseService):
    """Re-enqueue one verified failed event without re-verifying or replacing its payload."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: BillingEventInboxRepository | None = None,
        jobs: BackgroundJobService | None = None,
    ) -> None:
        super().__init__(settings)
        self._repository = repository or BillingEventInboxRepository()
        self._jobs = jobs or BackgroundJobService(settings)

    async def reconcile(
        self,
        *,
        inbox_id: UUID,
        expected_processing_attempts: int,
        idempotency_key: str,
        actor_user_id: UUID,
    ) -> BillingEventReconciliationResult:
        created_result: BackgroundJobCreateResult | None = None
        async with self.tx() as conn:
            inbox = await self._repository.get_by_id_for_update(inbox_id=inbox_id, conn=conn)
            if inbox is None:
                raise NotFound(error="BILLING_PROVIDER_EVENT_NOT_FOUND")
            if inbox.job_id is None:
                raise ServiceUnavailable(error="BILLING_WEBHOOK_ACCEPTANCE_INCOMPLETE")

            command = build_billing_event_job_command(
                jobs=self._jobs,
                inbox=inbox,
                idempotency_key=f"billing-event-reconcile:{inbox.id}:{idempotency_key}",
                retry_of_job_id=UUID(str(inbox.job_id)),
            )
            created_result = await self._jobs.create_job_in_transaction(command=command, conn=conn)
            if not created_result.created:
                return BillingEventReconciliationResult(
                    inbox=inbox,
                    reconciliation_job_id=UUID(str(created_result.job.id)),
                )

            self._validate_new_reconciliation(
                inbox=inbox,
                expected_processing_attempts=expected_processing_attempts,
            )
            inbox = await self._repository.prepare_reconciliation(inbox=inbox, conn=conn)
            await write_required_activity_event(
                settings=self.settings,
                payload=ActivityAuditPayload(
                    event_name="commerce.provider_event.reconciliation_requested",
                    actor_user_id=actor_user_id,
                    entity_type="connector_event_inbox",
                    entity_id=inbox.id,
                    properties={
                        "provider": inbox.provider,
                        "provider_event_id": inbox.provider_event_id,
                        "processing_attempts": expected_processing_attempts,
                        "source_job_id": str(inbox.job_id),
                        "reconciliation_job_id": str(created_result.job.id),
                        "idempotency_key_hash": sha256(idempotency_key.encode()).hexdigest(),
                    },
                ),
                conn=conn,
            )

        if created_result is None:
            raise RuntimeError("billing event reconciliation did not produce a durable Job")
        await self._jobs.publish_created_after_commit(created_result)
        return BillingEventReconciliationResult(
            inbox=inbox,
            reconciliation_job_id=UUID(str(created_result.job.id)),
        )

    @staticmethod
    def _validate_new_reconciliation(
        *,
        inbox: ConnectorEventInbox,
        expected_processing_attempts: int,
    ) -> None:
        if inbox.status != ConnectorEventInboxStatus.FAILED:
            raise Conflict(error="BILLING_PROVIDER_EVENT_RECONCILIATION_INELIGIBLE")
        if inbox.processing_attempts != expected_processing_attempts:
            raise Conflict(error="BILLING_PROVIDER_EVENT_PROCESSING_REVISION_STALE")
