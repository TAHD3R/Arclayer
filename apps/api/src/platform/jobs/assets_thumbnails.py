from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from tortoise import Tortoise

from src.config import Settings
from src.core.logging import get_logger
from src.models.assets.asset import AssetRecord
from src.platform.assets.thumbnails import generate_image_thumbnails
from src.platform.storage.factory import build_storage_provider_for
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.s3 import S3StorageProvider
from src.settings.runtime import get_effective_settings

logger = get_logger(__name__)

ASSET_THUMBNAILS_JOB_NAME = "core:assets:generate_thumbnails"

_FATAL_THUMBNAILS_JOB_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)

# Keep this aligned with the admin UI expectations (see `thumbBaseUrl` consumers).
_DEFAULT_WIDTHS: tuple[int, ...] = (400, 800, 1200, 1600)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_THUMBNAILS_JOB_ERRORS):
        raise exc


def _lock_key_for_asset(asset_id: UUID) -> int:
    """
    64-bit Postgres advisory lock key for thumbnail generation.

    We intentionally use a stable hash so the lock doesn't leak internal ids and remains bounded.
    """

    h = hashlib.blake2b(digest_size=8)
    h.update(b"arclayer:assets:thumbs:")
    h.update(asset_id.bytes)
    value = int.from_bytes(h.digest(), "big", signed=False)
    return int(value % (2**63 - 1))


def _parse_execute_query_result(result: Any) -> list[Any] | None:
    if isinstance(result, tuple) and len(result) == 2:
        a, b = result
        if isinstance(a, list):
            return a
        if isinstance(b, list):
            return b
    if isinstance(result, list):
        return result
    return None


def _parse_single_bool(rows: list[Any] | None) -> bool:
    if not rows:
        return False
    first = rows[0]
    if isinstance(first, dict):
        if not first:
            return False
        return bool(next(iter(first.values())))
    if isinstance(first, (list, tuple)):
        if not first:
            return False
        return bool(first[0])
    return bool(first)


async def _try_acquire_lock(asset_id: UUID) -> bool:
    if not Tortoise._inited:
        return False
    conn = Tortoise.get_connection("default")
    key = _lock_key_for_asset(asset_id)
    rows = _parse_execute_query_result(await conn.execute_query(f"SELECT pg_try_advisory_lock({key})"))
    return _parse_single_bool(rows)


async def _release_lock(asset_id: UUID) -> None:
    if not Tortoise._inited:
        return
    conn = Tortoise.get_connection("default")
    key = _lock_key_for_asset(asset_id)
    try:
        await conn.execute_query(f"SELECT pg_advisory_unlock({key})")
    except (RuntimeError, TypeError, ValueError):
        return


def _existing_thumb_widths(variants: object) -> set[int]:
    if not isinstance(variants, dict):
        return set()
    thumbs = variants.get("thumbnails")
    if not isinstance(thumbs, list):
        return set()
    out: set[int] = set()
    for item in thumbs:
        if not isinstance(item, dict):
            continue
        w = item.get("width")
        if isinstance(w, int) and w > 0:
            out.add(int(w))
    return out


def _merge_thumbnails(existing: object, incoming: object) -> list[dict[str, Any]]:
    """
    Merge thumbnail variant lists while preserving all widths.

    Rules:
    - Deduplicate by `width` (keep existing first to avoid churn).
    - Keep output sorted by width ascending (stable for API/UI consumption).
    """

    merged_by_width: dict[int, dict[str, Any]] = {}

    if isinstance(existing, list):
        for item in existing:
            if not isinstance(item, dict):
                continue
            w = item.get("width")
            if isinstance(w, int) and w > 0 and w not in merged_by_width:
                merged_by_width[int(w)] = dict(item)

    if isinstance(incoming, list):
        for item in incoming:
            if not isinstance(item, dict):
                continue
            w = item.get("width")
            if not isinstance(w, int) or w <= 0:
                continue
            width = int(w)
            if width in merged_by_width:
                continue
            merged_by_width[width] = dict(item)

    return [merged_by_width[w] for w in sorted(merged_by_width.keys())]


