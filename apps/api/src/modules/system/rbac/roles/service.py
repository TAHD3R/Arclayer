from __future__ import annotations

from typing import cast
from uuid import UUID

from src.common.utils.ids import uuid7
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.services import BaseService
from src.models.system.rbac import PermissionScope, SystemRole
from src.modules.system.rbac.localization.service import _tr
from src.modules.system.rbac.repository import RBACRepository

_ROLE_CODE_MAX_LEN: int = 64
_ROLE_CODE_GENERATE_ATTEMPTS: int = 20
_ROLE_CODE_SUFFIX_HEX_LEN: int = 8
_NON_ASSIGNABLE_ROLE_CODES = frozenset({"owner"})


class RBACRolesMixin:
    repo: RBACRepository

    def _validate_role_name(self, *, name: str) -> str:
        clean = str(name or "").strip()
        if clean:
            return clean
        raise BadRequest(message=_tr("ROLE_NAME_REQUIRED", "角色名称不能为空"), error="ROLE_NAME_REQUIRED")

    async def _resolve_template_permission_ids(
        self,
        *,
        workspace_id: UUID,
        template_role_code: str | None,
    ) -> list[UUID]:
        tpl_code = (template_role_code or "").strip()
        if not tpl_code:
            return []

        tpl = await self.repo.get_role_by_code(workspace_id=workspace_id, code=tpl_code)
        if tpl is None:
            raise BadRequest(
                message=_tr("ROLE_TEMPLATE_NOT_FOUND", "角色模板不存在"),
                error="ROLE_TEMPLATE_NOT_FOUND",
                meta={"missing": [tpl_code]},
            )

        tpl_perms = await self.repo.list_role_permissions(role_id=UUID(str(tpl.id)))
        return [UUID(str(p.id)) for p in tpl_perms]

    async def _assert_custom_role_code_available(self, *, workspace_id: UUID, role_code: str) -> None:
        clean = (role_code or "").strip()
        if not clean or len(clean) > _ROLE_CODE_MAX_LEN:
            raise BadRequest(message=_tr("ROLE_CODE_INVALID", "角色编码不合法"), error="ROLE_CODE_INVALID")

        if clean in _NON_ASSIGNABLE_ROLE_CODES:
            raise BadRequest(message=_tr("ROLE_CODE_RESERVED", "角色编码已被系统保留"), error="ROLE_CODE_RESERVED")

        existing = await self.repo.get_role_by_code(workspace_id=workspace_id, code=clean)
        if existing is not None:
            raise Conflict(message=_tr("ROLE_EXISTS", "角色编码已存在"), error="ROLE_EXISTS")

    async def _generate_custom_role_code(self, *, workspace_id: UUID) -> str:
        for _ in range(_ROLE_CODE_GENERATE_ATTEMPTS):
            shortid = uuid7().hex[:_ROLE_CODE_SUFFIX_HEX_LEN]
            candidate = f"role-{shortid}"
            if len(candidate) > _ROLE_CODE_MAX_LEN:
                candidate = candidate[:_ROLE_CODE_MAX_LEN]
            if await self.repo.get_role_by_code(workspace_id=workspace_id, code=candidate) is None:
                return candidate

        raise Conflict(
            message=_tr("ROLE_CODE_GENERATE_FAILED", "角色标识生成失败，请重试"),
            error="ROLE_CODE_GENERATE_FAILED",
        )

    async def create_custom_role(
        self,
        *,
        workspace_id: UUID,
        code: str | None,
        name: str,
        description: str | None,
        template_role_code: str | None,
    ) -> SystemRole:
        clean_name = self._validate_role_name(name=name)
        tpl_perm_ids = await self._resolve_template_permission_ids(
            workspace_id=workspace_id,
            template_role_code=template_role_code,
        )

        role_code = (code or "").strip()
        if role_code:
            await self._assert_custom_role_code_available(workspace_id=workspace_id, role_code=role_code)
        else:
            role_code = await self._generate_custom_role_code(workspace_id=workspace_id)

        role = await self.repo.create_role(
            workspace_id=workspace_id,
            code=role_code,
            name=clean_name,
            description=description,
            name_i18n=None,
            description_i18n=None,
            is_system=False,
            is_default=False,
            is_superuser=False,
        )

        await self.repo.replace_role_permissions(role=role, permission_ids=tpl_perm_ids)
        return role

    async def update_custom_role(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        name: str | None,
        description: str | None,
    ) -> SystemRole:
        code = (role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message=_tr("ROLE_UPDATE_INVALID", "不允许修改系统角色"), error="ROLE_UPDATE_INVALID")

        updates: dict[str, object] = {}
        if name is not None:
            updates["name"] = self._validate_role_name(name=str(name))
        if description is not None:
            updates["description"] = description
        if not updates:
            return role
        return await self.repo.update_role(role, updates=updates)

    async def delete_custom_role(self, *, workspace_id: UUID, role_code: str) -> None:
        code = (role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message=_tr("ROLE_DELETE_INVALID", "不允许删除系统角色"), error="ROLE_DELETE_INVALID")
        await self.repo.delete_role(role)

    async def set_permission_custom_roles(
        self,
        *,
        workspace_id: UUID,
        permission_code: str,
        role_codes: list[str],
    ) -> None:
        perm_code = (permission_code or "").strip()
        perm = await self.repo.get_permission_by_code(code=perm_code)
        if perm is None or perm.scope != PermissionScope.WORKSPACE:
            raise NotFound(message=_tr("PERMISSION_NOT_FOUND", "权限不存在"), error="PERMISSION_NOT_FOUND")

        desired = sorted({str(x).strip() for x in (role_codes or []) if x and str(x).strip()})
        roles = await self.repo.list_roles(workspace_id=workspace_id)
        custom_roles = {r.code: r for r in roles if not r.is_system}
        system_roles = {r.code for r in roles if r.is_system}

        invalid_system = [c for c in desired if c in system_roles]
        if invalid_system:
            raise BadRequest(
                message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                error="ROLE_SYSTEM_IMMUTABLE",
                meta={"system_role_codes": invalid_system},
            )

        missing = [c for c in desired if c not in custom_roles]
        if missing:
            raise BadRequest(
                message=_tr("ROLE_NOT_FOUND", "角色不存在"),
                error="ROLE_NOT_FOUND",
                meta={"missing": missing},
            )

        async with cast(BaseService, self).tx():
            for code, role in custom_roles.items():
                if code in desired:
                    await self.repo.ensure_role_permission(role=role, permission=perm)
                else:
                    await self.repo.delete_role_permission(role_id=UUID(str(role.id)), permission_id=UUID(str(perm.id)))

    async def set_custom_role_permissions(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        permission_codes: list[str],
    ) -> None:
        code = (role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(
                message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                error="ROLE_SYSTEM_IMMUTABLE",
            )

        desired = sorted({str(x).strip() for x in (permission_codes or []) if x and str(x).strip()})
        if not desired:
            await self.repo.replace_role_permissions(role=role, permission_ids=[])
            return

        perms = await self.repo.list_permissions_by_codes(codes=desired)
        by_code = {p.code: p for p in perms if p and p.code}
        missing = [c for c in desired if c not in by_code]
        if missing:
            raise BadRequest(
                message=_tr("PERMISSION_NOT_FOUND", "权限不存在"),
                error="PERMISSION_NOT_FOUND",
                meta={"missing": missing},
            )

        invalid = [p.code for p in by_code.values() if p.scope != PermissionScope.WORKSPACE]
        if invalid:
            raise BadRequest(
                message=_tr("PERMISSION_SCOPE_INVALID", "权限作用域不合法"),
                error="PERMISSION_SCOPE_INVALID",
                meta={"invalid": sorted(set(invalid))},
            )

        perm_ids = [UUID(str(by_code[c].id)) for c in desired if c in by_code]
        await self.repo.replace_role_permissions(role=role, permission_ids=perm_ids)
