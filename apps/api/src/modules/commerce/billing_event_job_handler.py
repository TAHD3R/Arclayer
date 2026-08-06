from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from uuid import UUID

from src.config import Settings
from src.core.exceptions import APIError
from src.core.registries import ConnectorRegistry
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus
from src.modules.commerce.billing_checkout_outcome_application_service import (
    BillingProviderCheckoutOutcomeApplicationService,
    BillingProviderCheckoutOutcomeApplicator,
)
from src.modules.commerce.billing_connector import (
    BillingConnector,
    BillingWebhookEnvelope,
    ProviderCheckoutOutcome,
    ProviderSubscription,
)
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
from src.modules.commerce.billing_provider_application_service import (
    BillingProviderSubscriptionApplicationService,
    BillingProviderSubscriptionApplicator,
    VerifiedBillingProviderEvent,
)
from src.modules.commerce.billing_top_up_settlement_application_service import (
    BillingProviderTopUpSettlementApplicator,
    build_billing_top_up_settlement_application_service,
)
from src.modules.commerce.top_up_settlement_evidence import ProviderTopUpSettlement
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
        applicator: BillingProviderSubscriptionApplicator | None = None,
        checkout_applicator: BillingProviderCheckoutOutcomeApplicator | None = None,
        top_up_applicator: BillingProviderTopUpSettlementApplicator | None = None,
    ) -> None:
        self._settings = settings
        self._connectors = connectors
        self._repository = repository or BillingEventInboxRepository()
        self._applicator = applicator or BillingProviderSubscriptionApplicationService(settings=settings)
        self._checkout_applicator = checkout_applicator or BillingProviderCheckoutOutcomeApplicationService(
            settings=settings
        )
        self._top_up_applicator = top_up_applicator or build_billing_top_up_settlement_application_service(
            settings=settings
        )

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
        checkout_outcome, top_up_settlement, subscription = await self._normalize_event(
            connector=connector,
            inbox=inbox,
            payload=payload,
        )
        await context.checkpoint()

        await context.report_progress(_progress("applying", 2))
        result = await context.run_fenced_domain_commit(
            lambda: self._apply_and_mark(
                inbox=inbox,
                checkout_outcome=checkout_outcome,
                top_up_settlement=top_up_settlement,
                subscription=subscription,
            )
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
    ) -> tuple[ProviderCheckoutOutcome | None, ProviderTopUpSettlement | None, ProviderSubscription | None]:
        envelope = BillingWebhookEnvelope(
            provider_event_id=inbox.provider_event_id,
            event_type=inbox.event_type,
            provider_mode="live" if str(inbox.provider_mode) == "live" else "test",
            provider_account_id=inbox.provider_account_id,
            signature_timestamp=inbox.signature_timestamp,
        )
        try:
            checkout_outcome = await connector.checkout_outcome_from_event(payload=payload, envelope=envelope)
            top_up_settlement = await connector.top_up_settlement_from_event(payload=payload, envelope=envelope)
            subscription = await connector.subscription_from_event(payload=payload, envelope=envelope)
            return checkout_outcome, top_up_settlement, subscription
        except APIError as exc:
            raise _connector_api_error(exc) from exc

    async def _apply_and_mark(
        self,
        *,
        inbox: ConnectorEventInbox,
        checkout_outcome: ProviderCheckoutOutcome | None,
        top_up_settlement: ProviderTopUpSettlement | None,
        subscription: ProviderSubscription | None,
    ) -> BillingConnectorEventJobResult:
        outcomes = (checkout_outcome, top_up_settlement, subscription)
        if sum(outcome is not None for outcome in outcomes) > 1:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Billing Connector event normalized to multiple commercial outcomes",
            )
        verified_event = VerifiedBillingProviderEvent(
            provider_event_id=inbox.provider_event_id,
            payload_sha256=inbox.payload_sha256,
            signature_reference=_signature_reference(inbox=inbox),
        )
        workspace_id = None
        if checkout_outcome is not None:
            workspace_id = await self._apply_checkout_outcome(
                inbox=inbox,
                outcome=checkout_outcome,
                verified_event=verified_event,
            )
        elif top_up_settlement is not None:
            workspace_id = await self._apply_top_up_settlement(
                inbox=inbox,
                settlement=top_up_settlement,
                verified_event=verified_event,
            )
        elif subscription is not None:
            workspace_id = await self._apply_subscription(
                inbox=inbox,
                subscription=subscription,
                verified_event=verified_event,
            )
        result = BillingConnectorEventJobResult(
            inbox_id=inbox.id,
            provider_event_id=inbox.provider_event_id,
            applied=workspace_id is not None,
            workspace_id=workspace_id,
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

    async def _apply_checkout_outcome(
        self,
        *,
        inbox: ConnectorEventInbox,
        outcome: ProviderCheckoutOutcome,
        verified_event: VerifiedBillingProviderEvent,
    ) -> UUID:
        if outcome.event_id != inbox.provider_event_id:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Normalized Checkout event identity differs from its inbox record",
            )
        try:
            result = await self._checkout_applicator.apply_provider_checkout_outcome(
                outcome=outcome,
                provider=inbox.provider,
                provider_mode=str(inbox.provider_mode),
                provider_account_id=inbox.provider_account_id,
                verified_event=verified_event,
            )
        except APIError as exc:
            raise _application_error(exc, subject="Checkout") from exc
        return result.workspace_id

    async def _apply_top_up_settlement(
        self,
        *,
        inbox: ConnectorEventInbox,
        settlement: ProviderTopUpSettlement,
        verified_event: VerifiedBillingProviderEvent,
    ) -> UUID:
        if settlement.event_id != inbox.provider_event_id:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Normalized top-up event identity differs from its inbox record",
            )
        try:
            result = await self._top_up_applicator.apply_provider_top_up_settlement(
                settlement=settlement,
                provider=inbox.provider,
                provider_mode=str(inbox.provider_mode),
                provider_account_id=inbox.provider_account_id,
                verified_event=verified_event,
            )
        except APIError as exc:
            raise _application_error(exc, subject="top-up") from exc
        return result.workspace_id

    async def _apply_subscription(
        self,
        *,
        inbox: ConnectorEventInbox,
        subscription: ProviderSubscription,
        verified_event: VerifiedBillingProviderEvent,
    ) -> UUID:
        if subscription.event_id != inbox.provider_event_id:
            raise PermanentJobExecutionError(
                code=BILLING_CONNECTOR_EVENT_PAYLOAD_INVALID_CODE,
                safe_message="Normalized billing event identity differs from its inbox record",
            )
        try:
            await self._applicator.apply_provider_subscription(
                subscription=subscription,
                provider=inbox.provider,
                provider_mode=str(inbox.provider_mode),
                provider_account_id=inbox.provider_account_id,
                verified_event=verified_event,
            )
        except APIError as exc:
            raise _application_error(exc, subject="subscription") from exc
        return subscription.workspace_id


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


def _application_error(
    error: APIError,
    *,
    subject: str,
) -> PermanentJobExecutionError | TransientJobExecutionError:
    if error.status_code >= 500:
        return TransientJobExecutionError(
            code=BILLING_CONNECTOR_EVENT_PROVIDER_UNAVAILABLE_CODE,
            safe_message="Commerce application of the verified billing event is temporarily unavailable",
        )
    return PermanentJobExecutionError(
        code=BILLING_CONNECTOR_EVENT_APPLICATION_REJECTED_CODE,
        safe_message=f"Billing {subject} event was rejected by the commerce domain",
    )


def _signature_reference(*, inbox: ConnectorEventInbox) -> str:
    identity = ":".join((
        inbox.provider,
        str(inbox.provider_mode),
        inbox.provider_account_id,
        inbox.provider_event_id,
        inbox.signature_timestamp.isoformat(),
        inbox.payload_sha256,
    ))
    return f"billing-webhook:{sha256(identity.encode()).hexdigest()}"


def _progress(phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        status_key=f"BILLING_CONNECTOR_EVENT_STATUS_{phase.upper()}",
        progress_completed=completed,
        progress_total=_PROGRESS_TOTAL,
    )
