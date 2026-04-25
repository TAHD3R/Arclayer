from __future__ import annotations

from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider


class VolcengineTosStorageProvider(S3StorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        provider_kind = ObjectStorageProviderKind(str(config.provider))
        if provider_kind != ObjectStorageProviderKind.VOLCENGINE_TOS:
            raise ValueError(f"{provider_kind.value} is not a Volcengine TOS provider")
        super().__init__(config)
