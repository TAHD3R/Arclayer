from __future__ import annotations

from typing import Protocol

from src.platform.storage.capabilities import ObjectStorageCapabilities, ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig


class StorageProvider(Protocol):
    provider: str
    kind: ObjectStorageProviderKind
    capabilities: ObjectStorageCapabilities
    config: StorageProfileConfig


class StorageProviderFactory(Protocol):
    provider: ObjectStorageProviderKind

    def build(self, profile_config: StorageProfileConfig) -> StorageProvider: ...
