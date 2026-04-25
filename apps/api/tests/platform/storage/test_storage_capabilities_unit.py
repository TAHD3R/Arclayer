from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.platform.storage.capabilities import (
    PROVIDER_CAPABILITIES,
    ObjectStorageProviderKind,
    get_provider_capabilities,
)
from src.platform.storage.profile_schema import PROVIDER_PROFILE_PRESETS, StorageProfileConfig


def test_every_provider_kind_has_capabilities() -> None:
    assert set(PROVIDER_CAPABILITIES) == set(ObjectStorageProviderKind)

    for provider in ObjectStorageProviderKind:
        capabilities = get_provider_capabilities(provider)
        assert capabilities is PROVIDER_CAPABILITIES[provider]
        assert isinstance(capabilities.supports_multipart_upload, bool)
        assert isinstance(capabilities.supports_presigned_download, bool)
        assert isinstance(capabilities.supports_public_bucket, bool)
        assert isinstance(capabilities.supports_server_side_copy, bool)


def test_cloud_provider_presets_exist() -> None:
    expected = {
        ObjectStorageProviderKind.AWS_S3,
        ObjectStorageProviderKind.MINIO,
        ObjectStorageProviderKind.CLOUDFLARE_R2,
        ObjectStorageProviderKind.ALIYUN_OSS,
        ObjectStorageProviderKind.VOLCENGINE_TOS,
    }
    assert set(PROVIDER_PROFILE_PRESETS) == expected

    for provider, preset in PROVIDER_PROFILE_PRESETS.items():
        assert isinstance(preset, StorageProfileConfig)
        assert preset.provider == provider


def test_storage_profile_config_is_frozen() -> None:
    config = StorageProfileConfig(provider=ObjectStorageProviderKind.LOCAL)
    with pytest.raises(ValidationError):
        config.provider = ObjectStorageProviderKind.AWS_S3  # type: ignore[misc]
