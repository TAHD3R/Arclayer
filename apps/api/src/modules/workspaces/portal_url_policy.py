from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def rewrite_workspace_slug_in_portal_url(value: str, *, workspace_slug: str) -> str:
    """
    Best-effort rewrite for Portal base URLs that use path-based multi-tenancy.

    Pattern:
    - /w/:workspaceSlug/...  -> replace :workspaceSlug

    Notes:
    - If the URL doesn't include a /w/... segment, we leave it untouched. This keeps
      compatibility with custom domains that may not use the /w prefix.
    """

    raw = str(value or "").strip()
    if not raw:
        return ""

    # Be tolerant with host-only inputs like "localhost:3100".
    parsed = urlsplit(raw if "://" in raw else f"http://{raw}")

    path = parsed.path or "/"
    parts = path.split("/")
    if len(parts) < 2 or parts[1] != "w":
        return raw

    # Ensure we have a slot for the slug segment: /w/:slug
    if len(parts) < 3:
        parts.append("")
    parts[2] = str(workspace_slug or "").strip()

    new_path = "/".join(parts) or "/"
    rebuilt = parsed._replace(path=new_path)
    out = urlunsplit(rebuilt)

    # Prefer returning a fully-qualified URL (consistent with UI validation).
    return out
