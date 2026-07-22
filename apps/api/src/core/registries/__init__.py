from __future__ import annotations

from typing import Any

from src.core.connectors import (
    ConnectorDefinition,
    ConnectorFactory,
    ConnectorRegistration,
    ConnectorRegistrationError,
)
from src.core.logging import get_logger

logger = get_logger(__name__)


class Registry(dict):
    """Base registry — a typed dictionary with domain-specific accessors.

    Subclassed per resource type for discoverability and type safety.
    Plugins register resources during arclayer_register via this registry.
    """

    pass


class PluginRegistry:  # noqa: B903 - mutable runtime registry container; dataclass is production-banned.
    """Composite registry passed to plugins during arclayer_register.

    Contains all sub-registries that plugins can populate with their
    services, controllers, content types, middlewares, policies,
    custom fields, providers, Connectors, components, validators, and sanitizers.
    """

    services: ServiceRegistry
    controllers: ControllerRegistry
    content_types: ContentTypeRegistry
    middlewares: MiddlewareRegistry
    policies: PolicyRegistry
    custom_fields: CustomFieldRegistry
    providers: ProviderRegistry
    connectors: ConnectorRegistry
    components: ComponentRegistry
    validators: ValidatorRegistry
    sanitizers: SanitizerRegistry

    def __init__(
        self,
        *,
        services: ServiceRegistry,
        controllers: ControllerRegistry,
        content_types: ContentTypeRegistry,
        middlewares: MiddlewareRegistry,
        policies: PolicyRegistry,
        custom_fields: CustomFieldRegistry,
        providers: ProviderRegistry,
        connectors: ConnectorRegistry,
        components: ComponentRegistry,
        validators: ValidatorRegistry,
        sanitizers: SanitizerRegistry,
    ) -> None:
        self.services = services
        self.controllers = controllers
        self.content_types = content_types
        self.middlewares = middlewares
        self.policies = policies
        self.custom_fields = custom_fields
        self.providers = providers
        self.connectors = connectors
        self.components = components
        self.validators = validators
        self.sanitizers = sanitizers


class ServiceRegistry(Registry):
    """Registry of named service instances."""

    def register(self, name: str, service: Any) -> None:
        if name in self:
            logger.warning("Service already registered, replacing", name=name)
        self[name] = service

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class ControllerRegistry(Registry):
    """Registry of named controller classes/factories."""

    def register(self, name: str, controller: Any) -> None:
        if name in self:
            logger.warning("Controller already registered, replacing", name=name)
        self[name] = controller

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class ContentTypeRegistry(Registry):
    """Registry of content type definitions."""

    def register(self, key: str, definition: Any) -> None:
        if key in self:
            logger.warning("Content type already registered, replacing", key=key)
        self[key] = definition

    def resolve(self, key: str) -> Any | None:
        return super().get(key)

    @property
    def keys(self) -> list[str]:
        return list(super().keys())


class MiddlewareRegistry(Registry):
    """Registry of named middleware factories."""

    def register(self, name: str, middleware: Any) -> None:
        if name in self:
            logger.warning("Middleware already registered, replacing", name=name)
        self[name] = middleware

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class PolicyRegistry(Registry):
    """Registry of named policy/guard functions."""

    def register(self, name: str, policy: Any) -> None:
        if name in self:
            logger.warning("Policy already registered, replacing", name=name)
        self[name] = policy

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class CustomFieldRegistry(Registry):
    """Registry of custom field type implementations."""

    def register(self, uid: str, field_type: Any) -> None:
        if uid in self:
            logger.warning("Custom field already registered, replacing", uid=uid)
        self[uid] = field_type

    def resolve(self, uid: str) -> Any | None:
        return super().get(uid)


class ProviderRegistry(Registry):
    """Registry of named providers (email, upload, search, SSO)."""

    def register(self, name: str, provider: Any) -> None:
        if name in self:
            logger.warning("Provider already registered, replacing", name=name)
        self[name] = provider

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class ConnectorRegistry(Registry):
    """Registry of typed external integration definitions and factories."""

    def register(
        self,
        *,
        extension: str,
        definition: ConnectorDefinition,
        factory: ConnectorFactory,
    ) -> None:
        if definition.key in self:
            current = self[definition.key]
            owner = current.extension if isinstance(current, ConnectorRegistration) else "unknown"
            raise ConnectorRegistrationError(
                f"Connector '{definition.key}' is already registered by extension '{owner}'"
            )
        self[definition.key] = ConnectorRegistration(
            extension=extension,
            definition=definition,
            factory=factory,
        )

    def resolve(self, key: str) -> ConnectorRegistration | None:
        registration = super().get(key)
        return registration if isinstance(registration, ConnectorRegistration) else None

    def list_registrations(self) -> tuple[ConnectorRegistration, ...]:
        return tuple(item for item in self.values() if isinstance(item, ConnectorRegistration))


class ComponentRegistry(Registry):
    """Registry of component definitions for dynamic zones."""

    def register(self, key: str, component: Any) -> None:
        if key in self:
            logger.warning("Component already registered, replacing", key=key)
        self[key] = component

    def resolve(self, key: str) -> Any | None:
        return super().get(key)


class ValidatorRegistry(Registry):
    """Registry of custom field validators."""

    def register(self, name: str, validator: Any) -> None:
        if name in self:
            logger.warning("Validator already registered, replacing", name=name)
        self[name] = validator

    def resolve(self, name: str) -> Any | None:
        return super().get(name)


class SanitizerRegistry(Registry):
    """Registry of custom input/output sanitizers."""

    def register(self, name: str, sanitizer: Any) -> None:
        if name in self:
            logger.warning("Sanitizer already registered, replacing", name=name)
        self[name] = sanitizer

    def resolve(self, name: str) -> Any | None:
        return super().get(name)
