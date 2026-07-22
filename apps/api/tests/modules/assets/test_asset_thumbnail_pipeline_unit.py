from __future__ import annotations

import asyncio
import shutil
import threading
from datetime import UTC, datetime
from typing import Literal, Never, cast
from uuid import uuid4

import pytest
from PIL import Image

import src.modules.assets.jobs.thumbnail_pipeline as thumbnail_pipeline_module
from src.common.types.json_types import JsonObject
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.modules.assets.jobs.thumbnail_pipeline import (
    AssetThumbnailPipelineOperation,
    AssetThumbnailSource,
    StorageAssetThumbnailPipeline,
)
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectEvidence,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
    ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
    AssetThumbnailProviderEffectManifestV1,
    AssetThumbnailProviderOutputV1,
    build_asset_thumbnail_output_identity,
)
from src.modules.assets.jobs.thumbnail_provider_storage import (
    AuthorizedAssetThumbnailOutputStorage,
    ResolvedAssetThumbnailSourceStorage,
)
from src.modules.jobs.execution_errors import (
    JobExecutionStateInvariantError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.provider_effect_schema import ProviderEffectSnapshot
from src.platform.assets.thumbnails import PreviewRendererTemporarilyUnavailableError
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.errors import (
    StorageAccessDeniedError,
    StorageObjectNotFoundError,
    StorageRateLimitedError,
    StorageTemporarilyUnavailableError,
)
from src.platform.storage.local import LocalStorageProvider, safe_object_key_to_path
from src.platform.storage.profile_routes import StorageProfileRoute, StorageProfileRouteBinding
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.providers.base import ObjectHead

pytestmark = pytest.mark.unit


class _StaticStorageResolver:
    def __init__(
        self,
        source_provider: LocalStorageProvider,
        *,
        output_provider: LocalStorageProvider | None = None,
    ) -> None:
        self.source_provider = source_provider
        self.output_provider = output_provider or source_provider
        self.route = StorageProfileRouteBinding(
            profile_id=uuid4(),
            profile_revision_id=uuid4(),
            route_hash="a" * 64,
            route=StorageProfileRoute(
                provider=ObjectStorageProviderKind.LOCAL,
                local_root_dir=str(self.output_provider.root_dir),
            ),
        )

    async def resolve_source_read(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> ResolvedAssetThumbnailSourceStorage:
        assert source.storage_provider == self.source_provider.provider
        return ResolvedAssetThumbnailSourceStorage(
            provider=self.source_provider,
            profile_key=source.storage_profile_key or "env-default",
            source_bucket=None,
        )

    async def authorize_output(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> AuthorizedAssetThumbnailOutputStorage:
        assert source.storage_provider == self.output_provider.provider
        return AuthorizedAssetThumbnailOutputStorage(
            provider=self.output_provider,
            route=self.route,
            target_bucket=None,
            profile_key=source.storage_profile_key or "env-default",
        )


class _RecordingControl:
    def __init__(self) -> None:
        self.phases: list[tuple[str, int]] = []
        self.checkpoint_count = 0
        self.registrations: list[
            tuple[
                AssetThumbnailPipelineOperation,
                StorageProfileRouteBinding,
                str | None,
                tuple[AssetThumbnailProviderOutputV1, ...],
            ]
        ] = []
        self.effect_id = uuid4()
        self.output_identity: str | None = None
        self.registration_error: Exception | None = None

    async def checkpoint(self) -> None:
        self.checkpoint_count += 1

    async def report_phase(self, phase: str, *, completed: int) -> None:
        self.phases.append((phase, completed))

    async def register_generated_outputs(
        self,
        *,
        operation: AssetThumbnailPipelineOperation,
        route: StorageProfileRouteBinding,
        target_bucket: str | None,
        outputs: tuple[AssetThumbnailProviderOutputV1, ...],
    ) -> AssetThumbnailProviderEffectEvidence:
        if self.registration_error is not None:
            raise self.registration_error
        self.registrations.append((operation, route, target_bucket, outputs))
        manifest = AssetThumbnailProviderEffectManifestV1(
            job_id=operation.job_id,
            project_id=operation.project_id,
            asset_id=operation.asset_id,
            request_fingerprint="f" * 64,
            source_revision="a" * 64,
            thumbnail_profile_version=cast(Literal[1], operation.thumbnail_profile_version),
            target_bucket=target_bucket,
            outputs=outputs,
        )
        manifest_json = cast(JsonObject, manifest.model_dump(mode="json", by_alias=False))
        effect = ProviderEffectSnapshot(
            id=self.effect_id,
            job_id=operation.job_id,
            owner_attempt_id=operation.attempt_id,
            profile_id=route.profile_id,
            profile_revision_id=route.profile_revision_id,
            effect_type=ASSET_THUMBNAIL_PROVIDER_EFFECT_TYPE,
            effect_key=ASSET_THUMBNAIL_PROVIDER_EFFECT_KEY,
            schema_version=ASSET_THUMBNAIL_PROVIDER_EFFECT_SCHEMA_VERSION,
            manifest=manifest_json,
            manifest_hash=hash_json(manifest_json),
            disposition=ProviderEffectDisposition.ACTIVE,
            registered_at=datetime.now(UTC),
        )
        self.output_identity = build_asset_thumbnail_output_identity(effect=effect, manifest=manifest)
        return AssetThumbnailProviderEffectEvidence(
            effect=effect,
            manifest=manifest,
            output_identity=self.output_identity,
        )


def _registered_outputs(control: _RecordingControl) -> tuple[AssetThumbnailProviderOutputV1, ...]:
    assert len(control.registrations) == 1
    return control.registrations[0][3]


class _StorageMustNotResolve:
    async def resolve_source_read(self, *, source: AssetThumbnailSource) -> Never:
        raise AssertionError(f"unsupported media must fail before storage resolution: {source.mime}")

    async def authorize_output(self, *, source: AssetThumbnailSource) -> Never:
        raise AssertionError(f"unsupported media must not authorize output storage: {source.mime}")


class _FailingStorageResolver:
    def __init__(self) -> None:
        self.calls = 0

    async def resolve_source_read(self, *, source: AssetThumbnailSource) -> Never:
        self.calls += 1
        raise PermanentJobExecutionError(
            code="ASSET_THUMBNAIL_STORAGE_UNSUPPORTED",
            safe_message=f"Storage is unavailable for {source.object_key}",
        )

    async def authorize_output(self, *, source: AssetThumbnailSource) -> Never:
        raise AssertionError(f"failed source read must not authorize output storage: {source}")


class _UnavailableSourceProvider(LocalStorageProvider):
    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        raise OSError(f"temporary source outage for {object_key} -> {out_path}")


class _PermissionDeniedSourceProvider(LocalStorageProvider):
    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        raise PermissionError(f"source access is misconfigured for {object_key} -> {out_path}")


class _RateLimitedSourceProvider(LocalStorageProvider):
    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        _ = out_path
        raise StorageRateLimitedError(
            provider=self.provider,
            operation="download_object_to_path",
            object_key=object_key,
            retry_after_seconds=17,
        )


class _TypedUnavailableSourceProvider(LocalStorageProvider):
    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        _ = out_path
        raise StorageTemporarilyUnavailableError(
            provider=self.provider,
            operation="download_object_to_path",
            object_key=object_key,
        )


class _UnavailableThumbnailStorageProvider(LocalStorageProvider):
    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        raise StorageTemporarilyUnavailableError(
            provider=self.provider,
            operation="put_object_bytes",
            object_key=object_key,
        )


class _ManifestRequiredThumbnailStorageProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        super().__init__(config)
        self.control: _RecordingControl | None = None

    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        assert self.control is not None
        assert self.control.registrations
        await super().put_object_bytes(
            object_key=object_key,
            data=data,
            content_type=content_type,
            cache_control=cache_control,
        )


class _ResponseLostThumbnailStorageProvider(LocalStorageProvider):
    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        await super().put_object_bytes(
            object_key=object_key,
            data=data,
            content_type=content_type,
            cache_control=cache_control,
        )
        raise StorageTemporarilyUnavailableError(
            provider=self.provider,
            operation="put_object_bytes",
            object_key=object_key,
        )


class _AccessDeniedThumbnailStorageProvider(LocalStorageProvider):
    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        _ = data, content_type, cache_control
        raise StorageAccessDeniedError(
            provider=self.provider,
            operation="put_object_bytes",
            object_key=object_key,
        )


class _UnavailableCleanupStorageProvider(LocalStorageProvider):
    async def delete_object(self, *, object_key: str) -> None:
        raise StorageTemporarilyUnavailableError(
            provider=self.provider,
            operation="delete_object",
            object_key=object_key,
        )


class _NotFoundCleanupStorageProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        super().__init__(config)
        self.deleted_keys: list[str] = []

    async def delete_object(self, *, object_key: str) -> None:
        self.deleted_keys.append(object_key)
        raise StorageObjectNotFoundError(
            provider=self.provider,
            object_key=object_key,
        )


class _BlockingThreadSourceProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        super().__init__(config)
        self.started = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()

    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        def _call() -> ObjectHead:
            self.started.set()
            self.release.wait()
            source_path = safe_object_key_to_path(self.root_dir, object_key)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source_path, out_path)
            self.finished.set()
            return ObjectHead(
                size_bytes=source_path.stat().st_size,
                content_type="image/png",
                etag=None,
            )

        return await asyncio.to_thread(_call)


class _RecordingDownloadPathProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        super().__init__(config)
        self.out_paths = []

    async def download_object_to_path(self, *, object_key, out_path):  # type: ignore[no-untyped-def]
        self.out_paths.append(out_path)
        return await super().download_object_to_path(object_key=object_key, out_path=out_path)


class _BlockingThreadUploadProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig) -> None:
        super().__init__(config)
        self.started = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()

    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        _ = content_type, cache_control

        def _call() -> None:
            self.started.set()
            self.release.wait()
            self.put_bytes(object_key=object_key, data=data)
            self.finished.set()

        await asyncio.to_thread(_call)


class _RegistrationRequiredControl(_RecordingControl):
    def __init__(self) -> None:
        super().__init__()
        self.registered_outputs: tuple[AssetThumbnailProviderOutputV1, ...] | None = None

    async def register_generated_outputs(
        self,
        *,
        operation,
        route,
        target_bucket,
        outputs,
    ) -> AssetThumbnailProviderEffectEvidence:
        evidence = await super().register_generated_outputs(
            operation=operation,
            route=route,
            target_bucket=target_bucket,
            outputs=outputs,
        )
        self.registered_outputs = outputs
        return evidence


class _RegistrationRequiredProvider(LocalStorageProvider):
    def __init__(self, config: StorageProfileConfig, *, control: _RegistrationRequiredControl) -> None:
        super().__init__(config)
        self.control = control

    async def put_object_bytes(  # type: ignore[no-untyped-def]
        self,
        *,
        object_key,
        data,
        content_type,
        cache_control=None,
    ):
        assert self.control.registered_outputs is not None
        await super().put_object_bytes(
            object_key=object_key,
            data=data,
            content_type=content_type,
            cache_control=cache_control,
        )


@pytest.mark.asyncio
async def test_pipeline_registers_complete_normalized_effect_before_first_provider_write(tmp_path) -> None:
    source_root = tmp_path / "source-objects"
    output_root = tmp_path / "output-objects"
    scratch = tmp_path / "scratch"
    control = _RegistrationRequiredControl()
    source_provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=source_root,
            local_tmp_dir=scratch,
        )
    )
    output_provider = _RegistrationRequiredProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=output_root,
            local_tmp_dir=scratch,
        ),
        control=control,
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(source_root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400, 800, 1200, 1600),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(
            source_provider,
            output_provider=output_provider,
        ),
    )

    result = await pipeline.execute(source=source, operation=operation, control=control)

    expected_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-300.jpg"
    assert control.registered_outputs is not None
    assert [(output.width, output.object_key) for output in control.registered_outputs] == [(300, expected_key)]
    operation_seen, route_seen, target_bucket_seen, _ = control.registrations[0]
    assert operation_seen == operation
    assert route_seen.route.local_root_dir == str(output_root)
    assert target_bucket_seen is None
    assert result.effect_id == control.effect_id
    assert result.output_identity == control.output_identity
    assert safe_object_key_to_path(output_root, expected_key).is_file()
    assert not safe_object_key_to_path(source_root, expected_key).exists()


