from __future__ import annotations

import re
from pathlib import Path

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.config import UploadPolicySettings, UploadPurposePolicySettings
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
_FORBIDDEN_EXTS = frozenset({"svg"})
_MIME_BY_EXT: dict[str, frozenset[str]] = {
    "jpg": frozenset({"image/jpeg"}),
    "jpeg": frozenset({"image/jpeg"}),
    "png": frozenset({"image/png"}),
    "webp": frozenset({"image/webp"}),
    "gif": frozenset({"image/gif"}),
    "bmp": frozenset({"image/bmp", "image/x-ms-bmp"}),
    "tif": frozenset({"image/tiff"}),
    "tiff": frozenset({"image/tiff"}),
    "avif": frozenset({"image/avif"}),
    "ico": frozenset({"image/x-icon", "image/vnd.microsoft.icon"}),
    "zip": frozenset({"application/zip", "application/x-zip-compressed"}),
    "pdf": frozenset({"application/pdf"}),
    "mp4": frozenset({"video/mp4"}),
    "webm": frozenset({"video/webm"}),
    "mov": frozenset({"video/quicktime"}),
    "m4v": frozenset({"video/mp4", "video/x-m4v"}),
    "woff2": frozenset({"font/woff2", "application/font-woff2"}),
    "woff": frozenset({"font/woff", "application/font-woff"}),
    "ttf": frozenset({"font/ttf", "application/x-font-ttf"}),
    "otf": frozenset({"font/otf", "application/x-font-otf"}),
    "eot": frozenset({"application/vnd.ms-fontobject"}),
}


class UploadPolicy(BaseSchema):
    model_config = ConfigDict(frozen=True)

    allowed_exts: frozenset[str]
    allowed_mime_types: frozenset[str]
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


def _normalize_exts(values: object) -> frozenset[str]:
    if not isinstance(values, (list, tuple, set, frozenset)):
        return frozenset()
    normalized: set[str] = set()
    for item in values:
        ext = str(item or "").strip().lower().lstrip(".")
        if ext and ext not in _FORBIDDEN_EXTS:
            normalized.add(ext)
    return frozenset(normalized)


def _mime_types_for_exts(exts: frozenset[str]) -> frozenset[str]:
    mime_types: set[str] = set()
    for ext in exts:
        mime_types.update(_MIME_BY_EXT.get(ext, frozenset()))
    return frozenset(mime_types)


def _policy_settings_for_purpose(
    *,
    purpose: str,
    upload_policy_settings: UploadPolicySettings,
) -> UploadPurposePolicySettings:
    p = (purpose or "").strip().lower()
    return upload_policy_settings.purposes.get(p) or upload_policy_settings.defaults


def build_upload_policy(
    *,
    purpose: str,
    global_max_size_bytes: int,
    max_avatar_size_bytes: int,
    max_site_logo_size_bytes: int,
    max_favicon_size_bytes: int,
    upload_policy_settings: UploadPolicySettings | None = None,
) -> UploadPolicy:
    p = (purpose or "").strip().lower()

    if upload_policy_settings is not None:
        purpose_settings = _policy_settings_for_purpose(
            purpose=p,
            upload_policy_settings=upload_policy_settings,
        )
        allowed_exts = _normalize_exts(purpose_settings.allowed_extensions)
        max_size_bytes = min(global_max_size_bytes, int(purpose_settings.max_size_mb) * 1024 * 1024)
        forced_public = p in {"avatar", "site_logo", "workspace_icon", "favicon"}
        return UploadPolicy(
            allowed_exts=allowed_exts,
            allowed_mime_types=_mime_types_for_exts(allowed_exts),
            max_size_bytes=max_size_bytes,
            forced_visibility="public" if forced_public else None,
            forced_indexable=False if forced_public else None,
        )

    if p == "avatar":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            allowed_mime_types=_mime_types_for_exts(_IMAGE_EXTS),
            max_size_bytes=min(global_max_size_bytes, max_avatar_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "site_logo":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            allowed_mime_types=_mime_types_for_exts(_IMAGE_EXTS),
            max_size_bytes=min(global_max_size_bytes, max_site_logo_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "workspace_icon":
        return UploadPolicy(
            allowed_exts=_IMAGE_EXTS,
            allowed_mime_types=_mime_types_for_exts(_IMAGE_EXTS),
            max_size_bytes=min(global_max_size_bytes, max_site_logo_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    if p == "favicon":
        return UploadPolicy(
            allowed_exts=_FAVICON_EXTS,
            allowed_mime_types=_mime_types_for_exts(_FAVICON_EXTS),
            max_size_bytes=min(global_max_size_bytes, max_favicon_size_bytes),
            forced_visibility="public",
            forced_indexable=False,
        )

    # Default policy for resource library and custom upload purposes.
    return UploadPolicy(
        allowed_exts=(_IMAGE_EXTS | _ARCHIVE_EXTS | _DOC_EXTS | _VIDEO_EXTS | _FONT_EXTS),
        allowed_mime_types=_mime_types_for_exts(_IMAGE_EXTS | _ARCHIVE_EXTS | _DOC_EXTS | _VIDEO_EXTS | _FONT_EXTS),
        max_size_bytes=global_max_size_bytes,
        forced_visibility=None,
        forced_indexable=None,
    )


def validate_upload_metadata(
    *,
    purpose: str,
    filename: str,
    mime: str | None = None,
    size_bytes: int,
    policy: UploadPolicy,
) -> str:
    if size_bytes < 0:
        raise BadRequest(message=_ts("UPLOAD_SIZE_INVALID", "文件大小不合法"), error="UPLOAD_SIZE_INVALID")
    if size_bytes > int(policy.max_size_bytes):
        raise BadRequest(message=_ts("UPLOAD_TOO_LARGE", "文件过大"), error="UPLOAD_TOO_LARGE")

    ext = extract_extension(filename)
    if ext in _FORBIDDEN_EXTS:
        raise BadRequest(
            message=_ts("UPLOAD_TYPE_NOT_ALLOWED", "不支持的文件类型"),
            error="UPLOAD_TYPE_NOT_ALLOWED",
            meta={"purpose": purpose, "ext": ext},
        )
    if ext not in policy.allowed_exts:
        raise BadRequest(
            message=_ts("UPLOAD_TYPE_NOT_ALLOWED", "不支持的文件类型"),
            error="UPLOAD_TYPE_NOT_ALLOWED",
            meta={"purpose": purpose, "ext": ext},
        )
    normalized_mime = str(mime or "").strip().lower()
    expected_mime_types = _MIME_BY_EXT.get(ext)
    if normalized_mime and expected_mime_types and normalized_mime not in expected_mime_types:
        raise BadRequest(
            message=_ts("UPLOAD_MIME_NOT_ALLOWED", "文件 MIME 类型与扩展名不匹配"),
            error="UPLOAD_MIME_NOT_ALLOWED",
            meta={"purpose": purpose, "ext": ext, "mime": normalized_mime},
        )

    return ext
