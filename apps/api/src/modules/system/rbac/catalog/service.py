from __future__ import annotations

"""
Core RBAC permission templates.

Notes:
- This file defines the source of truth for core permissions.
- Workspace system roles are immutable: their permission sets are reconciled from these templates.
"""

from src.modules.system.rbac.schema import PermissionTemplate

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
    # Site administration (single-site workspace model).
    PermissionTemplate(
        code="system:site:read",
        scope="workspace",
        name="Read site",
        description="Allow viewing workspace site metadata.",
        name_i18n="rbac:RBAC_PERM_SITE_READ_NAME",
        description_i18n="rbac:RBAC_PERM_SITE_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:site:manage",
        scope="workspace",
        name="Manage site",
        description="Allow managing workspace site operations such as issuing preview tokens.",
        name_i18n="rbac:RBAC_PERM_SITE_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_SITE_MANAGE_DESC",
        default_roles=["owner", "admin", "editor", "designer"],
    ),
    # Content management.
    PermissionTemplate(
        code="system:content:read",
        scope="workspace",
        name="Read content",
        description="Allow viewing content models, entries, pages, structures, and appearance settings.",
        name_i18n="rbac:RBAC_PERM_CONTENT_READ_NAME",
        description_i18n="rbac:RBAC_PERM_CONTENT_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:content:manage",
        scope="workspace",
        name="Manage content",
        description="Allow creating and editing content models, entries, pages, structures, and appearance settings.",
        name_i18n="rbac:RBAC_PERM_CONTENT_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_CONTENT_MANAGE_DESC",
        default_roles=["owner", "admin", "editor", "designer"],
    ),
    PermissionTemplate(
        code="system:content:publish",
        scope="workspace",
        name="Publish content",
        description="Allow publishing, unpublishing, and rolling back content revisions.",
        name_i18n="rbac:RBAC_PERM_CONTENT_PUBLISH_NAME",
        description_i18n="rbac:RBAC_PERM_CONTENT_PUBLISH_DESC",
        default_roles=["owner", "admin", "editor"],
    ),
    # API keys.
    PermissionTemplate(
        code="system:keys:read",
        scope="workspace",
        name="Read API keys",
        description="Allow listing and reading workspace service keys and delivery keys.",
        name_i18n="rbac:RBAC_PERM_KEYS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_KEYS_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="system:keys:manage",
        scope="workspace",
        name="Manage API keys",
        description="Allow creating, revoking, and rotating workspace service keys and delivery keys.",
        name_i18n="rbac:RBAC_PERM_KEYS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_KEYS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    # Themes.
    PermissionTemplate(
        code="system:themes:read",
        scope="workspace",
        name="Read themes",
        description="Allow viewing installed themes and theme package details.",
        name_i18n="rbac:RBAC_PERM_THEMES_READ_NAME",
        description_i18n="rbac:RBAC_PERM_THEMES_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:themes:manage",
        scope="workspace",
        name="Manage themes",
        description="Allow importing and uninstalling workspace themes.",
        name_i18n="rbac:RBAC_PERM_THEMES_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_THEMES_MANAGE_DESC",
        default_roles=["owner", "admin", "designer"],
    ),
    # Asset library and uploads.
    PermissionTemplate(
        code="system:assets:read",
        scope="workspace",
        name="Read assets",
        description="Allow listing and viewing asset library items, folders, tags, and usages.",
        name_i18n="rbac:RBAC_PERM_ASSETS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_ASSETS_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:assets:manage",
        scope="workspace",
        name="Manage assets",
        description="Allow uploading, updating, moving, deleting, and organizing asset library items and usages.",
        name_i18n="rbac:RBAC_PERM_ASSETS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_ASSETS_MANAGE_DESC",
        default_roles=["owner", "admin", "editor", "designer"],
    ),
    # Site domains.
    PermissionTemplate(
        code="system:domains:read",
        scope="workspace",
        name="Read domains",
        description="Allow viewing site custom domain bindings and verification status.",
        name_i18n="rbac:RBAC_PERM_DOMAINS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_DOMAINS_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:domains:manage",
        scope="workspace",
        name="Manage domains",
        description="Allow binding, verifying, updating, and deleting site custom domains.",
        name_i18n="rbac:RBAC_PERM_DOMAINS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_DOMAINS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
    # Notifications.
    PermissionTemplate(
        code="system:notifications:read",
        scope="workspace",
        name="Read notifications",
        description="Allow listing and reading workspace notifications.",
        name_i18n="rbac:RBAC_PERM_NOTIFICATIONS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_NOTIFICATIONS_READ_DESC",
        default_roles=["owner", "admin", "editor", "designer", "viewer"],
    ),
    PermissionTemplate(
        code="system:notifications:manage",
        scope="workspace",
        name="Manage notifications",
        description="Allow managing notification workflows such as seeding demo notifications.",
        name_i18n="rbac:RBAC_PERM_NOTIFICATIONS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_NOTIFICATIONS_MANAGE_DESC",
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
    # Extensions/Integrations management entry points in admin console.
    #
    # Note:
    # - v2 uses workspace as the governance boundary for admin UI authorization.
    # - Some system-level manager endpoints are still guarded by org membership role,
    #   but the *Admin UI visibility* and workspace console features should be controlled
    #   by workspace-scoped permissions.
    PermissionTemplate(
        code="system:extensions:read",
        scope="workspace",
        name="Read extensions",
        description="Allow listing extensions/integrations and reading their details.",
        name_i18n="rbac:RBAC_PERM_EXTENSIONS_READ_NAME",
        description_i18n="rbac:RBAC_PERM_EXTENSIONS_READ_DESC",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="system:extensions:manage",
        scope="workspace",
        name="Manage extensions",
        description="Allow enabling, disabling and configuring extensions/integrations.",
        name_i18n="rbac:RBAC_PERM_EXTENSIONS_MANAGE_NAME",
        description_i18n="rbac:RBAC_PERM_EXTENSIONS_MANAGE_DESC",
        default_roles=["owner", "admin"],
    ),
]
