from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from functools import lru_cache

from src.models.system.rbac import PermissionScope
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.schema import PermissionTemplate


@dataclass(frozen=True, slots=True)
class PermissionActionDefinition:
    code: str
    module: str | None = None
    name: str | None = None
    description: str | None = None
    permission_codes: tuple[str, ...] = ()
    subject_kinds: tuple[str, ...] = ()
    scope: str = PermissionScope.WORKSPACE.value
    name_i18n: str | None = None
    description_i18n: str | None = None
    default_role_codes: tuple[str, ...] = ()


def _permission_action_from_template(
    template: PermissionTemplate,
    *,
    module: str | None = None,
    subject_kinds: Sequence[str] = ("workspace_member",),
) -> PermissionActionDefinition:
    return PermissionActionDefinition(
        code=template.code,
        module=module,
        name=template.name,
        description=template.description,
        permission_codes=(template.code,),
        subject_kinds=tuple(subject_kinds),
        scope=PermissionScope(str(template.scope)).value,
        name_i18n=template.name_i18n,
        description_i18n=template.description_i18n,
        default_role_codes=tuple(template.default_roles),
    )


def _organization_permission_templates() -> tuple[PermissionTemplate, ...]:
    return (
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

_WORKSPACE_ACTION_DEFINITIONS: tuple[PermissionActionDefinition, ...] = (
    PermissionActionDefinition(
        code="content:items:write",
        description="Allow mutating content items via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:site-builder:write",
        description="Allow configuring canvas and site builder workflows.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:routing:read",
        description="Allow reading content routing and hierarchy contracts.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:routing:write",
        description="Allow mutating route bindings and hierarchy contracts.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:read",
        description="Allow reading workspace release history and status.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:publish",
        description="Allow publishing a new workspace release.",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="release:rollback",
        description="Allow rolling back a workspace to a historical release.",
        permission_codes=("system:content:publish",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="automation:read",
        description="Allow reading automation flows, runs, and diagnostics.",
        permission_codes=("system:automation:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="automation:manage",
        description="Allow managing automation flows and operations.",
        permission_codes=("system:automation:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:read",
        description="Allow published delivery reads.",
        subject_kinds=("delivery_api_key", "public"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:graphql:read",
        description="Allow GraphQL delivery reads for authenticated delivery keys.",
        subject_kinds=("delivery_api_key",),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="delivery:preview",
        description="Allow preview delivery reads.",
        subject_kinds=("delivery_api_key", "workspace_member"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:models:read",
        description="Allow reading content models via management APIs.",
        permission_codes=("system:content:read",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
    PermissionActionDefinition(
        code="content:models:write",
        description="Allow mutating content models via management APIs.",
        permission_codes=("system:content:manage",),
        subject_kinds=("workspace_member", "personal_api_key", "workspace_api_key"),
        scope=PermissionScope.WORKSPACE.value,
    ),
)


def _register_actions(
    registry: dict[str, PermissionActionDefinition],
    definitions: Iterable[PermissionActionDefinition],
) -> None:
    for definition in definitions:
        registry[definition.code] = definition


def build_workspace_permission_action_registry() -> dict[str, PermissionActionDefinition]:
    registry: dict[str, PermissionActionDefinition] = {}
    _register_actions(
        registry,
        (
            _permission_action_from_template(template)
            for template in CORE_PERMISSION_TEMPLATES
            if PermissionScope(str(template.scope)) == PermissionScope.WORKSPACE
        ),
    )
    _register_actions(registry, _WORKSPACE_ACTION_DEFINITIONS)
    return registry


def build_organization_permission_catalog() -> dict[str, PermissionActionDefinition]:
    registry: dict[str, PermissionActionDefinition] = {}
    for template in _organization_permission_templates():
        name_i18n, description_i18n = _ORG_PERMISSION_I18N_KEYS.get(template.code, (None, None))
        registry[template.code] = PermissionActionDefinition(
            code=template.code,
            module=template.code.split(".", 2)[1] if "." in template.code else None,
            name=template.name,
            description=template.description,
            permission_codes=(template.code,),
            scope=PermissionScope(str(template.scope)).value,
            name_i18n=name_i18n,
            description_i18n=description_i18n,
            default_role_codes=tuple(template.default_roles),
        )
    return registry


@lru_cache(maxsize=1)
def get_permission_action_registry() -> dict[str, PermissionActionDefinition]:
    return build_workspace_permission_action_registry()


@lru_cache(maxsize=1)
def get_organization_permission_catalog() -> dict[str, PermissionActionDefinition]:
    return build_organization_permission_catalog()


def list_actions_for_permission_codes(permission_codes: Iterable[str]) -> tuple[str, ...]:
    permission_code_set = {str(code).strip() for code in permission_codes if str(code).strip()}
    matched = [
        action
        for action, definition in get_permission_action_registry().items()
        if permission_code_set.intersection(definition.permission_codes)
    ]
    return tuple(sorted(set(matched)))
