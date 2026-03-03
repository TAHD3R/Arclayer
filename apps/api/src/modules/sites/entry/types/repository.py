from __future__ import annotations

"""
Entry types repository.

Entry type persistence is implemented on the root sites repository.
"""

from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.sites.site_entry import EntryRecord, EntryTypeRecord


class EntryTypesRepositoryMixin:
    async def get_entry_type_by_code(self, *, site_id: UUID, code: str) -> EntryTypeRecord:
        c = (code or "").strip()
        if not c:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        et = await EntryTypeRecord.get_or_none(site_id=site_id, code=c)
        if et is None:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
        return et

    async def get_entry_type_by_id(self, *, site_id: UUID, entry_type_id: UUID) -> EntryTypeRecord | None:
        return await EntryTypeRecord.get_or_none(id=entry_type_id, site_id=site_id)

    async def list_entry_types(self, *, site_id: UUID) -> list[EntryTypeRecord]:
        return await EntryTypeRecord.filter(site_id=site_id).order_by("code").all()

    async def create_entry_type(
        self,
        *,
        site_id: UUID,
        code: str,
        name: str,
        fields_schema: dict | None,
    ) -> EntryTypeRecord:
        c = (code or "").strip()
        n = (name or "").strip()
        if not c:
            raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
        if not n:
            raise Conflict("Invalid entry type name", error="ENTRY_TYPE_NAME_INVALID")
        try:
            return await EntryTypeRecord.create(site_id=site_id, code=c, name=n, fields_schema=fields_schema)
        except IntegrityError:
            raise Conflict("Entry type already exists", error="ENTRY_TYPE_CONFLICT") from None

    async def update_entry_type(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        name: str,
        fields_schema: dict | None,
    ) -> EntryTypeRecord:
        async with in_transaction() as conn:
            rec = (
                await EntryTypeRecord
                .filter(id=entry_type_id, site_id=site_id)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if rec is None:
                raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
            rec.name = (name or "").strip()
            rec.fields_schema = fields_schema
            await rec.save(update_fields=["name", "fields_schema"], using_db=conn)
            return rec

    async def delete_entry_type(self, *, site_id: UUID, entry_type_id: UUID) -> None:
        # Prevent deleting entry types in use.
        used = await EntryRecord.filter(site_id=site_id, entry_type_id=entry_type_id).exists()
        if used:
            raise Conflict("Entry type is in use", error="ENTRY_TYPE_IN_USE")
        deleted = await EntryTypeRecord.filter(site_id=site_id, id=entry_type_id).delete()
        if not deleted:
            raise NotFound("Entry type not found", error="ENTRY_TYPE_NOT_FOUND")
