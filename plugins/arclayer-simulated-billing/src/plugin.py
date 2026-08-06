"""Development/test-only simulated billing Connector foundation."""

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from src.config import get_settings
from src.core.connectors import (
    ConnectorAdminMetadata,
    ConnectorDefinition,
    ConnectorKind,
    ConnectorTrustLevel,
)
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.logging import get_logger
from src.core.registries import PluginRegistry
from src.models.commerce.billing import BillingCycle, SubscriptionStatus
from src.models.commerce.payments import (
    CommerceInvoiceStatus,
    CommerceTransactionKind,
    CommerceTransactionStatus,
)
from src.modules.commerce.billing_connector import (
    BillingRedirectSession,
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderCheckoutActivationEvidence,
    ProviderCheckoutOutcome,
    ProviderDunningEvent,
    ProviderInvoiceProjection,
    ProviderSubscription,
    ProviderTransactionProjection,
)

logger = get_logger(__name__)

_CONNECTOR_KEY = "billing.simulated"
_EXTENSION_NAME = "arclayer-simulated-billing"
_CHECKOUT_SESSION_TTL = timedelta(minutes=30)
_PROVIDER_ACCOUNT_ID = "platform"
_CHECKOUT_OUTCOME_EVENT_TYPE = "checkout.session.outcome"
_SUBSCRIPTION_LIFECYCLE_EVENT_TYPE = "subscription.lifecycle"


class _SimulatedCheckoutOutcomeData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: UUID
    external_session_id: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID
    actor_user_id: UUID
    plan_code: str = Field(..., min_length=1, max_length=48)
    plan_revision_id: UUID
    external_price_id: str = Field(..., min_length=1, max_length=255)
    checkout_request_fingerprint: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    command_idempotency_key_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    expected_revision: int = Field(..., ge=1)
    outcome: Literal["pending", "succeeded", "failed", "canceled"]


class _SimulatedCheckoutActivationData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: UUID
    external_session_id: str = Field(..., min_length=1, max_length=255)
    checkout_outcome_event_id: str = Field(..., min_length=1, max_length=255)


class _SimulatedPaymentFailureData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["payment_failure"]
    provider_period_id: str = Field(..., min_length=1, max_length=255)
    recovery_deadline: int


class _SimulatedFinalUnpaidData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["final_unpaid"]
    provider_period_id: str = Field(..., min_length=1, max_length=255)


class _SimulatedPaymentRecoveredData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: Literal["payment_recovered"]
    provider_period_id: str = Field(..., min_length=1, max_length=255)


class _SimulatedTransactionData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    external_transaction_id: str = Field(..., min_length=1, max_length=255)
    kind: CommerceTransactionKind
    status: CommerceTransactionStatus
    amount_micros: int = Field(..., ge=0)
    occurred_at: int


class _SimulatedInvoiceData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    external_invoice_id: str = Field(..., min_length=1, max_length=255)
    status: CommerceInvoiceStatus
    amount_due_micros: int = Field(..., ge=0)
    amount_paid_micros: int = Field(..., ge=0)
    amount_refunded_micros: int = Field(default=0, ge=0)
    period_start: int
    period_end: int
    issued_at: int
    paid_at: int | None = None
    hosted_invoice_url: str | None = Field(default=None, min_length=1)
    transactions: tuple[_SimulatedTransactionData, ...] = ()


_SimulatedDunningData = Annotated[
    _SimulatedPaymentFailureData | _SimulatedPaymentRecoveredData | _SimulatedFinalUnpaidData,
    Field(discriminator="kind"),
]


