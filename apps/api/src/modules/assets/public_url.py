from __future__ import annotations

from typing import Final
from urllib.parse import urlparse
from uuid import UUID

from apps.api.src.common.utils.public_ids import decode_public_id, is_public_id

_ASSET_PATH_PREFIX: Final[str] = "/assets/"


def try_extract_asset_uuid_from_relative_public_url(url: str | None) -> UUID | None:
    """
    Extract asset UUID from a relative public asset URL.

    Supported examples:
    - /assets/<public_id>
    - /assets/<public_id>/file.png
    - /assets/<public_id>/thumb

    Notes:
    - Only accepts *relative* URLs (no scheme/host). Absolute URLs are treated as external.
    - Returns None when the URL doesn't look like a public asset link.
    """

    raw = str(url or "").strip()
    if not raw:
        return None

    parsed = urlparse(raw)
    if parsed.scheme or parsed.netloc:
        return None

    path = (parsed.path or "").strip()
    if not path.startswith(_ASSET_PATH_PREFIX):
        return None

    rest = path[len(_ASSET_PATH_PREFIX) :]
    public_id = rest.split("/", 1)[0].strip()
    if not is_public_id(public_id):
        return None

    try:
        return decode_public_id(public_id)
    except Exception:
        return None
