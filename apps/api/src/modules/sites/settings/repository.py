from __future__ import annotations

"""
Settings repository.

Site settings are persisted via the root sites repository.
"""

from datetime import datetime
from typing import Any, cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import SettingUpdatedBy
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.system.setting import SettingRecord
from apps.api.src.modules.sites.namespaces.service import EDITOR_STYLE_NAMESPACE
from apps.api.src.settings.scopes import SCOPE_TYPE_SITE


class SettingsRepositoryMixin:
    async def get_site_setting(self, *, site_id: UUID, namespace: str) -> SettingRecord | None:
        ns = (namespace or "").strip()
        if not ns:
            return None
        return await SettingRecord.get_or_none(scope_type=SCOPE_TYPE_SITE, scope_id=site_id, namespace=ns)

    async def upsert_site_setting(
        self,
        *,
        site_id: UUID,
        namespace: str,
        value: dict | None,
        updated_by: UUID | None,
    ) -> SettingRecord:
        ns = (namespace or "").strip()
        if not ns:
            raise Conflict("Invalid namespace", error="SETTING_NAMESPACE_INVALID")

        rec, created = await SettingRecord.get_or_create(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace=ns,
            defaults={"value": value, "updated_by": updated_by},
        )
        if created:
            return rec

        rec.value = value
        cast(SettingUpdatedBy, rec).updated_by = updated_by
        await rec.save(update_fields=["value", "updated_by"])
        return rec

    async def get_site_settings_snapshot(self, *, site_id: UUID, namespaces: list[str]) -> dict[str, int]:
        """
        Build a minimal settings snapshot for deps (v1).

        We use per-namespace `updated_at` timestamps as a lightweight "version":
        - Changing a setting updates its `updated_at`.
        - Revisions can store this snapshot to help debugging and rollback safety analysis.
        """

        norm = [str(ns).strip() for ns in namespaces if isinstance(ns, str) and str(ns).strip()]
        if not norm:
            return {}

        rows = await SettingRecord.filter(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace__in=norm,
        ).all()

        out: dict[str, int] = {}
        for r in rows:
            updated_at = getattr(r, "updated_at", None)
            out[str(r.namespace)] = int(updated_at.timestamp() * 1000) if isinstance(updated_at, datetime) else 0

        # Keep the shape stable: always include requested namespaces.
        for ns in norm:
            out.setdefault(ns, 0)
        return out

    async def get_menu_by_key(self, *, site_id: UUID, key: str) -> dict[str, Any]:
        k = (key or "").strip()
        if not k:
            raise NotFound("Menu not found", error="DELIVERY_MENU_NOT_FOUND")
        ns = f"site.menu.{k}"
        setting = await SettingRecord.get_or_none(scope_type=SCOPE_TYPE_SITE, scope_id=site_id, namespace=ns)
        if setting is None or not isinstance(setting.value, dict):
            raise NotFound("Menu not found", error="DELIVERY_MENU_NOT_FOUND")
        return cast(dict[str, Any], setting.value)

    async def get_site_style(self, *, site_id: UUID) -> dict[str, Any]:
        setting = await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_SITE,
            scope_id=site_id,
            namespace=EDITOR_STYLE_NAMESPACE,
        )
        if setting is None or not isinstance(setting.value, dict):
            return {}
        return cast(dict[str, Any], setting.value)
