from __future__ import annotations


def is_asset_thumbnail_previewable(*, mime: str | None, ext: str | None) -> bool:
    """Return whether the asset family has a supported preview-source pipeline."""

    normalized_mime = (mime or "").strip().lower()
    normalized_ext = (ext or "").strip().lstrip(".").lower()
    if normalized_mime.startswith("image/") or normalized_ext in {
        "gif",
        "jpeg",
        "jpg",
        "png",
        "webp",
    }:
        return True
    if normalized_mime == "application/pdf" or normalized_ext == "pdf":
        return True
    return normalized_mime.startswith("video/") or normalized_ext in {
        "m4v",
        "mov",
        "mp4",
        "webm",
    }
