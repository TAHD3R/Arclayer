"""Development/test-only simulated billing Connector foundation."""

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

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
from src.modules.commerce.billing_connector import (
    BillingRedirectSession,
    BillingWebhookEnvelope,
    CheckoutSession,
    ProviderSubscription,
)

logger = get_logger(__name__)

_CONNECTOR_KEY = "billing.simulated"
_EXTENSION_NAME = "arclayer-simulated-billing"
_CHECKOUT_SESSION_TTL = timedelta(minutes=30)
_PROVIDER_ACCOUNT_ID = "platform"


class _SimulatedWebhookEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^sim_evt_[A-Za-z0-9]+$", max_length=255)
    type: str = Field(..., min_length=1, max_length=160)
    mode: Literal["test"] = "test"
    account: str = Field(default="platform", min_length=1, max_length=255)
    created: int
    data: dict[str, object] = Field(default_factory=dict)


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
        del payload, envelope
        raise ServiceUnavailable(error="BILLING_SIMULATOR_EVENT_NORMALIZATION_NOT_AVAILABLE")

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
                webhook_events=(),
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
