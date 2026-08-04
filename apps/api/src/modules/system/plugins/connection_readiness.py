from __future__ import annotations

from typing import Protocol

from src.core.connectors import ConnectorDefinition, ConnectorKind
from src.modules.commerce.platform_operations_schema import ProviderReadinessOut
from src.modules.platform_identity.sign_in_settings_schema import PlatformSignInSettingsOut
from src.modules.system.mail.profile_schema import MailServiceOut
from src.modules.system.plugins.schema import ExtensionConfigurationReadiness


class PlatformSignInReadinessPort(Protocol):
    async def get_settings(self) -> PlatformSignInSettingsOut: ...


class CommerceProviderReadinessPort(Protocol):
    async def provider_readiness(self) -> ProviderReadinessOut: ...


class MailServiceReadinessPort(Protocol):
    async def get_service(self) -> MailServiceOut: ...


class ExtensionConnectionReadinessService:
    def __init__(
        self,
        *,
        platform_sign_in: PlatformSignInReadinessPort,
        commerce: CommerceProviderReadinessPort,
        mail: MailServiceReadinessPort,
    ) -> None:
        self._platform_sign_in = platform_sign_in
        self._commerce = commerce
        self._mail = mail

    async def resolve(self, definition: ConnectorDefinition) -> ExtensionConfigurationReadiness:
        if definition.kind is ConnectorKind.OAUTH:
            return await self._oauth_readiness(definition)
        if definition.kind is ConnectorKind.BILLING:
            return await self._billing_readiness(definition)
        if definition.kind is ConnectorKind.EMAIL:
            return await self._email_readiness(definition)
        if definition.kind is ConnectorKind.ANALYTICS:
            return ExtensionConfigurationReadiness.UNAVAILABLE
        raise RuntimeError(f"unsupported extension connector kind: {definition.kind}")

    async def _oauth_readiness(self, definition: ConnectorDefinition) -> ExtensionConfigurationReadiness:
        provider_key = _provider_key(definition)
        readiness = await self._platform_sign_in.get_settings()
        provider = next((item for item in readiness.providers if item.key == provider_key), None)
        if provider is None or not provider.installed:
            return ExtensionConfigurationReadiness.UNAVAILABLE
        if provider.enabled and provider.configured:
            return ExtensionConfigurationReadiness.READY
        return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION

    async def _billing_readiness(self, definition: ConnectorDefinition) -> ExtensionConfigurationReadiness:
        readiness = await self._commerce.provider_readiness()
        if readiness.provider == "disabled":
            return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION
        if readiness.provider != _provider_key(definition) or not readiness.connector_registered:
            return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION
        if readiness.configured and readiness.webhook_ready:
            return ExtensionConfigurationReadiness.READY
        return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION

    async def _email_readiness(self, definition: ConnectorDefinition) -> ExtensionConfigurationReadiness:
        service = await self._mail.get_service()
        if service.unavailable:
            return ExtensionConfigurationReadiness.UNAVAILABLE
        if service.provider != _provider_key(definition):
            return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION
        if service.active:
            return ExtensionConfigurationReadiness.READY
        return ExtensionConfigurationReadiness.NEEDS_CONFIGURATION


def _provider_key(definition: ConnectorDefinition) -> str:
    return definition.key.rsplit(".", maxsplit=1)[-1]
