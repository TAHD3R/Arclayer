from __future__ import annotations

from pathlib import Path

import pytest

from src.config import Settings
from src.platform.storage import profiles
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.providers.aliyun_oss import AliyunOssStorageProvider
from src.platform.storage.providers.local import LocalObjectStorageProvider
from src.platform.storage.providers.s3_compatible import S3CompatibleObjectStorageProvider
from src.platform.storage.providers.volcengine_tos import VolcengineTosStorageProvider


def test_build_storage_provider_local(tmp_path: Path) -> None:
    provider = build_storage_provider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "uploads",
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    assert isinstance(provider, LocalObjectStorageProvider)
    assert provider.capabilities.supports_multipart_upload is False


@pytest.mark.parametrize(
    ("provider_kind", "expected_type"),
    [
        (ObjectStorageProviderKind.AWS_S3, S3CompatibleObjectStorageProvider),
        (ObjectStorageProviderKind.MINIO, S3CompatibleObjectStorageProvider),
        (ObjectStorageProviderKind.CLOUDFLARE_R2, S3CompatibleObjectStorageProvider),
        (ObjectStorageProviderKind.ALIYUN_OSS, AliyunOssStorageProvider),
        (ObjectStorageProviderKind.VOLCENGINE_TOS, VolcengineTosStorageProvider),
    ],
)
def test_build_storage_provider_cloud_variants(
    provider_kind: ObjectStorageProviderKind,
    expected_type: type[object],
    tmp_path: Path,
) -> None:
    provider = build_storage_provider(
        StorageProfileConfig(
            provider=provider_kind,
            endpoint_url="https://example.com",
            region="us-east-1",
            bucket="assets",
            access_key_id="key",
            secret_access_key="secret",
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    assert isinstance(provider, expected_type)
    assert provider.kind == provider_kind
    assert provider.capabilities == provider.config.capabilities


@pytest.mark.asyncio
async def test_get_effective_storage_profile_uses_default_profile_key_override(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"storage": {"default_profile_key": profiles.ENV_DEFAULT_PROFILE_KEY}}

    async def fake_get_or_none(**_kwargs):
        return None

    monkeypatch.setattr("src.settings.runtime.get_core_settings_value_cached", fake_core_settings)
    monkeypatch.setattr("src.models.storage.storage_profile.StorageProfileRecord.get_or_none", fake_get_or_none)

    profile_key, profile = await profiles.get_effective_storage_profile(Settings())

    assert profile_key == profiles.ENV_DEFAULT_PROFILE_KEY
    assert profile.provider == ObjectStorageProviderKind.LOCAL


@pytest.mark.asyncio
async def test_get_effective_storage_profile_raises_for_invalid_profile_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"storage": {"default_profile_key": "missing-profile"}}

    async def fake_get_or_none(**_kwargs):
        return None

    monkeypatch.setattr("src.settings.runtime.get_core_settings_value_cached", fake_core_settings)
    monkeypatch.setattr("src.models.storage.storage_profile.StorageProfileRecord.get_or_none", fake_get_or_none)

    with pytest.raises(ValueError, match="unknown storage profile key"):
        await profiles.get_effective_storage_profile(Settings())
