from __future__ import annotations

import time
from typing import Literal
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.modules.sites.design_document.schema import PageBlueprint
from apps.api.src.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord
from apps.api.src.modules.sites.shared.schema import ResolvedEntryDocument


class PublishingEntriesRepositoryMixin:
    async def get_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> EntryRecord | None:
        return await EntryRecord.get_or_none(id=entry_id, site_id=site_id)

    async def get_entry_revision(self, *, entry_id: UUID, rev: int) -> EntryRevisionRecord | None:
        return await EntryRevisionRecord.get_or_none(entry_id=entry_id, rev=rev)

    async def save_entry_draft_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        page_blueprint: PageBlueprint | None,
        data: dict | None,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[UUID, int, int]:
        """
        Save an entry draft by (entry_type_id, slug).

        Returns: (entry_id, revision, saved_at_ms).
        """

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
                entry = await EntryRecord.create(
                    site_id=site_id,
                    entry_type_id=entry_type_id,
                    slug=s,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(entry.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            prev: EntryRevisionRecord | None = None

            # PATCH semantics: when payload fields are omitted (None),
            # keep the current draft snapshot to avoid unintentionally wiping data.
            # (Clients can send {} to explicitly clear a JSON payload.)
            if current_rev > 0:
                prev = await EntryRevisionRecord.filter(entry_id=entry.id, rev=current_rev).using_db(conn).first()
                if prev is not None:
                    if data is None and isinstance(prev.data, dict):
                        data = prev.data
                    if meta is None and isinstance(prev.meta, dict):
                        meta = prev.meta
                    if style_overrides is None and isinstance(prev.style_overrides, dict):
                        style_overrides = prev.style_overrides
                    if deps is None and isinstance(prev.deps, dict):
                        deps = prev.deps
                    if variant_id is None and prev.variant_id:
                        variant_id = str(prev.variant_id)

            next_rev = current_rev + 1 if current_rev else 1
            await EntryRevisionRecord.create(
                entry_id=entry.id,
                rev=next_rev,
                data=data,
                document=None,
                design_document=(
                    page_blueprint.model_dump(by_alias=True)
                    if page_blueprint is not None
                    else (prev.design_document if prev is not None else None)
                ),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            entry.draft_rev = next_rev
            await entry.save(update_fields=["draft_rev"], using_db=conn)

            if retain_last_n is not None and retain_last_n > 0:
                threshold = next_rev - int(retain_last_n)
                if threshold > 0:
                    qs = EntryRevisionRecord.filter(entry_id=entry.id, rev__lte=threshold).using_db(conn)
                    published_rev = int(entry.published_rev or 0)
                    if published_rev:
                        qs = qs.exclude(rev=published_rev)
                    await qs.delete()

        return UUID(str(entry.id)), next_rev, now_ms

    async def publish_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        revision: int | None,
    ) -> tuple[UUID, int, int]:
        """
        Publish an entry revision by (entry_type_id, slug).

        Returns: (entry_id, published_revision, published_at_ms).
        """

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

            target_rev = int(revision) if revision is not None else int(entry.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await EntryRevisionRecord.filter(entry_id=entry.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            entry.published_rev = target_rev
            await entry.save(update_fields=["published_rev"], using_db=conn)

        return UUID(str(entry.id)), target_rev, now_ms

    async def resolve_entry_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        mode: Literal["public", "preview"],
    ) -> ResolvedEntryDocument | None:
        entry = await EntryRecord.get_or_none(site_id=site_id, entry_type_id=entry_type_id, slug=slug)
        if entry is None:
            return None

        draft_rev = int(entry.draft_rev or 0)
        published_rev = int(entry.published_rev or 0)

        revision = published_rev if mode == "public" else (draft_rev or published_rev)
        if revision <= 0:
            return None

        revision_state: Literal["draft", "published"]
        if mode == "public":
            revision_state = "published"
        else:
            revision_state = "draft" if draft_rev else "published"

        rec = await EntryRevisionRecord.get_or_none(entry_id=entry.id, rev=revision)
        if rec is None:
            return None

        data: dict | None = rec.data if isinstance(rec.data, dict) else None

        doc: PageBlueprint | None = None
        if rec.design_document is not None:
            try:
                doc = PageBlueprint.model_validate(rec.design_document)
            except Exception:
                doc = None

        if doc is None:
            return None

        return ResolvedEntryDocument(
            entry_id=UUID(str(entry.id)),
            data=data,
            draft_rev=draft_rev,
            published_rev=published_rev,
            revision=revision,
            revision_state=revision_state,
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            page_blueprint=doc,
        )
