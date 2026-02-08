from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from apps.api.config import Settings
from apps.api.core.logging import get_logger
from apps.api.infra.assets.thumbnails import generate_image_thumbnails
from apps.api.infra.storage.factory import build_storage_provider_for
from apps.api.infra.storage.local import safe_object_key_to_path
from apps.api.infra.storage.s3 import S3StorageProvider
from apps.api.modules.assets.events import ASSET_UPLOADED_EVENT
from apps.api.modules.assets.models.asset import AssetRecord
from apps.api.plugin.event_bus import Event, EventBus
from apps.api.settings.runtime import get_effective_settings

logger = get_logger(__name__)
_FATAL_ASSET_PROCESSOR_ERRORS: tuple[type[BaseException], ...] = (
    asyncio.CancelledError,
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_ASSET_PROCESSOR_ERRORS):
        raise exc


async def register_core_asset_processors(event_bus: EventBus, settings: Settings) -> None:
    """
    Register core asset processors on the in-process EventBus.

    Notes:
    - This is best-effort and in-process only (per worker). For durability, we may
      add a real task queue later.
    - We keep the core processors lightweight and safe; they must never crash the app.
    """

    async def _on_asset_uploaded(event: Event) -> None:
        # Thumbnails are a performance optimization; always best-effort.
        try:
            raw_asset_id = (event.payload or {}).get("asset_id")
            raw_workspace_id = (event.payload or {}).get("workspace_id")
            if not raw_asset_id or not raw_workspace_id:
                return

            asset_id = UUID(str(raw_asset_id))
            workspace_id = UUID(str(raw_workspace_id))
            asset = await AssetRecord.get_or_none(id=asset_id, workspace_id=workspace_id, deleted_at=None)
            if asset is None:
                return

            # Skip if already generated.
            if isinstance(asset.variants, dict) and asset.variants.get("thumbnails"):
                return

            ext = (asset.ext or "").lstrip(".").lower()
            if not ((asset.mime or "").startswith("image/") or ext in {"jpg", "jpeg", "png", "webp", "gif"}):
                return

            if asset.storage_provider == "local":
                in_path = safe_object_key_to_path(settings.storage.local_root_dir, asset.object_key)
                if not in_path.is_file():
                    return

                def _out_path_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
                    out_ext = "png" if alpha else "jpg"
                    key = f"workspaces/{workspace_id}/assets/{asset_id}/thumb-{width}.{out_ext}"
                    return safe_object_key_to_path(settings.storage.local_root_dir, key), key

                variants_payload, meta_payload = await asyncio.to_thread(
                    generate_image_thumbnails,
                    in_path=in_path,
                    out_path_for_width=_out_path_for_width,
                    widths=[320, 640],
                )

            elif asset.storage_provider == "s3":
                effective = await get_effective_settings(settings)
                try:
                    provider = build_storage_provider_for(effective, provider="s3")
                except BaseException as exc:
                    _raise_if_fatal(exc)
                    logger.warning(
                        "Asset processor storage provider init failed",
                        action="build_s3_provider",
                        workspace_id=str(workspace_id),
                        asset_id=str(asset_id),
                        error=str(exc),
                    )
                    return
                if not isinstance(provider, S3StorageProvider):
                    return

                # Download source image into tmp (processor needs local file access).
                source_key = f"thumbs/{workspace_id}/{asset_id}/source.{ext or 'bin'}"
                in_path = safe_object_key_to_path(settings.storage.local_tmp_dir, source_key)
                try:
                    await provider.download_object_to_path(object_key=asset.object_key, out_path=in_path)
                except BaseException as exc:
                    _raise_if_fatal(exc)
                    logger.warning(
                        "Asset processor source download failed",
                        action="download_source",
                        workspace_id=str(workspace_id),
                        asset_id=str(asset_id),
                        object_key=asset.object_key,
                        error=str(exc),
                    )
                    return

                out_paths: dict[str, Path] = {}

                def _out_path_for_width(width: int, *, alpha: bool) -> tuple[Path, str]:
                    out_ext = "png" if alpha else "jpg"
                    # Scheme C: thumbnails are public-facing under `/assets/{asset_id}/thumb-*.{ext}`.
                    object_key = f"assets/{asset_id}/thumb-{width}.{out_ext}"
                    local_key = f"thumbs/{workspace_id}/{asset_id}/thumb-{width}.{out_ext}"
                    out_path = safe_object_key_to_path(settings.storage.local_tmp_dir, local_key)
                    out_paths[object_key] = out_path
                    return out_path, object_key

                variants_payload, meta_payload = await asyncio.to_thread(
                    generate_image_thumbnails,
                    in_path=in_path,
                    out_path_for_width=_out_path_for_width,
                    widths=[320, 640],
                )

                # Upload thumbnails to S3 (best-effort).
                thumbs = (variants_payload or {}).get("thumbnails") if isinstance(variants_payload, dict) else None
                if isinstance(thumbs, list):
                    public_read = str(asset.visibility) == "public"
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
                                public_read=public_read,
                                cache_control="public, max-age=31536000, immutable",
                            )
                        except BaseException as exc:
                            _raise_if_fatal(exc)
                            logger.warning(
                                "Asset processor thumbnail upload failed",
                                action="upload_thumbnail",
                                workspace_id=str(workspace_id),
                                asset_id=str(asset_id),
                                object_key=object_key,
                                error=str(exc),
                            )
                            continue

                # Cleanup tmp files (best-effort).
                try:
                    in_path.unlink(missing_ok=True)
                except BaseException as cleanup_exc:
                    _raise_if_fatal(cleanup_exc)
                    logger.warning(
                        "Asset processor temp file cleanup failed",
                        action="cleanup_source",
                        workspace_id=str(workspace_id),
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
                            "Asset processor temp thumbnail cleanup failed",
                            action="cleanup_thumbnail",
                            workspace_id=str(workspace_id),
                            asset_id=str(asset_id),
                            path=str(p),
                            error=str(cleanup_exc),
                        )
                        continue

            else:
                return

            variants: dict = asset.variants if isinstance(asset.variants, dict) else {}
            variants.update(variants_payload)

            meta: dict = asset.meta if isinstance(asset.meta, dict) else {}
            meta.update(meta_payload)

            asset.variants = variants
            asset.meta = meta
            await asset.save(update_fields=["variants", "meta", "updated_at"])
        except BaseException as exc:
            _raise_if_fatal(exc)
            logger.warning(
                "Core asset processor failed",
                action="process_asset_upload",
                error_event=ASSET_UPLOADED_EVENT,
                error=str(exc),
            )

    # Subscribe as "core". If the app hot-reloads, duplicate subscriptions may happen;
    await event_bus.subscribe(
        plugin_id="core",
        event_name=ASSET_UPLOADED_EVENT,
        handler=_on_asset_uploaded,
        priority=0,
        name="core:thumbnail-generator",
    )
