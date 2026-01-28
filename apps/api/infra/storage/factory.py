from __future__ import annotations

from apps.api.config import Settings
from apps.api.infra.storage.local import LocalStorageProvider


def build_storage_provider(settings: Settings):
    """
    Build the active storage provider from environment-level settings.

    This is intentionally infrastructure-level wiring; domain services should depend on
    a provider interface, not directly on Settings.
    """

    provider = settings.storage.provider
    if provider == "local":
        settings.storage.local_root_dir.mkdir(parents=True, exist_ok=True)
        settings.storage.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        return LocalStorageProvider(root_dir=settings.storage.local_root_dir)
    if provider == "s3":
        raise NotImplementedError("S3 storage provider is not implemented yet")
    raise ValueError(f"unknown storage provider: {provider}")
