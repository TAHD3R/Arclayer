from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Literal
from uuid import uuid4

from apps.api.modules.assets.utils import slugify

WORKSPACE_SLUG_MAX_LEN = 64

# Workspace slug is a public identifier: it can be used as a tenant subdomain in SaaS,
# and as a path segment prefix in self-host mode (/w/:workspaceSlug).
RESERVED_WORKSPACE_SLUGS: frozenset[str] = frozenset({
    # Common platform/reserved subdomains.
    "admin",
    "api",
    "www",
    # Portal reserved paths/modes.
    "preview",
    "editor",
    "debug",
    # Misc infrastructure.
    "assets",
    "static",
    "system",
})

ExplicitWorkspaceSlugError = Literal["invalid", "reserved"]


def normalize_workspace_slug(value: str, *, fallback: str = "workspace") -> str:
    """
    Normalize a slug seed into a safe workspaceSlug.

    This is meant for auto-generated slugs (e.g. derived from workspace name).
    For user-provided slugs, use `parse_explicit_workspace_slug()` instead.
    """

    raw = slugify(value)
    if not raw or raw == "asset":
        raw = slugify(fallback)

    candidate = (raw or "workspace")[:WORKSPACE_SLUG_MAX_LEN]

    if candidate in RESERVED_WORKSPACE_SLUGS:
        # Prefer suffix to keep the original intent visible, e.g. "admin-ws".
        alt = slugify(f"{candidate}-ws")[:WORKSPACE_SLUG_MAX_LEN]
        if alt and alt != "asset" and alt not in RESERVED_WORKSPACE_SLUGS:
            return alt

        # Fallback to prefix if suffix somehow collapses to a reserved value.
        alt = slugify(f"ws-{candidate}")[:WORKSPACE_SLUG_MAX_LEN]
        if alt and alt != "asset" and alt not in RESERVED_WORKSPACE_SLUGS:
            return alt

        # Last resort: force a generic fallback.
        alt = slugify(fallback)[:WORKSPACE_SLUG_MAX_LEN]
        if alt and alt != "asset" and alt not in RESERVED_WORKSPACE_SLUGS:
            return alt
        return "workspace"

    return candidate


def parse_explicit_workspace_slug(value: str) -> tuple[str | None, ExplicitWorkspaceSlugError | None]:
    """
    Parse and validate an explicit workspace slug provided by user input.

    Returns:
    - (normalized_slug, None) if valid
    - (None, "invalid") if empty/invalid
    - (normalized_slug, "reserved") if reserved
    """

    desired = str(value or "").strip()
    if not desired:
        return None, "invalid"

    normalized = slugify(desired)
    if not normalized or normalized == "asset":
        return None, "invalid"

    normalized = normalized[:WORKSPACE_SLUG_MAX_LEN]
    if normalized in RESERVED_WORKSPACE_SLUGS:
        return normalized, "reserved"

    return normalized, None


async def next_available_workspace_slug(*, base_slug: str, exists_fn: Callable[[str], Awaitable[bool]]) -> str:
    """
    Find the next available workspaceSlug.

    Notes:
    - Uniqueness is global (across organizations).
    - Reserved slugs are auto-avoided by `normalize_workspace_slug()`.
    """

    base = normalize_workspace_slug(base_slug, fallback="workspace")
    candidate = base[:WORKSPACE_SLUG_MAX_LEN]

    for index in range(1, 200):
        if not await exists_fn(candidate):
            return candidate
        suffix = f"-{index + 1}"
        candidate = f"{base[: max(1, WORKSPACE_SLUG_MAX_LEN - len(suffix))]}{suffix}"

    return f"{base[:55]}-{uuid4().hex[:8]}"