def _is_image_asset(asset: AssetRecord) -> bool:
    ext = (asset.ext or "").lstrip(".").lower()
    return bool((asset.mime or "").startswith("image/") or ext in {"jpg", "jpeg", "png", "webp", "gif"})


async def generate_asset_thumbnails(ctx: dict[str, Any], asset_id_raw: str, project_id_raw: str) -> None:
    """
    Background job: generate and upload asset thumbnails.

    Goals:
    - idempotent: skip if all desired variants exist
    - dedup: guarded by a per-asset advisory lock + unique job id on enqueue
    - bounded: avoid crashing the worker; log actionable errors
    """

    settings: Settings | None = ctx.get("settings")
    if settings is None:
        logger.warning("Asset thumbnail job skipped (missing settings)", action="asset_thumbs_missing_settings")
        return

    try:
        asset_id = UUID(str(asset_id_raw))
        project_id = UUID(str(project_id_raw))
    except (ValueError, TypeError):
        logger.warning(
            "Asset thumbnail job skipped (invalid ids)",
            action="asset_thumbs_invalid_ids",
            asset_id=str(asset_id_raw),
            project_id=str(project_id_raw),
        )
        return

    if not settings.database.enabled:
        logger.info("Asset thumbnail job skipped (database disabled)", action="asset_thumbs_db_disabled")
        return

    if not Tortoise._inited:
        logger.warning("Asset thumbnail job skipped (ORM not initialized)", action="asset_thumbs_orm_not_ready")
        return

    acquired = await _try_acquire_lock(asset_id)
    if not acquired:
        # Another worker is processing; keep it quiet to avoid log spam.
        return

    started = datetime.now(UTC)
    try:
        asset = await AssetRecord.get_or_none(id=asset_id, project_id=project_id, deleted_at=None)
        if asset is None:
            return

        if not _is_image_asset(asset):
            return

        desired = set(_DEFAULT_WIDTHS)
        existing = _existing_thumb_widths(asset.variants)
        missing = sorted(desired - existing)
        if not missing:
            return

        if asset.storage_provider == "local":
            in_path = safe_object_key_to_path(settings.storage.local_root_dir, asset.object_key)
            if not in_path.is_file():
                return

            def _out_path_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
                out_ext = "png" if alpha else "jpg"
                key = f"projects/{project_id}/assets/{asset_id}/thumb-{width}.{out_ext}"
                return safe_object_key_to_path(settings.storage.local_root_dir, key), key

            variants_payload, meta_payload = await generate_image_thumbnails(
                in_path=in_path,
                out_path_for_width=_out_path_for_width,
                widths=missing,
            )

        elif asset.storage_provider == "s3":
            effective = await get_effective_settings(settings)
            provider = build_storage_provider_for(effective, provider="s3")
            if not isinstance(provider, S3StorageProvider):
                return

            bucket = str(getattr(asset, "storage_bucket", "") or "") or None
            if bucket:
                provider = provider.with_bucket(bucket)

            ext = (asset.ext or "").lstrip(".").lower() or "bin"
            source_key = f"thumbs/{project_id}/{asset_id}/source.{ext}"
            in_path = safe_object_key_to_path(settings.storage.local_tmp_dir, source_key)

            try:
                await provider.download_object_to_path(object_key=asset.object_key, out_path=in_path)
            except BaseException as exc:
                _raise_if_fatal(exc)
                logger.warning(
                    "Asset thumbnail job source download failed",
                    action="asset_thumbs_download_source_failed",
                    project_id=str(project_id),
                    asset_id=str(asset_id),
                    object_key=str(asset.object_key),
                    error=str(exc),
                )
                return

            out_paths: dict[str, Path] = {}

            def _out_path_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
                out_ext = "png" if alpha else "jpg"
                object_key = f"assets/{asset_id}/thumb-{width}.{out_ext}"
                local_key = f"thumbs/{project_id}/{asset_id}/thumb-{width}.{out_ext}"
                out_path = safe_object_key_to_path(settings.storage.local_tmp_dir, local_key)
                out_paths[object_key] = out_path
                return out_path, object_key

            variants_payload, meta_payload = await generate_image_thumbnails(
                in_path=in_path,
                out_path_for_width=_out_path_for_width,
                widths=missing,
            )

            thumbs = (variants_payload or {}).get("thumbnails") if isinstance(variants_payload, dict) else None
            if isinstance(thumbs, list):
                for item in thumbs:
                    if not isinstance(item, dict):
                        continue
                    object_key = str(item.get("object_key") or "")
                    if not object_key:
                        continue
                    out_path = out_paths.get(object_key)
                    if not out_path or not out_path.is_file():
                        continue
                    try:
                        data = await asyncio.to_thread(out_path.read_bytes)
                        await provider.put_object_bytes(
                            object_key=object_key,
                            data=data,
                            content_type=str(item.get("mime") or "") or None,
                            cache_control="public, max-age=31536000, immutable",
                        )
                    except BaseException as exc:
                        _raise_if_fatal(exc)
                        logger.warning(
                            "Asset thumbnail job upload failed",
                            action="asset_thumbs_upload_failed",
                            project_id=str(project_id),
                            asset_id=str(asset_id),
                            object_key=object_key,
                            error=str(exc),
                        )
                        raise

            # Cleanup tmp files (best-effort).
            try:
                in_path.unlink(missing_ok=True)
            except BaseException as cleanup_exc:
                _raise_if_fatal(cleanup_exc)
                logger.warning(
                    "Asset thumbnail job temp cleanup failed",
                    action="asset_thumbs_cleanup_source_failed",
                    project_id=str(project_id),
                    asset_id=str(asset_id),
                    path=str(in_path),
                    error=str(cleanup_exc),
                )
            for p in out_paths.values():
                try:
                    p.unlink(missing_ok=True)
                except BaseException as cleanup_exc:
                    _raise_if_fatal(cleanup_exc)
                    logger.warning(
                        "Asset thumbnail job temp cleanup failed",
                        action="asset_thumbs_cleanup_thumb_failed",
                        project_id=str(project_id),
                        asset_id=str(asset_id),
                        path=str(p),
                        error=str(cleanup_exc),
                    )

        else:
            return

        # Merge and persist (avoid overwriting concurrent metadata updates).
        latest = await AssetRecord.get_or_none(id=asset_id, project_id=project_id, deleted_at=None)
        if latest is None:
            return

        variants: dict = latest.variants if isinstance(latest.variants, dict) else {}
        vp = variants_payload if isinstance(variants_payload, dict) else {}

        existing_thumbs = variants.get("thumbnails") if isinstance(variants, dict) else None
        incoming_thumbs = vp.get("thumbnails") if isinstance(vp, dict) else None
        if isinstance(incoming_thumbs, list):
            variants["thumbnails"] = _merge_thumbnails(existing_thumbs, incoming_thumbs)
        for k, v in vp.items():
            if k == "thumbnails":
                continue
            variants[k] = v

        meta: dict = latest.meta if isinstance(latest.meta, dict) else {}
        meta.update(meta_payload)

        latest.variants = variants
        latest.meta = meta
        await latest.save(update_fields=["variants", "meta", "updated_at"])

        elapsed_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
        logger.info(
            "Asset thumbnails generated",
            action="asset_thumbs_ok",
            project_id=str(project_id),
            asset_id=str(asset_id),
            missing_count=len(missing),
            elapsed_ms=elapsed_ms,
        )
    finally:
        await _release_lock(asset_id)
