from __future__ import annotations

"""
Entries repository.

Entry persistence is implemented on the root sites repository and publishing flows.
"""

import time
from typing import Any, cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import EntryRecordMutableFields, HasEntryId, HasEntryTypeId
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.sites.site_entry import EntryRecord, EntryRevisionRecord, EntryTypeRecord


class EntriesRepositoryMixin:
    async def list_entries(self, *, site_id: UUID, entry_type_id: UUID | None = None) -> list[EntryRecord]:
        qs = EntryRecord.filter(site_id=site_id)
        if entry_type_id is not None:
            qs = qs.filter(entry_type_id=entry_type_id)
        return await qs.prefetch_related("entry_type").order_by("slug").all()

    async def create_entry(
        self, *, site_id: UUID, entry_type_id: UUID, slug: str, created_by_user_id: UUID | None
    ) -> EntryRecord:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")
        try:
            return await EntryRecord.create(
                site_id=site_id,
                entry_type_id=entry_type_id,
                slug=s,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=created_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Entry already exists", error="ENTRY_CONFLICT") from None

    async def update_entry_slug(self, *, site_id: UUID, entry_id: UUID, slug: str) -> EntryRecord:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(id=entry_id, site_id=site_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            entry.slug = s
            try:
                await entry.save(update_fields=["slug"], using_db=conn)
            except IntegrityError:
                raise Conflict("Entry slug already exists", error="ENTRY_SLUG_CONFLICT") from None
            return entry

    async def unpublish_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
    ) -> tuple[UUID, int]:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise Conflict("Invalid slug", error="ENTRY_SLUG_INVALID")

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            entry = (
                await EntryRecord
                .filter(site_id=site_id, entry_type_id=entry_type_id, slug=s)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            if entry.published_rev is None:
                raise Conflict("Entry is not published", error="ENTRY_NOT_PUBLISHED")
            cast(EntryRecordMutableFields, entry).published_rev = None
            await entry.save(update_fields=["published_rev"], using_db=conn)
        return UUID(str(entry.id)), now_ms

    async def delete_entry(self, *, site_id: UUID, entry_id: UUID) -> None:
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")
            if entry.published_rev is not None:
                raise Conflict("Entry must be unpublished before delete", error="ENTRY_MUST_UNPUBLISH")
            await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).delete()

    # --- Delivery API (public read-only) ---

    async def list_published_entries(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        qs = EntryRecord.filter(site_id=site_id, published_rev__not_isnull=True)
        if entry_type_id is not None:
            qs = qs.filter(entry_type_id=entry_type_id)

        entries = await qs.order_by("slug", "id").all()
        if not entries:
            return []

        # Resolve entry type code map (avoid relying on implicit FK typing).
        type_ids = {
            UUID(str(cast(HasEntryTypeId, entry).entry_type_id))
            for entry in entries
            if cast(HasEntryTypeId, entry).entry_type_id is not None
        }
        type_rows = await EntryTypeRecord.filter(id__in=list(type_ids)).all() if type_ids else []
        type_code_by_id = {UUID(str(row.id)): str(row.code) for row in type_rows}

        entry_ids = [UUID(str(entry.id)) for entry in entries]
        revs = {int(entry.published_rev) for entry in entries if entry.published_rev is not None}
        revisions = await EntryRevisionRecord.filter(entry_id__in=entry_ids, rev__in=list(revs)).all() if revs else []
        rev_by_key = {(UUID(str(cast(HasEntryId, rev).entry_id)), int(rev.rev)): rev for rev in revisions}

        out: list[dict[str, Any]] = []
        for entry in entries:
            entry_id = UUID(str(entry.id))
            published_rev = int(entry.published_rev) if entry.published_rev is not None else 0
            rev = rev_by_key.get((entry_id, published_rev))

            data = rev.data if rev is not None and isinstance(rev.data, dict) else None
            title_raw = data.get("title") if isinstance(data, dict) else None
            title = title_raw if isinstance(title_raw, str) and title_raw.strip() else None
            page_blueprint = rev.design_document if rev is not None and isinstance(rev.design_document, dict) else None

            type_id = UUID(str(cast(HasEntryTypeId, entry).entry_type_id))
            out.append({
                "slug": str(entry.slug),
                "entry_type_code": type_code_by_id.get(type_id, ""),
                "title": title,
                "field_values": data,
                "page_blueprint": page_blueprint,
            })

        return out

    async def get_published_entry_by_slug(self, *, site_id: UUID, slug: str) -> dict[str, Any]:
        s = (slug or "").strip()
        if not s or "/" in s:
            raise NotFound("Entry not found", error="DELIVERY_ENTRY_NOT_FOUND")

        entry = (
            await EntryRecord
            .filter(site_id=site_id, slug=s, published_rev__not_isnull=True)
            .order_by("entry_type_id", "id")
            .first()
        )
        if entry is None or entry.published_rev is None:
            raise NotFound("Entry not found", error="DELIVERY_ENTRY_NOT_FOUND")

        type_id = UUID(str(cast(HasEntryTypeId, entry).entry_type_id))
        et = await EntryTypeRecord.get_or_none(id=type_id)
        type_code = str(et.code) if et is not None else ""

        rev = await EntryRevisionRecord.get_or_none(entry_id=UUID(str(entry.id)), rev=int(entry.published_rev))
        data = rev.data if rev is not None and isinstance(rev.data, dict) else None
        title_raw = data.get("title") if isinstance(data, dict) else None
        title = title_raw if isinstance(title_raw, str) and title_raw.strip() else None
        page_blueprint = rev.design_document if rev is not None and isinstance(rev.design_document, dict) else None

        return {
            "slug": str(entry.slug),
            "entry_type_code": type_code,
            "title": title,
            "field_values": data,
            "page_blueprint": page_blueprint,
        }
