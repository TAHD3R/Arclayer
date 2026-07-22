from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Any, Protocol

from pydantic import ConfigDict

from src.common.schemas import BaseSchema


class PreviewSourceInvalidError(ValueError):
    """The source bytes deterministically cannot produce a media preview."""


class PreviewRendererTemporarilyUnavailableError(RuntimeError):
    """The configured preview renderer cannot currently execute."""


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
        raise PreviewRendererTemporarilyUnavailableError("Image scratch source is unavailable")

    try:
        with Image.open(in_path) as opened:
            opened.load()
            img = ImageOps.exif_transpose(opened).copy()
    except OSError as exc:
        if isinstance(exc, (FileNotFoundError, PermissionError)) or exc.errno is not None:
            raise PreviewRendererTemporarilyUnavailableError("Image scratch source is temporarily unavailable") from exc
        raise PreviewSourceInvalidError("Image source could not be decoded") from exc
    except ValueError as exc:
        raise PreviewSourceInvalidError("Image source could not be decoded") from exc

    orig_w, orig_h = int(img.width), int(img.height)
    if orig_w <= 0 or orig_h <= 0:
        raise PreviewSourceInvalidError("Image source dimensions are invalid")
    alpha = _has_alpha(img)
    variants: list[ImageThumbnailVariant] = []

    requested_widths = {int(width) for width in widths if int(width) > 0}
    target_widths = sorted({min(width, orig_w) for width in requested_widths})
    for target_w in target_widths:
        target_h = max(1, int(round(orig_h * (target_w / orig_w))))
        out_path, object_key = out_path_for_width(target_w, alpha=alpha)
        try:
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
                if resized.mode != "RGBA":
                    resized = resized.convert("RGBA")
                resized.save(out_path, format="PNG", optimize=True)
            else:
                if resized.mode not in {"RGB", "L"}:
                    resized = resized.convert("RGB")
                resized.save(out_path, format="JPEG", quality=85, optimize=True, progressive=True)
            size_bytes = out_path.stat().st_size
        except OSError as exc:
            raise PreviewRendererTemporarilyUnavailableError(
                "Image renderer output is temporarily unavailable"
            ) from exc
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


def _render_pdf_preview_source_sync(*, in_path: Path, out_path: Path) -> dict[str, Any]:
    if not in_path.is_file():
        raise PreviewRendererTemporarilyUnavailableError("PDF scratch source is unavailable")

    try:
        import pypdfium2 as pdfium  # type: ignore[import-not-found]
    except (ImportError, OSError) as exc:
        raise PreviewRendererTemporarilyUnavailableError("PDF renderer is unavailable") from exc

    try:
        _ensure_parent_dir(out_path)
        pdf = pdfium.PdfDocument(str(in_path))
        try:
            if len(pdf) < 1:
                raise PreviewSourceInvalidError("PDF has no pages")
            page = pdf[0]
            try:
                bitmap = page.render(scale=2.0)
                image = bitmap.to_pil()
                if image.mode not in {"RGB", "L"}:
                    image = image.convert("RGB")
                image.save(out_path, format="PNG", optimize=True)
                return {"document": {"preview_source": "first_page"}}
            finally:
                page.close()
        finally:
            pdf.close()
    except PreviewSourceInvalidError:
        raise
    except pdfium.PdfiumError as exc:
        raise PreviewSourceInvalidError("PDF source could not be rendered") from exc
    except OSError as exc:
        raise PreviewRendererTemporarilyUnavailableError("PDF renderer execution failed") from exc


def _render_video_preview_source_sync(*, in_path: Path, out_path: Path) -> dict[str, Any]:
    if not in_path.is_file():
        raise PreviewRendererTemporarilyUnavailableError("Video scratch source is unavailable")

    try:
        from imageio_ffmpeg import get_ffmpeg_exe  # type: ignore[import-not-found]

        ffmpeg = get_ffmpeg_exe()
    except (ImportError, OSError, RuntimeError) as exc:
        raise PreviewRendererTemporarilyUnavailableError("ffmpeg renderer is unavailable") from exc

    try:
        _ensure_parent_dir(out_path)
    except OSError as exc:
        raise PreviewRendererTemporarilyUnavailableError("Video renderer output is unavailable") from exc
    attempts = ("1", "0.1", "0")
    for seek in attempts:
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            seek,
            "-i",
            str(in_path),
            "-frames:v",
            "1",
            "-an",
            "-sn",
            str(out_path),
        ]
        try:
            result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise PreviewRendererTemporarilyUnavailableError("ffmpeg renderer execution failed") from exc
        if result.returncode < 0:
            raise PreviewRendererTemporarilyUnavailableError("ffmpeg renderer terminated unexpectedly")
        try:
            produced_frame = result.returncode == 0 and out_path.is_file() and out_path.stat().st_size > 0
        except OSError as exc:
            raise PreviewRendererTemporarilyUnavailableError("Video renderer output is unavailable") from exc
        if produced_frame:
            return {"video": {"preview_source": "frame", "seek_seconds": float(seek)}}
    raise PreviewSourceInvalidError("ffmpeg could not decode the video source")


def _source_kind_for_preview(*, mime: str | None, ext: str | None) -> str | None:
    normalized_mime = (mime or "").strip().lower()
    normalized_ext = (ext or "").strip().lstrip(".").lower()
    if normalized_mime.startswith("image/") or normalized_ext in {"jpg", "jpeg", "png", "webp", "gif"}:
        return "image"
    if normalized_mime == "application/pdf" or normalized_ext == "pdf":
        return "pdf"
    if normalized_mime.startswith("video/") or normalized_ext in {"mp4", "mov", "webm", "m4v"}:
        return "video"
    return None


async def render_preview_source(
    *,
    in_path: Path,
    out_path: Path,
    mime: str | None,
    ext: str | None,
) -> tuple[Path, dict[str, Any]]:
    kind = _source_kind_for_preview(mime=mime, ext=ext)
    if kind == "image":
        return in_path, {"image": {"preview_source": "original"}}
    if kind == "pdf":
        meta = await asyncio.to_thread(_render_pdf_preview_source_sync, in_path=in_path, out_path=out_path)
        return out_path, meta
    if kind == "video":
        meta = await asyncio.to_thread(_render_video_preview_source_sync, in_path=in_path, out_path=out_path)
        return out_path, meta
    raise ValueError("unsupported preview source")
