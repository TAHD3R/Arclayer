from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommercePaymentCorrectionDisposition,
    CommerceRefundStatus,
    CommerceTransactionStatus,
)
from src.models.connectors.inbox import ConnectorEventInboxStatus
from src.modules.commerce.billing_payment_reconciliation_service import (
    ProviderPaymentCorrectionFacts,
    ProviderPaymentCorrectionResult,
)
from src.modules.commerce.billing_top_up_refund_application_service import BillingTopUpRefundResult
from src.modules.commerce.platform_operations import PlatformCommerceOperationsService
from src.modules.commerce.platform_operations_schema import (
    CreditAdjustmentRequest,
    ProviderConfigurationWrite,
    ProviderEventReconcileRequest,
)


class _Connectors:
    def resolve(self, key: str) -> None:
        _ = key
        return None


class _RegisteredConnectors:
    def __init__(self, *, key: str, capabilities: tuple[str, ...], factory=None) -> None:
        self._key = key
        self._registration = SimpleNamespace(
            definition=ConnectorDefinition(
                key=key,
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
                capabilities=capabilities,
            ),
            factory=factory,
        )

    def resolve(self, key: str):  # type: ignore[no-untyped-def]
        return self._registration if key == self._key else None


class _RefundConnector:
    async def create_refund(self, **_: object):
        raise AssertionError("Provider call belongs to the injected refund applicator")

    async def refund_from_event(self, **_: object):
        return None


def _settings(*, provider: str = "disabled") -> SimpleNamespace:
    return SimpleNamespace(
        billing=SimpleNamespace(
            provider=provider,
            _stripe_configured=False,
            webhook_enabled=False,
        )
    )


def _simulated_settings(*, signing_secret_configured: bool) -> SimpleNamespace:
    return SimpleNamespace(
        billing=SimpleNamespace(
            provider="simulated",
            provider_configured=True,
            webhook_secret_configured=signing_secret_configured,
            webhook_enabled=signing_secret_configured,
        )
    )


@pytest.mark.asyncio
async def test_simulated_provider_readiness_never_requires_a_provider_secret() -> None:
    service = PlatformCommerceOperationsService(
        settings=cast(Settings, _simulated_settings(signing_secret_configured=True)),
        connectors=cast(
            ConnectorRegistry,
            _RegisteredConnectors(
                key="billing.simulated",
                capabilities=("subscription_webhook",),
            ),
        ),
    )

    readiness = await service.provider_readiness()

    assert readiness.provider == "simulated"
    assert readiness.configured is True
    assert readiness.webhook_ready is True
    assert readiness.connector_registered is True
    assert readiness.supported_capabilities == ("subscription_webhook",)
    assert readiness.missing_prerequisites == ()


@pytest.mark.asyncio
async def test_simulated_provider_readiness_requires_its_signing_secret() -> None:
    service = PlatformCommerceOperationsService(
        settings=cast(Settings, _simulated_settings(signing_secret_configured=False)),
        connectors=cast(
            ConnectorRegistry,
            _RegisteredConnectors(
                key="billing.simulated",
                capabilities=("subscription_webhook",),
            ),
        ),
    )

    readiness = await service.provider_readiness()

    assert readiness.configured is False
    assert readiness.webhook_ready is False
    assert readiness.missing_prerequisites == ("webhook_secret",)


@pytest.mark.asyncio
async def test_provider_configuration_requires_a_safe_secret_persistence_port() -> None:
    service = PlatformCommerceOperationsService(settings=_settings(), connectors=_Connectors())

    with pytest.raises(ServiceUnavailable) as exc:
        await service.write_provider_configuration(
            request=ProviderConfigurationWrite(
                provider="stripe",
                mode="test",
                expected_revision=0,
                secret="provider-secret",
                idempotency_key="provider-write-1",
            ),
            actor_user_id=uuid4(),
        )

    assert exc.value.error == "BILLING_PROVIDER_CONFIGURATION_PORT_UNAVAILABLE"
    assert exc.value.details == {"protocol": "commerce.provider.configuration.v1"}


