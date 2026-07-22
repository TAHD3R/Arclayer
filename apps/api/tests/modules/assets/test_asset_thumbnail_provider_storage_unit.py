from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from asyncpg import exceptions as asyncpg_exceptions
from pydantic import SecretStr, ValidationError

from src.config import Settings
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE,
)
from src.modules.assets.jobs.thumbnail_pipeline import AssetThumbnailSource
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    AuthorizedAssetThumbnailOutputStorage,
    ExactAssetThumbnailProviderStorageResolver,
)
from src.modules.jobs.execution_errors import (
    JobExecutionStateInvariantError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.profile_route_service import (
    ResolvedStorageProfileRoute,
    StorageProfileRouteUnavailableError,
)
from src.platform.storage.profile_routes import StorageProfileRoute, StorageProfileRouteBinding
from src.platform.storage.profile_schema import StorageProfileConfig

pytestmark = pytest.mark.unit

_NOW = datetime(2026, 7, 18, 8, tzinfo=UTC)


class _FakeProviderRouteOperations:
    def __init__(
        self,
        *,
        binding: StorageProfileRouteBinding,
        resolved: ResolvedStorageProfileRoute,
    ) -> None:
        self.binding = binding
        self.resolved = resolved
        self.calls: list[tuple[str, object]] = []
        self.materialize_error: Exception | None = None
        self.resolve_binding_error: Exception | None = None
        self.resolve_effect_error: Exception | None = None

    async def materialize_storage_profile_route(self, *, profile_key: str) -> StorageProfileRouteBinding:
        self.calls.append(("materialize", profile_key))
        if self.materialize_error is not None:
            raise self.materialize_error
        return self.binding

    async def resolve_storage_profile_binding(
        self,
        *,
        binding: StorageProfileRouteBinding,
    ) -> ResolvedStorageProfileRoute:
        self.calls.append(("resolve_binding", binding))
        if self.resolve_binding_error is not None:
            raise self.resolve_binding_error
        return self.resolved

    async def resolve_effect_route(self, *, effect_id: UUID) -> ResolvedStorageProfileRoute:
        self.calls.append(("resolve_effect", effect_id))
        if self.resolve_effect_error is not None:
            raise self.resolve_effect_error
        return self.resolved


@pytest.mark.asyncio
async def test_source_read_uses_compatibility_profile_without_authorizing_a_new_route(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    loaded_keys: list[str] = []

    async def load_profile(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
        _ = settings
        loaded_keys.append(profile_key)
        return resolved.config.model_copy(update={"bucket": "current-private"})

    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
        source_profile_loader=load_profile,
    )
    source = _source(
        profile_key="profile-assets",
        provider=ObjectStorageProviderKind.MINIO,
        bucket="recorded-legacy-bucket",
    )

    storage = await resolver.resolve_source_read(source=source)

    assert loaded_keys == ["profile-assets"]
    assert routes.calls == []
    assert storage.profile_key == "profile-assets"
    assert storage.source_bucket == "recorded-legacy-bucket"
    assert storage.provider.bucket == "recorded-legacy-bucket"


@pytest.mark.asyncio
async def test_source_read_uses_canonical_effective_default_key_for_legacy_source(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    calls: list[str] = []

    async def load_default(_settings: Settings) -> str:
        calls.append("default")
        return "database-default"

    async def load_profile(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
        _ = settings
        calls.append(profile_key)
        return resolved.config

    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
        source_profile_loader=load_profile,
        default_profile_key_loader=load_default,
    )

    storage = await resolver.resolve_source_read(
        source=_source(profile_key=None, provider=ObjectStorageProviderKind.LOCAL),
    )

    assert calls == ["default", "database-default"]
    assert routes.calls == []
    assert storage.profile_key == "database-default"
    assert storage.source_bucket is None


@pytest.mark.asyncio
async def test_source_read_rejects_local_asset_bucket(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)

    async def load_profile(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
        _ = (settings, profile_key)
        return resolved.config

    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
        source_profile_loader=load_profile,
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await resolver.resolve_source_read(
            source=_source(
                profile_key="profile-local",
                provider=ObjectStorageProviderKind.LOCAL,
                bucket="invalid-local-bucket",
            )
        )

    assert exc_info.value.code == ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE


@pytest.mark.asyncio
async def test_source_read_maps_retryable_profile_database_failure(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    database_error = asyncpg_exceptions.ConnectionDoesNotExistError("profile connection lost")

    async def fail_profile(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
        _ = (settings, profile_key)
        raise database_error

    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
        source_profile_loader=fail_profile,
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await resolver.resolve_source_read(
            source=_source(profile_key="profile-local", provider=ObjectStorageProviderKind.LOCAL)
        )

    assert exc_info.value.code == ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE
    assert exc_info.value.__cause__ is database_error


@pytest.mark.asyncio
async def test_output_authorization_materializes_then_resolves_exact_active_route(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
    )

    storage = await resolver.authorize_output(
        source=_source(
            profile_key="profile-assets",
            provider=ObjectStorageProviderKind.MINIO,
            bucket="public-assets",
        )
    )

    assert routes.calls == [
        ("materialize", "profile-assets"),
        ("resolve_binding", binding),
    ]
    assert storage.route == binding
    assert storage.profile_key == "profile-assets"
    assert storage.target_bucket == "public-assets"
    assert storage.provider.bucket == "public-assets"
    assert storage.provider.config.endpoint_url == "https://old-storage.example.test"


@pytest.mark.asyncio
async def test_output_authorization_keeps_local_target_bucket_null(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    storage = await resolver.authorize_output(
        source=_source(profile_key="profile-local", provider=ObjectStorageProviderKind.LOCAL)
    )

    assert routes.calls == [
        ("materialize", "profile-local"),
        ("resolve_binding", binding),
    ]
    assert storage.route == binding
    assert storage.target_bucket is None
    assert storage.provider.bucket is None


@pytest.mark.asyncio
async def test_output_authorization_uses_effective_default_key_without_compatibility_profile_read(
    tmp_path: Path,
) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path, profile_key="database-default")
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    default_calls: list[str] = []

    async def load_default(_settings: Settings) -> str:
        default_calls.append("default")
        return "database-default"

    async def forbid_profile_read(*, settings: Settings, profile_key: str) -> StorageProfileConfig:
        _ = (settings, profile_key)
        raise AssertionError("output authorization cannot use the compatibility profile loader")

    resolver = ExactAssetThumbnailProviderStorageResolver(
        settings=Settings(),
        route_operations=routes,
        default_profile_key_loader=load_default,
        source_profile_loader=forbid_profile_read,
    )

    storage = await resolver.authorize_output(
        source=_source(profile_key=None, provider=ObjectStorageProviderKind.MINIO),
    )

    assert default_calls == ["default"]
    assert routes.calls == [
        ("materialize", "database-default"),
        ("resolve_binding", binding),
    ]
    assert storage.target_bucket == "private-assets"


@pytest.mark.asyncio
async def test_output_authorization_rejects_bucket_outside_exact_route(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await resolver.authorize_output(
            source=_source(
                profile_key="profile-assets",
                provider=ObjectStorageProviderKind.MINIO,
                bucket="unrelated-bucket",
            )
        )

    assert exc_info.value.code == ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE
    assert routes.calls == [
        ("materialize", "profile-assets"),
        ("resolve_binding", binding),
    ]


@pytest.mark.asyncio
async def test_output_authorization_rejects_non_exact_resolution_as_invariant(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    mismatched_binding = binding.model_copy(update={"profile_revision_id": uuid4()})
    routes = _FakeProviderRouteOperations(
        binding=binding,
        resolved=resolved.model_copy(update={"binding": mismatched_binding}),
    )
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(JobExecutionStateInvariantError, match="exact materialized route"):
        await resolver.authorize_output(
            source=_source(profile_key="profile-assets", provider=ObjectStorageProviderKind.MINIO)
        )


@pytest.mark.asyncio
async def test_output_authorization_rejects_route_topology_substitution_as_invariant(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    substituted = resolved.model_copy(
        update={
            "config": resolved.config.model_copy(update={"endpoint_url": "https://substituted-storage.example.test"})
        }
    )
    routes = _FakeProviderRouteOperations(binding=binding, resolved=substituted)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(JobExecutionStateInvariantError, match="exact immutable route"):
        await resolver.authorize_output(
            source=_source(profile_key="profile-assets", provider=ObjectStorageProviderKind.MINIO)
        )


@pytest.mark.asyncio
async def test_output_authorization_preserves_route_invariant_failure(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    invariant = JobExecutionStateInvariantError("persisted effect route drift")
    routes.resolve_binding_error = invariant
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(JobExecutionStateInvariantError) as exc_info:
        await resolver.authorize_output(
            source=_source(profile_key="profile-assets", provider=ObjectStorageProviderKind.MINIO)
        )

    assert exc_info.value is invariant


@pytest.mark.asyncio
async def test_output_authorization_maps_unavailable_profile_to_permanent_failure(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    routes.materialize_error = StorageProfileRouteUnavailableError("inactive profile")
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await resolver.authorize_output(
            source=_source(profile_key="profile-assets", provider=ObjectStorageProviderKind.MINIO)
        )

    assert exc_info.value.code == ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE


@pytest.mark.asyncio
async def test_output_authorization_maps_retryable_postgres_failure(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    database_error = asyncpg_exceptions.ConnectionDoesNotExistError("route connection lost")
    routes.resolve_binding_error = database_error
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await resolver.authorize_output(
            source=_source(profile_key="profile-assets", provider=ObjectStorageProviderKind.MINIO)
        )

    assert exc_info.value.code == ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE
    assert exc_info.value.__cause__ is database_error


@pytest.mark.asyncio
async def test_effect_cleanup_resolves_only_effect_exact_historical_route(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    manifest = _manifest(target_bucket="public-assets")
    effect = _effect(binding=binding, manifest=manifest)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    storage = await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert routes.calls == [("resolve_effect", effect.id)]
    assert storage.route == binding
    assert storage.target_bucket == "public-assets"
    assert storage.provider.bucket == "public-assets"
    assert storage.provider.config.endpoint_url == "https://old-storage.example.test"
    assert storage.provider.config.access_key_id == "rotated-access-key"
    assert storage.provider.config.secret_access_key is not None
    assert storage.provider.config.secret_access_key.get_secret_value() == "rotated-secret"


@pytest.mark.asyncio
async def test_effect_cleanup_preserves_null_bucket_for_local_historical_route(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    manifest = _manifest(target_bucket=None)
    effect = _effect(binding=binding, manifest=manifest)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    storage = await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert routes.calls == [("resolve_effect", effect.id)]
    assert storage.route == binding
    assert storage.target_bucket is None
    assert storage.provider.bucket is None


@pytest.mark.asyncio
async def test_effect_cleanup_rejects_resolved_profile_or_revision_drift(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    manifest = _manifest(target_bucket="private-assets")
    effect = _effect(binding=binding, manifest=manifest)
    drifted = binding.model_copy(update={"profile_id": uuid4()})
    routes = _FakeProviderRouteOperations(
        binding=binding,
        resolved=resolved.model_copy(update={"binding": drifted}),
    )
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(JobExecutionStateInvariantError, match="persisted Profile and Revision"):
        await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)


@pytest.mark.asyncio
async def test_effect_cleanup_rejects_manifest_bucket_outside_historical_route(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    manifest = _manifest(target_bucket="unrelated-bucket")
    effect = _effect(binding=binding, manifest=manifest)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert exc_info.value.code == ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE


@pytest.mark.asyncio
async def test_effect_cleanup_rejects_bucket_for_local_historical_route(tmp_path: Path) -> None:
    binding, resolved = _local_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    manifest = _manifest(target_bucket="invalid-local-bucket")
    effect = _effect(binding=binding, manifest=manifest)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert exc_info.value.code == ASSET_THUMBNAIL_STORAGE_UNSUPPORTED_CODE


@pytest.mark.asyncio
async def test_effect_cleanup_maps_retryable_postgres_failure(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    database_error = asyncpg_exceptions.ConnectionDoesNotExistError("effect route connection lost")
    routes.resolve_effect_error = database_error
    manifest = _manifest(target_bucket="private-assets")
    effect = _effect(binding=binding, manifest=manifest)
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert exc_info.value.code == ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE
    assert exc_info.value.__cause__ is database_error


@pytest.mark.asyncio
async def test_effect_cleanup_rejects_cross_job_manifest_before_route_resolution(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    routes = _FakeProviderRouteOperations(binding=binding, resolved=resolved)
    manifest = _manifest(target_bucket="private-assets")
    effect = _effect(binding=binding, manifest=manifest).model_copy(update={"job_id": uuid4()})
    resolver = ExactAssetThumbnailProviderStorageResolver(settings=Settings(), route_operations=routes)

    with pytest.raises(JobExecutionStateInvariantError, match="another thumbnail Job"):
        await resolver.resolve_effect_cleanup(effect=effect, manifest=manifest)

    assert routes.calls == []


def test_output_storage_model_is_strict_frozen_and_forbids_extra(tmp_path: Path) -> None:
    binding, resolved = _object_route(tmp_path=tmp_path)
    provider = build_storage_provider(resolved.config).with_bucket("private-assets")
    storage = AuthorizedAssetThumbnailOutputStorage(
        route=binding,
        profile_key="profile-assets",
        provider=provider,
        target_bucket="private-assets",
    )

    with pytest.raises(ValidationError):
        storage.target_bucket = "public-assets"
    with pytest.raises(ValidationError):
        AuthorizedAssetThumbnailOutputStorage.model_validate({
            **storage.model_dump(),
            "target_bucket": 123,
            "unexpected": True,
        })


def _source(
    *,
    profile_key: str | None,
    provider: ObjectStorageProviderKind,
    bucket: str | None = None,
) -> AssetThumbnailSource:
    return AssetThumbnailSource(
        asset_id=uuid4(),
        project_id=uuid4(),
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider=provider,
        storage_profile_key=profile_key,
        storage_bucket=bucket,
        object_key="assets/source.png",
    )


def _object_route(
    *,
    tmp_path: Path,
    profile_key: str = "profile-assets",
) -> tuple[StorageProfileRouteBinding, ResolvedStorageProfileRoute]:
    route = StorageProfileRoute(
        provider=ObjectStorageProviderKind.MINIO,
        endpoint_url="https://old-storage.example.test",
        region="us-east-1",
        bucket="private-assets",
        public_bucket="public-assets",
        force_path_style=True,
    )
    binding = StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash="a" * 64,
        route=route,
    )
    return binding, ResolvedStorageProfileRoute(
        binding=binding,
        profile_key=profile_key,
        config=StorageProfileConfig(
            provider=ObjectStorageProviderKind.MINIO,
            endpoint_url=route.endpoint_url,
            region=route.region,
            bucket=route.bucket,
            public_bucket=route.public_bucket,
            force_path_style=route.force_path_style,
            access_key_id="rotated-access-key",
            secret_access_key=SecretStr("rotated-secret"),
            secret_access_key_ref="record:profile-id:secret_access_key",
            local_tmp_dir=tmp_path / "scratch",
        ),
        is_tombstoned=False,
    )


def _local_route(
    *,
    tmp_path: Path,
) -> tuple[StorageProfileRouteBinding, ResolvedStorageProfileRoute]:
    route = StorageProfileRoute(
        provider=ObjectStorageProviderKind.LOCAL,
        local_root_dir=str(tmp_path / "objects"),
    )
    binding = StorageProfileRouteBinding(
        profile_id=uuid4(),
        profile_revision_id=uuid4(),
        route_hash="b" * 64,
        route=route,
    )
    return binding, ResolvedStorageProfileRoute(
        binding=binding,
        profile_key="profile-local",
        config=StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "objects",
            local_tmp_dir=tmp_path / "scratch",
        ),
        is_tombstoned=False,
    )


def _manifest(*, target_bucket: str | None) -> AssetThumbnailProviderEffectManifestV1:
    job_id = uuid4()
    project_id = uuid4()
    asset_id = uuid4()
    return AssetThumbnailProviderEffectManifestV1(
        job_id=job_id,
        project_id=project_id,
        asset_id=asset_id,
        request_fingerprint="c" * 64,
        source_revision="d" * 64,
        thumbnail_profile_version=1,
        target_bucket=target_bucket,
        outputs=(
            AssetThumbnailProviderOutputV1(
                width=400,
                object_key=(f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-400.jpg"),
            ),
        ),
    )


def _effect(
    *,
    binding: StorageProfileRouteBinding,
    manifest: AssetThumbnailProviderEffectManifestV1,
) -> ProviderEffectSnapshot:
    manifest_json = manifest.model_dump(mode="json", by_alias=False)
    return ProviderEffectSnapshot(
        id=uuid4(),
        job_id=manifest.job_id,
        owner_attempt_id=uuid4(),
        profile_id=binding.profile_id,
        profile_revision_id=binding.profile_revision_id,
        effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
        effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
        schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
        manifest=manifest_json,
        manifest_hash=hash_json(manifest_json),
        disposition=ProviderEffectDisposition.ACTIVE,
        registered_at=_NOW,
    )
