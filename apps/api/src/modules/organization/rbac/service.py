from __future__ import annotations

import re
from typing import Protocol, cast
from uuid import UUID

from src.common.services import BaseService
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.i18n import t
from src.models.organization.org_membership import OrgMembership, OrgRole
from src.models.organization.org_rbac import (
    OrganizationPermission,
    OrganizationRole,
    OrganizationRolePermission,
)
from src.modules.organization.rbac.repository import OrganizationRBACRepository

_ORG_PERMISSION_TEMPLATES: list[tuple[str, str, str, str]] = [
    ("org.members.read", "members", "View members", "View organization member directory."),
    ("org.members.manage", "members", "Manage members", "Invite, update, and remove organization members."),
    ("org.invitations.read", "invitations", "View invitations", "View organization invitations."),
    ("org.invitations.create", "invitations", "Create invitations", "Create organization invitations."),
    ("org.invitations.revoke", "invitations", "Revoke invitations", "Revoke organization invitations."),
    ("org.roles.read", "rbac", "View roles", "View organization roles and permissions."),
    ("org.roles.write", "rbac", "Manage roles", "Create roles and manage organization permission grants."),
    ("org.workspaces.read", "workspaces", "View workspaces", "View organization workspaces."),
    ("org.workspaces.manage", "workspaces", "Manage workspaces", "Create and archive organization workspaces."),
    ("org.workspaces.delete", "workspaces", "Delete workspaces", "Permanently delete organization workspaces."),
    ("org.settings.read", "settings", "View settings", "View organization settings."),
    ("org.settings.manage", "settings", "Manage settings", "Update organization-level settings."),
    (
        "org.settings.assign-default-role",
        "settings",
        "Assign default role to members",
        "Bulk-assign organization role to all active member users.",
    ),
    ("org.settings.delete", "settings", "Delete organization", "Delete organization and all scoped settings."),
    ("org.assets.read", "assets", "View assets", "View organization asset library."),
    ("org.assets.manage", "assets", "Manage assets", "Upload and manage organization assets."),
    ("org.extensions.read", "extensions", "View extensions", "View organization extensions and integrations."),
    ("org.extensions.manage", "extensions", "Manage extensions", "Manage organization extensions and integrations."),
    ("org.activity.read", "activity", "View activity", "View organization activity and audit trails."),
]

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
    "org.extensions.read": ("ORG_ROLE_PERMISSION_PLUGINS_VIEW", "ORG_ROLE_PERMISSION_PLUGINS_VIEW_DESC"),
    "org.extensions.manage": ("ORG_ROLE_PERMISSION_PLUGINS_MANAGE", "ORG_ROLE_PERMISSION_PLUGINS_MANAGE_DESC"),
    "org.activity.read": ("ORG_ROLE_PERMISSION_ACTIVITY_VIEW", "ORG_ROLE_PERMISSION_ACTIVITY_VIEW_DESC"),
}

_BUILTIN_ROLE_RULES: dict[str, set[str]] = {
    "owner": {code for code, _, _, _ in _ORG_PERMISSION_TEMPLATES},
    "admin": {
        "org.members.read",
        "org.members.manage",
        "org.invitations.read",
        "org.invitations.create",
        "org.invitations.revoke",
        "org.roles.read",
        "org.roles.write",
        "org.workspaces.read",
        "org.workspaces.manage",
        "org.settings.read",
        "org.settings.manage",
        "org.assets.read",
        "org.assets.manage",
        "org.extensions.read",
        "org.extensions.manage",
        "org.activity.read",
    },
    "member": {
        "org.members.read",
        "org.invitations.read",
        "org.roles.read",
        "org.workspaces.read",
        "org.settings.read",
        "org.assets.read",
        "org.extensions.read",
        "org.activity.read",
    },
}

