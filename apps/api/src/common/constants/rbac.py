from __future__ import annotations

"""RBAC-related constants."""

# Workspace system roles (stable identifiers persisted in DB).
ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_DESIGNER = "designer"
ROLE_VIEWER = "viewer"

# Synthetic owner id for core permission templates registered into the plugin registry.
CORE_PERMISSION_OWNER = "core"

RBAC_ROLE_RESOLVER_EXTENSION_POINT = "rbac-role-resolver"
