from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.infra.storage.core_factories import CoreLocalStorageProviderFactory, CoreS3StorageProviderFactory
from apps.api.src.infra.storage.registry import StorageProviderFactory


def build_storage_provider_for(settings: Settings, *, provider: str):
    """
    Build a storage provider by name.

    This is intentionally infrastructure-level wiring; domain services should depend on
    a provider interface, not directly on Settings.
    """

    factories: list[StorageProviderFactory] = [
        CoreLocalStorageProviderFactory(),
        CoreS3StorageProviderFactory(),
    ]

    for factory in factories:
        if getattr(factory, "provider", None) == provider:
            built = factory.build(settings)
            return built

    raise ValueError(f"unknown storage provider: {provider}")


def build_storage_provider(settings: Settings):
    """
    Build the active storage provider from settings.storage.provider.
    """

    return build_storage_provider_for(settings, provider=settings.storage.provider)
