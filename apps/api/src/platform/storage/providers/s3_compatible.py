from __future__ import annotations

from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider


class S3CompatibleObjectStorageProvider(S3StorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        provider_kind = ObjectStorageProviderKind(str(config.provider))
        if provider_kind not in {
            ObjectStorageProviderKind.AWS_S3,
            ObjectStorageProviderKind.MINIO,
            ObjectStorageProviderKind.CLOUDFLARE_R2,
        }:
            raise ValueError(f"{provider_kind.value} is not an S3-compatible provider")
        super().__init__(config)
