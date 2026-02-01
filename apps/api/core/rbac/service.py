from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, NotFound
from apps.api.core.http.pagination import PageData, PageParams, paginate_queryset
from apps.api.core.i18n import t
from apps.api.core.rbac.constants import (
    CORE_PERMISSION_OWNER,
    ROLE_ADMIN,
    ROLE_DESIGNER,
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
)
from apps.api.core.rbac.repository import RBACRepository
from apps.api.models.rbac import Permission, PermissionScope, Role
from apps.api.models.workspace import Workspace
from apps.api.plugin.registry import registry


def _tr(key: str, default: str) -> str:
    return t("rbac", key, default=default)


def _parse_i18n_ref(value: str | None) -> tuple[str, str] | None:
    """
    Parse a "namespace:key" reference.
    """

    if not value:
        return None
    raw = str(value).strip()
    if not raw or ":" not in raw:
        return None
    ns, key = raw.split(":", 1)
    ns = ns.strip()
    key = key.strip()
    if not ns or not key:
        return None
    return ns, key


def _localize_i18n_ref(value: str | None, *, default: str) -> str:
    ref = _parse_i18n_ref(value)
    if ref is None:
        return default
    ns, key = ref
    return t(ns, key, default=default)


def _pick_l10n_text(payload: dict[str, Any] | None, *, locale: str, fallback: str | None = None) -> str | None:
    if not payload:
        return fallback
    raw = payload.get(locale)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    # fallback to default locale if present
    raw2 = payload.get("zh-CN")
    if isinstance(raw2, str) and raw2.strip():
        return raw2.strip()
    raw3 = payload.get("en-US")
    if isinstance(raw3, str) and raw3.strip():
        return raw3.strip()
    return fallback


