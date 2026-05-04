from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.queryset import QuerySet

from src.common.protocols.tortoise import PermissionMutableFields
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.rbac import Permission, PermissionScope, Role, RolePermission
from src.models.workspaces.workspace import Workspace
from src.modules.permissions import PermissionConditionSet, deserialize_condition_sets, serialize_condition_sets


class RBACRepository(TortoiseORMRepository):
    async def list_workspace_ids(self) -> list[UUID]:
        rows = await Workspace.all().values_list("id", flat=True)
        return [UUID(str(row)) for row in rows if row is not None]

    # -------- Roles (workspace-scoped) --------
    def query_roles(self, *, workspace_id: UUID) -> QuerySet[Role]:
        return Role.filter(workspace_id=workspace_id).order_by("code")

    async def list_roles(self, *, workspace_id: UUID) -> list[Role]:
        return await self.query_roles(workspace_id=workspace_id).all()

    async def get_role_by_code(self, *, workspace_id: UUID, code: str) -> Role | None:
        return await Role.get_or_none(workspace_id=workspace_id, code=code)

    async def create_role(
        self,
        *,
        workspace_id: UUID,
        code: str,
        name: str,
        description: str | None,
        name_i18n: str | None,
        description_i18n: str | None,
        is_system: bool,
        is_default: bool,
        is_superuser: bool,
    ) -> Role:
        return await Role.create(
            workspace_id=workspace_id,
            code=code,
            name=name,
            description=description,
            name_i18n=name_i18n,
            description_i18n=description_i18n,
            is_system=is_system,
            is_default=is_default,
            is_superuser=is_superuser,
        )

    async def update_role(self, role: Role, *, updates: dict[str, object]) -> Role:
        for key, value in updates.items():
            setattr(role, key, value)
        await role.save()
        return role

    async def delete_role(self, role: Role) -> int:
        return await Role.filter(id=role.id).delete()

    # -------- Permissions (global catalog) --------
    def query_permissions(self, *, scope: PermissionScope | None = None) -> QuerySet[Permission]:
        qs = Permission.all()
        if scope is not None:
            qs = qs.filter(scope=scope)
        return qs.order_by("code")

    async def list_permissions(self, *, scope: PermissionScope | None = None) -> list[Permission]:
        return await self.query_permissions(scope=scope).all()

    async def get_permission_by_code(self, *, code: str) -> Permission | None:
        return await Permission.get_or_none(code=code)

    async def get_or_create_permission(
        self,
        *,
        code: str,
        scope: PermissionScope,
        name: str,
        description: str | None,
        name_i18n: str | None,
        description_i18n: str | None,
        owner_key: str | None,
    ) -> tuple[Permission, bool]:
        return await Permission.get_or_create(
            code=code,
            defaults={
                "scope": scope,
                "name": name,
                "description": description,
                "name_i18n": name_i18n,
                "description_i18n": description_i18n,
                "owner_key": owner_key,
            },
        )

    async def update_permission(
        self,
        permission: Permission,
        *,
        scope: PermissionScope,
        name: str,
        description: str | None,
        name_i18n: str | None,
        description_i18n: str | None,
        owner_key: str | None,
    ) -> bool:
        perm_like = cast(PermissionMutableFields, permission)
        changed = False
        if permission.scope != scope:
            permission.scope = scope
            changed = True
        if permission.name != name:
            permission.name = name
            changed = True
        if permission.description != description:
            perm_like.description = description
            changed = True
        if permission.name_i18n != name_i18n:
            perm_like.name_i18n = name_i18n
            changed = True
        if permission.description_i18n != description_i18n:
            perm_like.description_i18n = description_i18n
            changed = True
        if permission.owner_key != owner_key:
            perm_like.owner_key = owner_key
            changed = True
        if changed:
            await permission.save()
        return changed

    async def list_permissions_by_codes(self, *, codes: list[str]) -> list[Permission]:
        if not codes:
            return []
        return await Permission.filter(code__in=codes).all()

    # -------- Role <-> Permission links --------
    async def list_role_permissions(self, *, role_id: UUID) -> list[Permission]:
        return await Permission.filter(permission_roles__role_id=role_id).all().order_by("code")

    async def replace_role_permissions(
        self,
        *,
        role: Role,
        permission_ids: list[UUID],
        condition_sets_by_permission_id: dict[UUID, list[PermissionConditionSet]] | None = None,
    ) -> None:
        # Delete+recreate keeps reconciliation logic explicit and deterministic.
        await RolePermission.filter(role_id=role.id).delete()
        for pid in permission_ids:
            await RolePermission.get_or_create(
                role_id=role.id,
                permission_id=pid,
                defaults={"conditions": serialize_condition_sets((condition_sets_by_permission_id or {}).get(pid, []))},
            )

    async def ensure_role_permission(
        self,
        *,
        role: Role,
        permission: Permission,
        condition_sets: list[PermissionConditionSet] | None = None,
    ) -> bool:
        payload = serialize_condition_sets(condition_sets or [])
        grant, created = await RolePermission.get_or_create(
            role=role,
            permission=permission,
            defaults={"conditions": payload},
        )
        if not created and deserialize_condition_sets(grant.conditions) != (condition_sets or []):
            grant.conditions = payload
            await grant.save()
        return created

    async def list_role_permission_condition_sets(
        self,
        *,
        role_id: UUID,
    ) -> dict[str, list[PermissionConditionSet]]:
        rows = await RolePermission.filter(role_id=role_id).values("permission__code", "conditions")
        out: dict[str, list[PermissionConditionSet]] = {}
        for row in rows:
            permission_code = str(row.get("permission__code") or "").strip()
            if not permission_code:
                continue
            out[permission_code] = deserialize_condition_sets(row.get("conditions"))
        return out

    async def delete_role_permission(self, *, role_id: UUID, permission_id: UUID) -> int:
        return await RolePermission.filter(role_id=role_id, permission_id=permission_id).delete()

    async def list_role_permission_edges_for_workspace(self, *, workspace_id: UUID) -> list[tuple[str, str]]:
        """
        Return (permission_code, role_code) edges for a workspace.
        """

        rows = await RolePermission.filter(role__workspace_id=workspace_id).values_list(
            "permission__code",
            "role__code",
        )
        out: list[tuple[str, str]] = []
        for perm_code, role_code in rows:
            if not perm_code or not role_code:
                continue
            out.append((str(perm_code), str(role_code)))
        return out
