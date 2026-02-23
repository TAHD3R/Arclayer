from __future__ import annotations

from uuid import UUID

from apps.api.core.http.pagination import PageData
from apps.api.modules.sites.schema import (
    SitePageCreateIn as ContentPageCreateIn,
)
from apps.api.modules.sites.schema import (
    SitePageDeleteOut as ContentPageDeleteOut,
)
from apps.api.modules.sites.schema import (
    SitePageDraftSaveIn as ContentPageDraftSaveIn,
)
from apps.api.modules.sites.schema import (
    SitePageDraftSaveOut as ContentPageDraftSaveOut,
)
from apps.api.modules.sites.schema import (
    SitePageMoveIn as ContentPageMoveIn,
)
from apps.api.modules.sites.schema import (
    SitePagePublishIn as ContentPagePublishIn,
)
from apps.api.modules.sites.schema import (
    SitePagePublishOut as ContentPagePublishOut,
)
from apps.api.modules.sites.schema import (
    SitePageRevisionOut as ContentPageRevisionOut,
)
from apps.api.modules.sites.schema import (
    SitePageRollbackIn as ContentPageRollbackIn,
)
from apps.api.modules.sites.schema import (
    SitePageRollbackOut as ContentPageRollbackOut,
)
from apps.api.modules.sites.schema import (
    SitePageTreeNodeOut as ContentPageTreeNodeOut,
)
from apps.api.modules.sites.schema import (
    SitePageUnpublishOut as ContentPageUnpublishOut,
)
from apps.api.modules.sites.schema import (
    SitePageUpdateIn as ContentPageUpdateIn,
)


class WorkspaceContentPagesMixin:
    async def list_pages_tree(self, *, site_id: UUID) -> PageData[ContentPageTreeNodeOut]:
        return await self.site_service.list_pages_tree(site_id=site_id)

    async def create_page(
        self,
        *,
        site_id: UUID,
        payload: ContentPageCreateIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        return await self.site_service.create_page(site_id=site_id, payload=payload, actor_user_id=actor_user_id)

    async def get_page(self, *, site_id: UUID, page_id: UUID) -> ContentPageTreeNodeOut:
        return await self.site_service.get_page(site_id=site_id, page_id=page_id)

    async def update_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageUpdateIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        return await self.site_service.update_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def move_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageMoveIn,
        actor_user_id: UUID | None,
    ) -> ContentPageTreeNodeOut:
        return await self.site_service.move_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def delete_page(self, *, site_id: UUID, page_id: UUID) -> ContentPageDeleteOut:
        return await self.site_service.delete_page(site_id=site_id, page_id=page_id)

    async def get_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        state: str,
    ) -> ContentPageRevisionOut:
        return await self.site_service.get_page_revision(site_id=site_id, page_id=page_id, state=state)

    async def save_page_draft(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageDraftSaveIn,
        actor_user_id: UUID | None,
    ) -> ContentPageDraftSaveOut:
        return await self.site_service.save_page_draft(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def publish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPagePublishIn,
        actor_user_id: UUID | None,
    ) -> ContentPagePublishOut:
        return await self.site_service.publish_page(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def unpublish_page(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentPageUnpublishOut:
        return await self.site_service.unpublish_page(site_id=site_id, page_id=page_id, actor_user_id=actor_user_id)

    async def rollback_page_revision(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        payload: ContentPageRollbackIn,
        actor_user_id: UUID | None,
    ) -> ContentPageRollbackOut:
        return await self.site_service.rollback_page_revision(
            site_id=site_id,
            page_id=page_id,
            payload=payload,
            actor_user_id=actor_user_id,
        )
