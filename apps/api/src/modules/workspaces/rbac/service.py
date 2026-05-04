from __future__ import annotations

from typing import TypedDict
from uuid import UUID

from tortoise.transactions import in_transaction

from src.common.constants.rbac import ROLE_ADMIN, ROLE_DESIGNER, ROLE_EDITOR, ROLE_OWNER, ROLE_VIEWER
from src.common.services import BaseService
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.models.system.rbac import Permission, PermissionScope, Role
from src.modules.permissions import PermissionConditionSet
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.schema import PermissionTemplate

_ROLE_CODE_MAX_LEN = 64
_ROLE_CODE_GENERATE_ATTEMPTS = 20
_ROLE_CODE_SUFFIX_HEX_LEN = 8


def _tr(key: str, default: str) -> str:
    return t("rbac", key, default=default)


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


def _localize_i18n_ref(value: str | None, *, default: str) -> str:
    ref = _parse_i18n_ref(value)
    if ref is None:
        return default
    namespace, key = ref
    return t(namespace, key, default=default)


class WorkspaceRBACService(BaseService):
    def __init__(self, settings: Settings, repo: RBACRepository | None = None) -> None:
        super().__init__(settings)
        self.repo = repo or RBACRepository()

    def localize_role(self, role: Role, *, locale: str) -> dict[str, object]:
        _ = locale
        if role.is_system:
            name = _localize_i18n_ref(role.name_i18n, default=role.name)
            description = _localize_i18n_ref(role.description_i18n, default=role.description or "")
        else:
            name = role.name
            description = role.description or ""
        return {
            "id": role.id,
            "code": role.code,
            "name": name,
            "description": description or None,
            "is_default": bool(role.is_default),
            "is_superuser": bool(role.is_superuser),
            "is_system": bool(role.is_system),
        }

    def localize_permission(self, permission: Permission) -> dict[str, object]:
        name = _localize_i18n_ref(permission.name_i18n, default=permission.name)
        description = _localize_i18n_ref(permission.description_i18n, default=permission.description or "")
        return {
            "id": permission.id,
            "code": permission.code,
            "scope": permission.scope.value,
            "name": name,
            "description": description or None,
            "owner_key": permission.owner_key,
        }

    async def _get_owner_name_map(self, *, owner_keys: set[str]) -> dict[str, str]:
        return {}

    async def get_owner_name_map(self, *, owner_keys: set[str]) -> dict[str, str]:
        return await self._get_owner_name_map(owner_keys=owner_keys)

    def _iter_workspace_permission_templates(self) -> list[PermissionTemplate]:
        templates: dict[str, PermissionTemplate] = {}
        for template in CORE_PERMISSION_TEMPLATES:
            raw_scope = (getattr(template, "scope", None) or "workspace").strip().lower()
            if raw_scope != PermissionScope.WORKSPACE.value:
                continue
            code = str(template.code or "").strip()
            if not code or code in templates:
                continue
            templates[code] = template
        return list(templates.values())

    def _build_desired_system_role_permission_map(self) -> dict[str, set[str]]:
        desired_by_role = {
            ROLE_OWNER: set[str](),
            ROLE_ADMIN: set[str](),
            ROLE_EDITOR: set[str](),
            ROLE_DESIGNER: set[str](),
            ROLE_VIEWER: set[str](),
        }
        for template in self._iter_workspace_permission_templates():
            for role_code in {
                str(item).strip() for item in (template.default_roles or []) if item and str(item).strip()
            }:
                if role_code in desired_by_role:
                    desired_by_role[role_code].add(template.code)
        return desired_by_role

    async def ensure_workspace_system_roles(self, *, workspace_id: UUID) -> None:
        class _SystemRoleDefinition(TypedDict):
            code: str
            name: str
            description: str
            name_i18n: str
            description_i18n: str
            is_default: bool
            is_superuser: bool

        system_role_definitions: list[_SystemRoleDefinition] = [
            {
                "code": ROLE_OWNER,
                "name": "Owner",
                "description": "Full access within this workspace.",
                "name_i18n": "rbac:RBAC_ROLE_OWNER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_OWNER_DESC",
                "is_default": False,
                "is_superuser": True,
            },
            {
                "code": ROLE_ADMIN,
                "name": "Admin",
                "description": "Workspace administration (team, settings, permissions).",
                "name_i18n": "rbac:RBAC_ROLE_ADMIN_NAME",
                "description_i18n": "rbac:RBAC_ROLE_ADMIN_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_EDITOR,
                "name": "Editor",
                "description": "Content editing and publishing.",
                "name_i18n": "rbac:RBAC_ROLE_EDITOR_NAME",
                "description_i18n": "rbac:RBAC_ROLE_EDITOR_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_DESIGNER,
                "name": "Designer",
                "description": "Design and presentation management.",
                "name_i18n": "rbac:RBAC_ROLE_DESIGNER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_DESIGNER_DESC",
                "is_default": False,
                "is_superuser": False,
            },
            {
                "code": ROLE_VIEWER,
                "name": "Viewer",
                "description": "Read-only access to the admin console.",
                "name_i18n": "rbac:RBAC_ROLE_VIEWER_NAME",
                "description_i18n": "rbac:RBAC_ROLE_VIEWER_DESC",
                "is_default": True,
                "is_superuser": False,
            },
        ]

        for definition in system_role_definitions:
            existing = await self.repo.get_role_by_code(
                workspace_id=workspace_id,
                code=definition["code"],
            )
            if existing is None:
                await self.repo.create_role(
                    workspace_id=workspace_id,
                    code=definition["code"],
                    name=definition["name"],
                    description=definition["description"],
                    name_i18n=definition["name_i18n"],
                    description_i18n=definition["description_i18n"],
                    is_system=True,
                    is_default=bool(definition["is_default"]),
                    is_superuser=bool(definition["is_superuser"]),
                )
                continue

            if not bool(existing.is_system):
                raise Conflict(
                    message=_tr("ROLE_CODE_RESERVED", "角色编码已被系统保留"),
                    error="ROLE_CODE_RESERVED",
                    meta={"code": definition["code"]},
                )

            updates: dict[str, object] = {}
            for field in (
                "name",
                "description",
                "name_i18n",
                "description_i18n",
                "is_default",
                "is_superuser",
            ):
                if getattr(existing, field) != definition[field]:
                    updates[field] = definition[field]
            if updates:
                await self.repo.update_role(existing, updates=updates)

    async def ensure_workspace_system_role_grants(self, *, workspace_id: UUID) -> None:
        await self.ensure_workspace_system_roles(workspace_id=workspace_id)

        roles = await self.repo.list_roles(workspace_id=workspace_id)
        system_roles = {role.code: role for role in roles if role.is_system and role.code}
        desired_by_role = self._build_desired_system_role_permission_map()
        for role_code, role in system_roles.items():
            desired_codes = sorted(desired_by_role.get(role_code, set()))
            permissions = await self.repo.list_permissions_by_codes(codes=desired_codes)
            permission_ids = [UUID(str(permission.id)) for permission in permissions]
            await self.repo.replace_role_permissions(role=role, permission_ids=permission_ids)

    async def ensure_workspace_rbac_ready(self, *, workspace_id: UUID) -> None:
        roles = await self.repo.list_roles(workspace_id=workspace_id)
        system_roles = {role.code: role for role in roles if role.is_system and role.code}
        desired_by_role = self._build_desired_system_role_permission_map()
        if any(role_code not in system_roles for role_code in desired_by_role):
            await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
            return

        actual_by_role: dict[str, set[str]] = {role_code: set() for role_code in desired_by_role}
        for permission_code, role_code in await self.repo.list_role_permission_edges_for_workspace(
            workspace_id=workspace_id
        ):
            if role_code in actual_by_role:
                actual_by_role[role_code].add(permission_code)

        for role_code, desired_codes in desired_by_role.items():
            role = system_roles.get(role_code)
            if role is None:
                await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
                return
            actual_codes = set(actual_by_role.get(role_code, set()))
            if role.is_superuser:
                workspace_permission_codes = {
                    permission.code
                    for permission in await self.repo.list_permissions(scope=PermissionScope.WORKSPACE)
                    if permission.code
                }
                if actual_codes != workspace_permission_codes:
                    await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
                    return
                continue
            if actual_codes != desired_codes:
                await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
                return

    async def list_permission_codes_for_role(self, *, role: Role) -> list[str]:
        if role.is_superuser:
            return sorted(
                permission.code
                for permission in await self.repo.list_permissions(scope=PermissionScope.WORKSPACE)
                if permission.code
            )
        return sorted(
            permission.code
            for permission in await self.repo.list_role_permissions(role_id=UUID(str(role.id)))
            if permission.code
        )

    async def list_permission_condition_sets_for_role(
        self,
        *,
        role: Role,
    ) -> dict[str, list[PermissionConditionSet]]:
        if role.is_superuser:
            return {}
        return await self.repo.list_role_permission_condition_sets(role_id=UUID(str(role.id)))

    async def list_roles_with_permission_codes(self, *, workspace_id: UUID) -> list[tuple[Role, list[str]]]:
        await self.ensure_workspace_rbac_ready(workspace_id=workspace_id)
        roles = await self.repo.list_roles(workspace_id=workspace_id)
        return [(role, await self.list_permission_codes_for_role(role=role)) for role in roles]

    def _validate_role_name(self, *, name: str) -> str:
        cleaned = str(name or "").strip()
        if cleaned:
            return cleaned
        raise BadRequest(message=_tr("ROLE_NAME_REQUIRED", "角色名称不能为空"), error="ROLE_NAME_REQUIRED")

    async def _resolve_template_permission_ids(
        self,
        *,
        workspace_id: UUID,
        template_role_code: str | None,
    ) -> list[UUID]:
        template_code = str(template_role_code or "").strip()
        if not template_code:
            return []

        template_role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=template_code)
        if template_role is None:
            raise BadRequest(
                message=_tr("ROLE_TEMPLATE_NOT_FOUND", "角色模板不存在"),
                error="ROLE_TEMPLATE_NOT_FOUND",
                meta={"missing": [template_code]},
            )

        permissions = await self.repo.list_role_permissions(role_id=UUID(str(template_role.id)))
        return [UUID(str(permission.id)) for permission in permissions]

    async def _assert_custom_role_code_available(self, *, workspace_id: UUID, role_code: str) -> None:
        cleaned = str(role_code or "").strip()
        if not cleaned or len(cleaned) > _ROLE_CODE_MAX_LEN:
            raise BadRequest(message=_tr("ROLE_CODE_INVALID", "角色编码不合法"), error="ROLE_CODE_INVALID")

        if await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned) is not None:
            raise Conflict(message=_tr("ROLE_EXISTS", "角色编码已存在"), error="ROLE_EXISTS")

    async def _generate_custom_role_code(self, *, workspace_id: UUID) -> str:
        for _ in range(_ROLE_CODE_GENERATE_ATTEMPTS):
            candidate = f"role-{uuid7().hex[:_ROLE_CODE_SUFFIX_HEX_LEN]}"
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
    ) -> Role:
        cleaned_name = self._validate_role_name(name=name)
        template_permission_ids = await self._resolve_template_permission_ids(
            workspace_id=workspace_id,
            template_role_code=template_role_code,
        )

        role_code = str(code or "").strip()
        if role_code:
            await self._assert_custom_role_code_available(workspace_id=workspace_id, role_code=role_code)
        else:
            role_code = await self._generate_custom_role_code(workspace_id=workspace_id)

        role = await self.repo.create_role(
            workspace_id=workspace_id,
            code=role_code,
            name=cleaned_name,
            description=description,
            name_i18n=None,
            description_i18n=None,
            is_system=False,
            is_default=False,
            is_superuser=False,
        )
        await self.repo.replace_role_permissions(role=role, permission_ids=template_permission_ids)
        return role

    async def update_custom_role(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        name: str | None,
        description: str | None,
    ) -> Role:
        cleaned_code = str(role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned_code)
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
        cleaned_code = str(role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned_code)
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
        cleaned_permission_code = str(permission_code or "").strip()
        permission = await self.repo.get_permission_by_code(code=cleaned_permission_code)
        if permission is None or permission.scope != PermissionScope.WORKSPACE:
            raise NotFound(message=_tr("PERMISSION_NOT_FOUND", "权限不存在"), error="PERMISSION_NOT_FOUND")

        desired_role_codes = sorted({str(item).strip() for item in (role_codes or []) if item and str(item).strip()})
        roles = await self.repo.list_roles(workspace_id=workspace_id)
        custom_roles = {role.code: role for role in roles if role.code and not role.is_system}
        system_role_codes = {role.code for role in roles if role.code and role.is_system}

        immutable_system_roles = [code for code in desired_role_codes if code in system_role_codes]
        if immutable_system_roles:
            raise BadRequest(
                message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                error="ROLE_SYSTEM_IMMUTABLE",
                meta={"system_role_codes": immutable_system_roles},
            )

        missing_role_codes = [code for code in desired_role_codes if code not in custom_roles]
        if missing_role_codes:
            raise BadRequest(
                message=_tr("ROLE_NOT_FOUND", "角色不存在"),
                error="ROLE_NOT_FOUND",
                meta={"missing": missing_role_codes},
            )

        async with in_transaction():
            for code, role in custom_roles.items():
                if code in desired_role_codes:
                    await self.repo.ensure_role_permission(role=role, permission=permission)
                    continue
                await self.repo.delete_role_permission(
                    role_id=UUID(str(role.id)),
                    permission_id=UUID(str(permission.id)),
                )

    async def set_custom_role_permissions(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        permission_codes: list[str],
        permission_condition_sets_by_code: dict[str, list[PermissionConditionSet]] | None = None,
    ) -> None:
        cleaned_role_code = str(role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned_role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(
                message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                error="ROLE_SYSTEM_IMMUTABLE",
            )

        desired_permission_codes = sorted({
            str(item).strip()
            for item in [
                *(permission_codes or []),
                *((permission_condition_sets_by_code or {}).keys()),
            ]
            if item and str(item).strip()
        })
        if not desired_permission_codes:
            await self.repo.replace_role_permissions(role=role, permission_ids=[])
            return

        permissions = await self.repo.list_permissions_by_codes(codes=desired_permission_codes)
        permissions_by_code = {permission.code: permission for permission in permissions if permission.code}
        missing_permission_codes = [code for code in desired_permission_codes if code not in permissions_by_code]
        if missing_permission_codes:
            raise BadRequest(
                message=_tr("PERMISSION_NOT_FOUND", "权限不存在"),
                error="PERMISSION_NOT_FOUND",
                meta={"missing": missing_permission_codes},
            )

        invalid_permission_codes = [
            permission.code
            for permission in permissions_by_code.values()
            if permission.scope != PermissionScope.WORKSPACE
        ]
        if invalid_permission_codes:
            raise BadRequest(
                message=_tr("PERMISSION_SCOPE_INVALID", "权限作用域不合法"),
                error="PERMISSION_SCOPE_INVALID",
                meta={"invalid": sorted(set(invalid_permission_codes))},
            )

        permission_ids = [
            UUID(str(permissions_by_code[code].id)) for code in desired_permission_codes if code in permissions_by_code
        ]
        conditions_by_permission_id = {
            UUID(str(permissions_by_code[code].id)): (permission_condition_sets_by_code or {}).get(code, [])
            for code in desired_permission_codes
            if code in permissions_by_code
        }
        await self.repo.replace_role_permissions(
            role=role,
            permission_ids=permission_ids,
            condition_sets_by_permission_id=conditions_by_permission_id,
        )

    async def ensure_all_workspaces_ready(self) -> int:
        workspace_ids = await self.repo.list_workspace_ids()
        total = 0
        for workspace_id in workspace_ids:
            total += 1
            await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
        return total
