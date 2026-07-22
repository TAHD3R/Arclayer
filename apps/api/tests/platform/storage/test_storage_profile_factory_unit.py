from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import SecretStr

from src.config import Settings
from src.models.storage.storage_profile import StorageProfile, StorageProfileConfigSource
from src.platform.storage import profiles
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.profile_route_service import StorageProfileRouteInvariantError
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
            secret_access_key=SecretStr("secret"),
            local_tmp_dir=tmp_path / ".tmp",
        )
    )
    assert isinstance(provider, expected_type)
    assert provider.kind == provider_kind
    assert provider.capabilities == provider.config.capabilities


def test_environment_profile_receives_deployment_s3_client_deadlines() -> None:
    settings = Settings(
        storage={
            "s3_connect_timeout_seconds": 7.5,
            "s3_read_timeout_seconds": 45.0,
        }
    )

    profile = profiles.build_env_storage_profile_config(settings)

    assert profile.connect_timeout_seconds == 7.5
    assert profile.read_timeout_seconds == 45.0


def test_persisted_profile_receives_deployment_s3_client_deadlines() -> None:
    settings = Settings(
        storage={
            "s3_connect_timeout_seconds": 6.0,
            "s3_read_timeout_seconds": 50.0,
        }
    )
    record = StorageProfile(
        profile_key="cloud-primary",
        provider=ObjectStorageProviderKind.AWS_S3.value,
        display_name="Cloud Primary",
        config={},
        secret_ref={},
    )

    profile = profiles.build_storage_profile_config_from_record(
        record,
        settings=settings,
    )

    assert profile.connect_timeout_seconds == 6.0
    assert profile.read_timeout_seconds == 50.0


@pytest.mark.parametrize(
    ("profile_key", "config_source"),
    [
        (profiles.ENV_DEFAULT_PROFILE_KEY, StorageProfileConfigSource.DATABASE),
        ("invalid-environment-alias", StorageProfileConfigSource.ENVIRONMENT),
    ],
)
def test_environment_profile_key_and_config_source_are_one_reserved_identity(
    profile_key: str,
    config_source: StorageProfileConfigSource,
) -> None:
    record = StorageProfile(
        profile_key=profile_key,
        provider=ObjectStorageProviderKind.LOCAL.value,
        config_source=config_source,
        display_name="Invalid Environment Identity",
        config={},
        secret_ref={},
    )

    with pytest.raises(StorageProfileRouteInvariantError, match="environment-managed storage identity"):
        profiles.build_storage_profile_config_from_record(record, settings=Settings())


@pytest.mark.asyncio
async def test_get_effective_storage_profile_uses_default_profile_key_override(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {"storage": {"default_profile_key": profiles.ENV_DEFAULT_PROFILE_KEY}}

    async def fake_get_or_none(**_kwargs):
        return None

    monkeypatch.setattr("src.settings.runtime.get_core_settings_value_cached", fake_core_settings)
    monkeypatch.setattr("src.models.storage.storage_profile.StorageProfile.get_or_none", fake_get_or_none)

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
    monkeypatch.setattr("src.models.storage.storage_profile.StorageProfile.get_or_none", fake_get_or_none)

    with pytest.raises(ValueError, match="unknown storage profile key"):
        await profiles.get_effective_storage_profile(Settings())
