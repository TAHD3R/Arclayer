from __future__ import annotations

import time
from typing import Literal, cast
from uuid import UUID

from tortoise.transactions import in_transaction

from apps.api.common.protocols.tortoise import (
    EntryRecordMutableFields,
    HasWorkspaceId,
)
from apps.api.common.repositories.base import BaseRepository
from apps.api.common.utils.public_ids import decode_public_id, encode_uuid, is_public_id
from apps.api.core.exceptions import Conflict, NotFound
from apps.api.modules.assets.models.asset import AssetRecord
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.sites.models.site_entry import EntryRecord, EntryRevisionRecord
from apps.api.modules.sites.models.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.modules.sites.models.site_route_template import RouteTemplateRecord
from apps.api.modules.sites.repository_routing import SiteRoutingRepository
from apps.api.modules.sites.schema import DocumentIR
from apps.api.modules.sites.types import ResolvedEntryDocument, RouteTemplateMatch
from apps.api.modules.sites.utils import normalize_path


class SitePublishingRepository(BaseRepository):
    def __init__(self) -> None:
        super().__init__()
        self._routing_repo = SiteRoutingRepository()

    async def _list_missing_assets(
        self,
        *,
        workspace_id: UUID,
        asset_ids: list[UUID],
        conn,
    ) -> list[str]:
        """
        Best-effort deps validator for v0 (assets only).

        Returns missing asset id strings (UUID).
        """

        if not asset_ids:
            return []

        rows = (
            await AssetRecord
            .filter(
                id__in=asset_ids,
                workspace_id=workspace_id,
                deleted_at=None,
            )
            .using_db(conn)
            .values_list("id", flat=True)
        )
        existing = {UUID(str(x)) for x in rows}
        missing = [encode_uuid(aid) for aid in asset_ids if aid not in existing]
        return missing

    async def _validate_revision_deps_assets(
        self,
        *,
        site_id: UUID,
        deps: dict | None,
        conn,
    ) -> None:
        """
        Validate revision deps before publishing/rollback (v0: assets only).

        Contract:
        - deps.assetIds: list[str] of AssetRecord ids.
        """

        if not deps or not isinstance(deps, dict):
            return
        asset_ids_raw = deps.get("assetIds")
        if not isinstance(asset_ids_raw, list) or not asset_ids_raw:
            return

        parsed: list[UUID] = []
        invalid: list[str] = []
        for x in asset_ids_raw:
            if not isinstance(x, str) or not x.strip():
                invalid.append(str(x))
                continue
            raw = x.strip()
            if is_public_id(raw):
                try:
                    parsed.append(decode_public_id(raw))
                except Exception:
                    invalid.append(raw)
                continue

            # Optional compatibility: allow raw UUID strings in dev/test (configurable).
            from apps.api.config import get_settings

            if not get_settings().public_id.accept_raw_uuid_input:
                invalid.append(raw)
                continue

            try:
                parsed.append(UUID(raw))
            except Exception:
                invalid.append(raw)

        if not parsed and not invalid:
            return

        site_qs = SiteRecord.filter(id=site_id)
        if conn is not None:
            site_qs = site_qs.using_db(conn)
        site = await site_qs.first()
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")

        missing = await self._list_missing_assets(
            workspace_id=UUID(str(cast(HasWorkspaceId, site).workspace_id)),
            asset_ids=parsed,
            conn=conn,
        )
        if invalid or missing:
            raise Conflict(
                "Revision deps validation failed",
                error="REVISION_DEPS_MISSING",
                meta={"missingAssets": [*invalid, *missing]},
            )

    async def rollback_page_revision_pointer(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        target: Literal["draft", "published"],
        revision: int,
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
                from_rev = int(page.draft_rev or 0) or None
                page.draft_rev = int(revision)
                await page.save(update_fields=["draft_rev"], using_db=conn)
                return from_rev, int(revision), now_ms

            from_rev = int(page.published_rev or 0) or None
            page.published_rev = int(revision)
            await page.save(update_fields=["published_rev"], using_db=conn)
            return from_rev, int(revision), now_ms

    async def get_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> EntryRecord | None:
        return await EntryRecord.get_or_none(id=entry_id, site_id=site_id)

    async def get_entry_revision(self, *, entry_id: UUID, rev: int) -> EntryRevisionRecord | None:
        return await EntryRevisionRecord.get_or_none(entry_id=entry_id, rev=rev)

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

    async def save_entry_draft_by_slug(
        self,
        *,
        site_id: UUID,
        entry_type_id: UUID,
        slug: str,
        document: DocumentIR | None,
        data: dict | None,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
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

            next_rev = current_rev + 1 if current_rev else 1
            await EntryRevisionRecord.create(
                entry_id=entry.id,
                rev=next_rev,
                data=data,
                document=(document.model_dump(by_alias=True) if document is not None else None),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            entry.draft_rev = next_rev
            await entry.save(update_fields=["draft_rev"], using_db=conn)

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

    async def save_page_draft_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        document: DocumentIR,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
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
                    path=pathname,
                    parent_id=None,
                    sort_order=0,
                    visibility=SitePageVisibility.PUBLIC,
                    draft_rev=0,
                    published_rev=None,
                    created_by_user_id=created_by_user_id,
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
                document=document.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            page.draft_rev = next_rev
            await page.save(update_fields=["draft_rev"], using_db=conn)

        return next_rev, now_ms

    async def save_page_draft_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        document: DocumentIR,
        meta: dict | None,
        style_overrides: dict | None,
        variant_id: str | None,
        deps: dict | None,
        expected_revision: int | None,
        created_by_user_id: UUID | None,
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
                document=document.model_dump(by_alias=True),
                meta=meta,
                style_overrides=style_overrides,
                variant_id=variant_id,
                deps=deps,
                created_by_user_id=created_by_user_id,
                using_db=conn,
            )
            page.draft_rev = next_rev
            await page.save(update_fields=["draft_rev"], using_db=conn)

        return normalize_path(str(page.path)), next_rev, now_ms

    async def publish_page_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        revision: int | None,
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

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            page.published_rev = target_rev
            await page.save(update_fields=["published_rev"], using_db=conn)

        return target_rev, now_ms

    async def publish_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        revision: int | None,
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

            await self._validate_revision_deps_assets(
                site_id=site_id,
                deps=(rec.deps if isinstance(rec.deps, dict) else None),
                conn=conn,
            )

            page.published_rev = target_rev
            await page.save(update_fields=["published_rev"], using_db=conn)

        return normalize_path(str(page.path)), target_rev, now_ms

    async def unpublish_page_by_id(self, *, site_id: UUID, page_id: UUID) -> tuple[str, int]:
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
            cast(EntryRecordMutableFields, page).published_rev = None
            await page.save(update_fields=["published_rev"], using_db=conn)

        return normalize_path(str(page.path)), now_ms

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
        if rec is None or rec.document is None:
            return None

        doc = DocumentIR.model_validate(rec.document)
        return ResolvedEntryDocument(
            entry_id=UUID(str(entry.id)),
            draft_rev=draft_rev,
            published_rev=published_rev,
            revision=revision,
            revision_state=revision_state,
            variant_id=(str(rec.variant_id) if rec.variant_id else None),
            document=doc,
        )


    async def list_route_templates(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._routing_repo.list_route_templates(site_id=site_id)

    async def list_route_templates_all(self, *, site_id: UUID) -> list[RouteTemplateRecord]:
        return await self._routing_repo.list_route_templates_all(site_id=site_id)

    async def get_route_template_by_id(self, *, site_id: UUID, template_id: UUID) -> RouteTemplateRecord | None:
        return await self._routing_repo.get_route_template_by_id(site_id=site_id, template_id=template_id)

    async def create_route_template(
        self,
        *,
        site_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        return await self._routing_repo.create_route_template(
            site_id=site_id,
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=template_page_revision_id,
            is_active=is_active,
        )

    async def update_route_template(
        self,
        *,
        site_id: UUID,
        template_id: UUID,
        path_pattern: str,
        entry_type_id: UUID,
        template_page_revision_id: UUID | None,
        is_active: bool,
    ) -> RouteTemplateRecord:
        return await self._routing_repo.update_route_template(
            site_id=site_id,
            template_id=template_id,
            path_pattern=path_pattern,
            entry_type_id=entry_type_id,
            template_page_revision_id=template_page_revision_id,
            is_active=is_active,
        )

    async def delete_route_template(self, *, site_id: UUID, template_id: UUID) -> None:
        await self._routing_repo.delete_route_template(site_id=site_id, template_id=template_id)

    def invalidate_route_template_cache(self, *, site_id: UUID) -> None:
        self._routing_repo.invalidate_route_template_cache(site_id=site_id)

    async def match_route_template(
        self,
        *,
        site_id: UUID,
        pathname: str,
        cache_version: int = 0,
    ) -> RouteTemplateMatch | None:
        return await self._routing_repo.match_route_template(
            site_id=site_id,
            pathname=pathname,
            cache_version=cache_version,
        )

    async def list_public_sitemap_paths(self, *, site_id: UUID) -> list[str]:
        return await self._routing_repo.list_public_sitemap_paths(site_id=site_id)

