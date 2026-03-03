from __future__ import annotations

from uuid import UUID

from apps.api.src.modules.system.admin.menus.heal.service import AdminMenuHealMixin
from apps.api.src.modules.system.admin.menus.models.service import AdminMenuItem, AdminMenuItemType
from apps.api.src.modules.system.admin.menus.repository import AdminMenuRepository
from apps.api.src.modules.system.admin.menus.schema import (
    AdminMenuBlockedReason,
    AdminMenuNode,
    AdminMenuNodeEffective,
    AdminMenuTreeEffectiveOut,
    AdminMenuTreeOut,
)
from apps.api.src.modules.system.admin.menus.shared.service import (
    MenuAccessContext,
    collect_roots,
    core_menu_codes_best_effort,
    get_parent_id,
    localize_menu_title,
    logger,
    raise_if_fatal,
    require_workspace_id,
)
from apps.api.src.modules.workspaces.authz_snapshot import get_workspace_authz_snapshot


class AdminMenuTreeMixin(AdminMenuHealMixin):
    repo: AdminMenuRepository

    async def get_menu(self, *, user_id: UUID) -> AdminMenuTreeOut:
        workspace_id = require_workspace_id()
        await self._maybe_heal_core_menus(workspace_id=workspace_id)

        ctx = await self._build_access_context(user_id=user_id, workspace_id=workspace_id)
        index = await self._load_tree_index()
        visible_ids = self._compute_visible_ids(index=index, ctx=ctx)
        tree = self._build_visible_tree(index=index, visible_ids=visible_ids)
        return AdminMenuTreeOut(items=tree)

    async def get_catalog(self) -> AdminMenuTreeOut:
        workspace_id = require_workspace_id()
        await self._maybe_heal_core_menus(workspace_id=workspace_id)

        index = await self._load_tree_index()
        tree = self._build_full_tree(index=index)
        return AdminMenuTreeOut(items=tree)

    async def get_catalog_effective(self, *, user_id: UUID) -> AdminMenuTreeEffectiveOut:
        workspace_id = require_workspace_id()
        await self._maybe_heal_core_menus(workspace_id=workspace_id)

        ctx = await self._build_access_context(user_id=user_id, workspace_id=workspace_id)
        index = await self._load_tree_index()
        tree = self._build_effective_tree(index=index, ctx=ctx)
        return AdminMenuTreeEffectiveOut(items=tree)

    async def _load_tree_index(self) -> tuple[dict[UUID, AdminMenuItem], dict[UUID | None, list[AdminMenuItem]]]:
        rows = await self.repo.query_items_for_user().all().order_by("sort", "created_at")
        by_id = {row.id: row for row in rows}
        children: dict[UUID | None, list[AdminMenuItem]] = {}
        for row in rows:
            children.setdefault(get_parent_id(row), []).append(row)
        for items in children.values():
            items.sort(key=lambda r: (r.sort, r.created_at, str(r.id)))
        return by_id, children

    async def _build_access_context(self, *, user_id: UUID, workspace_id: UUID) -> MenuAccessContext:
        snap = await get_workspace_authz_snapshot(user_id=user_id, workspace_id=workspace_id)
        permission_codes = frozenset(str(x) for x in (snap.permission_codes or []) if x)
        is_superuser = bool(snap.is_superuser)
        enabled_plugin_ids = frozenset(await self._load_enabled_plugin_ids(workspace_id=workspace_id))
        core_codes = frozenset(core_menu_codes_best_effort())
        return MenuAccessContext(
            permission_codes=permission_codes,
            is_superuser=is_superuser,
            enabled_plugin_ids=enabled_plugin_ids,
            core_codes=core_codes,
        )

    async def _load_enabled_plugin_ids(self, *, workspace_id: UUID) -> set[str]:
        try:
            from apps.api.src.modules.workspaces.plugins_center.models import WorkspacePluginState

            rows = await WorkspacePluginState.filter(workspace_id=workspace_id, enabled=True).values_list(
                "plugin_id", flat=True
            )
            return {str(x) for x in rows if x}
        except BaseException as exc:
            raise_if_fatal(exc)
            logger.warning(
                "Admin menu workspace plugin state load failed",
                action="load_workspace_plugin_states",
                workspace_id=str(workspace_id),
                error=str(exc),
            )
            return set()

    def _is_item_self_allowed(self, item: AdminMenuItem, *, ctx: MenuAccessContext) -> bool:
        if ctx.is_superuser:
            return True

        required = item.permission_code or "admin:access"
        if required == "admin:access":
            return "admin:access" in ctx.permission_codes
        return required in ctx.permission_codes

    def _is_plugin_enabled_or_core(self, item: AdminMenuItem, *, ctx: MenuAccessContext) -> bool:
        meta = item.meta if isinstance(item.meta, dict) else {}
        owner_plugin_id = str(meta.get("plugin_id") or "").strip() if meta else ""
        if not owner_plugin_id or owner_plugin_id == "core":
            return True
        if item.code in ctx.core_codes:
            return True
        return owner_plugin_id in ctx.enabled_plugin_ids

    def _derive_owner_plugin_id(self, item: AdminMenuItem) -> str | None:
        meta = item.meta if isinstance(item.meta, dict) else {}
        owner = str(meta.get("plugin_id") or "").strip() if meta else ""
        return owner or None

    def _compute_effective_self_access(
        self,
        item: AdminMenuItem,
        *,
        ctx: MenuAccessContext,
    ) -> tuple[bool, AdminMenuBlockedReason | None, str, str | None]:
        owner_plugin_id = self._derive_owner_plugin_id(item)
        if owner_plugin_id and owner_plugin_id != "core":
            if item.code not in ctx.core_codes and owner_plugin_id not in ctx.enabled_plugin_ids:
                return (
                    False,
                    AdminMenuBlockedReason.PLUGIN_DISABLED,
                    item.permission_code or "admin:access",
                    owner_plugin_id,
                )

        required = item.permission_code or "admin:access"
        if ctx.is_superuser:
            return True, None, required, owner_plugin_id
        ok = (
            required in ctx.permission_codes if required != "admin:access" else ("admin:access" in ctx.permission_codes)
        )
        if ok:
            return True, None, required, owner_plugin_id
        return False, AdminMenuBlockedReason.MISSING_PERMISSION, required, owner_plugin_id

    def _build_effective_node(
        self,
        item: AdminMenuItem,
        *,
        children: dict[UUID | None, list[AdminMenuItem]],
        ctx: MenuAccessContext,
    ) -> AdminMenuNodeEffective:
        allowed, reason, required, owner_plugin_id = self._compute_effective_self_access(item, ctx=ctx)
        node = AdminMenuNodeEffective(
            id=item.id,
            code=item.code,
            title=localize_menu_title(title=item.title, title_i18n=item.title_i18n),
            title_i18n=item.title_i18n,
            icon=item.icon,
            path=item.path,
            name=item.name,
            component_key=item.component_key,
            redirect=item.redirect,
            sort=item.sort,
            permission_code=item.permission_code,
            meta=item.meta if isinstance(item.meta, dict) else None,
            allowed=allowed,
            blocked_reason=reason,
            required_permission=required,
            owner_plugin_id=owner_plugin_id,
            children=[],
        )

        for child in children.get(item.id, []):
            node.children.append(self._build_effective_node(child, children=children, ctx=ctx))

        if item.type == AdminMenuItemType.GROUP and node.children and any(c.allowed for c in node.children):
            node.allowed = True
            node.blocked_reason = None
            node.required_permission = None
        return node

    def _compute_visible_ids(
        self,
        *,
        index: tuple[dict[UUID, AdminMenuItem], dict[UUID | None, list[AdminMenuItem]]],
        ctx: MenuAccessContext,
    ) -> set[UUID]:
        by_id, children = index
        visible: set[UUID] = set()
        visiting: set[UUID] = set()

        def compute(item_id: UUID) -> bool:
            if item_id in visible:
                return True
            if item_id in visiting:
                return False
            visiting.add(item_id)

            item = by_id.get(item_id)
            if item is None:
                visiting.remove(item_id)
                return False

            allowed = self._is_plugin_enabled_or_core(item, ctx=ctx) and self._is_item_self_allowed(item, ctx=ctx)
            if item.type == AdminMenuItemType.GROUP:
                for child in children.get(item.id, []):
                    if compute(child.id):
                        allowed = True
                        break

            if allowed:
                visible.add(item.id)
            visiting.remove(item_id)
            return allowed

        for root in collect_roots(children=children, by_id=by_id):
            compute(root.id)
        return visible

    def _build_visible_tree(
        self,
        *,
        index: tuple[dict[UUID, AdminMenuItem], dict[UUID | None, list[AdminMenuItem]]],
        visible_ids: set[UUID],
    ) -> list[AdminMenuNode]:
        by_id, children = index

        def build(item: AdminMenuItem) -> AdminMenuNode | None:
            if item.id not in visible_ids:
                return None
            node = AdminMenuNode(
                id=item.id,
                code=item.code,
                title=localize_menu_title(title=item.title, title_i18n=item.title_i18n),
                title_i18n=item.title_i18n,
                icon=item.icon,
                path=item.path,
                name=item.name,
                component_key=item.component_key,
                redirect=item.redirect,
                sort=item.sort,
                permission_code=item.permission_code,
                meta=item.meta if isinstance(item.meta, dict) else None,
                children=[],
            )
            for child in children.get(item.id, []):
                built = build(child)
                if built is not None:
                    node.children.append(built)
            return node

        tree: list[AdminMenuNode] = []
        for root in collect_roots(children=children, by_id=by_id):
            if root.id not in by_id:
                continue
            built = build(root)
            if built is not None:
                tree.append(built)
        return tree

    def _build_full_tree(
        self,
        *,
        index: tuple[dict[UUID, AdminMenuItem], dict[UUID | None, list[AdminMenuItem]]],
    ) -> list[AdminMenuNode]:
        by_id, children = index

        def build(item: AdminMenuItem) -> AdminMenuNode:
            node = AdminMenuNode(
                id=item.id,
                code=item.code,
                title=localize_menu_title(title=item.title, title_i18n=item.title_i18n),
                title_i18n=item.title_i18n,
                icon=item.icon,
                path=item.path,
                name=item.name,
                component_key=item.component_key,
                redirect=item.redirect,
                sort=item.sort,
                permission_code=item.permission_code,
                meta=item.meta if isinstance(item.meta, dict) else None,
                children=[],
            )
            for child in children.get(item.id, []):
                if child.id not in by_id:
                    continue
                node.children.append(build(child))
            return node

        roots = collect_roots(children=children, by_id=by_id)
        return [build(r) for r in roots if r.id in by_id]

    def _build_effective_tree(
        self,
        *,
        index: tuple[dict[UUID, AdminMenuItem], dict[UUID | None, list[AdminMenuItem]]],
        ctx: MenuAccessContext,
    ) -> list[AdminMenuNodeEffective]:
        by_id, children = index
        roots = collect_roots(children=children, by_id=by_id)
        return [self._build_effective_node(r, children=children, ctx=ctx) for r in roots if r.id in by_id]
