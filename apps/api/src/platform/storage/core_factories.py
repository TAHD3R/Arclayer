from __future__ import annotations

from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.registry import StorageProvider


class CoreLocalStorageProviderFactory:
    provider = ObjectStorageProviderKind.LOCAL

    def build(self, profile_config: StorageProfileConfig) -> StorageProvider:
        if profile_config.local_root_dir is None:
            raise ValueError("local_root_dir is required for local storage profiles")
        if profile_config.local_tmp_dir is None:
            raise ValueError("local_tmp_dir is required for local storage profiles")
        profile_config.local_root_dir.mkdir(parents=True, exist_ok=True)
        profile_config.local_tmp_dir.mkdir(parents=True, exist_ok=True)
        from src.platform.storage.providers.local import LocalObjectStorageProvider

        return LocalObjectStorageProvider(profile_config)


class CoreS3StorageProviderFactory:
    provider = ObjectStorageProviderKind.AWS_S3

    def build(self, profile_config: StorageProfileConfig) -> StorageProvider:
        if profile_config.local_tmp_dir is not None:
            profile_config.local_tmp_dir.mkdir(parents=True, exist_ok=True)

        from src.platform.storage.capabilities import ObjectStorageProviderKind
        from src.platform.storage.providers.aliyun_oss import AliyunOssStorageProvider
        from src.platform.storage.providers.s3_compatible import S3CompatibleObjectStorageProvider
        from src.platform.storage.providers.volcengine_tos import VolcengineTosStorageProvider

        provider_kind = ObjectStorageProviderKind(profile_config.provider)
        if provider_kind == ObjectStorageProviderKind.ALIYUN_OSS:
            return AliyunOssStorageProvider(profile_config)
        if provider_kind == ObjectStorageProviderKind.VOLCENGINE_TOS:
            return VolcengineTosStorageProvider(profile_config)
        if provider_kind in {
            ObjectStorageProviderKind.AWS_S3,
            ObjectStorageProviderKind.MINIO,
            ObjectStorageProviderKind.CLOUDFLARE_R2,
        }:
            return S3CompatibleObjectStorageProvider(profile_config)
        raise ValueError(f"unsupported object storage provider: {provider_kind.value}")
