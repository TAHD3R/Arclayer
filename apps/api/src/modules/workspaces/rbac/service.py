from __future__ import annotations

import json
from typing import TypedDict
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.rbac import (
    ROLE_ADMIN,
    ROLE_DESIGNER,
    ROLE_EDITOR,
    ROLE_VIEWER,
    WORKSPACE_COMMERCE_MANAGE,
)
from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.system.rbac import PermissionScope, SystemPermission, SystemRole
from src.models.workspaces.workspace import Workspace
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.permissions import (
    PermissionConditionSet,
    PermissionConditionTemplate,
    serialize_condition_sets,
)
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.system.rbac.repository import RBACRepository
from src.modules.system.rbac.schema import PermissionTemplate
from src.modules.workspaces.authz.role_management import (
    WorkspaceRoleManagementAvailabilityReader,
    build_workspace_role_management_availability_reader,
    require_workspace_role_management,
)
from src.modules.workspaces.permissions.registry import list_permission_condition_templates
from src.modules.workspaces.rbac.catalog import (
    RolePermissionBatchUpdate,
    build_catalog_revision,
    build_permission_metadata,
    role_revision,
)

SYSTEM_RBAC_UPDATED_EVENT = "system.settings.rbac.updated"
_ROLE_CODE_MAX_LEN = 64
_ROLE_CODE_GENERATE_ATTEMPTS = 20
_ROLE_CODE_SUFFIX_HEX_LEN = 8
_NON_ASSIGNABLE_ROLE_CODES = frozenset({"owner"})


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
    def __init__(
        self,
        settings: Settings,
        role_management_reader: WorkspaceRoleManagementAvailabilityReader,
        repo: RBACRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or RBACRepository()
        self.role_management_reader = role_management_reader

    async def _require_role_management(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await require_workspace_role_management(
            workspace_id=workspace_id,
            reader=self.role_management_reader,
            conn=conn,
        )

    @staticmethod
    async def _require_commerce_permission_owner(
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        query = Workspace.filter(id=workspace_id, deleted_at__isnull=True)
        if conn is not None:
            query = query.using_db(conn)
        workspace = await query.first()
        if workspace is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
        if UUID(str(workspace.owner_user_id)) != actor_user_id:
            raise BadRequest(
                message=_tr("COMMERCE_MANAGE_OWNER_REQUIRED", "仅工作区所有者可管理账单管理员"),
                error="WORKSPACE_COMMERCE_MANAGE_OWNER_REQUIRED",
            )

    async def _require_commerce_permission_owner_if_affected(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        permission_codes: set[str],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        if WORKSPACE_COMMERCE_MANAGE not in permission_codes:
            return
        await self._require_commerce_permission_owner(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            conn=conn,
        )

    async def _write_rbac_activity_event(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        change_kind: str,
        entity_type: str,
        entity_id: UUID,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload: JsonObject = {
            "organization_id": str(organization_id),
            "workspace_id": str(workspace_id),
            "actor_user_id": str(actor_user_id),
            "change_kind": change_kind,
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=SYSTEM_RBAC_UPDATED_EVENT,
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type=entity_type,
                entity_id=entity_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

    def localize_role(self, role: SystemRole, *, locale: str) -> dict[str, object]:
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

    def localize_permission(self, permission: SystemPermission) -> dict[str, object]:
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

    async def get_catalog_revision(self) -> str:
        permissions = await self.repo.list_permissions(scope=PermissionScope.WORKSPACE)
        return build_catalog_revision(permissions)

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

    async def list_permission_codes_for_role(self, *, role: SystemRole) -> list[str]:
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
        role: SystemRole,
    ) -> dict[str, list[PermissionConditionSet]]:
        if role.is_superuser:
            return {}
        return await self.repo.list_role_permission_condition_sets(role_id=UUID(str(role.id)))

    async def list_roles_with_permission_codes(self, *, workspace_id: UUID) -> list[tuple[SystemRole, list[str]]]:
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

        if cleaned in _NON_ASSIGNABLE_ROLE_CODES:
            raise BadRequest(message=_tr("ROLE_CODE_RESERVED", "角色编码已被系统保留"), error="ROLE_CODE_RESERVED")

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
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        code: str | None,
        name: str,
        description: str | None,
        template_role_code: str | None,
    ) -> SystemRole:
        await self._require_role_management(workspace_id=workspace_id)
        cleaned_name = self._validate_role_name(name=name)
        template_permission_ids = await self._resolve_template_permission_ids(
            workspace_id=workspace_id,
            template_role_code=template_role_code,
        )
        if template_role_code:
            template_role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=template_role_code)
            if template_role is None:
                raise BadRequest(
                    message=_tr("ROLE_TEMPLATE_NOT_FOUND", "角色模板不存在"),
                    error="ROLE_TEMPLATE_NOT_FOUND",
                    meta={"missing": [template_role_code]},
                )
            await self._require_commerce_permission_owner_if_affected(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                permission_codes=set(await self.list_permission_codes_for_role(role=template_role)),
            )

        role_code = str(code or "").strip()
        if role_code:
            await self._assert_custom_role_code_available(workspace_id=workspace_id, role_code=role_code)
        else:
            role_code = await self._generate_custom_role_code(workspace_id=workspace_id)

        async with self.tx() as conn:
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
                conn=conn,
            )
            await self.repo.replace_role_permissions(
                role=role,
                permission_ids=template_permission_ids,
                conn=conn,
            )
            await self._write_rbac_activity_event(
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                change_kind="role_created",
                entity_type="workspace_role",
                entity_id=UUID(str(role.id)),
                properties={
                    "role_code": role.code,
                    "is_system": False,
                    "template_role_code": template_role_code,
                    "permission_count": len(template_permission_ids),
                },
                conn=conn,
            )
            return role

    async def update_custom_role(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        role_code: str,
        name: str | None,
        description: str | None,
    ) -> SystemRole:
        await self._require_role_management(workspace_id=workspace_id)
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
        async with self.tx() as conn:
            updated = await self.repo.update_role(role, updates=updates, conn=conn)
            await self._write_rbac_activity_event(
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                change_kind="role_updated",
                entity_type="workspace_role",
                entity_id=UUID(str(updated.id)),
                properties={
                    "role_code": updated.code,
                    "changed_fields": sorted(updates.keys()),
                    "is_system": False,
                },
                conn=conn,
            )
            return updated

    async def delete_custom_role(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        role_code: str,
    ) -> None:
        await self._require_role_management(workspace_id=workspace_id)
        cleaned_code = str(role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message=_tr("ROLE_DELETE_INVALID", "不允许删除系统角色"), error="ROLE_DELETE_INVALID")
        await self._require_commerce_permission_owner_if_affected(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            permission_codes=set(await self.list_permission_codes_for_role(role=role)),
        )
        role_id = UUID(str(role.id))
        async with self.tx() as conn:
            await self.repo.delete_role(role, conn=conn)
            await self._write_rbac_activity_event(
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                change_kind="role_deleted",
                entity_type="workspace_role",
                entity_id=role_id,
                properties={
                    "role_code": cleaned_code,
                    "is_system": False,
                    "deleted": True,
                },
                conn=conn,
            )

    async def set_permission_custom_roles(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        permission_code: str,
        role_codes: list[str],
    ) -> None:
        await self._require_role_management(workspace_id=workspace_id)
        cleaned_permission_code = str(permission_code or "").strip()
        await self._require_commerce_permission_owner_if_affected(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            permission_codes={cleaned_permission_code},
        )
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

        async with self.tx() as conn:
            for code, role in custom_roles.items():
                if code in desired_role_codes:
                    await self.repo.ensure_role_permission(role=role, permission=permission, conn=conn)
                    continue
                await self.repo.delete_role_permission(
                    role_id=UUID(str(role.id)),
                    permission_id=UUID(str(permission.id)),
                    conn=conn,
                )
            await self._write_rbac_activity_event(
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                change_kind="permission_roles_set",
                entity_type="workspace_permission",
                entity_id=UUID(str(permission.id)),
                properties={
                    "permission_code": cleaned_permission_code,
                    "role_codes": desired_role_codes,
                },
                conn=conn,
            )

    async def set_custom_role_permissions(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        role_code: str,
        permission_codes: list[str],
        permission_condition_sets_by_code: dict[str, list[PermissionConditionSet]] | None = None,
    ) -> None:
        await self._require_role_management(workspace_id=workspace_id)
        cleaned_role_code = str(role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=cleaned_role_code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(
                message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                error="ROLE_SYSTEM_IMMUTABLE",
            )

        current_permission_codes = set(await self.list_permission_codes_for_role(role=role))

        desired_permission_codes = sorted({
            str(item).strip()
            for item in [
                *(permission_codes or []),
                *((permission_condition_sets_by_code or {}).keys()),
            ]
            if item and str(item).strip()
        })
        await self._require_commerce_permission_owner_if_affected(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            permission_codes=current_permission_codes.union(desired_permission_codes),
        )
        if not desired_permission_codes:
            async with self.tx() as conn:
                await self.repo.replace_role_permissions(role=role, permission_ids=[], conn=conn)
                await self._write_rbac_activity_event(
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    change_kind="role_permissions_set",
                    entity_type="workspace_role",
                    entity_id=UUID(str(role.id)),
                    properties={
                        "role_code": cleaned_role_code,
                        "permission_codes": [],
                        "permission_count": 0,
                    },
                    conn=conn,
                )
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
        async with self.tx() as conn:
            await self.repo.replace_role_permissions(
                role=role,
                permission_ids=permission_ids,
                condition_sets_by_permission_id=conditions_by_permission_id,
                conn=conn,
            )
            await self._write_rbac_activity_event(
                organization_id=organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                change_kind="role_permissions_set",
                entity_type="workspace_role",
                entity_id=UUID(str(role.id)),
                properties={
                    "role_code": cleaned_role_code,
                    "permission_codes": desired_permission_codes,
                    "permission_count": len(desired_permission_codes),
                    "conditional_permission_codes": sorted((permission_condition_sets_by_code or {}).keys()),
                },
                conn=conn,
            )

    async def set_custom_role_permissions_batch(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        catalog_revision: str,
        idempotency_key: str,
        updates: tuple[RolePermissionBatchUpdate, ...],
        actor_permission_codes: frozenset[str],
        actor_is_superuser: bool,
    ) -> tuple[str, list[SystemRole]]:
        await self._require_role_management(workspace_id=workspace_id)
        async with self.tx() as conn:
            permissions = await self.repo.list_permissions(
                scope=PermissionScope.WORKSPACE,
                conn=conn,
                for_update=True,
            )
            current_catalog_revision = build_catalog_revision(permissions)
            if catalog_revision != current_catalog_revision:
                raise Conflict(
                    message=_tr("PERMISSION_CATALOG_CONFLICT", "权限目录已更新，请先核对变更"),
                    error="PERMISSION_CATALOG_CONFLICT",
                    meta={
                        "expected_catalog_revision": catalog_revision,
                        "actual_catalog_revision": current_catalog_revision,
                    },
                )

            roles = await self.repo.list_roles(
                workspace_id=workspace_id,
                conn=conn,
                for_update=True,
            )
            roles_by_code = {role.code: role for role in roles}
            permissions_by_code = {permission.code: permission for permission in permissions}
            permission_metadata = build_permission_metadata(permissions)
            condition_templates = {template.key: template for template in list_permission_condition_templates()}
            changed_roles: list[
                tuple[SystemRole, RolePermissionBatchUpdate, list[UUID], dict[UUID, list[PermissionConditionSet]]]
            ] = []
            replay_roles: list[SystemRole] = []
            conflict_rows: list[dict[str, object]] = []

            for update in updates:
                role = roles_by_code.get(update.role_code)
                if role is None:
                    raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
                if role.is_system:
                    raise BadRequest(
                        message=_tr("ROLE_SYSTEM_IMMUTABLE", "系统角色权限不可编辑"),
                        error="ROLE_SYSTEM_IMMUTABLE",
                        meta={"role_code": role.code},
                    )

                desired_codes = [permission_code for permission_code, _conditions in update.permission_grants]
                desired_code_set = set(desired_codes)
                missing = sorted(desired_code_set.difference(permissions_by_code))
                if missing:
                    raise BadRequest(
                        message=_tr("PERMISSION_NOT_FOUND", "权限不存在"),
                        error="PERMISSION_NOT_FOUND",
                        meta={"role_code": role.code, "missing": missing},
                    )
                unavailable = sorted(
                    code for code in desired_code_set if permission_metadata[code].lifecycle != "active"
                )
                if unavailable:
                    raise BadRequest(
                        message=_tr("PERMISSION_UNAVAILABLE", "权限当前不可授予"),
                        error="PERMISSION_UNAVAILABLE",
                        meta={"role_code": role.code, "permission_codes": unavailable},
                    )
                if not actor_is_superuser:
                    forbidden = sorted(desired_code_set.difference(actor_permission_codes))
                    if forbidden:
                        raise BadRequest(
                            message=_tr("PERMISSION_DELEGATION_FORBIDDEN", "不能授予自己未拥有的权限"),
                            error="PERMISSION_DELEGATION_FORBIDDEN",
                            meta={"role_code": role.code, "permission_codes": forbidden},
                        )

                conditions_by_permission_id: dict[UUID, list[PermissionConditionSet]] = {}
                for permission_code, condition_sets in update.permission_grants:
                    self._validate_permission_condition_sets(
                        role_code=role.code,
                        permission_code=permission_code,
                        condition_sets=condition_sets,
                        supported_template_keys=permission_metadata[permission_code].condition_templates,
                        condition_templates=condition_templates,
                    )
                    permission = permissions_by_code[permission_code]
                    conditions_by_permission_id[UUID(str(permission.id))] = list(condition_sets)

                current_codes = [
                    permission.code
                    for permission in await self.repo.list_role_permissions(
                        role_id=UUID(str(role.id)),
                        conn=conn,
                    )
                ]
                await self._require_commerce_permission_owner_if_affected(
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    permission_codes=set(current_codes).union(desired_code_set),
                    conn=conn,
                )
                current_conditions = await self.repo.list_role_permission_condition_sets(
                    role_id=UUID(str(role.id)),
                    conn=conn,
                )
                desired_signature = _grant_signature(update.permission_grants)
                current_signature = _grant_signature(
                    tuple((code, tuple(current_conditions.get(code, []))) for code in sorted(current_codes))
                )
                actual_role_revision = role_revision(role)
                if update.role_revision != actual_role_revision:
                    if desired_signature == current_signature:
                        replay_roles.append(role)
                        continue
                    conflict_rows.append({
                        "role_code": role.code,
                        "expected_revision": update.role_revision,
                        "actual_revision": actual_role_revision,
                        "permission_codes": sorted(current_codes),
                    })
                    continue

                permission_ids = [UUID(str(permissions_by_code[code].id)) for code in sorted(desired_code_set)]
                changed_roles.append((role, update, permission_ids, conditions_by_permission_id))

            if conflict_rows:
                raise Conflict(
                    message=_tr("ROLE_REVISION_CONFLICT", "角色权限已被其他管理员更新"),
                    error="ROLE_REVISION_CONFLICT",
                    meta={
                        "catalog_revision": current_catalog_revision,
                        "role_diffs": conflict_rows,
                    },
                )

            saved_roles: list[SystemRole] = []
            for role, update, permission_ids, conditions_by_permission_id in changed_roles:
                await self.repo.replace_role_permissions(
                    role=role,
                    permission_ids=permission_ids,
                    condition_sets_by_permission_id=conditions_by_permission_id,
                    conn=conn,
                )
                await self.repo.update_role(role, updates={}, conn=conn)
                await self._write_rbac_activity_event(
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    actor_user_id=actor_user_id,
                    change_kind="role_permissions_batch_set",
                    entity_type="workspace_role",
                    entity_id=UUID(str(role.id)),
                    properties={
                        "role_code": role.code,
                        "permission_codes": sorted(code for code, _conditions in update.permission_grants),
                        "idempotency_key": idempotency_key,
                    },
                    conn=conn,
                )
                saved_roles.append(role)

            return current_catalog_revision, [*saved_roles, *replay_roles]

    def _validate_permission_condition_sets(
        self,
        *,
        role_code: str,
        permission_code: str,
        condition_sets: tuple[PermissionConditionSet, ...],
        supported_template_keys: tuple[str, ...],
        condition_templates: dict[str, PermissionConditionTemplate],
    ) -> None:
        if not condition_sets:
            return
        supported_templates = [
            condition_templates[key] for key in supported_template_keys if key in condition_templates
        ]
        allowed_fields = {template.field for template in supported_templates}
        allowed_operators_by_field = {template.field: set(template.operators) for template in supported_templates}
        for condition_set_index, condition_set in enumerate(condition_sets):
            if not condition_set.conditions:
                raise BadRequest(
                    message=_tr("PERMISSION_CONDITION_EMPTY", "权限条件组不能为空"),
                    error="PERMISSION_CONDITION_EMPTY",
                    meta={
                        "role_code": role_code,
                        "permission_code": permission_code,
                        "condition_set_index": condition_set_index,
                    },
                )
            for condition in condition_set.conditions:
                if condition.field not in allowed_fields or condition.operator not in allowed_operators_by_field.get(
                    condition.field, set()
                ):
                    raise BadRequest(
                        message=_tr("PERMISSION_CONDITION_UNSUPPORTED", "权限条件不受支持"),
                        error="PERMISSION_CONDITION_UNSUPPORTED",
                        meta={
                            "role_code": role_code,
                            "permission_code": permission_code,
                            "field": condition.field.value,
                            "operator": condition.operator.value,
                        },
                    )

    async def ensure_all_workspaces_ready(self) -> int:
        workspace_ids = await self.repo.list_workspace_ids()
        total = 0
        for workspace_id in workspace_ids:
            total += 1
            await self.ensure_workspace_system_role_grants(workspace_id=workspace_id)
        return total


def _grant_signature(
    grants: tuple[tuple[str, tuple[PermissionConditionSet, ...]], ...],
) -> str:
    payload = [
        {
            "permission_code": permission_code,
            "condition_sets": serialize_condition_sets(list(condition_sets)),
        }
        for permission_code, condition_sets in sorted(grants, key=lambda item: item[0])
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def build_workspace_rbac_service(settings: Settings) -> WorkspaceRBACService:
    return WorkspaceRBACService(settings, build_workspace_role_management_availability_reader())
