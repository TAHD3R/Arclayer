from __future__ import annotations

from enum import StrEnum

from pydantic import ConfigDict

from src.common.schemas.base import BaseSchema


class ObjectStorageProviderKind(StrEnum):
    LOCAL = "local"
    AWS_S3 = "aws_s3"
    MINIO = "minio"
    CLOUDFLARE_R2 = "cloudflare_r2"
    ALIYUN_OSS = "aliyun_oss"
    VOLCENGINE_TOS = "volcengine_tos"


class ObjectStorageCapabilities(BaseSchema):
    model_config = ConfigDict(frozen=True)

    supports_bucket_create: bool
    supports_multipart_upload: bool
    supports_presigned_upload: bool
    supports_presigned_download: bool
    supports_server_side_copy: bool
    supports_public_bucket: bool
    supports_path_style: bool
    supports_custom_public_base_url: bool


PROVIDER_CAPABILITIES: dict[ObjectStorageProviderKind, ObjectStorageCapabilities] = {
    ObjectStorageProviderKind.LOCAL: ObjectStorageCapabilities(
        supports_bucket_create=False,
        supports_multipart_upload=False,
        supports_presigned_upload=False,
        supports_presigned_download=False,
        supports_server_side_copy=True,
        supports_public_bucket=False,
        supports_path_style=False,
        supports_custom_public_base_url=True,
    ),
    ObjectStorageProviderKind.AWS_S3: ObjectStorageCapabilities(
        supports_bucket_create=True,
        supports_multipart_upload=True,
        supports_presigned_upload=True,
        supports_presigned_download=True,
        supports_server_side_copy=True,
        supports_public_bucket=True,
        supports_path_style=False,
        supports_custom_public_base_url=True,
    ),
    ObjectStorageProviderKind.MINIO: ObjectStorageCapabilities(
        supports_bucket_create=True,
        supports_multipart_upload=True,
        supports_presigned_upload=True,
        supports_presigned_download=True,
        supports_server_side_copy=True,
        supports_public_bucket=True,
        supports_path_style=True,
        supports_custom_public_base_url=True,
    ),
    ObjectStorageProviderKind.CLOUDFLARE_R2: ObjectStorageCapabilities(
        supports_bucket_create=False,
        supports_multipart_upload=True,
        supports_presigned_upload=True,
        supports_presigned_download=True,
        supports_server_side_copy=True,
        supports_public_bucket=False,
        supports_path_style=False,
        supports_custom_public_base_url=True,
    ),
    ObjectStorageProviderKind.ALIYUN_OSS: ObjectStorageCapabilities(
        supports_bucket_create=True,
        supports_multipart_upload=True,
        supports_presigned_upload=True,
        supports_presigned_download=True,
        supports_server_side_copy=True,
        supports_public_bucket=True,
        supports_path_style=False,
        supports_custom_public_base_url=True,
    ),
    ObjectStorageProviderKind.VOLCENGINE_TOS: ObjectStorageCapabilities(
        supports_bucket_create=True,
        supports_multipart_upload=True,
        supports_presigned_upload=True,
        supports_presigned_download=True,
        supports_server_side_copy=True,
        supports_public_bucket=True,
        supports_path_style=False,
        supports_custom_public_base_url=True,
    ),
}


def get_provider_capabilities(provider: ObjectStorageProviderKind | str) -> ObjectStorageCapabilities:
    provider_kind = ObjectStorageProviderKind(str(provider))
    try:
        return PROVIDER_CAPABILITIES[provider_kind]
    except KeyError as exc:  # pragma: no cover - guarded by tests
        raise ValueError(f"missing capability profile for provider: {provider_kind.value}") from exc