@pytest.mark.asyncio
async def test_pipeline_does_not_write_when_effect_registration_is_rejected(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    control = _RecordingControl()
    control.registration_error = JobExecutionStateInvariantError("Coordinator rejected terminal Provider Effect replay")
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(JobExecutionStateInvariantError):
        await pipeline.execute(source=source, operation=operation, control=control)

    expected_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-300.jpg"
    assert control.registrations == []
    assert not safe_object_key_to_path(root, expected_key).exists()
    await pipeline.remove_job_scratch(job_id=job_id)


@pytest.mark.asyncio
async def test_local_pipeline_generates_and_uploads_job_owned_thumbnail(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _ManifestRequiredThumbnailStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        storage_profile_key=None,
        storage_bucket=None,
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400, 800, 1200, 1600),
        idempotency_key="d" * 64,
    )
    control = _RecordingControl()
    provider.control = control
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    result = await pipeline.execute(
        source=source,
        operation=operation,
        control=control,
    )

    expected_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-300.jpg"
    assert result.produced_widths == (300,)
    assert result.variants["thumbnails"] == [
        {
            "name": "thumb_300",
            "width": 300,
            "height": 200,
            "mime": "image/jpeg",
            "ext": "jpg",
            "object_key": expected_key,
            "size_bytes": safe_object_key_to_path(root, expected_key).stat().st_size,
        }
    ]
    assert safe_object_key_to_path(root, expected_key).is_file()
    assert control.phases == [
        ("rendering_preview", 1),
        ("generating", 2),
        ("uploading", 3),
    ]
    assert control.checkpoint_count >= 4


