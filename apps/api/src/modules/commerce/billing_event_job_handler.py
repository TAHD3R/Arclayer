from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256

from src.config import Settings
from src.core.exceptions import APIError
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import ConnectorEventInbox, ConnectorEventInboxStatus
from src.modules.commerce.billing_connector import BillingConnector, BillingWebhookEnvelope, ProviderSubscription
from src.modules.commerce.billing_event_crypto import (
    BillingEventCryptoError,
    billing_event_aad,
    decrypt_billing_event_payload,
)
from src.modules.commerce.billing_event_job_contract import (
    BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
    BILLING_CONNECTOR_EVENT_NOT_FOUND_CODE,
    BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
    BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
    BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE,
    BillingConnectorEventJobInput,
    BillingConnectorEventJobResult,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.commerce.service import CommerceService, build_commerce_service
from src.modules.jobs.execution_errors import (
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate

_PROGRESS_TOTAL = 3


class BillingConnectorEventJobHandler:
    """Replay one encrypted billing event through its pinned Connector version."""

    def __init__(
        self,
        *,
        settings: Settings,
        connectors: ConnectorRegistry,
        repository: BillingEventInboxRepository | None = None,
        commerce: CommerceService | None = None,
    ) -> None:
        self._settings = settings
        self._connectors = connectors
        self._repository = repository or BillingEventInboxRepository()
        self._commerce = commerce or build_commerce_service(settings)

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput],
    ) -> BillingConnectorEventJobResult | None:
        inbox = await self._repository.get_by_id(inbox_id=context.target.inbox_id)
        if inbox is None or inbox.status != ConnectorEventInboxStatus.PROCESSED:
            return None
        if inbox.result_reference is None:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Processed billing Connector event is missing its result reference",
            )
        return BillingConnectorEventJobResult.model_validate(inbox.result_reference)

    async def execute(
        self,
        *,
        context: JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput],
    ) -> BillingConnectorEventJobResult:
        await context.report_progress(_progress("loading", 0))
        inbox = await self._repository.begin_processing(inbox_id=context.target.inbox_id)
        if inbox is None:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_NOT_FOUND_CODE,
                safe_message="Billing Connector event inbox record was not found",
            )
        if inbox.status == ConnectorEventInboxStatus.PROCESSED:
            if inbox.result_reference is None:
                raise PermanentJobExecutionError(
                    code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                    safe_message="Processed billing Connector event is missing its result reference",
                )
            return BillingConnectorEventJobResult.model_validate(inbox.result_reference)
        _validate_job_binding(inbox=inbox, input_reference=context.input_reference)
        connector = self._resolve_pinned_connector(inbox)
        payload = self._decrypt_and_validate_payload(inbox)

        await context.report_progress(_progress("normalizing", 1))
        subscription = await self._normalize_event(
            connector=connector,
            inbox=inbox,
            payload=payload,
        )
        await context.checkpoint()

        await context.report_progress(_progress("applying", 2))
        result = await context.run_fenced_domain_commit(
            lambda: self._apply_and_mark(inbox=inbox, subscription=subscription)
        )
        await context.report_progress(_progress("applying", _PROGRESS_TOTAL))
        return result

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        await self._repository.record_failure(
            inbox_id=context.target.inbox_id,
            error_code=error.code,
            safe_message=error.safe_message,
            is_terminal=not isinstance(error, TransientJobExecutionError),
        )

    def _resolve_pinned_connector(self, inbox: ConnectorEventInbox) -> BillingConnector:
        registration = self._connectors.resolve(inbox.connector_key)
        if registration is None or registration.definition.version != inbox.connector_version:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE,
                safe_message="Pinned billing Connector version is unavailable",
            )
        try:
            connector = registration.factory()
        except APIError as exc:
            raise _connector_api_error(exc) from exc
        if not isinstance(connector, BillingConnector):
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_VERSION_UNAVAILABLE_CODE,
                safe_message="Pinned billing Connector does not implement the billing contract",
            )
        return connector

    def _decrypt_and_validate_payload(self, inbox: ConnectorEventInbox) -> bytes:
        try:
            payload = decrypt_billing_event_payload(
                inbox.encrypted_payload,
                key_path=self._settings.security.master_key_path,
                aad=billing_event_aad(
                    provider=inbox.provider,
                    provider_mode=str(inbox.provider_mode),
                    provider_account_id=inbox.provider_account_id,
                    provider_event_id=inbox.provider_event_id,
                    connector_key=inbox.connector_key,
                    connector_version=inbox.connector_version,
                    payload_sha256=inbox.payload_sha256,
                ),
            )
        except BillingEventCryptoError as exc:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Encrypted billing Connector event cannot be decrypted",
            ) from exc
        if sha256(payload).hexdigest() != inbox.payload_sha256:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Billing Connector event payload hash does not match its inbox record",
            )
        return payload

    async def _normalize_event(
        self,
        *,
        connector: BillingConnector,
        inbox: ConnectorEventInbox,
        payload: bytes,
    ) -> ProviderSubscription | None:
        envelope = BillingWebhookEnvelope(
            provider_event_id=inbox.provider_event_id,
            event_type=inbox.event_type,
            provider_mode="live" if str(inbox.provider_mode) == "live" else "test",
            provider_account_id=inbox.provider_account_id,
            signature_timestamp=inbox.signature_timestamp,
        )
        try:
            return await connector.subscription_from_event(payload=payload, envelope=envelope)
        except APIError as exc:
            raise _connector_api_error(exc) from exc

    async def _apply_and_mark(
        self,
        *,
        inbox: ConnectorEventInbox,
        subscription: ProviderSubscription | None,
    ) -> BillingConnectorEventJobResult:
        if subscription is not None:
            if subscription.event_id != inbox.provider_event_id:
                raise PermanentJobExecutionError(
                    code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                    safe_message="Normalized billing event identity differs from its inbox record",
                )
            try:
                await self._commerce.apply_provider_subscription(
                    workspace_id=subscription.workspace_id,
                    plan_code=subscription.plan_code,
                    status=subscription.status,
                    billing_interval=subscription.billing_cycle,
                    current_period_start=subscription.current_period_start,
                    current_period_end=subscription.current_period_end,
                    cancel_at_period_end=subscription.cancel_at_period_end,
                    provider=inbox.provider,
                    external_customer_id=subscription.customer_id,
                    external_subscription_id=subscription.subscription_id,
                    event_id=subscription.event_id,
                )
            except APIError as exc:
                raise PermanentJobExecutionError(
                    code=BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
                    safe_message="Billing subscription event was rejected by the commerce domain",
                ) from exc
        result = BillingConnectorEventJobResult(
            inbox_id=inbox.id,
            provider_event_id=inbox.provider_event_id,
            applied=subscription is not None,
            workspace_id=None if subscription is None else subscription.workspace_id,
        )
        persisted = await self._repository.mark_processed(
            inbox_id=inbox.id,
            processed_at=datetime.now(UTC),
            result_reference=result.model_dump(mode="json", by_alias=True),
        )
        if persisted is None:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_NOT_FOUND_CODE,
                safe_message="Billing Connector event disappeared before result persistence",
            )
        return result


def _validate_job_binding(
    *,
    inbox: ConnectorEventInbox,
    input_reference: BillingConnectorEventJobInput,
) -> None:
    if (
        inbox.id != input_reference.inbox_id
        or inbox.connector_key != input_reference.connector_key
        or inbox.connector_version != input_reference.connector_version
        or inbox.payload_sha256 != input_reference.payload_sha256
    ):
        raise PermanentJobExecutionError(
            code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
            safe_message="Billing Connector event does not match its immutable Job input",
        )


def _connector_api_error(error: APIError) -> PermanentJobExecutionError | TransientJobExecutionError:
    if error.status_code >= 500:
        return TransientJobExecutionError(
            code=BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
            safe_message="Billing Connector provider request is temporarily unavailable",
        )
    return PermanentJobExecutionError(
        code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
        safe_message="Billing Connector rejected the persisted event payload",
    )


def _progress(phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"BILLING_CONNECTOR_EVENT_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_PROGRESS_TOTAL,
    )
