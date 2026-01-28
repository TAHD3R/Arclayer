from __future__ import annotations

import re
from urllib.parse import quote

_CTL = re.compile(r"[\x00-\x1f\x7f]+")


def build_attachment_content_disposition(filename: str) -> str:
    """
    Build a safe RFC 6266 / RFC 5987 Content-Disposition header value for attachments.

    Notes:
    - Always include an ASCII fallback in `filename=`.
    - Include UTF-8 `filename*=` for better international filename support.
    - Strip control characters and prevent header injection.
    """

    raw = (filename or "").strip()
    raw = raw.replace("\r", "").replace("\n", "")
    raw = _CTL.sub("", raw)

    if not raw:
        raw = "download"

    # ASCII fallback: replace unsafe chars.
    ascii_fallback = raw.encode("ascii", "ignore").decode("ascii")
    ascii_fallback = ascii_fallback.replace("\\", "_").replace("/", "_").replace('"', "_")
    ascii_fallback = ascii_fallback.strip() or "download"

    # RFC 5987: percent-encode UTF-8 bytes.
    quoted = quote(raw, safe="")
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quoted}"
