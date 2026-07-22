from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, TypeGuard, cast
from uuid import UUID

from pydantic import ConfigDict, Field, ValidationError, field_validator
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.database.errors import is_retryable_postgres_failure
from src.models.assets.asset import AssetRecord
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
    ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
    ASSET_THUMBNAIL_SOURCE_STALE_CODE,
    ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
    AssetThumbnailOutcomeMarker,
    build_asset_thumbnail_source_revision,
    validate_asset_thumbnail_output_identity,
)
from src.modules.assets.jobs.thumbnail_pipeline import AssetThumbnailSource
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.schema import TenantContext

type _TenantDatabaseRouterFactory = Callable[[TenantContext], TenantDatabaseRouter]


class AssetThumbnailOutcomeWrite(BaseSchema):
    """Validated tenant-domain command persisted after thumbnail objects exist."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    project_id: UUID
    asset_id: UUID
    request_fingerprint: str = Field(..., min_length=64, max_length=64)
    output_identity: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    source_revision: str = Field(..., min_length=1, max_length=160)
    thumbnail_profile_version: int = Field(..., ge=1)
    produced_widths: tuple[int, ...] = Field(..., min_length=1)
    variants: JsonObject
    meta: JsonObject

    @field_validator("output_identity", mode="before")
    @classmethod
    def validate_output_identity(cls, value: object) -> str:
        return validate_asset_thumbnail_output_identity(value)


class TenantAssetThumbnailRepository:
    """Tenant-routed persistence for thumbnail source and outcome state."""

    __slots__ = ("_router_factory", "_tenant_context_provider")

    def __init__(
        self,
        *,
        tenant_context_provider: Callable[[], TenantContext] = require_current_tenant_context,
        router_factory: _TenantDatabaseRouterFactory | None = None,
    ) -> None:
        self._tenant_context_provider = tenant_context_provider
        self._router_factory = TenantDatabaseRouter if router_factory is None else router_factory

    async def get_outcome_marker(
        self,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailOutcomeMarker | None:
        context = self._tenant_context_provider()
        _require_project_scope(context=context, project_id=project_id)
        router = self._router_factory(context)
        async with _translate_thumbnail_persistence_failures():
            async with router.connection() as conn:
                asset = (
                    await AssetRecord
                    .filter(
                        id=asset_id,
                        project_id=project_id,
                    )
                    .using_db(conn)
                    .first()
                )
        if asset is None:
            raise PermanentJobExecutionError(
                code=ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
                safe_message="The thumbnail target Asset is no longer available",
            )

        return _outcome_marker_from_meta(asset.meta)

    async def get_source(
        self,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> AssetThumbnailSource:
        context = self._tenant_context_provider()
        _require_project_scope(context=context, project_id=project_id)
        router = self._router_factory(context)
        async with _translate_thumbnail_persistence_failures():
            async with router.connection() as conn:
                asset = await (
                    AssetRecord
                    .filter(
                        id=asset_id,
                        project_id=project_id,
                        deleted_at=None,
                    )
                    .using_db(conn)
                    .first()
                )
        if asset is None:
            raise _target_not_found()
        return _source_from_asset(asset=asset, project_id=project_id)

    async def commit_outcome(
        self,
        *,
        write: AssetThumbnailOutcomeWrite,
    ) -> AssetThumbnailOutcomeMarker:
        context = self._tenant_context_provider()
        _require_project_scope(context=context, project_id=write.project_id)
        router = self._router_factory(context)
        async with _translate_thumbnail_persistence_failures():
            async with router.connection() as conn:
                asset = await (
                    AssetRecord
                    .filter(id=write.asset_id, project_id=write.project_id)
                    .using_db(conn)
                    .select_for_update()
                    .first()
                )
                if asset is None:
                    raise _target_not_found()

                existing_marker = _outcome_marker_from_meta(asset.meta)
                if existing_marker is not None and existing_marker.job_id == write.job_id:
                    _validate_existing_marker(marker=existing_marker, write=write)
                    return existing_marker
                if asset.deleted_at is not None:
                    raise _target_not_found()
                _validate_source_revision(asset=asset, expected=write.source_revision)

                completed_at = await _database_time(conn)
                marker = AssetThumbnailOutcomeMarker(
                    job_id=write.job_id,
                    request_fingerprint=write.request_fingerprint,
                    output_identity=write.output_identity,
                    source_revision=write.source_revision,
                    thumbnail_profile_version=write.thumbnail_profile_version,
                    produced_widths=write.produced_widths,
                    completed_at=completed_at,
                )
                variants = _merge_variants(asset.variants, write.variants)
                meta = _merge_meta(asset.meta, write.meta)
                meta["thumbnail_generation"] = marker.model_dump(mode="json", by_alias=True)
                asset.variants = variants
                asset.meta = meta
                asset.updated_at = completed_at
                await asset.save(
                    update_fields=["variants", "meta", "updated_at"],
                    using_db=conn,
                )
                return marker


def _outcome_marker_from_meta(meta_value: object) -> AssetThumbnailOutcomeMarker | None:
    if isinstance(meta_value, dict) and all(isinstance(key, str) for key in meta_value):
        meta = cast(dict[str, object], meta_value)
    else:
        meta = {}
    raw_marker = meta.get("thumbnail_generation")
    if raw_marker is None:
        return None
    try:
        return AssetThumbnailOutcomeMarker.model_validate(raw_marker)
    except (TypeError, ValidationError, ValueError) as exc:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
            safe_message="The stored thumbnail outcome is invalid",
        ) from exc


def _source_from_asset(*, asset: AssetRecord, project_id: UUID) -> AssetThumbnailSource:
    return AssetThumbnailSource(
        asset_id=asset.id,
        project_id=project_id,
        mime=asset.mime,
        ext=asset.ext,
        checksum_sha256=asset.checksum_sha256,
        storage_provider=str(asset.storage_provider),
        storage_profile_key=asset.storage_profile_key,
        storage_bucket=asset.storage_bucket,
        object_key=str(asset.object_key),
    )


def _validate_existing_marker(
    *,
    marker: AssetThumbnailOutcomeMarker,
    write: AssetThumbnailOutcomeWrite,
) -> None:
    if (
        marker.request_fingerprint != write.request_fingerprint
        or marker.output_identity != write.output_identity
        or marker.source_revision != write.source_revision
        or marker.thumbnail_profile_version != write.thumbnail_profile_version
        or marker.produced_widths != write.produced_widths
    ):
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_OUTCOME_INVALID_CODE,
            safe_message="The stored thumbnail outcome conflicts with the canonical Job",
        )


def _validate_source_revision(*, asset: AssetRecord, expected: str) -> None:
    try:
        actual = build_asset_thumbnail_source_revision(
            asset_id=asset.id,
            checksum_sha256=asset.checksum_sha256,
        )
    except ValueError as exc:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
            safe_message="The thumbnail source revision is invalid",
        ) from exc
    if actual != expected:
        raise PermanentJobExecutionError(
            code=ASSET_THUMBNAIL_SOURCE_STALE_CODE,
            safe_message="The thumbnail source changed after Job creation",
        )


def _is_json_mapping(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def _merge_variants(current_value: object, incoming: JsonObject) -> JsonObject:
    current: JsonObject = dict(current_value) if _is_json_mapping(current_value) else {}
    incoming_thumbnails = incoming.get("thumbnails")
    if isinstance(incoming_thumbnails, list):
        current["thumbnails"] = _merge_thumbnail_items(
            current.get("thumbnails"),
            incoming_thumbnails,
        )
    for key, value in incoming.items():
        if key != "thumbnails":
            current[key] = value
    return current


def _merge_thumbnail_items(current: object, incoming: list[object]) -> list[object]:
    by_width: dict[int, object] = {}
    if isinstance(current, list):
        for item in current:
            width = _thumbnail_width(item)
            if width is not None:
                by_width[width] = item
    for item in incoming:
        width = _thumbnail_width(item)
        if width is not None:
            by_width[width] = item
    return [by_width[width] for width in sorted(by_width)]


def _thumbnail_width(value: object) -> int | None:
    if not _is_json_mapping(value):
        return None
    width = value.get("width")
    return width if isinstance(width, int) and not isinstance(width, bool) and width > 0 else None


def _merge_meta(current_value: object, incoming: JsonObject) -> JsonObject:
    current: JsonObject = dict(current_value) if _is_json_mapping(current_value) else {}
    for key, value in incoming.items():
        existing = current.get(key)
        if _is_json_mapping(existing) and _is_json_mapping(value):
            current[key] = {**existing, **value}
        else:
            current[key] = value
    return current


async def _database_time(conn: BaseDBAsyncClient) -> datetime:
    rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
    if len(rows) != 1:
        raise RuntimeError(f"expected one PostgreSQL clock row, received {len(rows)}")
    value = rows[0].get("database_time")
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise RuntimeError("PostgreSQL clock_timestamp() must return a timezone-aware datetime")
    return value


def _target_not_found() -> PermanentJobExecutionError:
    return PermanentJobExecutionError(
        code=ASSET_THUMBNAIL_TARGET_NOT_FOUND_CODE,
        safe_message="The thumbnail target Asset is no longer available",
    )


def _require_project_scope(*, context: TenantContext, project_id: UUID) -> None:
    if context.project_id != project_id:
        raise _target_not_found()


@asynccontextmanager
async def _translate_thumbnail_persistence_failures() -> AsyncIterator[None]:
    try:
        yield
    except Exception as exc:
        if not is_retryable_postgres_failure(exc):
            raise
        raise TransientJobExecutionError(
            code=ASSET_THUMBNAIL_PERSISTENCE_TEMPORARILY_UNAVAILABLE_CODE,
            safe_message="Asset thumbnail persistence is temporarily unavailable",
        ) from exc
