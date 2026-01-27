from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.core.rbac.constants import BOOTSTRAP_KEY, ROLE_ADMIN
from apps.api.models.rbac import BootstrapState, Permission, Role, RolePermission, UserRole


class RBACRepository(BaseRepository):
    def query_roles(self) -> QuerySet[Role]:
        return Role.all().order_by("code")

    async def get_role_by_code(self, code: str) -> Role | None:
        return await Role.get_or_none(code=code)

    async def list_roles(self) -> list[Role]:
        return await Role.all().order_by("code")

    def query_permissions(self) -> QuerySet[Permission]:
        return Permission.all().order_by("code")

    async def create_role(
        self,
        *,
        code: str,
        name: str,
        description: str | None,
        is_default: bool,
        is_superuser: bool,
    ) -> Role:
        return await Role.create(
            code=code,
            name=name,
            description=description,
            is_default=is_default,
            is_superuser=is_superuser,
        )

    async def update_role(self, role: Role, *, updates: dict) -> Role:
        for key, value in updates.items():
            setattr(role, key, value)
        await role.save()
        return role

    async def delete_role(self, role: Role) -> int:
        return await Role.filter(id=role.id).delete()

    async def list_permissions(self) -> list[Permission]:
        return await Permission.all().order_by("code")

    async def get_permission_by_code(self, code: str) -> Permission | None:
        return await Permission.get_or_none(code=code)

    async def list_role_permissions(self, *, role_id) -> list[Permission]:
        return await Permission.filter(permission_roles__role_id=role_id).all().order_by("code")

    async def replace_role_permissions(self, *, role: Role, permission_ids: list) -> None:
        # Early-stage: delete+recreate is acceptable and keeps logic simple.
        await RolePermission.filter(role_id=role.id).delete()
        for pid in permission_ids:
            await RolePermission.get_or_create(role_id=role.id, permission_id=pid)

    async def get_or_create_role(
        self,
        *,
        code: str,
        name: str,
        is_default: bool = False,
        is_superuser: bool = False,
    ) -> Role:
        role, created = await Role.get_or_create(
            code=code,
            defaults={
                "name": name,
                "is_default": is_default,
                "is_superuser": is_superuser,
            },
        )
        if not created:
            changed = False
            if role.name != name:
                role.name = name
                changed = True
            if role.is_default != is_default:
                role.is_default = is_default
                changed = True
            if role.is_superuser != is_superuser:
                role.is_superuser = is_superuser
                changed = True
            if changed:
                await role.save()
        return role

    async def get_or_create_permission(
        self,
        *,
        code: str,
        name: str,
        description: str | None,
        plugin_id: str | None,
    ) -> tuple[Permission, bool]:
        return await Permission.get_or_create(
            code=code,
            defaults={
                "name": name,
                "description": description,
                "plugin_id": plugin_id,
            },
        )

    async def update_permission(
        self,
        permission: Permission,
        *,
        name: str,
        description: str | None,
        plugin_id: str | None,
    ) -> bool:
        changed = False
        if permission.name != name:
            permission.name = name
            changed = True
        if permission.description != description:
            permission.description = description
            changed = True
        if permission.plugin_id != plugin_id:
            permission.plugin_id = plugin_id
            changed = True
        if changed:
            await permission.save()
        return changed

    async def assign_role(self, *, user_id: UUID, role: Role) -> None:
        await UserRole.get_or_create(user_id=user_id, role=role)

    async def revoke_role(self, *, user_id: UUID, role: Role) -> int:
        return await UserRole.filter(user_id=user_id, role=role).delete()

    def query_user_roles(self, *, user_id: UUID) -> QuerySet[Role]:
        return Role.filter(role_users__user_id=user_id).order_by("code")

    async def list_user_role_codes(self, *, user_id: UUID) -> list[str]:
        rows = await Role.filter(role_users__user_id=user_id).values_list("code", flat=True)
        return sorted(set(rows))

    async def list_permission_codes_for_role_codes(self, *, role_codes: list[str]) -> list[str]:
        if not role_codes:
            return []
        rows = await Permission.filter(permission_roles__role__code__in=role_codes).values_list("code", flat=True)
        return sorted(set(rows))

    async def role_codes_is_superuser(self, *, role_codes: list[str]) -> bool:
        if not role_codes:
            return False
        return await Role.filter(code__in=role_codes, is_superuser=True).exists()

    async def role_codes_have_permission(self, *, role_codes: list[str], permission_code: str) -> bool:
        if not role_codes:
            return False
        return await RolePermission.filter(
            role__code__in=role_codes,
            permission__code=permission_code,
        ).exists()

    async def ensure_role_permission(self, *, role: Role, permission: Permission) -> bool:
        _, created = await RolePermission.get_or_create(role=role, permission=permission)
        return created

    async def admin_binding_exists(self) -> bool:
        return await UserRole.filter(role__code=ROLE_ADMIN).exists()

    async def get_bootstrap_state(self) -> BootstrapState:
        state, _ = await BootstrapState.get_or_create(
            key=BOOTSTRAP_KEY,
            defaults={"done": False},
        )
        return state

    async def mark_bootstrap_done(self) -> BootstrapState:
        state = await self.get_bootstrap_state()
        if not state.done:
            state.done = True
            state.done_at = datetime.now(UTC)
            await state.save(update_fields=["done", "done_at"])
        return state
