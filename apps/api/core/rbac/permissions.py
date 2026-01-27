from __future__ import annotations

from apps.api.plugin.manifest import PermissionTemplate

# Core permission templates must live outside the plugin system, because RBAC is now a core capability.
# These templates are registered into the plugin registry at startup so RBAC can sync them into DB.
CORE_PERMISSION_TEMPLATES: list[PermissionTemplate] = [
    # Admin access gate (required for all /admin/** routes).
    PermissionTemplate(
        code="admin:access",
        name="Access admin console",
        description="Allow accessing /admin/** routes.",
        default_roles=["admin"],
    ),
    # System (core) management.
    PermissionTemplate(
        code="system:plugins:read",
        name="Read plugins",
        description="Allow listing plugins and reading plugin details.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="system:plugins:manage",
        name="Manage plugins",
        description="Allow installing, enabling, disabling, and configuring plugins.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="system:settings:read",
        name="Read settings",
        description="Allow reading system settings and plugin settings.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="system:settings:manage",
        name="Manage settings",
        description="Allow updating system settings and plugin settings.",
        default_roles=["admin"],
    ),
    # RBAC admin.
    PermissionTemplate(
        code="rbac:roles:read",
        name="Read roles",
        description="Allow listing roles and role details.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="rbac:roles:write",
        name="Manage roles",
        description="Allow creating, updating, and deleting roles.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="rbac:users:assign",
        name="Assign user roles",
        description="Allow assigning and revoking user roles.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="rbac:permissions:read",
        name="Read permissions",
        description="Allow listing permissions.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="rbac:permissions:sync",
        name="Sync permissions",
        description="Allow syncing permissions from plugins and core.",
        default_roles=["admin"],
    ),
    # Admin user management.
    PermissionTemplate(
        code="admin:users:read",
        name="Read admin users",
        description="Allow listing users and reading user details in admin console.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="admin:users:write",
        name="Manage admin users",
        description="Allow creating, updating, enabling and disabling users.",
        default_roles=["admin"],
    ),
    PermissionTemplate(
        code="admin:users:reset-password",
        name="Reset user password",
        description="Allow resetting user password in admin console.",
        default_roles=["admin"],
    ),
]
