from __future__ import annotations

import time
from typing import Literal, cast
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import SitePageMutableFields
from apps.api.src.core.exceptions import NotFound
from apps.api.src.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord
from apps.api.src.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord


class RevisionPointersRepositoryMixin:
    async def rollback_page_revision_pointer(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
        updated_by_user_id: UUID | None,
    ) -> tuple[int | None, int, int]:
        """
        Rollback a page revision pointer by setting `draft_rev` or `published_rev`.

        Returns: (from_revision, to_revision, rolled_back_at_ms).
        """

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=revision).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            if target == "draft":
                mutable_page = cast(SitePageMutableFields, page)
                from_rev = int(page.draft_rev or 0) or None
                mutable_page.draft_rev = int(revision)
                update_fields = ["draft_rev"]
                if updated_by_user_id is not None:
                    mutable_page.updated_by_user_id = updated_by_user_id
                    update_fields.append("updated_by_user_id")
                await page.save(update_fields=update_fields, using_db=conn)
                return from_rev, int(revision), now_ms

            mutable_page = cast(SitePageMutableFields, page)
            from_rev = int(page.published_rev or 0) or None
            mutable_page.published_rev = int(revision)
            update_fields = ["published_rev"]
            if updated_by_user_id is not None:
                mutable_page.updated_by_user_id = updated_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)
            return from_rev, int(revision), now_ms

    async def rollback_entry_revision_pointer(
        self,
        *,
        site_id: UUID,
        entry_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
    ) -> tuple[int | None, int, int]:
        """
        Rollback an entry revision pointer by setting `draft_rev` or `published_rev`.

        Returns: (from_revision, to_revision, rolled_back_at_ms).
        """

        now_ms = int(time.time() * 1000)
        async with in_transaction() as conn:
            entry = await EntryRecord.filter(site_id=site_id, id=entry_id).using_db(conn).select_for_update().first()
            if entry is None:
                raise NotFound("Entry not found", error="ENTRY_NOT_FOUND")

            rec = await EntryRevisionRecord.filter(entry_id=entry.id, rev=revision).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            if target == "draft":
                from_rev = int(entry.draft_rev or 0) or None
                entry.draft_rev = int(revision)
                await entry.save(update_fields=["draft_rev"], using_db=conn)
                return from_rev, int(revision), now_ms

            from_rev = int(entry.published_rev or 0) or None
            entry.published_rev = int(revision)
            await entry.save(update_fields=["published_rev"], using_db=conn)
            return from_rev, int(revision), now_ms
