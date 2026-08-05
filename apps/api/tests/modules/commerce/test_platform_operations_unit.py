from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry
from src.models.connectors.inbox import ConnectorEventInboxStatus
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
    def __init__(self, *, key: str, capabilities: tuple[str, ...]) -> None:
        self._key = key
        self._registration = SimpleNamespace(
            definition=ConnectorDefinition(
                key=key,
                kind=ConnectorKind.BILLING,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
                capabilities=capabilities,
            )
        )

    def resolve(self, key: str):  # type: ignore[no-untyped-def]
        return self._registration if key == self._key else None


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
