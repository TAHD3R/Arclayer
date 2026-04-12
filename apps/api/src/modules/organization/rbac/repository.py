from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, cast
from uuid import UUID

from src.common.repositories import BaseRepository
from src.models.organization.org_rbac import (
    OrganizationPermission,
    OrganizationRole,
    OrganizationRolePermission,
)


class _HasNullableDescription(Protocol):
    description: str | None


class OrganizationRBACRepository(BaseRepository):
    async def list_roles(self, *, organization_id: UUID) -> list[OrganizationRole]:
        return (
            await OrganizationRole.filter(organization_id=organization_id).order_by("-is_system", "name", "code").all()
        )

    async def get_role_by_code(self, *, organization_id: UUID, code: str) -> OrganizationRole | None:
        return await OrganizationRole.get_or_none(organization_id=organization_id, code=code)

    async def create_role(
        self,
        *,
        organization_id: UUID,
        code: str,
        name: str,
        description: str | None,
        name_i18n: str | None,
        description_i18n: str | None,
        is_system: bool,
        is_builtin: bool,
    ) -> OrganizationRole:
        return await OrganizationRole.create(
            organization_id=organization_id,
            code=code,
            name=name,
            description=description,
            name_i18n=name_i18n,
            description_i18n=description_i18n,
            is_system=is_system,
            is_builtin=is_builtin,
        )

    async def list_permissions(self) -> list[OrganizationPermission]:
        return await OrganizationPermission.all().order_by("module", "name", "code")

    async def get_permission_by_code(self, *, code: str) -> OrganizationPermission | None:
        return await OrganizationPermission.get_or_none(code=code)

    async def upsert_permission(
        self,
        *,
        code: str,
        module: str,
        name: str,
        description: str | None,
    ) -> OrganizationPermission:
        row = await OrganizationPermission.get_or_none(code=code)
        if row is None:
            return await OrganizationPermission.create(
                code=code,
                module=module,
                name=name,
                description=description,
                is_system=True,
            )

        updates: list[str] = []
        if row.module != module:
            row.module = module
            updates.append("module")
        if row.name != name:
            row.name = name
            updates.append("name")
        row_with_nullable_desc = cast(_HasNullableDescription, row)
        if row_with_nullable_desc.description != description:
            row_with_nullable_desc.description = description
            updates.append("description")
        if updates:
            updates.append("updated_at")
            await row.save(update_fields=updates)
        return row

    async def list_role_permissions(self, *, role_id: UUID) -> list[OrganizationPermission]:
        return (
            await OrganizationPermission
            .filter(permission_roles__role_id=role_id)
            .order_by("module", "name", "code")
            .all()
        )

    async def list_role_permission_edges(self, *, organization_id: UUID) -> list[tuple[str, str]]:
        rows = await OrganizationRolePermission.filter(role__organization_id=organization_id).values_list(
            "permission__code",
            "role__code",
        )
        return [(str(perm_code), str(role_code)) for perm_code, role_code in rows]

    async def replace_role_permissions(self, *, role: OrganizationRole, permission_ids: Sequence[UUID]) -> None:
        await OrganizationRolePermission.filter(role_id=role.id).delete()
        for permission_id in permission_ids:
            await OrganizationRolePermission.get_or_create(role_id=role.id, permission_id=permission_id)

    async def replace_permission_roles(
        self,
        *,
        organization_id: UUID,
        permission: OrganizationPermission,
        role_ids: Sequence[UUID],
    ) -> None:
        custom_role_ids = await OrganizationRole.filter(
            organization_id=organization_id,
            is_system=False,
        ).values_list("id", flat=True)
        if custom_role_ids:
            await OrganizationRolePermission.filter(
                permission_id=permission.id,
                role_id__in=list(custom_role_ids),
            ).delete()

        for role_id in role_ids:
            await OrganizationRolePermission.get_or_create(role_id=role_id, permission_id=permission.id)
