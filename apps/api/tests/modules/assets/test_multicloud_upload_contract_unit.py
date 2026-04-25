from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.config import Settings
from src.core.exceptions import BadRequest
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.naming.service import build_scoped_asset_object_key
from src.modules.assets.scope import AssetScope
from src.platform.storage.capabilities import ObjectStorageCapabilities, ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig


class FakeRemoteProvider:
    def __init__(self, *, capabilities: ObjectStorageCapabilities) -> None:
        self.capabilities = capabilities
        self.bucket: str | None = None
        self.ensure_bucket_calls = 0
        self.multipart_calls: list[tuple[str, str | None]] = []

    @property
    def provider(self) -> str:
        return "fake-remote"

    def with_bucket(self, bucket: str):
        self.bucket = bucket
        return self

    async def ensure_bucket(self) -> bool:
        self.ensure_bucket_calls += 1
        return True

    async def create_multipart_upload(self, *, object_key: str, content_type: str | None) -> str:
        self.multipart_calls.append((object_key, content_type))
        return "upload-123"


def _settings() -> Settings:
    base = Settings()
    return base.model_copy(
        update={
            "storage": base.storage.model_copy(
                update={
                    "local_root_dir": base.storage.local_root_dir,
                    "local_tmp_dir": base.storage.local_tmp_dir,
                    "upload_chunk_size_mb": 8,
                    "upload_max_file_size_mb": 64,
                }
            )
        }
    )


@asynccontextmanager
async def _unit_connection(**_kwargs) -> AsyncIterator[None]:
    yield None


@pytest.mark.asyncio
async def test_local_upload_path_uses_local_object_key(monkeypatch: pytest.MonkeyPatch) -> None:
    service = UploadsService(_settings())
    scope_id = uuid4()
    scope = AssetScope(type=ASSET_SCOPE_PROJECT, id=scope_id)
    captured: dict[str, object] = {}

    async def fake_create_session(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(**kwargs)

    monkeypatch.setattr(service.repo, "create_session", fake_create_session)
    monkeypatch.setattr(service.repo, "connection", _unit_connection)

    async def fake_get_effective_settings(_settings):
        return _settings

    monkeypatch.setattr("src.modules.assets.admin.uploads.service.get_effective_settings", fake_get_effective_settings)

    async def fake_get_effective_storage_profile(_settings):
        return (
            "local-main",
            StorageProfileConfig(
                provider=ObjectStorageProviderKind.LOCAL,
                local_root_dir=_settings.storage.local_root_dir,
                local_tmp_dir=_settings.storage.local_tmp_dir,
            ),
        )

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        fake_get_effective_storage_profile,
    )

    session = await service.init_upload(
        scope=scope,
        actor_user_id=uuid4(),
        purpose="library",
        filename="demo.png",
        mime="image/png",
        size_bytes=12,
        expected_sha256=None,
        requested_visibility="private",
        requested_indexable=False,
        target_folder_id=None,
    )

    expected_key = build_scoped_asset_object_key(
        scope=ASSET_SCOPE_PROJECT,
        scope_id=scope_id,
        asset_id=session.reserved_asset_id,
        ext="png",
    )
    assert session.storage_provider == ObjectStorageProviderKind.LOCAL.value
    assert session.storage_profile_key == "local-main"
    assert session.object_key == expected_key
    assert session.multipart_upload_id is None


@pytest.mark.asyncio
async def test_remote_multipart_path_uses_capabilities(monkeypatch: pytest.MonkeyPatch) -> None:
    service = UploadsService(_settings())
    scope = AssetScope(type=ASSET_SCOPE_PROJECT, id=uuid4())
    captured: dict[str, object] = {}
    provider = FakeRemoteProvider(
        capabilities=ObjectStorageCapabilities(
            supports_bucket_create=True,
            supports_multipart_upload=True,
            supports_presigned_upload=True,
            supports_presigned_download=True,
            supports_server_side_copy=True,
            supports_public_bucket=True,
            supports_path_style=False,
            supports_custom_public_base_url=True,
        )
    )

    async def fake_create_session(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(**kwargs)

    monkeypatch.setattr(service.repo, "create_session", fake_create_session)
    monkeypatch.setattr(service.repo, "connection", _unit_connection)

    async def fake_get_effective_settings(_settings):
        return _settings

    monkeypatch.setattr("src.modules.assets.admin.uploads.service.get_effective_settings", fake_get_effective_settings)

    profile = StorageProfileConfig(
        provider=ObjectStorageProviderKind.AWS_S3,
        bucket="assets-private",
        public_bucket="assets-public",
        access_key_id="key",
        secret_access_key="secret",
        endpoint_url="https://s3.example.com",
        local_root_dir=service.settings.storage.local_root_dir,
        local_tmp_dir=service.settings.storage.local_tmp_dir,
    )

    async def fake_get_effective_storage_profile(_settings):
        return ("cloud-main", profile)

    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        fake_get_effective_storage_profile,
    )
    monkeypatch.setattr("src.modules.assets.admin.uploads.service.build_storage_provider", lambda _profile: provider)

    async def fake_build_remote_provider(**_kwargs):
        return provider

    monkeypatch.setattr(service, "_build_remote_provider", fake_build_remote_provider)

    session = await service.init_upload(
        scope=scope,
        actor_user_id=uuid4(),
        purpose="library",
        filename="demo.png",
        mime="image/png",
        size_bytes=6 * 1024 * 1024,
        expected_sha256=None,
        requested_visibility="public",
        requested_indexable=False,
        target_folder_id=None,
    )

    assert session.storage_provider == ObjectStorageProviderKind.AWS_S3.value
    assert session.storage_profile_key == "cloud-main"
    assert session.s3_bucket == "assets-public"
    assert session.multipart_upload_id == "upload-123"
    assert provider.ensure_bucket_calls == 1
    assert provider.multipart_calls


