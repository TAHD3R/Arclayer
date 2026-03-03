from __future__ import annotations

import time
from typing import Protocol, cast
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import SitePageMutableFields
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.sites.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.src.modules.sites.design.schema import PageBlueprint
from apps.api.src.modules.sites.shared.service import normalize_path


class _RevisionDepsAssetsValidator(Protocol):
    async def _validate_revision_deps_assets(
        self,
        *,
        site_id: UUID,
        deps: dict | None,
        conn: object,
    ) -> None: ...


class PublishingPagesRepositoryMixin:
    async def save_page_draft_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        page_blueprint: PageBlueprint,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[int, int]:
        """
        Save a page draft by pathname (helper for editor mode).

        Returns: (revision, saved_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                page = await SitePageRecord.create(
                    site_id=site_id,
                    title=None,
                    description=None,
                    path=pathname,
                    parent_id=None,
                    sort_order=0,
                    visibility=SitePageVisibility.PUBLIC,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
                    updated_by_user_id=created_by_user_id,
                    using_db=conn,
                )

            current_rev = int(page.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await SitePageRevisionRecord.create(
                page_id=page.id,
                rev=next_rev,
                document=None,
                design_document=page_blueprint.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.draft_rev = next_rev
            update_fields = ["draft_rev"]
            if created_by_user_id is not None:
                mutable_page.updated_by_user_id = created_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)

            if retain_last_n is not None and retain_last_n > 0:
                threshold = next_rev - int(retain_last_n)
                if threshold > 0:
                    qs = SitePageRevisionRecord.filter(page_id=page.id, rev__lte=threshold).using_db(conn)
                    published_rev = int(page.published_rev or 0)
                    if published_rev:
                        qs = qs.exclude(rev=published_rev)
                    await qs.delete()

        return next_rev, now_ms

    async def save_page_draft_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        page_blueprint: PageBlueprint,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
        retain_last_n: int | None = None,
    ) -> tuple[str, int, int]:
        """
        Save a page draft by page id.

        Returns: (path, revision, saved_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            current_rev = int(page.draft_rev or 0)
            if expected_revision is not None and expected_revision != current_rev:
                raise Conflict(
                    "Draft revision mismatch",
                    error="DRAFT_REVISION_MISMATCH",
                    meta={"expectedRevision": expected_revision, "currentRevision": current_rev},
                )

            next_rev = current_rev + 1 if current_rev else 1
            await SitePageRevisionRecord.create(
                page_id=page.id,
                rev=next_rev,
                document=None,
                design_document=page_blueprint.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.draft_rev = next_rev
            update_fields = ["draft_rev"]
            if created_by_user_id is not None:
                mutable_page.updated_by_user_id = created_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)

            if retain_last_n is not None and retain_last_n > 0:
                threshold = next_rev - int(retain_last_n)
                if threshold > 0:
                    qs = SitePageRevisionRecord.filter(page_id=page.id, rev__lte=threshold).using_db(conn)
                    published_rev = int(page.published_rev or 0)
                    if published_rev:
                        qs = qs.exclude(rev=published_rev)
                    await qs.delete()

        return normalize_path(str(page.path)), next_rev, now_ms

    async def publish_page_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        revision: int | None,
        updated_by_user_id: UUID | None,
    ) -> tuple[int, int]:
        """
        Publish a page revision by pathname.

        Returns: (published_revision, published_at_ms).
        """

        pathname = normalize_path(path)
        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = (
                await SitePageRecord.filter(site_id=site_id, path=pathname).using_db(conn).select_for_update().first()
            )
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(page.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await cast(_RevisionDepsAssetsValidator, self)._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.published_rev = target_rev
            update_fields = ["published_rev"]
            if updated_by_user_id is not None:
                mutable_page.updated_by_user_id = updated_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)

        return target_rev, now_ms

    async def publish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        revision: int | None,
        updated_by_user_id: UUID | None,
    ) -> tuple[str, int, int]:
        """
        Publish a page revision by page id.

        Returns: (path, published_revision, published_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            target_rev = int(revision) if revision is not None else int(page.draft_rev or 0)
            if not target_rev:
                raise Conflict("No draft revision to publish", error="NO_DRAFT_TO_PUBLISH")

            rec = await SitePageRevisionRecord.filter(page_id=page.id, rev=target_rev).using_db(conn).first()
            if rec is None:
                raise NotFound("Revision not found", error="REVISION_NOT_FOUND")

            await cast(_RevisionDepsAssetsValidator, self)._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.published_rev = target_rev
            update_fields = ["published_rev"]
            if updated_by_user_id is not None:
                mutable_page.updated_by_user_id = updated_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)

        return normalize_path(str(page.path)), target_rev, now_ms

    async def unpublish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        updated_by_user_id: UUID | None,
    ) -> tuple[str, int]:
        """
        Unpublish a page (published -> draft-only).

        Returns: (path, unpublished_at_ms).
        """

        now_ms = int(time.time() * 1000)

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(site_id=site_id, id=page_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            # Idempotent: if already unpublished, keep it as is.
            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.published_rev = None
            update_fields = ["published_rev"]
            if updated_by_user_id is not None:
                mutable_page.updated_by_user_id = updated_by_user_id
                update_fields.append("updated_by_user_id")
            await page.save(update_fields=update_fields, using_db=conn)

        return normalize_path(str(page.path)), now_ms
