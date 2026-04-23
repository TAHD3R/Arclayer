from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from src.models.system.rbac import PermissionScope
from src.modules.system.rbac.schema import PermissionTemplate


@dataclass(frozen=True, slots=True)
class OrganizationPermissionActionDefinition:
    code: str
    module: str | None = None
    name: str | None = None
    description: str | None = None
    permission_codes: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    scope: str = PermissionScope.ORG.value
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_role_codes: tuple[str, ...] = ()


_ORGANIZATION_PERMISSION_TEMPLATES: tuple[PermissionTemplate, ...] = (
    PermissionTemplate(
        code="org.members.read",
        scope=PermissionScope.ORG.value,
        name="View members",
        description="View organization member directory.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.members.manage",
        scope=PermissionScope.ORG.value,
        name="Manage members",
        description="Invite, update, and remove organization members.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.invitations.read",
        scope=PermissionScope.ORG.value,
        name="View invitations",
        description="View organization invitations.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.invitations.create",
        scope=PermissionScope.ORG.value,
        name="Create invitations",
        description="Create organization invitations.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.invitations.revoke",
        scope=PermissionScope.ORG.value,
        name="Revoke invitations",
        description="Revoke organization invitations.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.roles.read",
        scope=PermissionScope.ORG.value,
        name="View roles",
        description="View organization roles and permissions.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.roles.write",
        scope=PermissionScope.ORG.value,
        name="Manage roles",
        description="Create roles and manage organization permission grants.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.workspaces.read",
        scope=PermissionScope.ORG.value,
        name="View workspaces",
        description="View organization workspaces.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.workspaces.manage",
        scope=PermissionScope.ORG.value,
        name="Manage workspaces",
        description="Create and archive organization workspaces.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.workspaces.delete",
        scope=PermissionScope.ORG.value,
        name="Delete workspaces",
        description="Permanently delete organization workspaces.",
        default_roles=["owner"],
    ),
    PermissionTemplate(
        code="org.settings.read",
        scope=PermissionScope.ORG.value,
        name="View settings",
        description="View organization settings.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.settings.manage",
        scope=PermissionScope.ORG.value,
        name="Manage settings",
        description="Update organization-level settings.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.settings.assign-default-role",
        scope=PermissionScope.ORG.value,
        name="Assign default role to members",
        description="Bulk-assign organization role to all active member users.",
        default_roles=["owner"],
    ),
    PermissionTemplate(
        code="org.settings.delete",
        scope=PermissionScope.ORG.value,
        name="Delete organization",
        description="Delete organization and all scoped settings.",
        default_roles=["owner"],
    ),
    PermissionTemplate(
        code="org.assets.read",
        scope=PermissionScope.ORG.value,
        name="View assets",
        description="View organization asset library.",
        default_roles=["owner", "admin", "member"],
    ),
    PermissionTemplate(
        code="org.assets.manage",
        scope=PermissionScope.ORG.value,
        name="Manage assets",
        description="Upload and manage organization assets.",
        default_roles=["owner", "admin"],
    ),
    PermissionTemplate(
        code="org.activity.read",
        scope=PermissionScope.ORG.value,
        name="View activity",
        description="View organization activity and audit trails.",
        default_roles=["owner", "admin", "member"],
    ),
)

_ORG_PERMISSION_I18N_KEYS: dict[str, tuple[str, str]] = {
    "org.members.read": ("ORG_ROLE_PERMISSION_MEMBERS_VIEW", "ORG_ROLE_PERMISSION_MEMBERS_VIEW_DESC"),
    "org.members.manage": ("ORG_ROLE_PERMISSION_MEMBERS_MANAGE", "ORG_ROLE_PERMISSION_MEMBERS_MANAGE_DESC"),
    "org.invitations.read": ("ORG_ROLE_PERMISSION_INVITES_VIEW", "ORG_ROLE_PERMISSION_INVITES_VIEW_DESC"),
    "org.invitations.create": ("ORG_ROLE_PERMISSION_INVITES_CREATE", "ORG_ROLE_PERMISSION_INVITES_CREATE_DESC"),
    "org.invitations.revoke": ("ORG_ROLE_PERMISSION_INVITES_REVOKE", "ORG_ROLE_PERMISSION_INVITES_REVOKE_DESC"),
    "org.roles.read": ("ORG_ROLE_PERMISSION_ROLES_VIEW", "ORG_ROLE_PERMISSION_ROLES_VIEW_DESC"),
    "org.roles.write": ("ORG_ROLE_PERMISSION_ROLES_MANAGE", "ORG_ROLE_PERMISSION_ROLES_MANAGE_DESC"),
    "org.workspaces.read": ("ORG_ROLE_PERMISSION_WORKSPACES_VIEW", "ORG_ROLE_PERMISSION_WORKSPACES_VIEW_DESC"),
    "org.workspaces.manage": (
        "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE",
        "ORG_ROLE_PERMISSION_WORKSPACES_MANAGE_DESC",
    ),
    "org.workspaces.delete": (
        "ORG_ROLE_PERMISSION_WORKSPACES_DELETE",
        "ORG_ROLE_PERMISSION_WORKSPACES_DELETE_DESC",
    ),
    "org.settings.read": ("ORG_ROLE_PERMISSION_SETTINGS_VIEW", "ORG_ROLE_PERMISSION_SETTINGS_VIEW_DESC"),
    "org.settings.manage": ("ORG_ROLE_PERMISSION_SETTINGS_MANAGE", "ORG_ROLE_PERMISSION_SETTINGS_MANAGE_DESC"),
    "org.settings.assign-default-role": (
        "ORG_ROLE_PERMISSION_SETTINGS_ASSIGN_DEFAULT_ROLE",
        "ORG_ROLE_PERMISSION_SETTINGS_ASSIGN_DEFAULT_ROLE_DESC",
    ),
    "org.settings.delete": ("ORG_ROLE_PERMISSION_SETTINGS_DELETE", "ORG_ROLE_PERMISSION_SETTINGS_DELETE_DESC"),
    "org.assets.read": ("ORG_ROLE_PERMISSION_ASSETS_VIEW", "ORG_ROLE_PERMISSION_ASSETS_VIEW_DESC"),
    "org.assets.manage": ("ORG_ROLE_PERMISSION_ASSETS_MANAGE", "ORG_ROLE_PERMISSION_ASSETS_MANAGE_DESC"),
    "org.activity.read": ("ORG_ROLE_PERMISSION_ACTIVITY_VIEW", "ORG_ROLE_PERMISSION_ACTIVITY_VIEW_DESC"),
}


def build_organization_permission_catalog() -> dict[str, OrganizationPermissionActionDefinition]:
    catalog: dict[str, OrganizationPermissionActionDefinition] = {}
    for template in _ORGANIZATION_PERMISSION_TEMPLATES:
        name_i18n, description_i18n = _ORG_PERMISSION_I18N_KEYS.get(template.code, (None, None))
        catalog[template.code] = OrganizationPermissionActionDefinition(
            code=template.code,
            module=template.code.split(".", 2)[1] if "." in template.code else None,
            name=template.name,
            description=template.description,
            permission_codes=(template.code,),
            subject_kinds=("organization_member",),
            scope=PermissionScope(str(template.scope)).value,
            name_i18n=name_i18n,
            description_i18n=description_i18n,
            default_role_codes=tuple(template.default_roles),
        )
    return catalog


@lru_cache(maxsize=1)
def get_organization_permission_catalog() -> dict[str, OrganizationPermissionActionDefinition]:
    return build_organization_permission_catalog()
