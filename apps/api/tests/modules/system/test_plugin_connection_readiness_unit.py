from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.modules.system.plugins.connection_readiness import ExtensionConnectionReadinessService
from src.modules.system.plugins.schema import ExtensionConfigurationReadiness


class _ReadinessPort:
    def __init__(self, value: object) -> None:
        self.value = value
        self.calls = 0

    async def get_settings(self) -> object:
        self.calls += 1
        return self.value

    async def provider_readiness(self) -> object:
        self.calls += 1
        return self.value

    async def get_service(self) -> object:
        self.calls += 1
        return self.value


class _UnexpectedPort:
    async def get_settings(self) -> object:
        raise AssertionError("analytics must not read a non-existent owning readiness port")

    async def provider_readiness(self) -> object:
        raise AssertionError("analytics must not read a non-existent owning readiness port")

    async def get_service(self) -> object:
        raise AssertionError("analytics must not read a non-existent owning readiness port")


def _definition(kind: ConnectorKind, key: str) -> ConnectorDefinition:
    return ConnectorDefinition(
        key=key,
        kind=kind,
        version="1.0.0",
        trust_level=ConnectorTrustLevel.OFFICIAL,
    )


def _service(*, oauth: object, billing: object, mail: object) -> ExtensionConnectionReadinessService:
    return ExtensionConnectionReadinessService(
        platform_sign_in=cast(Any, oauth),
        commerce=cast(Any, billing),
        mail=cast(Any, mail),
    )


async def test_analytics_connection_is_explicitly_unavailable_without_an_owning_readiness_port() -> None:
    unavailable = _UnexpectedPort()
    service = _service(oauth=unavailable, billing=unavailable, mail=unavailable)

    readiness = await service.resolve(_definition(ConnectorKind.ANALYTICS, "analytics.posthog"))

    assert readiness is ExtensionConfigurationReadiness.UNAVAILABLE


async def test_oauth_connection_uses_platform_sign_in_readiness() -> None:
    oauth = _ReadinessPort(
        SimpleNamespace(providers=(SimpleNamespace(key="google", installed=True, enabled=True, configured=True),))
    )
    service = _service(
        oauth=oauth,
        billing=_UnexpectedPort(),
        mail=_UnexpectedPort(),
    )

    readiness = await service.resolve(_definition(ConnectorKind.OAUTH, "oauth.google"))

    assert readiness is ExtensionConfigurationReadiness.READY
    assert oauth.calls == 1


async def test_oauth_connection_surfaces_missing_configuration() -> None:
    service = _service(
        oauth=_ReadinessPort(
            SimpleNamespace(providers=(SimpleNamespace(key="google", installed=True, enabled=True, configured=False),))
        ),
        billing=_UnexpectedPort(),
        mail=_UnexpectedPort(),
    )

    readiness = await service.resolve(_definition(ConnectorKind.OAUTH, "oauth.google"))

    assert readiness is ExtensionConfigurationReadiness.NEEDS_CONFIGURATION


async def test_billing_connection_uses_the_configured_provider_readiness() -> None:
    billing = _ReadinessPort(
        SimpleNamespace(
            provider="stripe",
            configured=True,
            webhook_ready=True,
            connector_registered=True,
        )
    )
    service = _service(
        oauth=_UnexpectedPort(),
        billing=billing,
        mail=_UnexpectedPort(),
    )

    readiness = await service.resolve(_definition(ConnectorKind.BILLING, "billing.stripe"))

    assert readiness is ExtensionConfigurationReadiness.READY
    assert billing.calls == 1


async def test_email_connection_keeps_an_unavailable_mail_service_distinct_from_configuration() -> None:
    service = _service(
        oauth=_UnexpectedPort(),
        billing=_UnexpectedPort(),
        mail=_ReadinessPort(SimpleNamespace(provider="smtp", unavailable=True, active=False)),
    )

    readiness = await service.resolve(_definition(ConnectorKind.EMAIL, "email.smtp"))

    assert readiness is ExtensionConfigurationReadiness.UNAVAILABLE
