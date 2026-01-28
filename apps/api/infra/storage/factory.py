from __future__ import annotations

from apps.api.config import Settings
from apps.api.infra.storage.local import LocalStorageProvider
from apps.api.infra.storage.registry import (
    STORAGE_PROVIDER_FACTORY_EXTENSION_POINT,
    StorageProvider,
    StorageProviderFactory,
)
from apps.api.infra.storage.s3 import S3StorageProvider
from apps.api.plugin.registry import registry


def build_storage_provider(settings: Settings):
    """
    Build the active storage provider from environment-level settings.

    This is intentionally infrastructure-level wiring; domain services should depend on
    a provider interface, not directly on Settings.
    """

    provider = settings.storage.provider

    # Ensure core providers are available even without plugins.
    factories: list[StorageProviderFactory] = registry.get_extension(STORAGE_PROVIDER_FACTORY_EXTENSION_POINT) or []
    if not factories:
        # Register built-in factories lazily to keep import side-effects minimal.
        registry.register_extension(
            "core",
            STORAGE_PROVIDER_FACTORY_EXTENSION_POINT,
            _CoreLocalStorageProviderFactory(),
        )
        registry.register_extension(
            "core",
            STORAGE_PROVIDER_FACTORY_EXTENSION_POINT,
            _CoreS3StorageProviderFactory(),
        )
        factories = registry.get_extension(STORAGE_PROVIDER_FACTORY_EXTENSION_POINT) or []

    for factory in factories:
        if getattr(factory, "provider", None) == provider:
            built = factory.build(settings)
            return built

    raise ValueError(f"unknown storage provider: {provider}")


class _CoreLocalStorageProviderFactory:
    provider = "local"

    def build(self, settings: Settings) -> StorageProvider:
        settings.storage.local_root_dir.mkdir(parents=True, exist_ok=True)
        settings.storage.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        return LocalStorageProvider(root_dir=settings.storage.local_root_dir)


class _CoreS3StorageProviderFactory:
    provider = "s3"

    def build(self, settings: Settings) -> StorageProvider:
        # Even in S3 mode, we rely on a local tmp directory for small intermediate files
        # (e.g. thumbnail generation, server-side validation).
        settings.storage.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        return S3StorageProvider(settings)
