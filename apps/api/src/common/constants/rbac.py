from __future__ import annotations

"""RBAC-related constants."""

# Workspace system roles (stable identifiers persisted in DB).
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_DESIGNER = "designer"
ROLE_VIEWER = "viewer"

# Synthetic owner id for core permission templates registered into the RBAC catalog.
CORE_PERMISSION_OWNER = "core"

# Workspace commercial authorization permissions.
WORKSPACE_COMMERCE_MANAGE = "workspace:commerce:manage"
WORKSPACE_FEATURE_SEATS_MANAGE = "workspace:feature-seats:manage"