@pytest.mark.asyncio
async def test_pipeline_never_uses_untrusted_extension_in_scratch_path(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _RecordingDownloadPathProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="../../../../escape.png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    await pipeline.execute(source=source, operation=operation, control=_RecordingControl())

    assert provider.out_paths == [
        scratch / "thumbnail-jobs" / str(operation.job_id) / str(operation.attempt_id) / "source.bin"
    ]
    assert not (tmp_path / "escape.png").exists()


@pytest.mark.asyncio
async def test_pipeline_rejects_unsupported_media_with_permanent_typed_error(tmp_path) -> None:
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="text/plain",
        ext="txt",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.txt",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=tmp_path,
        storage_resolver=_StorageMustNotResolve(),
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_MEDIA_UNSUPPORTED"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_pipeline_reports_missing_canonical_source_as_permanent_failure(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/missing.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_SOURCE_NOT_FOUND"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_pipeline_reports_deterministic_image_decode_failure_without_retry(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/corrupt.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(b"not-a-png")
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_RENDER_FAILED"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_pipeline_classifies_preview_renderer_infrastructure_failure_as_retryable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.pdf"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(b"%PDF-1.4")
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="application/pdf",
        ext="pdf",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )

    async def _renderer_unavailable(**_kwargs: object):  # type: ignore[no-untyped-def]
        raise PreviewRendererTemporarilyUnavailableError("renderer process cannot start")

    monkeypatch.setattr(thumbnail_pipeline_module, "render_preview_source", _renderer_unavailable)
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.execute(source=source, operation=operation, control=_RecordingControl())

    assert exc_info.value.code == "ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None


@pytest.mark.parametrize("provider_type", [_TypedUnavailableSourceProvider])
@pytest.mark.asyncio
async def test_pipeline_classifies_temporary_source_failure_as_retryable(tmp_path, provider_type) -> None:  # type: ignore[no-untyped-def]
    provider = provider_type(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "objects",
            local_tmp_dir=tmp_path / "scratch",
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=tmp_path / "scratch",
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None


@pytest.mark.parametrize("provider_type", [_UnavailableSourceProvider, _PermissionDeniedSourceProvider])
@pytest.mark.asyncio
async def test_pipeline_does_not_silently_classify_unknown_provider_oserror(
    tmp_path,
    provider_type,
) -> None:  # type: ignore[no-untyped-def]
    provider = provider_type(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "objects",
            local_tmp_dir=tmp_path / "scratch",
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=tmp_path / "scratch",
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(OSError):
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )


@pytest.mark.asyncio
async def test_pipeline_preserves_provider_retry_after_for_rate_limited_source(tmp_path) -> None:
    provider = _RateLimitedSourceProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=tmp_path / "objects",
            local_tmp_dir=tmp_path / "scratch",
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=tmp_path / "scratch",
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED"
    assert exc_info.value.provider_retry_after_seconds == 17
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_pipeline_classifies_temporary_thumbnail_upload_failure_as_retryable(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _UnavailableThumbnailStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_failed_upload_response_keeps_written_key_owned_for_exact_cleanup(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _ResponseLostThumbnailStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )
    written_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-300.jpg"

    control = _RecordingControl()
    with pytest.raises(TransientJobExecutionError):
        await pipeline.execute(source=source, operation=operation, control=control)
    assert safe_object_key_to_path(root, written_key).is_file()

    await pipeline.delete_effect_outputs(
        provider=provider,
        outputs=_registered_outputs(control),
        control=control,
    )
    await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert not safe_object_key_to_path(root, written_key).exists()


@pytest.mark.asyncio
async def test_pipeline_classifies_storage_access_denied_as_permanent(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _AccessDeniedThumbnailStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(PermanentJobExecutionError) as exc_info:
        await pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED"
    assert exc_info.value.metadata is None


@pytest.mark.asyncio
async def test_pipeline_cancellation_waits_for_blocking_source_download_to_settle(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _BlockingThreadSourceProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    execution = asyncio.create_task(
        pipeline.execute(
            source=source,
            operation=operation,
            control=_RecordingControl(),
        )
    )
    assert await asyncio.to_thread(provider.started.wait, 1)

    execution.cancel()
    await asyncio.sleep(0)
    execution.cancel()
    await asyncio.sleep(0)

    was_running_until_release = not execution.done()
    provider.release.set()
    outcome = await asyncio.wait_for(asyncio.gather(execution, return_exceptions=True), timeout=1)

    assert was_running_until_release
    assert isinstance(outcome[0], asyncio.CancelledError)
    assert provider.finished.is_set()
    await pipeline.remove_job_scratch(job_id=operation.job_id)


@pytest.mark.asyncio
async def test_pipeline_cancellation_records_settled_upload_for_exact_cleanup(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _BlockingThreadUploadProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (300, 200), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )
    expected_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}/thumb-300.jpg"

    control = _RecordingControl()
    execution = asyncio.create_task(
        pipeline.execute(
            source=source,
            operation=operation,
            control=control,
        )
    )
    assert await asyncio.to_thread(provider.started.wait, 1)

    execution.cancel()
    await asyncio.sleep(0)

    was_running_until_release = not execution.done()
    provider.release.set()
    outcome = await asyncio.wait_for(asyncio.gather(execution, return_exceptions=True), timeout=1)

    assert was_running_until_release
    assert isinstance(outcome[0], asyncio.CancelledError)
    assert provider.finished.is_set()
    assert safe_object_key_to_path(root, expected_key).is_file()
    unowned_candidate = expected_key.removesuffix(".jpg") + ".png"
    provider.put_bytes(object_key=unowned_candidate, data=b"not-recorded-by-this-attempt")

    await pipeline.delete_effect_outputs(
        provider=provider,
        outputs=_registered_outputs(control),
        control=control,
    )
    await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert not safe_object_key_to_path(root, expected_key).exists()
    assert safe_object_key_to_path(root, unowned_candidate).read_bytes() == b"not-recorded-by-this-attempt"


@pytest.mark.asyncio
async def test_pipeline_reconstructs_job_owned_cleanup_after_worker_state_is_lost(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=job_id,
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400, 800, 1200, 1600),
        idempotency_key="d" * 64,
    )
    job_prefix = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}"
    cleanup_keys = {
        f"{job_prefix}/thumb-400.jpg",
        f"{job_prefix}/thumb-600.png",
    }
    for object_key in cleanup_keys:
        provider.put_bytes(object_key=object_key, data=b"orphan")
    retained_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{uuid4()}/thumb-600.jpg"
    provider.put_bytes(object_key=retained_key, data=b"canonical-other-job")
    prior_scratch = scratch / "thumbnail-jobs" / str(job_id) / str(uuid4()) / "generated"
    prior_scratch.mkdir(parents=True)
    (prior_scratch / "thumb-600.jpg").write_bytes(b"orphan")
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    cleanup_control = _RecordingControl()
    await pipeline.delete_effect_outputs(
        provider=provider,
        outputs=(
            AssetThumbnailProviderOutputV1(
                width=400,
                object_key=f"{job_prefix}/thumb-400.jpg",
            ),
            AssetThumbnailProviderOutputV1(
                width=600,
                object_key=f"{job_prefix}/thumb-600.png",
            ),
        ),
        control=cleanup_control,
    )
    await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert all(not safe_object_key_to_path(root, key).exists() for key in cleanup_keys)
    assert safe_object_key_to_path(root, retained_key).read_bytes() == b"canonical-other-job"
    assert not (scratch / "thumbnail-jobs" / str(job_id)).exists()
    assert cleanup_control.checkpoint_count == 2


@pytest.mark.asyncio
async def test_effect_cleanup_treats_typed_not_found_as_exact_idempotent_success(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _NotFoundCleanupStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    job_id = uuid4()
    prefix = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{job_id}"
    outputs = (
        AssetThumbnailProviderOutputV1(width=400, object_key=f"{prefix}/thumb-400.jpg"),
        AssetThumbnailProviderOutputV1(width=800, object_key=f"{prefix}/thumb-800.png"),
    )
    control = _RecordingControl()
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    await pipeline.delete_effect_outputs(
        provider=provider,
        outputs=outputs,
        control=control,
    )

    assert provider.deleted_keys == [output.object_key for output in outputs]
    assert control.checkpoint_count == 2


@pytest.mark.asyncio
async def test_pipeline_same_handler_cleanup_does_not_reconstruct_before_storage_is_owned(tmp_path) -> None:
    resolver = _FailingStorageResolver()
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/source.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=tmp_path / "scratch",
        storage_resolver=resolver,
    )

    with pytest.raises(PermanentJobExecutionError):
        await pipeline.execute(source=source, operation=operation, control=_RecordingControl())

    await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert resolver.calls == 1


@pytest.mark.asyncio
async def test_reconstructed_cleanup_exposes_typed_storage_failure(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = _UnavailableCleanupStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )
    object_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{operation.job_id}/thumb-400.jpg"
    job_scratch = scratch / "thumbnail-jobs" / str(operation.job_id)
    job_scratch.mkdir(parents=True)
    cleanup_control = _RecordingControl()

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.delete_effect_outputs(
            provider=provider,
            outputs=(
                AssetThumbnailProviderOutputV1(
                    width=400,
                    object_key=object_key,
                ),
            ),
            control=cleanup_control,
        )

    assert exc_info.value.code == "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"
    assert job_scratch.is_dir()
    assert cleanup_control.checkpoint_count == 1


@pytest.mark.asyncio
async def test_manifest_cleanup_does_not_read_missing_canonical_source(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=f"projects/{project_id}/assets/{asset_id}/missing-source.png",
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )
    object_key = f"projects/{project_id}/assets/{asset_id}/thumbnails/v1/{operation.job_id}/thumb-400.jpg"
    provider.put_bytes(object_key=object_key, data=b"orphan")

    await pipeline.delete_effect_outputs(
        provider=provider,
        outputs=(
            AssetThumbnailProviderOutputV1(
                width=400,
                object_key=object_key,
            ),
        ),
        control=_RecordingControl(),
    )

    assert not safe_object_key_to_path(root, object_key).exists()


@pytest.mark.asyncio
async def test_reconstructed_cleanup_exposes_typed_scratch_removal_failure(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch"
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=scratch,
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )
    job_scratch = scratch / "thumbnail-jobs" / str(operation.job_id)
    job_scratch.mkdir(parents=True)

    def _removal_failure(_path) -> None:  # type: ignore[no-untyped-def]
        raise OSError("scratch filesystem unavailable")

    monkeypatch.setattr(thumbnail_pipeline_module.shutil, "rmtree", _removal_failure)

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert exc_info.value.code == "ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE"
    assert job_scratch.is_dir()


@pytest.mark.asyncio
async def test_reconstructed_cleanup_exposes_typed_scratch_creation_failure(tmp_path) -> None:
    root = tmp_path / "objects"
    scratch = tmp_path / "scratch-file"
    scratch.write_bytes(b"not-a-directory")
    provider = LocalStorageProvider(
        StorageProfileConfig(
            provider=ObjectStorageProviderKind.LOCAL,
            local_root_dir=root,
            local_tmp_dir=tmp_path / "provider-scratch",
        )
    )
    project_id = uuid4()
    asset_id = uuid4()
    source_key = f"projects/{project_id}/assets/{asset_id}/source.png"
    source_path = safe_object_key_to_path(root, source_key)
    source_path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (600, 400), color="navy").save(source_path)
    source = AssetThumbnailSource(
        asset_id=asset_id,
        project_id=project_id,
        mime="image/png",
        ext="png",
        checksum_sha256="a" * 64,
        storage_provider="local",
        object_key=source_key,
    )
    operation = AssetThumbnailPipelineOperation(
        job_id=uuid4(),
        attempt_id=uuid4(),
        asset_id=asset_id,
        project_id=project_id,
        thumbnail_profile_version=1,
        requested_widths=(400,),
        idempotency_key="d" * 64,
    )
    pipeline = StorageAssetThumbnailPipeline(
        scratch_root=scratch,
        storage_resolver=_StaticStorageResolver(provider),
    )

    with pytest.raises(TransientJobExecutionError) as exc_info:
        await pipeline.remove_job_scratch(job_id=operation.job_id)

    assert exc_info.value.code == "ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE"
