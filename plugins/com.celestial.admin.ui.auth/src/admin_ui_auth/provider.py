from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

from apps.api.core.authz import get_authz_snapshot_provider
from apps.api.core.i18n import t
from apps.api.plugin.extension_points.admin_ui import (
    AdminUIResourceSpec,
    AdminUIResourceType,
    get_admin_ui_resource_providers,
)
from apps.api.routers.v1.admin.ui.schema import AdminUIActionState, AdminUIContext, AdminUINavNode


def _translate_ref(ref: str | None, default: str) -> str:
    if not ref:
        return default
    trimmed = ref.strip()
    if ":" in trimmed:
        namespace, key = trimmed.split(":", 1)
    elif "." in trimmed:
        namespace, key = trimmed.split(".", 1)
    else:
        return default
    namespace = namespace.strip()
    key = key.strip()
    if not namespace or not key:
        return default
    return t(namespace, key, default=default)


def _has_required_permissions(
    permission_set: set[str],
    *,
    required_any: list[str],
    required_all: list[str],
    is_superuser: bool,
) -> bool:
    if is_superuser:
        return True
    if required_all:
        if not all(code in permission_set for code in required_all):
            return False
    if required_any:
        return any(code in permission_set for code in required_any)
    # No requirement means allowed.
    return True


class DefaultAdminUIContextProvider:
    async def get_context(self, user_id: UUID) -> AdminUIContext:
        snapshot_provider = get_authz_snapshot_provider()
        if snapshot_provider is None:
            # The router will translate this into 503; keep it simple here.
            raise RuntimeError("Authz snapshot provider not available")

        snap = await snapshot_provider.get_snapshot(user_id)
        permissions = set(snap.get("permission_codes") or [])
        is_superuser = bool(snap.get("is_superuser", False))

        resources: list[AdminUIResourceSpec] = []
        for provider in get_admin_ui_resource_providers():
            items = provider.get_resources() or []
            for item in items:
                # Normalize to pydantic model for downstream logic.
                resources.append(AdminUIResourceSpec.model_validate(item))

        # Index resources by id and group children by parent_id.
        by_id: dict[str, AdminUIResourceSpec] = {}
        children: dict[str | None, list[AdminUIResourceSpec]] = defaultdict(list)
        for res in resources:
            if res.id in by_id:
                # Keep first for determinism; ignore duplicates.
                continue
            by_id[res.id] = res
            children[res.parent_id].append(res)

        # Sort children lists for stable output.
        for key in list(children.keys()):
            children[key].sort(key=lambda r: (r.sort, r.title, r.id))

        # First pass: decide which menu nodes are visible.
        visible_menu_ids: set[str] = set()

        def _compute_menu_visibility(res_id: str) -> bool:
            res = by_id.get(res_id)
            if res is None:
                return False
            if res.type not in {AdminUIResourceType.MENU_GROUP, AdminUIResourceType.MENU_ITEM}:
                return False

            allowed = _has_required_permissions(
                permissions,
                required_any=res.required_permissions_any,
                required_all=res.required_permissions_all,
                is_superuser=is_superuser,
            )
            # Menu group can be visible if any child is visible.
            if res.type == AdminUIResourceType.MENU_GROUP:
                for child in children.get(res.id, []):
                    if child.type in {AdminUIResourceType.MENU_GROUP, AdminUIResourceType.MENU_ITEM}:
                        if _compute_menu_visibility(child.id):
                            allowed = True
                            break

            if allowed:
                visible_menu_ids.add(res.id)
            return allowed

        # Compute visibility starting from roots (parent_id is None or missing).
        roots = children.get(None, [])
        for res in roots:
            if res.type in {AdminUIResourceType.MENU_GROUP, AdminUIResourceType.MENU_ITEM}:
                _compute_menu_visibility(res.id)

        # Build nav tree (menus only; hidden menus not included).
        def _build_nav_node(res: AdminUIResourceSpec) -> dict[str, Any] | None:
            if res.id not in visible_menu_ids:
                return None
            node = AdminUINavNode(
                id=res.id,
                title=_translate_ref(res.title_i18n, res.title),
                icon=res.icon,
                path=res.path,
                sort=res.sort,
                children=[],
            )
            for child in children.get(res.id, []):
                if child.type in {AdminUIResourceType.MENU_GROUP, AdminUIResourceType.MENU_ITEM}:
                    built = _build_nav_node(child)
                    if built is not None:
                        node.children.append(built)
            return node

        nav_tree: list[AdminUINavNode] = []
        for res in roots:
            if res.type in {AdminUIResourceType.MENU_GROUP, AdminUIResourceType.MENU_ITEM}:
                built = _build_nav_node(res)
                if built is not None:
                    nav_tree.append(built)

        # Build action map: only actions under visible menu nodes are included,
        # but they can be enabled/disabled based on permission codes.
        actions: dict[str, AdminUIActionState] = {}
        for res in resources:
            if res.type != AdminUIResourceType.ACTION:
                continue
            # If action has a parent, require that its parent menu is visible.
            if res.parent_id and res.parent_id not in visible_menu_ids:
                continue

            enabled = _has_required_permissions(
                permissions,
                required_any=res.required_permissions_any,
                required_all=res.required_permissions_all,
                is_superuser=is_superuser,
            )
            actions[res.id] = AdminUIActionState(
                id=res.id,
                title=_translate_ref(res.title_i18n, res.title),
                enabled=bool(enabled),
                required_permissions_any=list(res.required_permissions_any),
                required_permissions_all=list(res.required_permissions_all),
            )

        return AdminUIContext(nav_tree=nav_tree, actions=actions)
