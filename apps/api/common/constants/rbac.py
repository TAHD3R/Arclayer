from __future__ import annotations

"""RBAC-related constants."""

# Keep role codes stable because they are persisted in DB and referenced by defaults.
ROLE_ADMIN = "admin"
ROLE_USER = "user"

# Marker row key for one-time admin bootstrap.
BOOTSTRAP_KEY = "bootstrap_admin"

# Synthetic owner id for core permission templates registered into the plugin registry.
CORE_PERMISSION_OWNER = "core"

RBAC_ROLE_RESOLVER_EXTENSION_POINT = "rbac-role-resolver"

