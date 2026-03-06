from __future__ import annotations

"""Asset-related constants."""

ASSET_UPLOADED_EVENT = "asset.uploaded"

# Asset scope identifiers.
ASSET_SCOPE_WORKSPACE = "workspace"
ASSET_SCOPE_ORGANIZATION = "organization"
ASSET_SCOPE_USER = "user"

# Public library ordering allow-list. This keeps the API stable and prevents arbitrary ORDER BY injection.
PUBLIC_LIBRARY_ASSET_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({"created_at", "updated_at", "size_bytes"})

# Admin asset listing ordering allow-list.
ADMIN_ASSET_ALLOWED_ORDER_FIELDS: frozenset[str] = frozenset({
    "created_at",
    "updated_at",
    "size_bytes",
    "purpose",
    "visibility",
})