@pytest.mark.asyncio
async def test_failed_provider_event_reconcile_requires_the_durable_reenqueue_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_id = uuid4()
    event = SimpleNamespace(
        id=event_id,
        status=ConnectorEventInboxStatus.FAILED,
        processing_attempts=3,
    )

    class _Query:
        async def first(self):  # type: ignore[no-untyped-def]
            return event

    from src.models.connectors.inbox import ConnectorEventInbox

    monkeypatch.setattr(ConnectorEventInbox, "filter", lambda **_kwargs: _Query())
    service = PlatformCommerceOperationsService(settings=_settings(), connectors=_Connectors())

    with pytest.raises(ServiceUnavailable) as exc:
        await service.reconcile_provider_event(
            event_id=event_id,
            request=ProviderEventReconcileRequest(expected_processing_attempts=3, idempotency_key="reconcile-1"),
            actor_user_id=uuid4(),
        )

    assert exc.value.error == "BILLING_PROVIDER_EVENT_RECONCILIATION_PORT_UNAVAILABLE"
    assert exc.value.details == {"protocol": "commerce.provider-event.reconcile.v1"}


@pytest.mark.asyncio
async def test_top_up_refund_uses_injected_refund_authority_and_provider_scope() -> None:
    transaction_id = uuid4()
    actor_id = uuid4()

    class _RefundApplicator:
        async def request_refund(self, **kwargs: object) -> BillingTopUpRefundResult:
            assert kwargs["transaction_id"] == transaction_id
            assert kwargs["actor_user_id"] == actor_id
            assert kwargs["idempotency_key"] == "refund-1"
            assert isinstance(kwargs["provider"], _RefundConnector)
            return BillingTopUpRefundResult(
                refund_id=uuid4(),
                workspace_id=uuid4(),
                transaction_id=transaction_id,
                status=CommerceRefundStatus.PENDING,
                amount_micros=5_000_000,
                credit_amount=500,
                external_refund_id=None,
                held_credits=500,
            )

    service = PlatformCommerceOperationsService(
        settings=cast(Settings, _settings(provider="stripe")),
        connectors=cast(
            ConnectorRegistry,
            _RegisteredConnectors(key="billing.stripe", capabilities=(), factory=_RefundConnector),
        ),
        refund_applicator=cast(Any, _RefundApplicator()),
    )

    result = await service.request_top_up_refund(
        transaction_id=transaction_id,
        reason="operator correction",
        idempotency_key="refund-1",
        actor_user_id=actor_id,
    )

    assert result.transaction_id == transaction_id
    assert result.held_credits == 500


@pytest.mark.asyncio
async def test_payment_correction_is_delegated_to_provider_neutral_recorder() -> None:
    actor_id = uuid4()
    facts = ProviderPaymentCorrectionFacts(
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="acct_test",
        provider_event_id="evt_correction_1",
        external_transaction_id="pi_1",
        transaction_status=CommerceTransactionStatus.SUCCEEDED,
        currency="USD",
        amount_micros=1_000,
        provider_event_occurred_at=datetime.now(UTC),
    )
    expected = ProviderPaymentCorrectionResult(
        correction_id=uuid4(),
        disposition=CommercePaymentCorrectionDisposition.APPLIED,
        workspace_id=None,
        transaction_id=None,
        invoice_id=None,
        refund_id=None,
        credit_consequence=None,
        failure_code=None,
    )

    class _Recorder:
        async def reconcile(self, **kwargs: object) -> ProviderPaymentCorrectionResult:
            assert kwargs["facts"] == facts
            assert kwargs["actor_user_id"] == actor_id
            return expected

    service = PlatformCommerceOperationsService(
        settings=cast(Settings, _settings()),
        connectors=cast(ConnectorRegistry, _Connectors()),
        payment_correction_recorder=cast(Any, _Recorder()),
    )

    result = await service.record_payment_correction(
        facts=facts,
        reason="Provider evidence review",
        evidence_reference="case-45",
        idempotency_key="correction-45",
        actor_user_id=actor_id,
    )

    assert result == expected


def test_credit_adjustment_rejects_a_noop_before_any_ledger_write() -> None:
    with pytest.raises(ValueError, match="delta_credits must not be zero"):
        CreditAdjustmentRequest(
            delta_credits=0,
            reason="no-op",
            evidence_reference="case-1",
            expires_at=None,
            expected_account_revision=1,
            idempotency_key="credit-adjustment-1",
        )
