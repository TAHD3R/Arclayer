from __future__ import annotations

from typing import Any, cast

from apps.api.src.common.protocols.tortoise import AdminMenuItemMutableFields
from apps.api.src.common.services import BaseService
from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.modules.system.admin.menus.models import AdminMenuItem, AdminMenuItemType
from apps.api.src.plugin.manifest import AdminMenuSeedItem

logger = get_logger(__name__)


class AdminMenuSeedService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def ensure_seeds(
        self,
        *,
        owner_plugin_id: str,
        seeds: list[AdminMenuSeedItem],
        update_existing: bool,
        restore_deleted: bool,
    ) -> None:
        """
        Ensure menu seed items exist in DB.

        Policies:
        - update_existing=False: only create missing items; never overwrite user edits.
        - restore_deleted=True: revive soft-deleted items owned by the same plugin/core.
        """

        if not seeds:
            return

        # Resolve parent codes in a best-effort manner.
        code_to_id: dict[str, Any] = {}
        # Prefer active tree anchors when resolving parent codes. Deleted items can exist in legacy DBs,
        # and using them as parent anchors would make the new items "orphaned" (parent not visible).
        existing = await AdminMenuItem.filter(deleted_at__isnull=True).values_list("id", "code")
        for row_id, code in existing:
            if code:
                code_to_id[str(code)] = row_id

        def _normalize_type(raw: str) -> AdminMenuItemType:
            value = (raw or "").strip().lower()
            if value == "group":
                return AdminMenuItemType.GROUP
            return AdminMenuItemType.ITEM

        for seed in seeds:
            code = (seed.code or "").strip()
            if not code:
                continue

            parent_id = None
            parent_code = (seed.parent_code or "").strip()
            if parent_code:
                parent_id = code_to_id.get(parent_code)
                if parent_id is None and owner_plugin_id != "core":
                    # Fallback: attach plugin menus under the plugins root group when parent is missing.
                    parent_id = code_to_id.get("plugins")
                    logger.warning(
                        "Admin menu seed parent_code not found, fallback to plugins root",
                        code=code,
                        parent_code=parent_code,
                        plugin_id=owner_plugin_id,
                    )
            elif owner_plugin_id != "core":
                # Convention: plugin menus default to live under the plugins root group.
                parent_id = code_to_id.get("plugins")

            existing_item = await AdminMenuItem.get_or_none(code=code)
            if existing_item is None:
                item_type = _normalize_type(seed.type)
                payload_meta: dict[str, Any] = {}
                if isinstance(seed.meta, dict):
                    payload_meta.update(seed.meta)
                payload_meta["plugin_id"] = owner_plugin_id
                created = await AdminMenuItem.create(
                    code=code,
                    parent_id=parent_id,
                    title=seed.title,
                    title_i18n=seed.title_i18n,
                    icon=seed.icon,
                    type=item_type,
                    path=seed.path if item_type == AdminMenuItemType.ITEM else None,
                    name=seed.name if item_type == AdminMenuItemType.ITEM else None,
                    component_key=seed.component_key,
                    redirect=seed.redirect,
                    sort=int(seed.sort or 0),
                    is_active=bool(seed.is_active),
                    permission_code=seed.permission_code,
                    meta=payload_meta or None,
                    deleted_at=None,
                )
                # Update index for subsequent child seeds.
                code_to_id[code] = created.id
                continue

            # Always prefer the resolved row for subsequent child seeds in this same run.
            # This avoids parent_id drift when legacy DB contains inconsistent anchors.
            code_to_id[code] = existing_item.id

            meta = existing_item.meta if isinstance(existing_item.meta, dict) else {}
            owner = str(meta.get("plugin_id") or "").strip() if meta else ""
            if owner and owner != owner_plugin_id:
                if owner_plugin_id != "core":
                    logger.warning(
                        "Admin menu seed collision (owned by another plugin), skip",
                        code=code,
                        owner=owner,
                        plugin_id=owner_plugin_id,
                    )
                    continue
                # Core navigation is product-owned. If legacy data or a plugin accidentally
                # claimed a core code, core must take it back to keep menu/RBAC stable.
                logger.warning(
                    "Admin menu seed collision (core takeover)",
                    code=code,
                    previous_owner=owner,
                    plugin_id=owner_plugin_id,
                )
            if not update_existing and not owner:
                # Respect user-created items (no plugin owner marker).
                continue
            if not update_existing and owner == owner_plugin_id:
                # Do not overwrite, but allow restore if requested.
                if restore_deleted and existing_item.deleted_at is not None:
                    item_like = cast(AdminMenuItemMutableFields, existing_item)
                    item_like.deleted_at = None
                    existing_item.is_active = bool(seed.is_active)
                    await existing_item.save(update_fields=["deleted_at", "is_active"])
                    code_to_id[code] = existing_item.id
                continue

            # Upsert allowed (core/system seeds).
            item_type = _normalize_type(seed.type)
            item_like = cast(AdminMenuItemMutableFields, existing_item)
            next_meta: dict[str, Any] = {}
            if isinstance(meta, dict):
                next_meta.update(meta)
            if isinstance(seed.meta, dict):
                next_meta.update(seed.meta)
            next_meta["plugin_id"] = owner_plugin_id

            existing_item.parent_id = parent_id
            existing_item.title = seed.title
            item_like.title_i18n = seed.title_i18n
            item_like.icon = seed.icon
            existing_item.type = item_type
            item_like.path = seed.path if item_type == AdminMenuItemType.ITEM else None
            item_like.name = seed.name if item_type == AdminMenuItemType.ITEM else None
            item_like.component_key = seed.component_key
            item_like.redirect = seed.redirect
            existing_item.sort = int(seed.sort or 0)
            existing_item.is_active = bool(seed.is_active)
            item_like.permission_code = seed.permission_code
            existing_item.meta = next_meta or None
            if restore_deleted:
                item_like.deleted_at = None
            await existing_item.save()
            code_to_id[code] = existing_item.id
