from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.models.connectors.inbox import ConnectorEventInboxStatus
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.commerce.billing_event_reconciliation_service import BillingEventReconciliationService


class _Registry:
    def require(self, *, job_type: str, job_type_version: int) -> SimpleNamespace:
        return SimpleNamespace(
            job_type=job_type,
            job_type_version=job_type_version,
            task_name="jobs.billing.connector-event",
            workload_class=JobWorkloadClass.CONNECTOR,
            authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
            retry_class=JobRetryClass.TRANSIENT,
            max_attempts=3,
            timeout_seconds=60,
            lease_seconds=30,
            heartbeat_seconds=10,
            initial_status_key="billing_event_queued",
        )


class _Jobs:
    def __init__(self, *, created: bool) -> None:
        self.registry = _Registry()
        self.result = SimpleNamespace(job=SimpleNamespace(id=uuid4()), created=created)
        self.commands = []
        self.published = []

    async def create_job_in_transaction(self, *, command, conn):  # type: ignore[no-untyped-def]
        self.commands.append((command, conn))
        return self.result

    async def publish_created_after_commit(self, result):  # type: ignore[no-untyped-def]
        self.published.append(result)


class _Repository:
    def __init__(self, inbox: SimpleNamespace) -> None:
        self.inbox = inbox
        self.prepared = False

    async def get_by_id_for_update(self, *, inbox_id, conn):  # type: ignore[no-untyped-def]
        assert inbox_id == self.inbox.id
        assert conn is not None
        return self.inbox

    async def prepare_reconciliation(self, *, inbox, conn):  # type: ignore[no-untyped-def]
        assert inbox is self.inbox
        assert conn is not None
        self.prepared = True
        inbox.status = ConnectorEventInboxStatus.RECEIVED
        inbox.last_error_code = None
        inbox.last_error_message = None
        return inbox


def _inbox(*, status: ConnectorEventInboxStatus, processing_attempts: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        provider="stripe",
        provider_mode="test",
        provider_account_id="acct_test",
        provider_event_id="evt_test",
        connector_key="billing.stripe",
        connector_version="1.0.0",
        payload_sha256="a" * 64,
        status=status,
        processing_attempts=processing_attempts,
        job_id=uuid4(),
        last_error_code="BILLING_PROVIDER_REQUEST_FAILED",
        last_error_message="Provider request failed",
    )


def _install_transaction(service: BillingEventReconciliationService) -> None:
    @asynccontextmanager
    async def transaction():
        yield object()

    service.tx = transaction  # type: ignore[method-assign]


@pytest.mark.asyncio
async def test_reconciliation_creates_retry_job_resets_inbox_and_writes_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inbox = _inbox(status=ConnectorEventInboxStatus.FAILED, processing_attempts=3)
    repository = _Repository(inbox)
    jobs = _Jobs(created=True)
    audit_payloads = []

    async def write_audit(*, settings, payload, conn):  # type: ignore[no-untyped-def]
        audit_payloads.append((settings, payload, conn))
        return SimpleNamespace(id=uuid4())

    monkeypatch.setattr(
        "src.modules.commerce.billing_event_reconciliation_service.write_required_activity_event",
        write_audit,
    )
    settings = SimpleNamespace()
    service = BillingEventReconciliationService(settings, repository=repository, jobs=jobs)  # type: ignore[arg-type]
    _install_transaction(service)

    result = await service.reconcile(
        inbox_id=inbox.id,
        expected_processing_attempts=3,
        idempotency_key="operator-reconcile-1",
        actor_user_id=uuid4(),
    )

    assert result.inbox.status == ConnectorEventInboxStatus.RECEIVED
    assert result.reconciliation_job_id == jobs.result.job.id
    assert repository.prepared is True
    assert len(audit_payloads) == 1
    assert jobs.published == [jobs.result]
    command = jobs.commands[0][0]
    assert command.retry_of_job_id == inbox.job_id
    assert command.idempotency_key == f"billing-event-reconcile:{inbox.id}:operator-reconcile-1"


@pytest.mark.asyncio
async def test_reconciliation_replays_existing_job_after_inbox_progress_without_second_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inbox = _inbox(status=ConnectorEventInboxStatus.PROCESSING, processing_attempts=4)
    repository = _Repository(inbox)
    jobs = _Jobs(created=False)

    async def unexpected_audit(**_kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("idempotent replay must not write another Audit event")

    monkeypatch.setattr(
        "src.modules.commerce.billing_event_reconciliation_service.write_required_activity_event",
        unexpected_audit,
    )
    service = BillingEventReconciliationService(  # type: ignore[arg-type]
        SimpleNamespace(),
        repository=repository,
        jobs=jobs,
    )
    _install_transaction(service)

    result = await service.reconcile(
        inbox_id=inbox.id,
        expected_processing_attempts=3,
        idempotency_key="operator-reconcile-1",
        actor_user_id=uuid4(),
    )

    assert result.reconciliation_job_id == jobs.result.job.id
    assert repository.prepared is False
    assert jobs.published == []
