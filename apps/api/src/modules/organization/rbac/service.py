from __future__ import annotations

import re
from typing import Protocol, cast
from uuid import UUID

from apps.api.src.common.services import BaseService
from apps.api.src.common.utils.ids import uuid7
from apps.api.src.config import Settings
from apps.api.src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.organization.models.org_rbac import (
    OrganizationPermission,
    OrganizationRole,
    OrganizationRolePermission,
)
from apps.api.src.modules.organization.rbac.repository import OrganizationRBACRepository

_ORG_PERMISSION_TEMPLATES: list[tuple[str, str, str, str]] = [
    ("org.members.read", "members", "View members", "View organization member directory."),
    ("org.members.manage", "members", "Manage members", "Invite, update, and remove organization members."),
    ("org.invitations.read", "invitations", "View invitations", "View organization invitations."),
    ("org.invitations.create", "invitations", "Create invitations", "Create organization invitations."),
    ("org.invitations.revoke", "invitations", "Revoke invitations", "Revoke organization invitations."),
    ("org.roles.read", "rbac", "View roles", "View organization roles and permissions."),
    ("org.roles.write", "rbac", "Manage roles", "Create roles and manage organization permission grants."),
    ("org.workspaces.read", "workspaces", "View workspaces", "View organization workspaces."),
    ("org.workspaces.manage", "workspaces", "Manage workspaces", "Create, archive, or delete organization workspaces."),
    ("org.settings.read", "settings", "View settings", "View organization settings."),
    ("org.settings.manage", "settings", "Manage settings", "Update organization-level settings."),
    ("org.plugins.read", "plugins", "View plugins", "View organization plugins."),
    ("org.plugins.manage", "plugins", "Manage plugins", "Manage organization plugins."),
    ("org.activity.read", "activity", "View activity", "View organization activity and audit trails."),
]

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
        "org.plugins.read",
        "org.plugins.manage",
        "org.activity.read",
    },
    "member": {
        "org.members.read",
        "org.invitations.read",
        "org.roles.read",
        "org.workspaces.read",
        "org.settings.read",
        "org.plugins.read",
        "org.activity.read",
    },
}

_BUILTIN_ROLE_LABELS: dict[str, tuple[str, str | None]] = {
    "owner": ("Owner", "Full organization control including destructive operations."),
    "admin": ("Admin", "Manage members, invitations, and most organization operations."),
    "member": ("Member", "Organization visibility with limited governance operations."),
}

_ROLE_CODE_PATTERN = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")


class _HasNullableDescription(Protocol):
    description: str | None


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
            name, description = _BUILTIN_ROLE_LABELS[code]
            if role is None:
                role = await self.repo.create_role(
                    organization_id=organization_id,
                    code=code,
                    name=name,
                    description=description,
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