class RBACService(BaseService):
    """
    Workspace-scoped RBAC service + global permission catalog sync.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = RBACRepository()

    # -----------------------------
    # Permission catalog (global)
    # -----------------------------
    async def sync_permission_catalog(self) -> dict[str, Any]:
        """
        Sync permission templates (core + plugins) into DB.

        Notes:
        - Permissions are global catalog entries (code unique across the system).
        - Role grants are reconciled separately at workspace scope.
        """

        created = 0
        updated = 0

        templates: dict[str, Any] = {}
        for entry in registry.permissions:
            code = entry.template.code
            if code in templates:
                continue
            templates[code] = entry

        # Upsert known permissions
        for code in sorted(templates.keys()):
            entry = templates[code]
            plugin_id = entry.plugin_id or CORE_PERMISSION_OWNER
            tpl = entry.template

            raw_scope = (getattr(tpl, "scope", None) or "workspace").strip().lower()
            scope = PermissionScope.ORG if raw_scope == "org" else PermissionScope.WORKSPACE

            perm, is_created = await self.repo.get_or_create_permission(
                code=tpl.code,
                scope=scope,
                name=tpl.name,
                description=tpl.description,
                name_i18n=tpl.name_i18n,
                description_i18n=tpl.description_i18n,
                plugin_id=plugin_id,
            )
            if is_created:
                created += 1
            else:
                if await self.repo.update_permission(
                    perm,
                    scope=scope,
                    name=tpl.name,
                    description=tpl.description,
                    name_i18n=tpl.name_i18n,
                    description_i18n=tpl.description_i18n,
                    plugin_id=plugin_id,
                ):
                    updated += 1

        # Remove permissions that are no longer present in templates (e.g. plugin uninstalled).
        known_codes = set(templates.keys())
        await Permission.exclude(code__in=list(known_codes)).delete()

        return {"total": len(templates), "created": created, "updated": updated}

    # -----------------------------
    # Workspace roles (system + custom)
    # -----------------------------
    async def ensure_workspace_system_roles(self, *, workspace_id: UUID) -> None:
        """
        Ensure the immutable workspace system roles exist for this workspace.
        """

        # Note: keep these descriptions as English fallbacks; UI can localize via *_i18n.
        system_defs = [
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

        for d in system_defs:
            existing = await self.repo.get_role_by_code(workspace_id=workspace_id, code=d["code"])
            if existing is None:
                await self.repo.create_role(
                    workspace_id=workspace_id,
                    code=d["code"],
                    name=d["name"],
                    description=d["description"],
                    name_i18n=d["name_i18n"],
                    description_i18n=d["description_i18n"],
                    name_l10n=None,
                    description_l10n=None,
                    is_system=True,
                    is_default=bool(d["is_default"]),
                    is_superuser=bool(d["is_superuser"]),
                )
                continue

            # Defensive: avoid collisions where a custom role uses a reserved system code.
            if not bool(existing.is_system):
                raise Conflict(
                    message=_tr("ROLE_CODE_RESERVED", "角色编码已被系统保留"),
                    error="ROLE_CODE_RESERVED",
                    meta={"code": d["code"]},
                )

            # Reconcile immutable fields for system roles.
            updates: dict[str, Any] = {}
            for k in ("name", "description", "name_i18n", "description_i18n", "is_default", "is_superuser"):
                if getattr(existing, k) != d[k]:
                    updates[k] = d[k]
            if existing.name_l10n is not None:
                updates["name_l10n"] = None
            if existing.description_l10n is not None:
                updates["description_l10n"] = None
            if not existing.is_system:
                updates["is_system"] = True
            if updates:
                await self.repo.update_role(existing, updates=updates)

    async def ensure_workspace_system_role_grants(self, *, workspace_id: UUID) -> None:
        """
        Reconcile permission grants for workspace system roles based on registered templates.

        Notes:
        - System role permissions are immutable; templates are the source of truth.
        - This only touches system roles. Custom roles are intentionally not reconciled.
        """

        await self.ensure_workspace_system_roles(workspace_id=workspace_id)

        roles = await self.repo.list_roles(workspace_id=workspace_id)
        system_roles = {r.code: r for r in roles if r.is_system}

        # Build desired permission codes per system role.
        desired_by_role: dict[str, set[str]] = {code: set() for code in system_roles.keys()}
        templates: dict[str, Any] = {}
        for entry in registry.permissions:
            code = entry.template.code
            if code in templates:
                continue
            templates[code] = entry

        for perm_code, entry in templates.items():
            tpl = entry.template
            raw_scope = (getattr(tpl, "scope", None) or "workspace").strip().lower()
            if raw_scope != "workspace":
                continue
            default_roles = sorted({str(x).strip() for x in (tpl.default_roles or []) if x and str(x).strip()})
            for role_code in default_roles:
                if role_code in desired_by_role:
                    desired_by_role[role_code].add(perm_code)

        # Reconcile each system role's permission set.
        # Owner is a superuser, so enforcement is not strictly necessary, but we keep it deterministic.
        for role_code, role in system_roles.items():
            desired_codes = sorted(desired_by_role.get(role_code) or [])
            perms = await self.repo.list_permissions_by_codes(codes=desired_codes)
            perm_ids = [UUID(str(p.id)) for p in perms]
            await self.repo.replace_role_permissions(role=role, permission_ids=perm_ids)

    async def ensure_all_workspaces_ready(self) -> dict[str, Any]:
        """
        Ensure all workspaces have system roles and reconciled grants.

        This is intentionally deterministic and can be called on app startup.
        """

        workspaces = await Workspace.all().values_list("id", flat=True)
        total = 0
        for ws_id in workspaces:
            total += 1
            await self.ensure_workspace_system_role_grants(workspace_id=UUID(str(ws_id)))
        return {"workspaces": total}

    # -----------------------------
    # Query helpers (workspace)
    # -----------------------------
    async def list_roles_paginated(
        self, *, workspace_id: UUID, params: PageParams, out_schema: type[Any]
    ) -> PageData[Any]:
        qs = self.repo.query_roles(workspace_id=workspace_id)
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def list_permissions_paginated(
        self, *, scope: PermissionScope, params: PageParams, out_schema: type[Any]
    ) -> PageData[Any]:
        qs = self.repo.query_permissions(scope=scope)
        return await paginate_queryset(qs, params=params, out_schema=out_schema)

    async def get_matrix(self, *, workspace_id: UUID) -> dict[str, Any]:
        """
        Matrix payload: roles + permissions + permission->role grants.
        """

        await self.ensure_workspace_system_roles(workspace_id=workspace_id)

        roles = await self.repo.list_roles(workspace_id=workspace_id)
        permissions = await self.repo.list_permissions(scope=PermissionScope.WORKSPACE)
        edges = await self.repo.list_role_permission_edges_for_workspace(workspace_id=workspace_id)

        superuser_codes = {r.code for r in roles if r.is_superuser}
        grants: dict[str, set[str]] = {}
        for perm_code, role_code in edges:
            grants.setdefault(perm_code, set()).add(role_code)
        # Superusers implicitly have all workspace permissions.
        if superuser_codes:
            for p in permissions:
                grants.setdefault(p.code, set()).update(superuser_codes)

        return {
            "roles": roles,
            "permissions": permissions,
            "grants": {k: sorted(v) for k, v in grants.items()},
        }

    # -----------------------------
    # Custom role lifecycle (workspace)
    # -----------------------------
    async def create_custom_role(
        self,
        *,
        workspace_id: UUID,
        code: str | None,
        name_l10n: dict[str, str],
        description_l10n: dict[str, str] | None,
        template_role_code: str | None,
    ) -> Role:
        # Ensure l10n maps have at least one valid value.
        if not any(str(v).strip() for v in (name_l10n or {}).values()):
            raise BadRequest(message=_tr("ROLE_NAME_REQUIRED", "角色名称不能为空"), error="ROLE_NAME_REQUIRED")

        # Validate template role (optional).
        tpl_perm_ids: list[UUID] = []
        tpl_code = (template_role_code or "").strip()
        if tpl_code:
            tpl = await self.repo.get_role_by_code(workspace_id=workspace_id, code=tpl_code)
            if tpl is None:
                raise BadRequest(
                    message=_tr("ROLE_TEMPLATE_NOT_FOUND", "角色模板不存在"),
                    error="ROLE_TEMPLATE_NOT_FOUND",
                    meta={"missing": [tpl_code]},
                )
            tpl_perms = await self.repo.list_role_permissions(role_id=UUID(str(tpl.id)))
            tpl_perm_ids = [UUID(str(p.id)) for p in tpl_perms]

        # Determine role code (auto-generate when omitted).
        role_code = (code or "").strip()
        if role_code:
            if len(role_code) > 64:
                raise BadRequest(message=_tr("ROLE_CODE_INVALID", "角色编码不合法"), error="ROLE_CODE_INVALID")
            existing = await self.repo.get_role_by_code(workspace_id=workspace_id, code=role_code)
            if existing is not None:
                raise Conflict(message=_tr("ROLE_EXISTS", "角色编码已存在"), error="ROLE_EXISTS")
        else:
            from uuid import uuid4

            # Avoid Chinese slugify: generate role-<shortid>.
            # Keep it deterministic and human-friendly for diagnostics/logs.
            for _ in range(20):
                shortid = uuid4().hex[:8]
                candidate = f"role-{shortid}"
                if len(candidate) > 64:
                    candidate = candidate[:64]
                if await self.repo.get_role_by_code(workspace_id=workspace_id, code=candidate) is None:
                    role_code = candidate
                    break
            if not role_code:
                raise Conflict(
                    message=_tr("ROLE_CODE_GENERATE_FAILED", "角色标识生成失败，请重试"),
                    error="ROLE_CODE_GENERATE_FAILED",
                )

        # Store a stable fallback name for older clients/logs.
        fallback_name = (
            _pick_l10n_text(name_l10n, locale="zh-CN")
            or _pick_l10n_text(name_l10n, locale="en-US")
            or next((str(v).strip() for v in name_l10n.values() if str(v).strip()), role_code)
        )
        fallback_desc = _pick_l10n_text(description_l10n, locale="zh-CN") if description_l10n else None

        role = await self.repo.create_role(
            workspace_id=workspace_id,
            code=role_code,
            name=fallback_name,
            description=fallback_desc,
            name_i18n=None,
            description_i18n=None,
            name_l10n=dict(name_l10n),
            description_l10n=dict(description_l10n or {}),
            is_system=False,
            is_default=False,
            is_superuser=False,
        )

        # Copy permissions from template role if provided; otherwise start empty.
        await self.repo.replace_role_permissions(role=role, permission_ids=tpl_perm_ids)
        return role

    async def update_custom_role(
        self,
        *,
        workspace_id: UUID,
        role_code: str,
        name_l10n: dict[str, str] | None,
        description_l10n: dict[str, str] | None,
    ) -> Role:
        code = (role_code or "").strip()
        role = await self.repo.get_role_by_code(workspace_id=workspace_id, code=code)
        if role is None:
            raise NotFound(message=_tr("ROLE_NOT_FOUND", "角色不存在"), error="ROLE_NOT_FOUND")
        if role.is_system:
            raise BadRequest(message=_tr("ROLE_UPDATE_INVALID", "不允许修改系统角色"), error="ROLE_UPDATE_INVALID")

        updates: dict[str, Any] = {}
        if name_l10n is not None:
            # Merge-patch semantics: keep existing translations unless explicitly overwritten.
            merged: dict[str, str] = {}
            if isinstance(role.name_l10n, dict):
                merged.update({str(k): str(v) for k, v in role.name_l10n.items() if v})
            merged.update({str(k): str(v) for k, v in dict(name_l10n).items() if v})
            updates["name_l10n"] = merged or None

            # Keep fallback stable (prefer zh-CN, then en-US, then existing name).
            fallback_name = _pick_l10n_text(merged or None, locale="zh-CN", fallback=role.name) or role.name
            updates["name"] = fallback_name
        if description_l10n is not None:
            merged_desc: dict[str, str] = {}
            if isinstance(role.description_l10n, dict):
                merged_desc.update({str(k): str(v) for k, v in role.description_l10n.items() if v})
            merged_desc.update({str(k): str(v) for k, v in dict(description_l10n).items() if v})
            updates["description_l10n"] = merged_desc or None
            fallback_desc = _pick_l10n_text(
                merged_desc or None,
                locale="zh-CN",
                fallback=role.description,  # type: ignore[arg-type]
            )
            updates["description"] = fallback_desc

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

    # -----------------------------
    # Permission assignment (workspace, custom roles only)
    # -----------------------------
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

        async with in_transaction():
            # Reconcile custom role links for this permission only.
            for code, role in custom_roles.items():
                if code in desired:
                    await self.repo.ensure_role_permission(role=role, permission=perm)
                else:
                    await self.repo.delete_role_permission(role_id=UUID(str(role.id)), permission_id=UUID(str(perm.id)))

    # -----------------------------
    # Localization helpers (API adapters)
    # -----------------------------
    def localize_role(self, role: Role, *, locale: str) -> dict[str, Any]:
        if role.is_system:
            name = _localize_i18n_ref(role.name_i18n, default=role.name)
            desc = _localize_i18n_ref(role.description_i18n, default=role.description or "")
        else:
            name = _pick_l10n_text(role.name_l10n, locale=locale, fallback=role.name) or role.name
            desc = _pick_l10n_text(role.description_l10n, locale=locale, fallback=role.description or "") or ""

        return {
            "id": role.id,
            "code": role.code,
            "name": name,
            "description": desc or None,
            "is_default": bool(role.is_default),
            "is_superuser": bool(role.is_superuser),
            "is_system": bool(role.is_system),
        }

    def localize_permission(self, perm: Permission) -> dict[str, Any]:
        name = _localize_i18n_ref(perm.name_i18n, default=perm.name)
        desc = _localize_i18n_ref(perm.description_i18n, default=perm.description or "")
        return {
            "id": perm.id,
            "code": perm.code,
            "scope": perm.scope.value,
            "name": name,
            "description": desc or None,
            "plugin_id": perm.plugin_id,
        }