_BUILTIN_ROLE_DEFS: dict[str, dict[str, str | None]] = {
    "owner": {
        "name": "Owner",
        "description": "Full organization control including destructive operations.",
        "name_i18n": "rbac:ORG_RBAC_ROLE_OWNER_NAME",
        "description_i18n": "rbac:ORG_RBAC_ROLE_OWNER_DESC",
    },
    "admin": {
        "name": "Admin",
        "description": "Manage members, invitations, and most organization operations except destructive actions.",
        "name_i18n": "rbac:ORG_RBAC_ROLE_ADMIN_NAME",
        "description_i18n": "rbac:ORG_RBAC_ROLE_ADMIN_DESC",
    },
    "member": {
        "name": "Member",
        "description": "Organization visibility with limited governance operations.",
        "name_i18n": "rbac:ORG_RBAC_ROLE_MEMBER_NAME",
        "description_i18n": "rbac:ORG_RBAC_ROLE_MEMBER_DESC",
    },
}

_ROLE_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")


class _HasNullableDescription(Protocol):
    description: str | None


class _HasRoleI18nFields(Protocol):
    name_i18n: str | None
    description_i18n: str | None


def _parse_i18n_ref(value: str | None) -> tuple[str, str] | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw or ":" not in raw:
        return None
    namespace, key = raw.split(":", 1)
    namespace = namespace.strip()
    key = key.strip()
    if not namespace or not key:
        return None
    return namespace, key


def _localize_i18n_ref(value: str | None, *, default: str | None) -> str | None:
    ref = _parse_i18n_ref(value)
    if ref is None:
        return default
    namespace, key = ref
    return t(namespace, key, default=default)


