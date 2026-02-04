from __future__ import annotations

from apps.api.config import Settings
from apps.api.infra.storage.registry import StorageProviderFactory
from apps.api.plugin.host import host


def build_storage_provider_for(settings: Settings, *, provider: str):
    """
    Build a storage provider by name.

    This is intentionally infrastructure-level wiring; domain services should depend on
    a provider interface, not directly on Settings.
    """

    # Pluggy returns a list of results (one per implementing plugin). Each result can itself be a list.
    raw = host.hook.storage_provider_factories()
    factories: list[StorageProviderFactory] = []
    for part in raw or []:
        if part is None:
            continue
        if isinstance(part, list):
            factories.extend(part)
            continue
        factories.append(part)

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