class _SimulatedSubscriptionData(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    plan_id: UUID
    plan_revision_id: UUID
    external_price_id: str = Field(..., min_length=1, max_length=255)
    billing_cycle: BillingCycle
    currency: str = Field(..., min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    customer_id: str = Field(..., min_length=1, max_length=128)
    subscription_id: str = Field(..., min_length=1, max_length=128)
    status: SubscriptionStatus
    current_period_start: int
    current_period_end: int
    cancel_at_period_end: bool = False
    checkout_activation: _SimulatedCheckoutActivationData | None = None
    dunning: _SimulatedDunningData | None = None
    payment: _SimulatedInvoiceData | None = None

    @model_validator(mode="after")
    def validate_period(self) -> "_SimulatedSubscriptionData":
        if self.current_period_end <= self.current_period_start:
            raise ValueError("subscription period end must be later than its start")
        if self.checkout_activation is not None and self.dunning is not None:
            raise ValueError("subscription event cannot combine Checkout activation and dunning")
        if self.dunning is None:
            return self
        if self.dunning.kind == "payment_failure" and self.status != SubscriptionStatus.PAST_DUE:
            raise ValueError("payment failure requires past_due subscription status")
        if self.dunning.kind == "payment_recovered" and self.status != SubscriptionStatus.ACTIVE:
            raise ValueError("payment recovery requires active subscription status")
        if self.dunning.kind == "final_unpaid" and self.status not in {
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.CANCELED,
        }:
            raise ValueError("final unpaid requires past_due or canceled subscription status")
        return self


class _SimulatedWebhookEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^sim_evt_[A-Za-z0-9]+$", max_length=255)
    type: str = Field(..., min_length=1, max_length=160)
    mode: Literal["test"] = "test"
    account: str = Field(default="platform", min_length=1, max_length=255)
    created: int
    data: _SimulatedCheckoutOutcomeData | _SimulatedSubscriptionData


class SimulatedBillingConnector:
    def __init__(self, *, signing_secret: str, webhook_tolerance_seconds: int) -> None:
        if not signing_secret:
            raise ServiceUnavailable(error="BILLING_PROVIDER_NOT_CONFIGURED")
        self._signing_secret = signing_secret
        self._webhook_tolerance_seconds = webhook_tolerance_seconds

    @property
    def provider_mode(self) -> str:
        return "test"

    async def create_checkout_session(
        self,
        *,
        workspace_id: str,
        plan_code: str,
        plan_id: str,
        plan_revision_id: str,
        external_price_id: str,
        billing_cycle: str,
        currency: str,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
        idempotency_key: str,
    ) -> CheckoutSession:
        del workspace_id, plan_code, plan_id, plan_revision_id, external_price_id, billing_cycle, currency
        del cancel_url, customer_id
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:32]
        external_session_id = f"sim_cs_{digest}"
        separator = "&" if "?" in success_url else "?"
        return CheckoutSession(
            url=(f"{success_url}{separator}billingProvider=simulated&simulatedCheckout={external_session_id}"),
            external_session_id=external_session_id,
            provider_account_id=_PROVIDER_ACCOUNT_ID,
            expires_at=datetime.now(UTC) + _CHECKOUT_SESSION_TTL,
        )

    async def create_top_up_checkout_session(
        self,
        *,
        workspace_id: str,
        top_up_offer_id: str,
        top_up_offer_revision: int,
        credit_amount: int,
        external_price_id: str,
        currency: str,
        amount_micros: int,
        success_url: str,
        cancel_url: str,
        customer_id: str | None,
        idempotency_key: str,
    ) -> CheckoutSession:
        del workspace_id, top_up_offer_id, top_up_offer_revision, credit_amount, external_price_id
        del currency, amount_micros, cancel_url, customer_id
        digest = hashlib.sha256(idempotency_key.encode()).hexdigest()[:32]
        external_session_id = f"sim_top_up_cs_{digest}"
        separator = "&" if "?" in success_url else "?"
        return CheckoutSession(
            url=(f"{success_url}{separator}billingProvider=simulated&simulatedTopUpCheckout={external_session_id}"),
            external_session_id=external_session_id,
            provider_account_id=_PROVIDER_ACCOUNT_ID,
            expires_at=datetime.now(UTC) + _CHECKOUT_SESSION_TTL,
        )

    async def create_portal_session(
        self,
        *,
        customer_id: str,
        return_url: str,
        idempotency_key: str,
    ) -> BillingRedirectSession:
        del customer_id, return_url, idempotency_key
        raise ServiceUnavailable(error="BILLING_SIMULATOR_PORTAL_NOT_AVAILABLE")

    def verify_webhook(self, *, payload: bytes, signature: str) -> BillingWebhookEnvelope:
        timestamp = self._verify_signature(payload=payload, signature=signature)
        event = self._parse_event(payload)
        return BillingWebhookEnvelope(
            provider_event_id=event.id,
            event_type=event.type,
            provider_mode=event.mode,
            provider_account_id=event.account,
            signature_timestamp=datetime.fromtimestamp(timestamp, tz=UTC),
        )

    async def subscription_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderSubscription | None:
        event = self._parse_event(payload)
        self._validate_envelope(event=event, envelope=envelope)
        if event.type == _CHECKOUT_OUTCOME_EVENT_TYPE:
            self._require_checkout_data(event)
            return None
        if event.type != _SUBSCRIPTION_LIFECYCLE_EVENT_TYPE:
            raise ServiceUnavailable(error="BILLING_SIMULATOR_EVENT_NORMALIZATION_NOT_AVAILABLE")
        data = self._require_subscription_data(event)
        activation = data.checkout_activation
        occurred_at = _provider_timestamp(event.created)
        try:
            return ProviderSubscription(
                event_id=event.id,
                workspace_id=data.workspace_id,
                plan_id=data.plan_id,
                plan_revision_id=data.plan_revision_id,
                external_price_id=data.external_price_id,
                billing_cycle=data.billing_cycle,
                currency=data.currency,
                customer_id=data.customer_id,
                subscription_id=data.subscription_id,
                status=data.status,
                current_period_start=_provider_timestamp(data.current_period_start),
                current_period_end=_provider_timestamp(data.current_period_end),
                cancel_at_period_end=data.cancel_at_period_end,
                dunning_event=_provider_dunning_event(data.dunning, occurred_at=occurred_at),
                payment=_provider_payment_projection(
                    data.payment,
                    currency=data.currency,
                    occurred_at=occurred_at,
                ),
                checkout_activation=(
                    ProviderCheckoutActivationEvidence(
                        checkout_session_id=activation.checkout_session_id,
                        external_session_id=activation.external_session_id,
                        checkout_outcome_event_id=activation.checkout_outcome_event_id,
                        occurred_at=occurred_at,
                    )
                    if activation is not None
                    else None
                ),
            )
        except ValidationError as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    async def checkout_outcome_from_event(
        self,
        *,
        payload: bytes,
        envelope: BillingWebhookEnvelope,
    ) -> ProviderCheckoutOutcome | None:
        event = self._parse_event(payload)
        self._validate_envelope(event=event, envelope=envelope)
        if event.type == _SUBSCRIPTION_LIFECYCLE_EVENT_TYPE:
            self._require_subscription_data(event)
            return None
        if event.type != _CHECKOUT_OUTCOME_EVENT_TYPE:
            return None
        data = self._require_checkout_data(event)
        return ProviderCheckoutOutcome(
            event_id=event.id,
            checkout_session_id=data.checkout_session_id,
            external_session_id=data.external_session_id,
            workspace_id=data.workspace_id,
            actor_user_id=data.actor_user_id,
            plan_code=data.plan_code,
            plan_revision_id=data.plan_revision_id,
            external_price_id=data.external_price_id,
            checkout_request_fingerprint=data.checkout_request_fingerprint,
            command_idempotency_key_hash=data.command_idempotency_key_hash,
            expected_revision=data.expected_revision,
            outcome=data.outcome,
            occurred_at=_provider_timestamp(event.created),
        )

    def _verify_signature(self, *, payload: bytes, signature: str) -> int:
        parts: dict[str, list[str]] = {}
        for item in signature.split(","):
            key, separator, value = item.partition("=")
            if separator:
                parts.setdefault(key, []).append(value)
        try:
            timestamp = int(parts["t"][0])
            candidates = parts["v1"]
        except (KeyError, ValueError, IndexError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID") from exc
        if abs(int(time.time()) - timestamp) > self._webhook_tolerance_seconds:
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_EXPIRED")
        expected = hmac.new(
            self._signing_secret.encode(),
            str(timestamp).encode() + b"." + payload,
            hashlib.sha256,
        ).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in candidates):
            raise BadRequest(error="BILLING_WEBHOOK_SIGNATURE_INVALID")
        return timestamp

    @staticmethod
    def _parse_event(payload: bytes) -> _SimulatedWebhookEvent:
        try:
            return _SimulatedWebhookEvent.model_validate(json.loads(payload))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc

    @staticmethod
    def _validate_envelope(
        *,
        event: _SimulatedWebhookEvent,
        envelope: BillingWebhookEnvelope,
    ) -> None:
        if (
            event.id != envelope.provider_event_id
            or event.type != envelope.event_type
            or event.mode != envelope.provider_mode
            or event.account != envelope.provider_account_id
        ):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")

    @staticmethod
    def _require_checkout_data(event: _SimulatedWebhookEvent) -> _SimulatedCheckoutOutcomeData:
        if not isinstance(event.data, _SimulatedCheckoutOutcomeData):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        return event.data

    @staticmethod
    def _require_subscription_data(event: _SimulatedWebhookEvent) -> _SimulatedSubscriptionData:
        if not isinstance(event.data, _SimulatedSubscriptionData):
            raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID")
        return event.data


class SimulatedBillingExtension:
    name = _EXTENSION_NAME

    def create_connector(self) -> SimulatedBillingConnector:
        settings = get_settings()
        if settings.app_env == "production":
            raise ServiceUnavailable(error="BILLING_SIMULATOR_PRODUCTION_FORBIDDEN")
        return SimulatedBillingConnector(
            signing_secret=settings.billing.simulated_signing_secret.get_secret_value(),
            webhook_tolerance_seconds=settings.billing.webhook_tolerance_seconds,
        )

    def arclayer_register(self, registry: PluginRegistry) -> None:
        registry.connectors.register(
            extension=self.name,
            definition=ConnectorDefinition(
                key=_CONNECTOR_KEY,
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
                capabilities=("checkout", "subscription_webhook"),
                config_schema={
                    "webhookToleranceSeconds": {"type": "integer", "minimum": 30, "maximum": 3600},
                },
                secret_schema={
                    "signingSecret": {"type": "string", "writeOnly": True},
                },
                webhook_events=(
                    _CHECKOUT_OUTCOME_EVENT_TYPE,
                    _SUBSCRIPTION_LIFECYCLE_EVENT_TYPE,
                ),
                health_contract=("configured", "webhook_configured"),
                admin=ConnectorAdminMetadata(
                    label_key="settings:SETTINGS_SYSTEM_PLUGIN_SIMULATED_BILLING_NAME",
                    description_key="settings:SETTINGS_SYSTEM_PLUGIN_SIMULATED_BILLING_DESC",
                    settings_section="billing",
                    icon_key="flask-conical",
                ),
            ),
            factory=self.create_connector,
        )
        logger.info("Simulated billing Connector registered", connector=_CONNECTOR_KEY)


def create_plugin() -> SimulatedBillingExtension:
    return SimulatedBillingExtension()


def _provider_dunning_event(
    data: _SimulatedDunningData | None,
    *,
    occurred_at: datetime,
) -> ProviderDunningEvent | None:
    if data is None:
        return None
    recovery_deadline = (
        _provider_timestamp(data.recovery_deadline) if isinstance(data, _SimulatedPaymentFailureData) else None
    )
    try:
        return ProviderDunningEvent(
            kind=data.kind,
            provider_period_id=data.provider_period_id,
            occurred_at=occurred_at,
            recovery_deadline=recovery_deadline,
        )
    except ValidationError as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc


def _provider_payment_projection(
    data: _SimulatedInvoiceData | None,
    *,
    currency: str,
    occurred_at: datetime,
) -> ProviderInvoiceProjection | None:
    if data is None:
        return None
    try:
        return ProviderInvoiceProjection(
            external_invoice_id=data.external_invoice_id,
            status=data.status,
            currency=currency,
            amount_due_micros=data.amount_due_micros,
            amount_paid_micros=data.amount_paid_micros,
            amount_refunded_micros=data.amount_refunded_micros,
            period_start=_provider_timestamp(data.period_start),
            period_end=_provider_timestamp(data.period_end),
            issued_at=_provider_timestamp(data.issued_at),
            paid_at=_provider_timestamp(data.paid_at) if data.paid_at is not None else None,
            hosted_invoice_url=data.hosted_invoice_url,
            occurred_at=occurred_at,
            transactions=tuple(
                ProviderTransactionProjection(
                    external_transaction_id=transaction.external_transaction_id,
                    kind=transaction.kind,
                    status=transaction.status,
                    currency=currency,
                    amount_micros=transaction.amount_micros,
                    occurred_at=_provider_timestamp(transaction.occurred_at),
                )
                for transaction in data.transactions
            ),
        )
    except ValidationError as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc


def _provider_timestamp(value: int) -> datetime:
    try:
        return datetime.fromtimestamp(value, tz=UTC)
    except (OverflowError, OSError, ValueError) as exc:
        raise BadRequest(error="BILLING_WEBHOOK_PAYLOAD_INVALID") from exc
