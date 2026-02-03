from __future__ import annotations

"""
Core RBAC permission templates.

Notes:
- This file defines the source of truth for core permissions. Plugins can contribute additional
  permissions via their manifests, and all templates are registered into the plugin registry.
- Workspace system roles are immutable: their permission sets are reconciled from these templates.
"""

from apps.api.plugin.manifest import PermissionTemplate

# Core permission templates must live outside the plugin system, because RBAC is a core capability.
# These templates are registered into the plugin registry at startup so RBAC can sync them into DB.
CORE_PERMISSION_TEMPLATES: list[PermissionTemplate] = [
    # Admin access gate (required for all /admin/** routes).
    PermissionTemplate(
        code="admin:access",
        scope="workspace",
        name="Access admin console",
        description="Allow accessing /admin/** routes.",
        name_i18n="rbac:RBAC_PERM_ADMIN_ACCESS_NAME",
        description_i18n="rbac:RBAC_PERM_ADMIN_ACCESS_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    # Admin menu management (dynamic routing tree).
    PermissionTemplate(
        code="admin:menu:read",
        scope="workspace",
        name="Read admin menus",
        description="Allow listing and viewing admin menu items.",
        name_i18n="admin_menu:PERM_MENU_READ_NAME",
        description_i18n="admin_menu:PERM_MENU_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="admin:menu:write",
        scope="workspace",
        name="Manage admin menus",
        description="Allow creating, updating, deleting and reordering admin menu items.",
        name_i18n="admin_menu:PERM_MENU_WRITE_NAME",
        description_i18n="admin_menu:PERM_MENU_WRITE_DESC",
        default_roles=["owner", "admin"],
    ),
    # System (workspace-level) settings.
    PermissionTemplate(
        code="system:settings:read",
        scope="workspace",
        name="Read settings",
        description="Allow reading system settings and plugin settings.",
        name_i18n="rbac:RBAC_PERM_SETTINGS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_SETTINGS_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:settings:manage",
        scope="workspace",
        name="Manage settings",
        description="Allow updating system settings and plugin settings.",
        name_i18n="rbac:RBAC_PERM_SETTINGS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_SETTINGS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    # Workspace RBAC management (custom roles + assignments).
    PermissionTemplate(
        code="rbac:roles:read",
        scope="workspace",
        name="Read roles",
        description="Allow listing roles and role details in current workspace.",
        name_i18n="rbac:RBAC_PERM_RBAC_ROLES_READ_NAME",
        description_i18n="rbac:RBAC_PERM_RBAC_ROLES_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="rbac:roles:write",
        scope="workspace",
        name="Manage roles",
        description="Allow creating, updating, and deleting custom roles in current workspace.",
        name_i18n="rbac:RBAC_PERM_RBAC_ROLES_WRITE_NAME",
        description_i18n="rbac:RBAC_PERM_RBAC_ROLES_WRITE_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="rbac:users:assign",
        scope="workspace",
        name="Assign user roles",
        description="Allow assigning and revoking user roles in current workspace.",
        name_i18n="rbac:RBAC_PERM_RBAC_USERS_ASSIGN_NAME",
        description_i18n="rbac:RBAC_PERM_RBAC_USERS_ASSIGN_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="rbac:permissions:read",
        scope="workspace",
        name="Read permissions",
        description="Allow listing permissions (workspace-scoped).",
        name_i18n="rbac:RBAC_PERM_RBAC_PERMS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_RBAC_PERMS_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    # Admin user management (workspace-scoped admin console).
    PermissionTemplate(
        code="admin:users:read",
        scope="workspace",
        name="Read admin users",
        description="Allow listing users and reading user details in admin console.",
        name_i18n="rbac:RBAC_PERM_ADMIN_USERS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_ADMIN_USERS_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="admin:users:write",
        scope="workspace",
        name="Manage admin users",
        description="Allow creating, updating, enabling and disabling users in admin console.",
        name_i18n="rbac:RBAC_PERM_ADMIN_USERS_WRITE_NAME",
        description_i18n="rbac:RBAC_PERM_ADMIN_USERS_WRITE_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="admin:users:reset-password",
        scope="workspace",
        name="Reset user password",
        description="Allow resetting user password in admin console.",
        name_i18n="rbac:RBAC_PERM_ADMIN_USERS_RESET_PW_NAME",
        description_i18n="rbac:RBAC_PERM_ADMIN_USERS_RESET_PW_DESC",
        default_roles=["owner", "admin"],
    ),
    # Team collaboration (workspace governance boundary in v2).
    PermissionTemplate(
        code="team:members:read",
        scope="workspace",
        name="Read team members",
        description="Allow listing members in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_READ_DESC",
        default_roles=["owner", "admin", "viewer"],
    ),
    PermissionTemplate(
        code="team:members:roles:manage",
        scope="workspace",
        name="Manage member roles",
        description="Allow managing member role bindings in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_MEMBER_ROLES_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_MEMBER_ROLES_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="team:members:manage",
        scope="workspace",
        name="Manage team members",
        description="Allow enabling/disabling members and updating member profiles in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="team:members:reset-password",
        scope="workspace",
        name="Reset member password",
        description="Allow resetting user password for a member in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_RESET_PW_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_MEMBERS_RESET_PW_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="team:invitations:manage",
        scope="workspace",
        name="Manage invitations",
        description="Allow creating, listing, renewing and revoking invites in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_INVITES_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_INVITES_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="team:invite-links:manage",
        scope="workspace",
        name="Manage invite links",
        description="Allow managing reusable invite links in current workspace.",
        name_i18n="rbac:RBAC_PERM_TEAM_INVITE_LINKS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_TEAM_INVITE_LINKS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    # Plugin management entry points in admin console.
    #
    # Note:
    # - v2 uses workspace as the governance boundary for admin UI authorization.
    # - System-level plugin manager endpoints are still guarded by org membership role,
    #   but the *UI visibility* and workspace admin console features should be controlled
    #   by workspace-scoped permissions.
    PermissionTemplate(
        code="system:plugins:read",
        scope="workspace",
        name="Read plugins",
        description="Allow listing plugins and reading plugin details.",
        name_i18n="rbac:RBAC_PERM_PLUGINS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_PLUGINS_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="system:plugins:manage",
        scope="workspace",
        name="Manage plugins",
        description="Allow installing, enabling, disabling, and configuring plugins.",
        name_i18n="rbac:RBAC_PERM_PLUGINS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_PLUGINS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
]
