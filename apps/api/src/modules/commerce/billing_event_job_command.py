from __future__ import annotations

from hashlib import sha256
from uuid import UUID

from src.models.connectors.inbox import ConnectorEventInbox
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_JOB_TYPE,
    BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.jobs.service import BackgroundJobService


def build_billing_event_job_command(
    *,
    jobs: BackgroundJobService,
    inbox: ConnectorEventInbox,
    idempotency_key: str | None = None,
    retry_of_job_id: UUID | None = None,
) -> BackgroundJobCreate:
    definition = jobs.registry.require(
        job_type=BILLING_CONNECTOR_EVENT_JOB_TYPE,
        job_type_version=BILLING_CONNECTOR_EVENT_JOB_TYPE_VERSION,
    )
    target = BillingConnectorEventJobTarget(inbox_id=inbox.id)
    input_reference = BillingConnectorEventJobInput(
        inbox_id=inbox.id,
        connector_key=inbox.connector_key,
        connector_version=inbox.connector_version,
        payload_sha256=inbox.payload_sha256,
    )
    identity_hash = sha256(
        f"{inbox.provider}:{inbox.provider_mode}:{inbox.provider_account_id}:{inbox.provider_event_id}".encode()
    ).hexdigest()
    return BackgroundJobCreate(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        authority_mode=definition.authority_mode,
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_key=idempotency_key or f"billing-event:{identity_hash}",
        source_revision=inbox.connector_version,
        correlation_id=f"billing-event:{identity_hash[:32]}",
        retry_class=definition.retry_class,
        max_attempts=definition.max_attempts,
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        retry_of_job_id=retry_of_job_id,
        status_key=definition.initial_status_key,
    )
