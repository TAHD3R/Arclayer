from __future__ import annotations

import asyncio
import shutil
from collections.abc import Awaitable
from pathlib import Path
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_MEDIA_UNSUPPORTED_CODE,
    ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE,
    ASSET_THUMBNAIL_RENDER_FAILED_CODE,
    ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_SOURCE_NOT_FOUND_CODE,
    ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED_CODE,
    ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE,
)
from src.modules.assets.jobs.thumbnail_media import is_asset_thumbnail_previewable
from src.modules.assets.jobs.thumbnail_provider_effect_coordinator import (
    AssetThumbnailProviderEffectEvidence,
)
from src.modules.assets.jobs.thumbnail_provider_effects import (
    AssetThumbnailProviderOutputV1,
)
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.platform.assets.thumbnails import (
    PreviewRendererTemporarilyUnavailableError,
    PreviewSourceInvalidError,
    generate_image_thumbnails,
    render_preview_source,
)
from src.platform.storage.errors import (
    StorageAccessDeniedError,
    StorageObjectNotFoundError,
    StorageRateLimitedError,
    StorageTemporarilyUnavailableError,
)
from src.platform.storage.profile_routes import StorageProfileRouteBinding
from src.platform.storage.providers.base import ObjectStorageProvider


class AssetThumbnailSource(BaseSchema):
    """Immutable canonical source snapshot read before the long media pipeline begins."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    asset_id: UUID
    project_id: UUID
    mime: str | None = Field(default=None, max_length=128)
    ext: str | None = Field(default=None, max_length=32)
    checksum_sha256: str | None = Field(default=None, min_length=64, max_length=64)
    storage_provider: str = Field(..., min_length=1, max_length=32)
    storage_profile_key: str | None = Field(default=None, max_length=128)
    storage_bucket: str | None = Field(default=None, max_length=255)
    object_key: str = Field(..., min_length=1, max_length=1024)


class AssetThumbnailPipelineOperation(BaseSchema):
    """Attempt-owned identity used for deterministic scratch and object paths."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    attempt_id: UUID
    asset_id: UUID
    project_id: UUID
    thumbnail_profile_version: int = Field(..., ge=1)
    requested_widths: tuple[int, ...] = Field(..., min_length=1)
    idempotency_key: str = Field(..., min_length=64, max_length=64)


