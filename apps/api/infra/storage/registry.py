from __future__ import annotations

from typing import Protocol

from apps.api.config import Settings
from apps.api.plugin.registry import ExtensionPointType, registry

STORAGE_PROVIDER_FACTORY_EXTENSION_POINT = "storage-provider-factory"


class StorageProvider(Protocol):
    """
    Storage provider interface used by the application.

    Notes:
    - Keep it minimal and focused on the capabilities we actually need now.
    - Provider-specific APIs (e.g. S3 multipart) are exposed via optional methods
      on concrete implementations (checked via hasattr / isinstance).
    """

    provider: str


class StorageProviderFactory(Protocol):
    provider: str

    def build(self, settings: Settings) -> StorageProvider: ...


def _register_extension_point() -> None:
    registry.register_extension_point(
        STORAGE_PROVIDER_FACTORY_EXTENSION_POINT,
        ExtensionPointType.MULTI_INSTANCE,
        description="Storage provider factories (core and plugins).",
    )


_register_extension_point()
