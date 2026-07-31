from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock

import pytest

from src.config import Settings, get_settings
from src.core.exceptions import BadRequest
from src.models.connectors.inbox import ConnectorEventInbox
from src.models.jobs.background_job import BackgroundJobRecord, JobDispatchOutboxRecord
from src.modules.commerce.billing_connector import BillingConnector, BillingWebhookEnvelope
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.jobs.service import BackgroundJobService
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration


class _VerifiedConnector:
    def __init__(self, envelope: BillingWebhookEnvelope) -> None:
        self.envelope = envelope

    def verify_webhook(self, *, payload: bytes, signature: str) -> BillingWebhookEnvelope:
        _ = payload
        if signature != "valid":
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID")
        return self.envelope


def _settings_with_master_key(tmp_path: Path) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "billing-events.key"
    ensure_master_key(key_path)
    return settings.model_copy(
        update={
            "security": settings.security.model_copy(update={"master_key_path": key_path}),
        }
    )


def _service(
    *,
    settings: Settings,
    envelope: BillingWebhookEnvelope,
    jobs: BackgroundJobService | None = None,
) -> BillingEventAcceptanceService:
    return BillingEventAcceptanceService(
        settings=settings,
        provider_name="stripe",
        connector_key="billing.stripe",
        connector_version="1.0.0",
        webhook_events=("customer.subscription.updated",),
        connector=cast(BillingConnector, _VerifiedConnector(envelope)),
        repository=BillingEventInboxRepository(),
        jobs=jobs or BackgroundJobService(settings, event_publisher=None),
    )


def _envelope() -> BillingWebhookEnvelope:
    return BillingWebhookEnvelope(
        provider_event_id="evt_durable123",
        event_type="customer.subscription.updated",
        provider_mode="test",
        provider_account_id="platform",
        signature_timestamp=datetime.now(UTC),
    )


async def test_acceptance_atomically_persists_encrypted_inbox_job_and_dispatch_outbox(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    payload = b'{"id":"evt_durable123","livemode":false}'
    service = _service(settings=_settings_with_master_key(tmp_path), envelope=_envelope())

    created = await service.accept(payload=payload, signature="valid")
    replayed = await service.accept(payload=payload, signature="valid")

    assert created.accepted is True
    assert created.created is True
    assert replayed.accepted is True
    assert replayed.created is False
    assert replayed.inbox_id == created.inbox_id
    assert replayed.job_id == created.job_id
    assert created.inbox_id is not None
    assert created.job_id is not None
    assert await ConnectorEventInbox.all().count() == 1
    assert await BackgroundJobRecord.all().count() == 1
    assert await JobDispatchOutboxRecord.all().count() == 1
    inbox = await ConnectorEventInbox.get(id=created.inbox_id)
    assert payload not in inbox.encrypted_payload.encode()
    assert inbox.job_id == created.job_id


async def test_acceptance_rejects_same_provider_event_identity_with_different_payload(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    service = _service(settings=_settings_with_master_key(tmp_path), envelope=_envelope())
    await service.accept(payload=b'{"revision":1}', signature="valid")

    with pytest.raises(BadRequest) as captured:
        await service.accept(payload=b'{"revision":2}', signature="valid")

    assert captured.value.error == "BILLING_WEBHOOK_EVENT_CONFLICT"
    assert await ConnectorEventInbox.all().count() == 1
    assert await BackgroundJobRecord.all().count() == 1
    assert await JobDispatchOutboxRecord.all().count() == 1


async def test_invalid_signature_does_not_persist_acceptance_state(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    service = _service(settings=_settings_with_master_key(tmp_path), envelope=_envelope())

    with pytest.raises(BadRequest) as captured:
        await service.accept(payload=b"{}", signature="invalid")

    assert captured.value.error == "BILLING_WEBHOOK_SIGNATURE_INVALID"
    assert await ConnectorEventInbox.all().count() == 0
    assert await BackgroundJobRecord.all().count() == 0
    assert await JobDispatchOutboxRecord.all().count() == 0


async def test_job_creation_failure_rolls_back_new_inbox_record(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    settings = _settings_with_master_key(tmp_path)
    real_jobs = BackgroundJobService(settings, event_publisher=None)
    jobs = cast(
        BackgroundJobService,
        SimpleNamespace(
            registry=real_jobs.registry,
            create_job_in_transaction=AsyncMock(side_effect=RuntimeError("job persistence failed")),
        ),
    )
    service = _service(settings=settings, envelope=_envelope(), jobs=jobs)

    with pytest.raises(RuntimeError, match="job persistence failed"):
        await service.accept(payload=b"{}", signature="valid")

    assert await ConnectorEventInbox.all().count() == 0
    assert await BackgroundJobRecord.all().count() == 0
    assert await JobDispatchOutboxRecord.all().count() == 0
