from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from pydantic import ConfigDict
from tortoise.exceptions import IntegrityError

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.core.registries import ConnectorRegistry
from src.core.services.base import BaseService
from src.models.connectors.inbox import ConnectorEventInbox
from src.modules.commerce.billing_connector import BillingConnector, BillingWebhookEnvelope
from src.modules.commerce.billing_event_crypto import (
    BillingEventCryptoError,
    billing_event_aad,
    encrypt_billing_event_payload,
)
from src.modules.commerce.billing_event_job_command import build_billing_event_job_command
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.jobs.service import BackgroundJobService


class BillingEventAcceptanceResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    accepted: bool
    inbox_id: PublicUUID | None = None
    job_id: PublicUUID | None = None
    created: bool = False


class BillingEventAcceptanceService(BaseService):
    """Verify and durably accept billing events without provider-side I/O."""

    def __init__(
        self,
        *,
        settings: Settings,
        provider_name: str,
        connector_key: str,
        connector_version: str,
        webhook_events: tuple[str, ...],
        connector: BillingConnector,
        repository: BillingEventInboxRepository,
        jobs: BackgroundJobService,
    ) -> None:
        super().__init__(settings)
        self._provider_name = provider_name
        self._connector_key = connector_key
        self._connector_version = connector_version
        self._webhook_events = frozenset(webhook_events)
        self._connector = connector
        self._repository = repository
        self._jobs = jobs

    async def accept(self, *, payload: bytes, signature: str) -> BillingEventAcceptanceResult:
        envelope = self._connector.verify_webhook(payload=payload, signature=signature)
        if envelope.event_type not in self._webhook_events:
            return BillingEventAcceptanceResult(accepted=False)

        payload_sha256 = sha256(payload).hexdigest()
        provider_mode = envelope.provider_mode
        async with self.tx() as conn:
            existing = await self._repository.get_by_identity(
                provider=self._provider_name,
                provider_mode=provider_mode,
                provider_account_id=envelope.provider_account_id,
                provider_event_id=envelope.provider_event_id,
                conn=conn,
                for_update=True,
            )
            if existing is not None:
                return _replay_result(existing=existing, payload_sha256=payload_sha256)

            encrypted_payload = self._encrypt_payload(
                payload=payload,
                envelope=envelope,
                payload_sha256=payload_sha256,
            )
            try:
                async with conn._in_transaction() as savepoint_conn:
                    inbox = await self._repository.create_inbox(
                        provider=self._provider_name,
                        provider_mode=provider_mode,
                        provider_account_id=envelope.provider_account_id,
                        provider_event_id=envelope.provider_event_id,
                        connector_key=self._connector_key,
                        connector_version=self._connector_version,
                        event_type=envelope.event_type,
                        signature_timestamp=envelope.signature_timestamp,
                        payload_sha256=payload_sha256,
                        encrypted_payload=encrypted_payload,
                        retention_deadline=datetime.now(UTC)
                        + timedelta(days=self.settings.billing.webhook_event_retention_days),
                        conn=savepoint_conn,
                    )
            except IntegrityError:
                raced = await self._repository.get_by_identity(
                    provider=self._provider_name,
                    provider_mode=provider_mode,
                    provider_account_id=envelope.provider_account_id,
                    provider_event_id=envelope.provider_event_id,
                    conn=conn,
                    for_update=True,
                )
                if raced is None:
                    raise
                return _replay_result(existing=raced, payload_sha256=payload_sha256)

            job_result = await self._jobs.create_job_in_transaction(
                command=build_billing_event_job_command(jobs=self._jobs, inbox=inbox),
                conn=conn,
            )
            await self._repository.attach_job(inbox=inbox, job_id=job_result.job.id, conn=conn)

        return BillingEventAcceptanceResult(
            accepted=True,
            inbox_id=inbox.id,
            job_id=job_result.job.id,
            created=True,
        )

    def _encrypt_payload(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
        payload_sha256: str,
    ) -> str:
        try:
            return encrypt_billing_event_payload(
                payload,
                key_path=self.settings.security.master_key_path,
                aad=billing_event_aad(
                    provider=self._provider_name,
                    provider_mode=envelope.provider_mode,
                    provider_account_id=envelope.provider_account_id,
                    provider_event_id=envelope.provider_event_id,
                    connector_key=self._connector_key,
                    connector_version=self._connector_version,
                    payload_sha256=payload_sha256,
                ),
            )
        except BillingEventCryptoError as exc:
            raise ServiceUnavailable(
                error="BILLING_WEBHOOK_STORAGE_UNAVAILABLE",
                message=t("errors", "BILLING_WEBHOOK_STORAGE_UNAVAILABLE"),
            ) from exc


def build_billing_event_acceptance_service(
    settings: Settings,
    connector_registry: ConnectorRegistry,
) -> BillingEventAcceptanceService:
    billing = settings.billing
    if not billing.webhook_enabled:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
    connector_key = f"billing.{billing.provider}"
    registration = connector_registry.resolve(connector_key)
    if registration is None:
        raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_SUPPORTED")
    connector = registration.factory()
    if not isinstance(connector, BillingConnector):
        raise ServiceUnavailable(error="BILLING_CONNECTOR_INVALID")
    return BillingEventAcceptanceService(
        settings=settings,
        provider_name=billing.provider,
        connector_key=registration.definition.key,
        connector_version=registration.definition.version,
        webhook_events=registration.definition.webhook_events,
        connector=connector,
        repository=BillingEventInboxRepository(),
        jobs=BackgroundJobService(settings),
    )


def _replay_result(
    *,
    existing: ConnectorEventInbox,
    payload_sha256: str,
) -> BillingEventAcceptanceResult:
    if existing.payload_sha256 != payload_sha256:
        raise BadRequest(error="BILLING_WEBHOOK_EVENT_CONFLICT")
    if existing.job_id is None:
        raise ServiceUnavailable(error="BILLING_WEBHOOK_ACCEPTANCE_INCOMPLETE")
    return BillingEventAcceptanceResult(
        accepted=True,
        inbox_id=existing.id,
        job_id=existing.job_id,
        created=False,
    )
