from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasEntryTypeId
from apps.api.src.common.services.base import BaseService
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.modules.sites.repository import SitesRepository
from apps.api.src.modules.sites.schema import (
    SiteEntryCreateIn,
    SiteEntryDeleteOut,
    SiteEntryOut,
    SiteEntryTypeCreateIn,
    SiteEntryTypeDeleteOut,
    SiteEntryTypeOut,
    SiteEntryTypeUpdateIn,
    SiteEntryUnpublishIn,
    SiteEntryUnpublishOut,
    SiteEntryUpdateIn,
)
from apps.api.src.modules.sites.shared.service import validate_entry_type_code


def _get_entry_type_id(value: object) -> UUID:
    raw = cast(HasEntryTypeId, value).entry_type_id
    return UUID(str(raw))


class ContentEntryService(BaseService):
    def __init__(
        self,
        settings,
        *,
        repo: SitesRepository,
    ) -> None:
        super().__init__(settings)
        self._repo = repo

    async def list_entry_types_paginated(self, *, site_id: UUID, params: PageParams) -> PageData[SiteEntryTypeOut]:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        items = [
            SiteEntryTypeOut(
                id=UUID(str(et.id)),
                site_id=site_id,
                code=str(et.code),
                name=str(et.name),
                fields_schema=(et.fields_schema if isinstance(et.fields_schema, dict) else None),
            )
            for et in await self._repo.list_entry_types(site_id=site_id)
        ]
        return paginate_items(items, params=params)

    async def create_entry_type(self, *, site_id: UUID, payload: SiteEntryTypeCreateIn) -> SiteEntryTypeOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        code = validate_entry_type_code(payload.code)
        name = (payload.name or "").strip()
        if not name:
            raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")

        rec = await self._repo.create_entry_type(
            site_id=site_id,
            code=code,
            name=name,
            fields_schema=(payload.fields_schema if isinstance(payload.fields_schema, dict) else None),
        )
        return SiteEntryTypeOut(
            id=UUID(str(rec.id)),
            site_id=site_id,
            code=str(rec.code),
            name=str(rec.name),
            fields_schema=(rec.fields_schema if isinstance(rec.fields_schema, dict) else None),
        )

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        payload: SiteEntryTypeUpdateIn,
    ) -> SiteEntryTypeOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        # v1: allow partial update (name/fields_schema).
        fields_set = payload.model_fields_set
        if "name" not in fields_set and "fields_schema" not in fields_set:
            raise Conflict("No fields to update", error="NO_UPDATES")

        existing = await self._repo.get_entry_type_by_id(site_id=site_id, entry_type_id=entry_type_id)
        if existing is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")

        name = str(existing.name)
        if "name" in fields_set and payload.name is not None:
            name = (payload.name or "").strip()
            if not name:
                raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")

        fields_schema = existing.fields_schema if isinstance(existing.fields_schema, dict) else None
        if "fields_schema" in fields_set:
            fields_schema = payload.fields_schema if isinstance(payload.fields_schema, dict) else None

        updated = await self._repo.update_entry_type(
            site_id=site_id,
            entry_type_id=entry_type_id,
            name=name,
            fields_schema=(fields_schema if isinstance(fields_schema, dict) else None),
        )
        return SiteEntryTypeOut(
            id=UUID(str(updated.id)),
            site_id=site_id,
            code=str(updated.code),
            name=str(updated.name),
            fields_schema=(updated.fields_schema if isinstance(updated.fields_schema, dict) else None),
        )

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> SiteEntryTypeDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entry types require database storage", error="ENTRY_TYPE_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry_type(site_id=site_id, entry_type_id=entry_type_id)
        return SiteEntryTypeDeleteOut(entry_type_id=entry_type_id)

    async def list_entries_paginated(
        self,
        *,
        site_id: UUID,
        params: PageParams,
        entry_type_code: str | None,
    ) -> PageData[SiteEntryOut]:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        entry_type_id: UUID | None = None
        if entry_type_code is not None:
            et = await self._repo.get_entry_type_by_code(site_id=site_id, code=entry_type_code)
            entry_type_id = UUID(str(et.id))

        entries = await self._repo.list_entries(site_id=site_id, entry_type_id=entry_type_id)
        items: list[SiteEntryOut] = []
        for e in entries:
            et_code = getattr(e.entry_type, "code", "") if getattr(e, "entry_type", None) is not None else ""
            entry_type_id_value = _get_entry_type_id(e)
            items.append(
                SiteEntryOut(
                    id=UUID(str(e.id)),
                    site_id=site_id,
                    entry_type_id=entry_type_id_value,
                    entry_type_code=str(et_code),
                    slug=str(e.slug),
                    draft_revision=int(e.draft_rev or 0),
                    published_revision=(int(e.published_rev) if e.published_rev is not None else None),
                )
            )
        return paginate_items(items, params=params)

    async def create_entry(self, *, site_id: UUID, payload: SiteEntryCreateIn) -> SiteEntryOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
        entry = await self._repo.create_entry(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=payload.slug,
            created_by_user_id=None,
        )
        entry_type_id_value = _get_entry_type_id(entry)
        return SiteEntryOut(
            id=UUID(str(entry.id)),
            site_id=site_id,
            entry_type_id=entry_type_id_value,
            entry_type_code=str(payload.entry_type_code),
            slug=str(entry.slug),
            draft_revision=int(entry.draft_rev or 0),
            published_revision=(int(entry.published_rev) if entry.published_rev is not None else None),
        )

    async def update_entry(self, *, site_id: UUID, entry_id: UUID, payload: SiteEntryUpdateIn) -> SiteEntryOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)

        fields_set = payload.model_fields_set
        if "slug" not in fields_set or payload.slug is None:
            raise Conflict("No fields to update", error="NO_UPDATES")

        updated = await self._repo.update_entry_slug(site_id=site_id, entry_id=entry_id, slug=payload.slug)
        entry_type_id_value = _get_entry_type_id(updated)
        et = await self._repo.get_entry_type_by_id(site_id=site_id, entry_type_id=entry_type_id_value)
        if et is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        return SiteEntryOut(
            id=UUID(str(updated.id)),
            site_id=site_id,
            entry_type_id=entry_type_id_value,
            entry_type_code=str(et.code),
            slug=str(updated.slug),
            draft_revision=int(updated.draft_rev or 0),
            published_revision=(int(updated.published_rev) if updated.published_rev is not None else None),
        )

    async def unpublish_entry(self, *, site_id: UUID, payload: SiteEntryUnpublishIn) -> SiteEntryUnpublishOut:
        if not self.settings.database.enabled:
            raise Conflict("Publishing requires database storage", error="PUBLISH_DB_REQUIRED")

        await self._repo.get_site_by_id(site_id=site_id)
        et = await self._repo.get_entry_type_by_code(site_id=site_id, code=payload.entry_type_code)
        entry_id, now_ms = await self._repo.unpublish_entry_by_slug(
            site_id=site_id,
            entry_type_id=UUID(str(et.id)),
            slug=payload.slug,
        )
        return SiteEntryUnpublishOut(
            site_id=site_id,
            entry_id=entry_id,
            entry_type_code=payload.entry_type_code,
            slug=(payload.slug or "").strip(),
            unpublished_at_ms=now_ms,
        )

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> SiteEntryDeleteOut:
        if not self.settings.database.enabled:
            raise Conflict("Entries require database storage", error="ENTRY_DB_REQUIRED")
        await self._repo.get_site_by_id(site_id=site_id)
        await self._repo.delete_entry(site_id=site_id, entry_id=entry_id)
        return SiteEntryDeleteOut(entry_id=entry_id)