class AssetThumbnailPipelineResult(BaseSchema):
    """Uploaded thumbnail references ready for the tenant outcome transaction."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    effect_id: UUID
    output_identity: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    produced_widths: tuple[int, ...] = Field(..., min_length=1)
    variants: JsonObject
    meta: JsonObject

    @field_validator("produced_widths")
    @classmethod
    def validate_produced_widths(cls, values: tuple[int, ...]) -> tuple[int, ...]:
        if any(width <= 0 for width in values):
            raise ValueError("producedWidths must contain only positive widths")
        if values != tuple(sorted(set(values))):
            raise ValueError("producedWidths must be unique and sorted")
        return values


class AssetThumbnailPipelineControl(Protocol):
    async def checkpoint(self) -> None: ...

    async def report_phase(self, phase: str, *, completed: int) -> None: ...

    async def register_generated_outputs(
        self,
        *,
        operation: AssetThumbnailPipelineOperation,
        route: StorageProfileRouteBinding,
        target_bucket: str | None,
        outputs: tuple[AssetThumbnailProviderOutputV1, ...],
    ) -> AssetThumbnailProviderEffectEvidence: ...


class AssetThumbnailPipeline(Protocol):
    async def execute(
        self,
        *,
        source: AssetThumbnailSource,
        operation: AssetThumbnailPipelineOperation,
        control: AssetThumbnailPipelineControl,
    ) -> AssetThumbnailPipelineResult: ...

    async def delete_effect_outputs(
        self,
        *,
        provider: ObjectStorageProvider,
        outputs: tuple[AssetThumbnailProviderOutputV1, ...],
        control: AssetThumbnailPipelineControl,
    ) -> None: ...

    async def remove_job_scratch(self, *, job_id: UUID) -> None: ...


class AssetThumbnailSourceReadStorage(Protocol):
    provider: ObjectStorageProvider


class AssetThumbnailAuthorizedOutputStorage(Protocol):
    provider: ObjectStorageProvider
    route: StorageProfileRouteBinding
    target_bucket: str | None


class AssetThumbnailStorageResolver(Protocol):
    async def resolve_source_read(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> AssetThumbnailSourceReadStorage: ...

    async def authorize_output(
        self,
        *,
        source: AssetThumbnailSource,
    ) -> AssetThumbnailAuthorizedOutputStorage: ...


class StorageAssetThumbnailPipeline:
    """Attempt-scoped media pipeline with stable Job-owned output objects."""

    __slots__ = ("_scratch_root", "_storage_resolver")

    def __init__(
        self,
        *,
        scratch_root: Path,
        storage_resolver: AssetThumbnailStorageResolver,
    ) -> None:
        self._scratch_root = scratch_root
        self._storage_resolver = storage_resolver

    async def execute(
        self,
        *,
        source: AssetThumbnailSource,
        operation: AssetThumbnailPipelineOperation,
        control: AssetThumbnailPipelineControl,
    ) -> AssetThumbnailPipelineResult:
        _validate_operation_source(source=source, operation=operation)
        if not is_asset_thumbnail_previewable(mime=source.mime, ext=source.ext):
            raise PermanentJobExecutionError(
                code=ASSET_THUMBNAIL_MEDIA_UNSUPPORTED_CODE,
                safe_message="The Asset media type cannot produce a thumbnail preview",
            )
        source_storage = await self._storage_resolver.resolve_source_read(source=source)
        scratch_dir = _scratch_dir(root=self._scratch_root, operation=operation)
        await _create_scratch_dir(scratch_dir)

        await control.report_phase("rendering_preview", completed=1)
        source_path = scratch_dir / "source.bin"
        await control.checkpoint()
        await _download_thumbnail_source(
            provider=source_storage.provider,
            source=source,
            out_path=source_path,
        )
        await control.checkpoint()
        preview_path, preview_meta = await _render_thumbnail_preview(
            source=source,
            in_path=source_path,
            out_path=scratch_dir / "preview-source.png",
        )

        await control.report_phase("generating", completed=2)
        await control.checkpoint()
        output_paths: dict[str, Path] = {}

        def output_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
            extension = "png" if alpha else "jpg"
            object_key = _thumbnail_object_key(
                operation=operation,
                width=width,
                extension=extension,
            )
            path = scratch_dir / "generated" / f"thumb-{width}.{extension}"
            output_paths[object_key] = path
            return path, object_key

        try:
            variants, generated_meta = await _await_attempt_operation(
                generate_image_thumbnails(
                    in_path=preview_path,
                    out_path_for_width=output_for_width,
                    widths=list(operation.requested_widths),
                )
            )
        except PreviewSourceInvalidError as exc:
            raise _render_failed() from exc
        except PreviewRendererTemporarilyUnavailableError as exc:
            raise _renderer_unavailable() from exc
        output_storage = await self._storage_resolver.authorize_output(source=source)
        thumbnails = _thumbnail_items(variants)
        outputs = _provider_outputs(operation=operation, thumbnails=thumbnails)
        upload_payloads = await _read_upload_payloads(
            thumbnails=thumbnails,
            output_paths=output_paths,
        )
        await control.report_phase("uploading", completed=3)
        evidence = await control.register_generated_outputs(
            operation=operation,
            route=output_storage.route,
            target_bucket=output_storage.target_bucket,
            outputs=outputs,
        )
        for thumbnail, data in upload_payloads:
            object_key = str(thumbnail["object_key"])
            await control.checkpoint()
            try:
                await _await_attempt_operation(
                    _put_owned_thumbnail(
                        provider=output_storage.provider,
                        object_key=object_key,
                        data=data,
                        content_type=str(thumbnail["mime"]),
                    )
                )
            except (StorageAccessDeniedError, StorageRateLimitedError, StorageTemporarilyUnavailableError) as exc:
                raise _storage_execution_error(
                    exc,
                    temporarily_unavailable_code=ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE,
                    temporarily_unavailable_message="Thumbnail object storage is temporarily unavailable",
                ) from exc

        await _remove_cleanup_scratch(scratch_dir)
        return AssetThumbnailPipelineResult(
            effect_id=evidence.effect.id,
            output_identity=evidence.output_identity,
            produced_widths=tuple(output.width for output in outputs),
            variants=variants,
            meta=_merge_meta(preview_meta, generated_meta),
        )

    async def delete_effect_outputs(
        self,
        *,
        provider: ObjectStorageProvider,
        outputs: tuple[AssetThumbnailProviderOutputV1, ...],
        control: AssetThumbnailPipelineControl,
    ) -> None:
        for output in outputs:
            await control.checkpoint()
            await _delete_cleanup_object(provider=provider, object_key=output.object_key)

    async def remove_job_scratch(self, *, job_id: UUID) -> None:
        await _remove_cleanup_scratch(_job_scratch_dir(root=self._scratch_root, job_id=job_id))


def _validate_operation_source(
    *,
    source: AssetThumbnailSource,
    operation: AssetThumbnailPipelineOperation,
) -> None:
    if source.asset_id != operation.asset_id or source.project_id != operation.project_id:
        raise ValueError("thumbnail pipeline source does not match the Job operation")


def _scratch_dir(*, root: Path, operation: AssetThumbnailPipelineOperation) -> Path:
    return _job_scratch_dir(root=root, job_id=operation.job_id) / str(operation.attempt_id)


def _job_scratch_dir(*, root: Path, job_id: UUID) -> Path:
    return root / "thumbnail-jobs" / str(job_id)


def _thumbnail_object_key(
    *,
    operation: AssetThumbnailPipelineOperation,
    width: int,
    extension: str,
) -> str:
    return (
        f"projects/{operation.project_id}/assets/{operation.asset_id}/thumbnails/"
        f"v{operation.thumbnail_profile_version}/{operation.job_id}/thumb-{width}.{extension}"
    )


def _thumbnail_items(variants: JsonObject) -> list[dict[str, object]]:
    value = variants.get("thumbnails")
    if not isinstance(value, list):
        raise ValueError("thumbnail pipeline result is missing thumbnail variants")
    items = [item for item in value if isinstance(item, dict)]
    if len(items) != len(value):
        raise ValueError("thumbnail pipeline variants contain an invalid item")
    return items


def _provider_outputs(
    *,
    operation: AssetThumbnailPipelineOperation,
    thumbnails: list[dict[str, object]],
) -> tuple[AssetThumbnailProviderOutputV1, ...]:
    if not 1 <= len(thumbnails) <= 4:
        raise ValueError("thumbnail pipeline must produce between one and four outputs")
    outputs: list[AssetThumbnailProviderOutputV1] = []
    for thumbnail in thumbnails:
        width = thumbnail.get("width")
        extension = thumbnail.get("ext")
        object_key = thumbnail.get("object_key")
        if not isinstance(width, int) or isinstance(width, bool) or width <= 0:
            raise ValueError("thumbnail pipeline variant width is invalid")
        if not isinstance(extension, str) or extension not in {"jpg", "png"} or not isinstance(object_key, str):
            raise ValueError("thumbnail pipeline variant output is invalid")
        expected_key = _thumbnail_object_key(
            operation=operation,
            width=width,
            extension=extension,
        )
        if object_key != expected_key:
            raise ValueError("thumbnail pipeline variant is not the canonical Job-owned output")
        outputs.append(
            AssetThumbnailProviderOutputV1(
                width=width,
                object_key=object_key,
            )
        )
    widths = tuple(output.width for output in outputs)
    if widths != tuple(sorted(set(widths))):
        raise ValueError("thumbnail pipeline outputs must be unique and sorted")
    return tuple(outputs)


async def _read_upload_payloads(
    *,
    thumbnails: list[dict[str, object]],
    output_paths: dict[str, Path],
) -> tuple[tuple[dict[str, object], bytes], ...]:
    payloads: list[tuple[dict[str, object], bytes]] = []
    for thumbnail in thumbnails:
        object_key = str(thumbnail["object_key"])
        payloads.append((
            thumbnail,
            await _read_rendered_output(output_paths[object_key]),
        ))
    return tuple(payloads)


def _merge_meta(first: JsonObject, second: JsonObject) -> JsonObject:
    merged: JsonObject = dict(first)
    for key, value in second.items():
        current = merged.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            merged[key] = {**current, **value}
        else:
            merged[key] = value
    return merged


def _render_failed() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=ASSET_THUMBNAIL_RENDER_FAILED_CODE,
        safe_message="The Asset source could not be decoded into a thumbnail",
    )


async def _await_attempt_operation[ResultT](operation: Awaitable[ResultT]) -> ResultT:
    """Let Attempt-owned work settle before propagating cooperative task cancellation."""

    task = asyncio.ensure_future(operation)
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError as cancellation:
        while not task.done():
            try:
                await asyncio.wait({task})
            except asyncio.CancelledError:
                cancellation.add_note("Repeated cancellation observed while Attempt-owned operation was settling")
        try:
            task.result()
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException as operation_error:
            cancellation.add_note(
                f"Attempt-owned operation also failed while settling: {type(operation_error).__name__}"
            )
        raise


async def _put_owned_thumbnail(
    *,
    provider: ObjectStorageProvider,
    object_key: str,
    data: bytes,
    content_type: str,
) -> None:
    await provider.put_object_bytes(
        object_key=object_key,
        data=data,
        content_type=content_type,
        cache_control="public, max-age=31536000, immutable",
    )


async def _download_thumbnail_source(
    *,
    provider: ObjectStorageProvider,
    source: AssetThumbnailSource,
    out_path: Path,
) -> None:
    try:
        await _await_attempt_operation(
            provider.download_object_to_path(
                object_key=source.object_key,
                out_path=out_path,
            )
        )
    except (FileNotFoundError, StorageObjectNotFoundError) as exc:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_NOT_FOUND_CODE,
            safe_message="The canonical Asset source object no longer exists",
        ) from exc
    except (StorageAccessDeniedError, StorageRateLimitedError, StorageTemporarilyUnavailableError) as exc:
        raise _storage_execution_error(
            exc,
            temporarily_unavailable_code=ASSET_THUMBNAIL_SOURCE_TEMPORARILY_UNAVAILABLE_CODE,
            temporarily_unavailable_message="The Asset source is temporarily unavailable",
        ) from exc


async def _render_thumbnail_preview(
    *,
    source: AssetThumbnailSource,
    in_path: Path,
    out_path: Path,
) -> tuple[Path, JsonObject]:
    try:
        return await _await_attempt_operation(
            render_preview_source(
                in_path=in_path,
                out_path=out_path,
                mime=source.mime,
                ext=source.ext,
            )
        )
    except PreviewRendererTemporarilyUnavailableError as exc:
        raise _renderer_unavailable() from exc
    except PreviewSourceInvalidError as exc:
        raise _render_failed() from exc


async def _delete_cleanup_object(
    *,
    provider: ObjectStorageProvider,
    object_key: str,
) -> None:
    try:
        await _await_attempt_operation(provider.delete_object(object_key=object_key))
    except (FileNotFoundError, StorageObjectNotFoundError):
        return
    except (StorageAccessDeniedError, StorageRateLimitedError, StorageTemporarilyUnavailableError) as exc:
        raise _storage_execution_error(
            exc,
            temporarily_unavailable_code=ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE_CODE,
            temporarily_unavailable_message="Thumbnail cleanup storage is temporarily unavailable",
        ) from exc


async def _remove_cleanup_scratch(path: Path) -> None:
    try:
        await _await_attempt_operation(asyncio.to_thread(_remove_tree_if_present, path))
    except OSError as exc:
        raise TransientJobExecutionError(
            code=ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
            safe_message="Thumbnail scratch space is temporarily unavailable",
        ) from exc


async def _create_scratch_dir(path: Path) -> None:
    try:
        await _await_attempt_operation(asyncio.to_thread(path.mkdir, parents=True, exist_ok=False))
    except OSError as exc:
        raise TransientJobExecutionError(
            code=ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
            safe_message="Thumbnail scratch space is temporarily unavailable",
        ) from exc


async def _read_rendered_output(path: Path) -> bytes:
    try:
        return await _await_attempt_operation(asyncio.to_thread(path.read_bytes))
    except OSError as exc:
        raise TransientJobExecutionError(
            code=ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
            safe_message="The rendered thumbnail output is temporarily unavailable",
        ) from exc


def _remove_tree_if_present(path: Path) -> None:
    try:
        shutil.rmtree(path)
    except FileNotFoundError:
        return


def _storage_execution_error(
    error: StorageAccessDeniedError | StorageRateLimitedError | StorageTemporarilyUnavailableError,
    *,
    temporarily_unavailable_code: str,
    temporarily_unavailable_message: str,
) -> PermanentJobExecutionError | TransientJobExecutionError:
    if isinstance(error, StorageAccessDeniedError):
        return PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_STORAGE_ACCESS_DENIED_CODE,
            safe_message="The Asset storage provider denied the thumbnail operation",
        )
    if isinstance(error, StorageRateLimitedError):
        return TransientJobExecutionError(
            code=ASSET_THUMBNAIL_PROVIDER_RATE_LIMITED_CODE,
            safe_message="The Asset storage provider rate limited the thumbnail operation",
            provider_retry_after_seconds=error.retry_after_seconds,
        )
    return TransientJobExecutionError(
        code=temporarily_unavailable_code,
        safe_message=temporarily_unavailable_message,
    )


def _renderer_unavailable() -> TransientJobExecutionError:
    return TransientJobExecutionError(
        code=ASSET_THUMBNAIL_RENDERER_TEMPORARILY_UNAVAILABLE_CODE,
        safe_message="The preview renderer is temporarily unavailable",
    )
