from __future__ import annotations

from pathlib import Path

from pydantic import ConfigDict, Field, SecretStr

from src.common.schemas.base import BaseSchema
from src.platform.storage.capabilities import ObjectStorageProviderKind, get_provider_capabilities


class PublicAssetDeliveryMode(str):
    AUTO = "auto"
    DIRECT = "direct"
    PRESIGN = "presign"


class StorageProfileConfig(BaseSchema):
    model_config = ConfigDict(frozen=True)

    provider: ObjectStorageProviderKind
    display_name: str | None = None
    endpoint_url: str | None = None
    region: str | None = None
    bucket: str | None = None
    public_bucket: str | None = None
    public_base_url: str | None = None
    public_delivery_mode: str = Field(default=PublicAssetDeliveryMode.AUTO)
    force_path_style: bool = False
    access_key_id: str | None = None
    secret_access_key: SecretStr | None = None
    secret_access_key_ref: str | None = None
    presign_expires_seconds: int = Field(default=900, ge=60, le=24 * 3600)
    local_root_dir: Path | None = None
    local_tmp_dir: Path | None = None

    @property
    def capabilities(self):
        return get_provider_capabilities(self.provider)


PROVIDER_PROFILE_PRESETS: dict[ObjectStorageProviderKind, StorageProfileConfig] = {
    ObjectStorageProviderKind.AWS_S3: StorageProfileConfig(
        provider=ObjectStorageProviderKind.AWS_S3,
        display_name="AWS S3",
        region="us-east-1",
        public_delivery_mode=PublicAssetDeliveryMode.AUTO,
    ),
    ObjectStorageProviderKind.MINIO: StorageProfileConfig(
        provider=ObjectStorageProviderKind.MINIO,
        display_name="MinIO",
        endpoint_url="http://127.0.0.1:9000",
        region="us-east-1",
        force_path_style=True,
        public_delivery_mode=PublicAssetDeliveryMode.AUTO,
    ),
    ObjectStorageProviderKind.CLOUDFLARE_R2: StorageProfileConfig(
        provider=ObjectStorageProviderKind.CLOUDFLARE_R2,
        display_name="Cloudflare R2",
        endpoint_url="https://<account-id>.r2.cloudflarestorage.com",
        region="auto",
        public_delivery_mode=PublicAssetDeliveryMode.AUTO,
    ),
    ObjectStorageProviderKind.ALIYUN_OSS: StorageProfileConfig(
        provider=ObjectStorageProviderKind.ALIYUN_OSS,
        display_name="Aliyun OSS",
        endpoint_url="https://oss-cn-hangzhou.aliyuncs.com",
        region="cn-hangzhou",
        public_delivery_mode=PublicAssetDeliveryMode.AUTO,
    ),
    ObjectStorageProviderKind.VOLCENGINE_TOS: StorageProfileConfig(
        provider=ObjectStorageProviderKind.VOLCENGINE_TOS,
        display_name="Volcengine TOS",
        endpoint_url="https://tos-cn-beijing.volces.com",
        region="cn-beijing",
        public_delivery_mode=PublicAssetDeliveryMode.AUTO,
    ),
}


def get_provider_profile_preset(provider: ObjectStorageProviderKind | str) -> StorageProfileConfig:
    provider_kind = ObjectStorageProviderKind(str(provider))
    try:
        return PROVIDER_PROFILE_PRESETS[provider_kind]
    except KeyError as exc:  # pragma: no cover - guarded by tests
        raise ValueError(f"missing storage profile preset for provider: {provider_kind.value}") from exc
