from __future__ import annotations

"""
Settings service.

Settings workflows are implemented on `SiteService` and will be extracted here as part of ongoing refactors.
"""

import secrets
import time
from typing import TYPE_CHECKING, cast
from uuid import UUID

from pydantic import ValidationError

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.modules.sites import schema as sites_schema
from apps.api.src.modules.sites.namespaces.service import EDITOR_GLOBAL_SECTIONS_NAMESPACE, EDITOR_STYLE_NAMESPACE

if TYPE_CHECKING:
    from apps.api.src.config import Settings
    from apps.api.src.modules.sites.repository import SitesRepository


class SiteSettingsMixin:
    settings: Settings
    _repo: SitesRepository

    async def get_site_setting(self, *, site_id: UUID, namespace: str) -> sites_schema.SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.get_site_setting(site_id=site_id, namespace=namespace)
        value = rec.value if rec and isinstance(rec.value, dict) else None
        return sites_schema.SiteSettingGetOut(namespace=namespace, value=value)

    async def upsert_site_setting(
        self, *, site_id: UUID, namespace: str, payload: sites_schema.SiteSettingUpsertIn
    ) -> sites_schema.SiteSettingGetOut:
        if not self.settings.database.enabled:
            raise Conflict("Site settings require database storage", error="SETTINGS_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        rec = await self._repo.upsert_site_setting(
            site_id=site_id, namespace=namespace, value=payload.value, updated_by=None
        )
        value = rec.value if isinstance(rec.value, dict) else None
        return sites_schema.SiteSettingGetOut(namespace=namespace, value=value)

    @staticmethod
    def _normalize_section_id(section_id: str) -> str:
        return (section_id or "").strip()

    @staticmethod
    def _parse_global_sections_items(raw_items: object) -> list[sites_schema.SiteGlobalSectionOut]:
        if not isinstance(raw_items, list):
            return []

        items: list[sites_schema.SiteGlobalSectionOut] = []
        for raw in raw_items:
            if not isinstance(raw, dict):
                raise Conflict("Invalid global section item shape", error="GLOBAL_SECTION_ITEM_INVALID")
            try:
                items.append(sites_schema.SiteGlobalSectionOut.model_validate(raw))
            except ValidationError as exc:
                raise Conflict("Invalid global section item", error="GLOBAL_SECTION_ITEM_INVALID") from exc
        return items

    def _parse_global_sections_value(self, value: object) -> list[sites_schema.SiteGlobalSectionOut]:
        if not isinstance(value, dict):
            return []
        return self._parse_global_sections_items(value.get("items"))

    @staticmethod
    def _dump_global_sections_value(items: list[sites_schema.SiteGlobalSectionOut]) -> dict[str, object]:
        return {"items": [cast(dict[str, object], item.model_dump()) for item in items]}

    async def _load_global_sections(self, *, site_id: UUID) -> list[sites_schema.SiteGlobalSectionOut]:
        setting = await self.get_site_setting(site_id=site_id, namespace=EDITOR_GLOBAL_SECTIONS_NAMESPACE)
        return self._parse_global_sections_value(setting.value)

    async def _save_global_sections(self, *, site_id: UUID, items: list[sites_schema.SiteGlobalSectionOut]) -> None:
        await self.upsert_site_setting(
            site_id=site_id,
            namespace=EDITOR_GLOBAL_SECTIONS_NAMESPACE,
            payload=sites_schema.SiteSettingUpsertIn(value=self._dump_global_sections_value(items)),
        )

    async def get_site_style(self, *, site_id: UUID) -> sites_schema.SiteStyleOut:
        setting = await self.get_site_setting(site_id=site_id, namespace=EDITOR_STYLE_NAMESPACE)
        return sites_schema.SiteStyleOut(namespace=setting.namespace, value=setting.value)

    async def upsert_site_style(
        self, *, site_id: UUID, payload: sites_schema.SiteStyleUpsertIn
    ) -> sites_schema.SiteStyleOut:
        setting = await self.upsert_site_setting(
            site_id=site_id,
            namespace=EDITOR_STYLE_NAMESPACE,
            payload=sites_schema.SiteSettingUpsertIn(value=payload.value),
        )
        return sites_schema.SiteStyleOut(namespace=setting.namespace, value=setting.value)

    async def list_global_sections(self, *, site_id: UUID) -> sites_schema.SiteGlobalSectionsOut:
        items = await self._load_global_sections(site_id=site_id)
        return sites_schema.SiteGlobalSectionsOut(items=items)

    async def create_global_section(
        self,
        *,
        site_id: UUID,
        payload: sites_schema.SiteGlobalSectionCreateIn,
    ) -> sites_schema.SiteGlobalSectionOut:
        items = await self._load_global_sections(site_id=site_id)

        new_id = secrets.token_hex(12)
        while any(item.id == new_id for item in items):
            new_id = secrets.token_hex(12)

        now_ms = int(time.time() * 1000)
        section = sites_schema.SiteGlobalSectionOut(
            id=new_id,
            name=payload.name,
            kind=payload.kind,
            enabled=payload.enabled,
            payload=payload.payload,
            updated_at_ms=now_ms,
        )
        items.append(section)
        await self._save_global_sections(site_id=site_id, items=items)
        return section

    @staticmethod
    def _apply_global_section_patch(
        current: sites_schema.SiteGlobalSectionOut,
        payload: sites_schema.SiteGlobalSectionUpdateIn,
    ) -> sites_schema.SiteGlobalSectionOut:
        fields_set = payload.model_fields_set
        patch_data: dict[str, object] = {}

        if "name" in fields_set and payload.name is not None:
            patch_data["name"] = payload.name
        if "kind" in fields_set and payload.kind is not None:
            patch_data["kind"] = payload.kind
        if "enabled" in fields_set and payload.enabled is not None:
            patch_data["enabled"] = payload.enabled
        if "payload" in fields_set:
            patch_data["payload"] = payload.payload

        if not patch_data:
            return current

        patch_data["updated_at_ms"] = int(time.time() * 1000)
        return current.model_copy(update=patch_data)

    async def patch_global_section(
        self,
        *,
        site_id: UUID,
        section_id: str,
        payload: sites_schema.SiteGlobalSectionUpdateIn,
    ) -> sites_schema.SiteGlobalSectionOut:
        target_section_id = self._normalize_section_id(section_id)
        if not target_section_id:
            raise NotFound("Global section not found", error="GLOBAL_SECTION_NOT_FOUND")

        items = await self._load_global_sections(site_id=site_id)
        index = next((i for i, item in enumerate(items) if item.id == target_section_id), None)
        if index is None:
            raise NotFound("Global section not found", error="GLOBAL_SECTION_NOT_FOUND")

        updated = self._apply_global_section_patch(items[index], payload)
        if updated == items[index]:
            return updated

        items[index] = updated
        await self._save_global_sections(site_id=site_id, items=items)
        return updated

    async def delete_global_section(self, *, site_id: UUID, section_id: str) -> sites_schema.SiteGlobalSectionDeleteOut:
        target_section_id = self._normalize_section_id(section_id)
        if not target_section_id:
            raise NotFound("Global section not found", error="GLOBAL_SECTION_NOT_FOUND")

        items = await self._load_global_sections(site_id=site_id)
        next_items = [item for item in items if item.id != target_section_id]
        if len(next_items) == len(items):
            raise NotFound("Global section not found", error="GLOBAL_SECTION_NOT_FOUND")

        await self._save_global_sections(site_id=site_id, items=next_items)
        return sites_schema.SiteGlobalSectionDeleteOut(id=target_section_id)