class OrganizationRBACService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = OrganizationRBACRepository()

    @staticmethod
    def resolve_membership_role_code(membership: OrgMembership) -> str:
        """Resolve effective role code with compatibility for legacy rows."""

        raw_code = str(getattr(membership, "role_code", "") or "").strip().lower()
        role_value = str(cast(OrgRole, membership.role).value)
        if not raw_code:
            return role_value

        # Historical rows could store role_code=member even when role is owner/admin.
        # Keep these users operable without forcing immediate data migration in all environments.
        if raw_code == OrgRole.MEMBER.value and role_value in {OrgRole.OWNER.value, OrgRole.ADMIN.value}:
            return role_value

        return raw_code

    def localize_role(self, role: OrganizationRole) -> dict[str, object]:
        if role.is_system:
            role_with_i18n = cast(_HasRoleI18nFields, role)
            name = _localize_i18n_ref(role_with_i18n.name_i18n, default=role.name) or role.name
            description = (
                _localize_i18n_ref(role_with_i18n.description_i18n, default=role.description or "")
                or role.description
                or ""
            )
        else:
            name = role.name
            description = role.description or ""

        role_with_i18n = cast(_HasRoleI18nFields, role)
        return {
            "id": role.id,
            "code": role.code,
            "name": name,
            "description": description or None,
            "name_i18n": role_with_i18n.name_i18n,
            "description_i18n": role_with_i18n.description_i18n,
            "is_system": bool(role.is_system),
            "is_builtin": bool(role.is_builtin),
        }

    def localize_permission(self, permission: OrganizationPermission) -> dict[str, object]:
        mapped = _ORG_PERMISSION_I18N_KEYS.get(str(permission.code))
        name = str(permission.name)
        description = str(permission.description or "")
        if mapped:
            name = t("common", mapped[0], default=name)
            description = t("common", mapped[1], default=description)
        return {
            "id": permission.id,
            "code": permission.code,
            "module": permission.module,
            "name": name,
            "description": (description.strip() or None),
        }

    async def ensure_defaults(self, *, organization_id: UUID) -> None:
        permissions: dict[str, OrganizationPermission] = {}
        for code, module, name, description in _ORG_PERMISSION_TEMPLATES:
            row = await self.repo.upsert_permission(
                code=code,
                module=module,
                name=name,
                description=description,
            )
            permissions[code] = row

        for code in ("owner", "admin", "member"):
            role = await self.repo.get_role_by_code(organization_id=organization_id, code=code)
            builtin = _BUILTIN_ROLE_DEFS[code]
            name = str(builtin["name"] or "")
            description = str(builtin["description"] or "") or None
            name_i18n = str(builtin["name_i18n"] or "") or None
            description_i18n = str(builtin["description_i18n"] or "") or None
            if role is None:
                role = await self.repo.create_role(
                    organization_id=organization_id,
                    code=code,
                    name=name,
                    description=description,
                    name_i18n=name_i18n,
                    description_i18n=description_i18n,
                    is_system=True,
                    is_builtin=True,
                )
            else:
                update_fields: list[str] = []
                if not role.is_system:
                    role.is_system = True
                    update_fields.append("is_system")
                if not role.is_builtin:
                    role.is_builtin = True
                    update_fields.append("is_builtin")
                if role.name != name:
                    role.name = name
                    update_fields.append("name")
                role_with_nullable_desc = cast(_HasNullableDescription, role)
                if role_with_nullable_desc.description != description:
                    role_with_nullable_desc.description = description
                    update_fields.append("description")
                role_with_i18n = cast(_HasRoleI18nFields, role)
                if role_with_i18n.name_i18n != name_i18n:
                    role_with_i18n.name_i18n = name_i18n
                    update_fields.append("name_i18n")
                if role_with_i18n.description_i18n != description_i18n:
                    role_with_i18n.description_i18n = description_i18n
                    update_fields.append("description_i18n")
                if update_fields:
                    update_fields.append("updated_at")
                    await role.save(update_fields=update_fields)

            desired = _BUILTIN_ROLE_RULES[code]
            perm_ids = [UUID(str(permissions[p].id)) for p in sorted(desired) if p in permissions]
            await self.repo.replace_role_permissions(role=role, permission_ids=perm_ids)

    async def list_roles(self, *, organization_id: UUID) -> list[OrganizationRole]:
        await self.ensure_defaults(organization_id=organization_id)
        return await self.repo.list_roles(organization_id=organization_id)

    async def list_permissions(self, *, organization_id: UUID) -> list[OrganizationPermission]:
        await self.ensure_defaults(organization_id=organization_id)
        return await self.repo.list_permissions()

    async def has_permission(
        self,
        *,
        organization_id: UUID,
        role_code: str,
        permission_code: str,
    ) -> bool:
        await self.ensure_defaults(organization_id=organization_id)

        role = await self.repo.get_role_by_code(organization_id=organization_id, code=str(role_code).strip().lower())
        if role is None:
            return False

        permission = await self.repo.get_permission_by_code(code=permission_code)
        if permission is None:
            return False

        return await OrganizationRolePermission.filter(role_id=role.id, permission_id=permission.id).exists()

    async def ensure_permission(
        self,
        *,
        organization_id: UUID,
        membership: OrgMembership,
        permission_code: str,
        error_code: str = "ORG_PERMISSION_DENIED",
    ) -> None:
        await self.ensure_defaults(organization_id=organization_id)

        resolved_role_code = self.resolve_membership_role_code(membership)
        fallback_role_code = str(cast(OrgRole, membership.role).value)

        role = await self.repo.get_role_by_code(
            organization_id=organization_id,
            code=resolved_role_code,
        )
        if role is None and resolved_role_code != fallback_role_code:
            role = await self.repo.get_role_by_code(
                organization_id=organization_id,
                code=fallback_role_code,
            )

        permission = await self.repo.get_permission_by_code(code=permission_code)

        if role is not None and permission is not None:
            allowed = await OrganizationRolePermission.filter(role_id=role.id, permission_id=permission.id).exists()
            if allowed:
                return

        raise Forbidden(message="Forbidden", error=error_code)

    async def get_matrix(
        self, *, organization_id: UUID
    ) -> tuple[list[OrganizationRole], list[OrganizationPermission], dict[str, list[str]]]:
        roles = await self.list_roles(organization_id=organization_id)
        permissions = await self.list_permissions(organization_id=organization_id)
        edges = await self.repo.list_role_permission_edges(organization_id=organization_id)

        grants: dict[str, set[str]] = {}
        for perm_code, role_code in edges:
            grants.setdefault(perm_code, set()).add(role_code)

        return roles, permissions, {k: sorted(v) for k, v in grants.items()}

    async def create_custom_role(
        self,
        *,
        organization_id: UUID,
        code: str | None,
        name: str,
        description: str | None,
        template_role_code: str | None,
    ) -> OrganizationRole:
        await self.ensure_defaults(organization_id=organization_id)

        clean_name = str(name or "").strip()
        if not clean_name:
            raise BadRequest(message="Role name is required", error="ROLE_NAME_REQUIRED")

        role_code = str(code or "").strip()
        if role_code:
            role_code = role_code.lower()
            if not _ROLE_CODE_PATTERN.match(role_code):
                raise BadRequest(message="Invalid role code", error="ROLE_CODE_INVALID")
            existing = await self.repo.get_role_by_code(organization_id=organization_id, code=role_code)
            if existing is not None:
                raise Conflict(message="Role already exists", error="ROLE_EXISTS")
        else:
            for _ in range(24):
                candidate = f"role-{uuid7().hex[:8]}"
                if await self.repo.get_role_by_code(organization_id=organization_id, code=candidate) is None:
                    role_code = candidate
                    break
            if not role_code:
                raise Conflict(message="Failed to allocate role code", error="ROLE_CODE_GENERATION_FAILED")

        role = await self.repo.create_role(
            organization_id=organization_id,
            code=role_code,
            name=clean_name,
            description=(description or "").strip() or None,
            name_i18n=None,
            description_i18n=None,
            is_system=False,
            is_builtin=False,
        )

        tpl_code = str(template_role_code or "").strip().lower()
        if tpl_code:
            template = await self.repo.get_role_by_code(organization_id=organization_id, code=tpl_code)
            if template is None:
                raise BadRequest(message="Template role not found", error="ROLE_TEMPLATE_NOT_FOUND")
            perms = await self.repo.list_role_permissions(role_id=UUID(str(template.id)))
            await self.repo.replace_role_permissions(
                role=role,
                permission_ids=[UUID(str(p.id)) for p in perms],
            )

        return role

    async def delete_custom_role(self, *, organization_id: UUID, role_code: str) -> None:
        role = await self.repo.get_role_by_code(organization_id=organization_id, code=role_code)
        if role is None:
            raise NotFound(message="Role not found", error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message="System roles are immutable", error="ROLE_SYSTEM_IMMUTABLE")

        await OrgMembership.filter(organization_id=organization_id, role_code=role.code).update(
            role=OrgRole.MEMBER,
            role_code=OrgRole.MEMBER.value,
        )
        await role.delete()

    async def set_permission_custom_roles(
        self,
        *,
        organization_id: UUID,
        permission_code: str,
        role_codes: list[str],
    ) -> None:
        await self.ensure_defaults(organization_id=organization_id)
        permission = await self.repo.get_permission_by_code(code=permission_code)
        if permission is None:
            raise NotFound(message="Permission not found", error="PERMISSION_NOT_FOUND")

        custom_roles: list[OrganizationRole] = []
        for role_code in sorted({str(x).strip() for x in role_codes if str(x).strip()}):
            role = await self.repo.get_role_by_code(organization_id=organization_id, code=role_code)
            if role is None:
                raise BadRequest(message="Role not found", error="ROLE_NOT_FOUND")
            if role.is_system:
                raise BadRequest(message="System roles are immutable", error="ROLE_SYSTEM_IMMUTABLE")
            custom_roles.append(role)

        await self.repo.replace_permission_roles(
            organization_id=organization_id,
            permission=permission,
            role_ids=[UUID(str(role.id)) for role in custom_roles],
        )

    async def set_custom_role_permissions(
        self,
        *,
        organization_id: UUID,
        role_code: str,
        permission_codes: list[str],
    ) -> None:
        await self.ensure_defaults(organization_id=organization_id)

        role = await self.repo.get_role_by_code(organization_id=organization_id, code=role_code)
        if role is None:
            raise NotFound(message="Role not found", error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message="System roles are immutable", error="ROLE_SYSTEM_IMMUTABLE")

        permission_ids: list[UUID] = []
        for permission_code in sorted({str(x).strip() for x in permission_codes if str(x).strip()}):
            permission = await self.repo.get_permission_by_code(code=permission_code)
            if permission is None:
                raise BadRequest(message="Permission not found", error="PERMISSION_NOT_FOUND")
            permission_ids.append(UUID(str(permission.id)))

        await self.repo.replace_role_permissions(role=role, permission_ids=permission_ids)