@pytest.mark.asyncio
async def test_remote_provider_without_bucket_create_skips_ensure(monkeypatch: pytest.MonkeyPatch) -> None:
    service = UploadsService(_settings())
    scope = AssetScope(type=ASSET_SCOPE_PROJECT, id=uuid4())
    provider = FakeRemoteProvider(
        capabilities=ObjectStorageCapabilities(
            supports_bucket_create=False,
            supports_multipart_upload=True,
            supports_presigned_upload=True,
            supports_presigned_download=True,
            supports_server_side_copy=True,
            supports_public_bucket=False,
            supports_path_style=False,
            supports_custom_public_base_url=True,
        )
    )

    async def fake_create_session(**kwargs):
        return SimpleNamespace(**kwargs)

    monkeypatch.setattr(service.repo, "create_session", fake_create_session)
    monkeypatch.setattr(service.repo, "connection", _unit_connection)

    async def fake_get_effective_settings(_settings):
        return _settings

    async def fake_get_effective_storage_profile(_settings):
        return (
            "r2-main",
            StorageProfileConfig(
                provider=ObjectStorageProviderKind.CLOUDFLARE_R2,
                bucket="assets",
                access_key_id="key",
                secret_access_key="secret",
                endpoint_url="https://r2.example.com",
                public_base_url="https://cdn.example.com",
                local_root_dir=service.settings.storage.local_root_dir,
                local_tmp_dir=service.settings.storage.local_tmp_dir,
            ),
        )

    monkeypatch.setattr("src.modules.assets.admin.uploads.service.get_effective_settings", fake_get_effective_settings)
    monkeypatch.setattr(
        "src.modules.assets.admin.uploads.service.get_effective_storage_profile",
        fake_get_effective_storage_profile,
    )
    monkeypatch.setattr("src.modules.assets.admin.uploads.service.build_storage_provider", lambda _profile: provider)

    async def fake_build_remote_provider(**_kwargs):
        return provider

    monkeypatch.setattr(service, "_build_remote_provider", fake_build_remote_provider)

    session = await service.init_upload(
        scope=scope,
        actor_user_id=uuid4(),
        purpose="library",
        filename="demo.png",
        mime="image/png",
        size_bytes=6 * 1024 * 1024,
        expected_sha256=None,
        requested_visibility="public",
        requested_indexable=False,
        target_folder_id=None,
    )

    assert session.s3_bucket == "assets"
    assert provider.ensure_bucket_calls == 0


def test_r2_direct_delivery_uses_custom_public_base_url() -> None:
    service = AdminAssetsService(_settings())
    profile = StorageProfileConfig(
        provider=ObjectStorageProviderKind.CLOUDFLARE_R2,
        bucket="assets",
        public_base_url="https://cdn.example.com",
        public_delivery_mode="direct",
        access_key_id="key",
        secret_access_key="secret",
        endpoint_url="https://r2.example.com",
    )

    assert service._can_direct_deliver(profile=profile, storage_bucket=None) is True


@pytest.mark.asyncio
async def test_missing_copy_capability_raises_stable_error() -> None:
    service = AdminAssetsService(_settings())
    profile = SimpleNamespace(
        bucket="assets-private",
        public_bucket="assets-public",
        capabilities=SimpleNamespace(
            supports_bucket_create=False,
            supports_server_side_copy=False,
        ),
    )
    provider = FakeRemoteProvider(
        capabilities=ObjectStorageCapabilities(
            supports_bucket_create=False,
            supports_multipart_upload=True,
            supports_presigned_upload=True,
            supports_presigned_download=True,
            supports_server_side_copy=False,
            supports_public_bucket=True,
            supports_path_style=False,
            supports_custom_public_base_url=True,
        )
    )
    asset = SimpleNamespace(storage_bucket="assets-private", object_key="assets/demo.bin", variants=None)

    with pytest.raises(BadRequest) as exc:
        await service._sync_remote_bucket_for_visibility(
            profile=profile,
            provider=provider,
            asset=asset,
            target_visibility="public",
        )

    assert exc.value.error == "ASSET_VISIBILITY_SYNC_FAILED"
