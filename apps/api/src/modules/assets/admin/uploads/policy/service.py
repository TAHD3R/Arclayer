from __future__ import annotations

import re
from pathlib import Path

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest
from src.core.i18n import t


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


_SHA256_HEX = re.compile(r"^[0-9a-fA-F]{64}$")

# NOTE: We intentionally keep the allow-list small and conservative.
# - SVG is excluded by default due to XSS risk when served inline on same-origin.
# - More formats can be enabled later via admin-configurable policies.
_IMAGE_EXTS = frozenset({"jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif"})
_FAVICON_EXTS = frozenset({"ico", "png"})
_ARCHIVE_EXTS = frozenset({"zip"})
_DOC_EXTS = frozenset({"pdf"})
_VIDEO_EXTS = frozenset({"mp4", "webm", "mov", "m4v"})
_FONT_EXTS = frozenset({"woff2", "woff", "ttf", "otf", "eot"})


class UploadPolicy(BaseSchema):
    model_config = ConfigDict(frozen=True)

    allowed_exts: frozenset[str]
    max_size_bytes: int
    forced_visibility: str | None = None
    forced_indexable: bool | None = None


def validate_sha256_hex(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    if not _SHA256_HEX.match(v):
        raise BadRequest(message=_ts("UPLOAD_SHA256_INVALID", "SHA-256 不合法"), error="UPLOAD_SHA256_INVALID")
    return v.lower()


def normalize_original_filename(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        raise BadRequest(message=_ts("UPLOAD_FILENAME_INVALID", "文件名不合法"), error="UPLOAD_FILENAME_INVALID")

    # Reject any path-like input early to avoid leaking client paths into DB and logs.
    if "/" in raw or "\\" in raw:
        raise BadRequest(message=_ts("UPLOAD_FILENAME_INVALID", "文件名不合法"), error="UPLOAD_FILENAME_INVALID")
    return raw


def extract_extension(filename: str) -> str:
    name = normalize_original_filename(filename)
    ext = (Path(name).suffix or "").lstrip(".").strip().lower()
    return ext or "bin"


def build_upload_policy(
    *,
    purpose: str,
    global_max_size_bytes: int,
    max_avatar_size_bytes: int,
    max_site_logo_size_bytes: int,
    max_favicon_size_bytes: int,
) -> UploadPolicy:
    p = (purpose or "").strip().lower()

    if p == "avatar":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            max_size_bytes=min(global_max_size_bytes, max_avatar_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "site_logo":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            max_size_bytes=min(global_max_size_bytes, max_site_logo_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "workspace_icon":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            max_size_bytes=min(global_max_size_bytes, max_site_logo_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "favicon":
        return UploadPolicy(
            allowed_exts=_FAVICON_EXTS,
            max_size_bytes=min(global_max_size_bytes, max_favicon_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    # Default policy for resource library and custom upload purposes.
    return UploadPolicy(
        allowed_exts=(_IMAGE_EXTS | _ARCHIVE_EXTS | _DOC_EXTS | _VIDEO_EXTS | _FONT_EXTS),
        max_size_bytes=global_max_size_bytes,
        forced_visibility=None,
        forced_indexable=None,
    )


def validate_upload_metadata(
    *,
    purpose: str,
    filename: str,
    size_bytes: int,
    policy: UploadPolicy,
) -> str:
    if size_bytes < 0:
        raise BadRequest(message=_ts("UPLOAD_SIZE_INVALID", "文件大小不合法"), error="UPLOAD_SIZE_INVALID")
    if size_bytes > int(policy.max_size_bytes):
        raise BadRequest(message=_ts("UPLOAD_TOO_LARGE", "文件过大"), error="UPLOAD_TOO_LARGE")

    ext = extract_extension(filename)
    if ext not in policy.allowed_exts:
        raise BadRequest(
            message=_ts("UPLOAD_TYPE_NOT_ALLOWED", "不支持的文件类型"),
            error="UPLOAD_TYPE_NOT_ALLOWED",
            meta={"purpose": purpose, "ext": ext},
        )

    return ext
