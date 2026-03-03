from __future__ import annotations

"""
Pages repository.

Page persistence is implemented on the root sites repository.
"""

from typing import cast
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.common.protocols.tortoise import SitePageMutableFields
from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.sites.site_page import SitePageRecord, SitePageRevisionRecord, SitePageVisibility
from apps.api.src.modules.sites.shared.service import normalize_path


class PagesRepositoryMixin:
    async def get_page_by_id(self, *, site_id: UUID, page_id: UUID) -> SitePageRecord | None:
        return await SitePageRecord.get_or_none(id=page_id, site_id=site_id)

    async def get_page_by_path(self, *, site_id: UUID, path: str) -> SitePageRecord | None:
        pathname = normalize_path(path)
        return await SitePageRecord.get_or_none(site_id=site_id, path=pathname)

    async def list_pages_by_site(self, *, site_id: UUID) -> list[SitePageRecord]:
        # Keep ordering deterministic so tree building stays stable.
        return await SitePageRecord.filter(site_id=site_id).order_by("sort_order", "path").all()

    async def create_page(
        self,
        *,
        site_id: UUID,
        title: str | None,
        description: str | None,
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
        created_by_user_id: UUID | None,
        updated_by_user_id: UUID | None,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except ValueError:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        try:
            return await SitePageRecord.create(
                site_id=site_id,
                title=(title.strip() if isinstance(title, str) and title.strip() else None),
                description=(description.strip() if isinstance(description, str) and description.strip() else None),
                path=pathname,
                parent_id=parent_id,
                sort_order=int(sort_order or 0),
                visibility=vis,
                draft_rev=0,
                published_rev=None,
                created_by_user_id=created_by_user_id,
                updated_by_user_id=updated_by_user_id,
            )
        except IntegrityError:
            raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT") from None

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        title: str | None,
        description: str | None,
        path: str,
        parent_id: UUID | None,
        sort_order: int,
        visibility: str,
        updated_by_user_id: UUID | None,
    ) -> SitePageRecord:
        pathname = normalize_path(path)
        if not pathname.startswith("/"):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

        try:
            vis = SitePageVisibility(visibility)
        except ValueError:
            raise Conflict("Invalid visibility", error="PAGE_VISIBILITY_INVALID") from None

        async with in_transaction() as conn:
            page = await SitePageRecord.filter(id=page_id, site_id=site_id).using_db(conn).select_for_update().first()
            if page is None:
                raise NotFound("Page not found", error="PAGE_NOT_FOUND")

            page.path = pathname
            mutable_page = cast(SitePageMutableFields, page)
            mutable_page.title = title.strip() if isinstance(title, str) and title.strip() else None
            mutable_page.description = (
                description.strip() if isinstance(description, str) and description.strip() else None
            )
            page.parent_id = parent_id
            page.sort_order = int(sort_order or 0)
            page.visibility = vis
            mutable_page.updated_by_user_id = updated_by_user_id

            try:
                await page.save(
                    update_fields=[
                        "title",
                        "description",
                        "path",
                        "parent_id",
                        "sort_order",
                        "visibility",
                        "updated_by_user_id",
                    ],
                    using_db=conn,
                )
            except IntegrityError:
                raise Conflict("Page path already exists", error="PAGE_PATH_CONFLICT") from None

        return page

    async def page_has_children(self, *, site_id: UUID, page_id: UUID) -> bool:
        return await SitePageRecord.filter(site_id=site_id, parent_id=page_id).exists()

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> None:
        deleted = await SitePageRecord.filter(site_id=site_id, id=page_id).delete()
        if not deleted:
            raise NotFound("Page not found", error="PAGE_NOT_FOUND")

    async def get_page_revision(self, *, page_id: UUID, rev: int) -> SitePageRevisionRecord | None:
        return await SitePageRevisionRecord.get_or_none(page_id=page_id, rev=rev)

    async def get_page_revision_by_id(self, *, site_id: UUID, revision_id: UUID) -> SitePageRevisionRecord | None:
        # Ensure the revision belongs to the given site via page relationship.
        return (
            await SitePageRevisionRecord.filter(id=revision_id, page__site_id=site_id).prefetch_related("page").first()
        )
