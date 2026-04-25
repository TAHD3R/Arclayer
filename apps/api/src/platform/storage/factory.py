from __future__ import annotations

from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.core_factories import CoreLocalStorageProviderFactory, CoreS3StorageProviderFactory
from src.platform.storage.profile_schema import StorageProfileConfig


def build_storage_provider(profile_config: StorageProfileConfig):
    provider_kind = ObjectStorageProviderKind(profile_config.provider)
    if provider_kind == ObjectStorageProviderKind.LOCAL:
        return CoreLocalStorageProviderFactory().build(profile_config)
    return CoreS3StorageProviderFactory().build(profile_config)
