from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Protocol

from pydantic import ConfigDict

from src.common.schemas import BaseSchema


class ImageThumbnailVariant(BaseSchema):
    model_config = ConfigDict(frozen=True)

    name: str
    width: int
    height: int
    mime: str
    ext: str
    object_key: str
    size_bytes: int


class OutPathForWidth(Protocol):
    def __call__(self, width: int, *, alpha: bool) -> tuple[Path, str]: ...


def _ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _has_alpha(img) -> bool:  # type: ignore[no-untyped-def]
    try:
        if img.mode in {"RGBA", "LA"}:
            return True
        if img.mode == "P" and "transparency" in (img.info or {}):
            return True
    except (AttributeError, KeyError, TypeError, ValueError):
        return False
    return False


def _generate_image_thumbnails_sync(
    *,
    in_path: Path,
    out_path_for_width: OutPathForWidth,
    widths: list[int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Generate image thumbnails and return:
    - variants payload (to store in AssetRecord.variants)
    - meta payload (to merge into AssetRecord.meta)

    Design goals:
    - deterministic output paths (provider-agnostic via object_key)
    - idempotent: if output exists, skip regeneration
    - preserve EXIF orientation
    """

    # Imported lazily so the app can boot even if Pillow is not installed,
    # and the feature can be turned on/off by dependency availability.
    from PIL import Image, ImageOps  # type: ignore[import-not-found]

    if not in_path.is_file():
        raise FileNotFoundError(str(in_path))

    with Image.open(in_path) as img:
        img = ImageOps.exif_transpose(img)
        orig_w, orig_h = int(img.width), int(img.height)
        alpha = _has_alpha(img)

        variants: list[ImageThumbnailVariant] = []

        for w in sorted({int(x) for x in widths if int(x) > 0}):
            if orig_w <= 0 or orig_h <= 0:
                continue

            target_w = min(w, orig_w)
            target_h = max(1, int(round(orig_h * (target_w / orig_w))))

            out_path, object_key = out_path_for_width(target_w, alpha=alpha)
            if out_path.is_file():
                size_bytes = out_path.stat().st_size
                variants.append(
                    ImageThumbnailVariant(
                        name=f"thumb_{target_w}",
                        width=target_w,
                        height=target_h,
                        mime="image/png" if alpha else "image/jpeg",
                        ext="png" if alpha else "jpg",
                        object_key=object_key,
                        size_bytes=int(size_bytes),
                    )
                )
                continue

            _ensure_parent_dir(out_path)

            resized = img.copy()
            resized.thumbnail((target_w, target_h), resample=Image.Resampling.LANCZOS)

            if alpha:
                # Keep alpha for thumbnails to avoid ugly backgrounds.
                if resized.mode != "RGBA":
                    resized = resized.convert("RGBA")
                resized.save(out_path, format="PNG", optimize=True)
            else:
                if resized.mode not in {"RGB", "L"}:
                    resized = resized.convert("RGB")
                resized.save(out_path, format="JPEG", quality=85, optimize=True, progressive=True)

            size_bytes = out_path.stat().st_size
            variants.append(
                ImageThumbnailVariant(
                    name=f"thumb_{target_w}",
                    width=int(resized.width),
                    height=int(resized.height),
                    mime="image/png" if alpha else "image/jpeg",
                    ext="png" if alpha else "jpg",
                    object_key=object_key,
                    size_bytes=int(size_bytes),
                )
            )

    variants_payload = {"thumbnails": [v.model_dump() for v in variants]}
    meta_payload = {
        "image": {
            "width": orig_w,
            "height": orig_h,
        }
    }
    return variants_payload, meta_payload


async def generate_image_thumbnails(
    *,
    in_path: Path,
    out_path_for_width: OutPathForWidth,
    widths: list[int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    return await asyncio.to_thread(
        _generate_image_thumbnails_sync,
        in_path=in_path,
        out_path_for_width=out_path_for_width,
        widths=widths,
    )
