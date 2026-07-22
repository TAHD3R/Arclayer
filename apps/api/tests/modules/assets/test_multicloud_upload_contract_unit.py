from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import SecretStr
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import ASSET_SCOPE_PROJECT
from src.config import Settings
from src.core.exceptions import BadRequest
from src.modules.assets.admin.assets.service import AdminAssetsService
from src.modules.assets.admin.uploads.schema import build_upload_init_out
from src.modules.assets.admin.uploads.service import UploadsService
from src.modules.assets.jobs import is_asset_thumbnail_previewable
from src.modules.assets.naming.service import build_scoped_asset_object_key
from src.modules.assets.scope import AssetScope
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope
from src.platform.storage.capabilities import ObjectStorageCapabilities, ObjectStorageProviderKind
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.s3 import S3StorageProvider


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


def test_upload_init_out_maps_remote_providers_to_s3_multipart() -> None:
    now = datetime.now(UTC)
    session = SimpleNamespace(
        id=uuid4(),
        chunk_size=8 * 1024 * 1024,
        total_parts=1,
        expires_at=now,
        storage_provider=ObjectStorageProviderKind.AWS_S3.value,
        reserved_asset_id=uuid4(),
        object_key="projects/demo/assets/demo.png",
    )

    out = build_upload_init_out(session)

    assert out.method == "s3_multipart"


def test_upload_init_out_keeps_local_method() -> None:
    now = datetime.now(UTC)
    session = SimpleNamespace(
        id=uuid4(),
        chunk_size=8 * 1024 * 1024,
        total_parts=1,
        expires_at=now,
        storage_provider=ObjectStorageProviderKind.LOCAL.value,
        reserved_asset_id=uuid4(),
        object_key="projects/demo/assets/demo.png",
    )

    out = build_upload_init_out(session)

    assert out.method == "local"


@pytest.mark.parametrize(
    ("mime", "ext", "expected"),
    [
        ("image/png", "png", True),
        ("application/pdf", "pdf", True),
        ("video/mp4", "mp4", True),
        ("application/zip", "zip", False),
    ],
)
def test_asset_thumbnail_job_previewable_types(mime: str, ext: str, expected: bool) -> None:
    assert is_asset_thumbnail_previewable(mime=mime, ext=ext) is expected


@asynccontextmanager
async def _unit_connection(**kwargs) -> AsyncIterator[BaseDBAsyncClient | None]:
    yield cast(BaseDBAsyncClient | None, kwargs.get("conn"))


def _tenant_context(*, project_id: UUID) -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=project_id,
            runtime_id=uuid4(),
            site_id=None,
            schema_name="workspace_1234567890abcdefghij",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.PROJECT,
    )


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
        secret_access_key=SecretStr("secret"),
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
                secret_access_key=SecretStr("secret"),
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
        secret_access_key=SecretStr("secret"),
        endpoint_url="https://r2.example.com",
    )

    assert service._can_direct_deliver(profile=profile, storage_bucket=None) is True


def test_local_direct_delivery_uses_public_asset_path() -> None:
    service = AdminAssetsService(_settings())
    profile = StorageProfileConfig(
        provider=ObjectStorageProviderKind.LOCAL,
        public_base_url="http://localhost:8000",
        public_delivery_mode="direct",
        local_root_dir=service.settings.storage.local_root_dir,
        local_tmp_dir=service.settings.storage.local_tmp_dir,
    )

    assert service._can_direct_deliver(profile=profile, storage_bucket=None) is True
    assert (
        service._build_public_direct_url(
            base_url=profile.public_base_url,
            object_key="/assets/example-id/demo.png",
        )
        == "http://localhost:8000/assets/example-id/demo.png"
    )


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
            provider=cast(S3StorageProvider, provider),
            asset=asset,
            target_visibility="public",
        )

    assert exc.value.error == "ASSET_VISIBILITY_SYNC_FAILED"
