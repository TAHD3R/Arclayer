from __future__ import annotations

"""
Runtime repository.

Runtime payload is derived from settings and other stored entities.
"""

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.models.projects.environment import ProjectEnvironmentKey
from src.models.sites.site import SiteRecord
from src.modules.projects.deployments.service import ProjectDeploymentsService
from src.modules.sites.shared.service import normalize_path


class RuntimeRepositoryMixin:
    _conn: BaseDBAsyncClient | None

    def __init__(self, conn: BaseDBAsyncClient | None = None) -> None:
        self._conn = conn
        self._deployments = ProjectDeploymentsService(conn=conn)

    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    async def get_site_by_id(self, *, site_id: UUID) -> SiteRecord:
        site = await self._using_db(SiteRecord.filter(id=site_id), self._conn).first()
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

    async def get_site_by_runtime_id(self, *, runtime_id: UUID) -> SiteRecord:
        site = await self._using_db(SiteRecord.filter(runtime_id=runtime_id), self._conn).first()
        if site is None:
            raise NotFound("Site not found", error="SITE_NOT_FOUND")
        return site

    async def get_content_entry_by_id(self, *, site_id: UUID, entry_id: UUID) -> ContentItemRecord | None:
        return (
            await self
            ._using_db(ContentItemRecord.filter(id=entry_id, site_id=site_id), self._conn)
            .prefetch_related("model_definition", "model_definition__fields")
            .first()
        )

    async def get_content_page_entry_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
    ) -> ContentItemRecord | None:
        pathname = normalize_path(path)
        route = (
            await self
            ._using_db(RouteBindingRecord.filter(site_id=site_id, path=pathname, is_active=True), self._conn)
            .order_by("created_at", "id")
            .first()
        )
        if route is None:
            return None
        return await (
            self
            ._using_db(ContentItemRecord.filter(id=UUID(str(route.item_id)), site_id=site_id), self._conn)
            .prefetch_related("model_definition")
            .first()
        )

    async def get_content_route_binding_by_item_id(
        self,
        *,
        site_id: UUID,
        item_id: UUID,
    ) -> RouteBindingRecord | None:
        return (
            await self
            ._using_db(
                RouteBindingRecord.filter(site_id=site_id, item_id=item_id, is_active=True),
                self._conn,
            )
            .order_by("created_at", "id")
            .first()
        )

    async def list_content_route_bindings(
        self,
        *,
        site_id: UUID,
        environment_id: UUID | None = None,
    ) -> list[RouteBindingRecord]:
        qs = RouteBindingRecord.filter(site_id=site_id, is_active=True)
        if environment_id is not None:
            qs = qs.filter(item__environment_id=environment_id)
        return list(await self._using_db(qs, self._conn).prefetch_related("item__model_definition").all())

    async def list_content_entries_by_model_key(
        self,
        *,
        site_id: UUID,
        model_key: str,
        environment_id: UUID | None = None,
    ) -> list[ContentItemRecord]:
        qs = ContentItemRecord.filter(site_id=site_id, model_definition__singular_key=model_key)
        if environment_id is not None:
            qs = qs.filter(environment_id=environment_id, model_definition__environment_id=environment_id)
        return list(
            await self._using_db(qs, self._conn).prefetch_related("model_definition", "model_definition__fields").all()
        )

    async def get_active_release(
        self,
        *,
        site_id: UUID,
        environment_id: UUID | None = None,
    ) -> ContentReleaseRecord | None:
        if environment_id is not None:
            deployment_release_id = await self._deployments.get_release_id_for_environment(
                site_id=site_id,
                environment_id=environment_id,
            )
        else:
            deployment_release_id = await self._deployments.get_environment_release_id(
                site_id=site_id,
                environment_key=ProjectEnvironmentKey.PRODUCTION,
            )
        if deployment_release_id is not None:
            return await self._using_db(
                ContentReleaseRecord.filter(id=deployment_release_id, site_id=site_id),
                self._conn,
            ).first()
        return None

    async def list_active_release_route_nodes(
        self,
        *,
        site_id: UUID,
        environment_id: UUID | None = None,
    ) -> list[PublishedGraphRecord]:
        active_release = await self.get_active_release(site_id=site_id, environment_id=environment_id)
        if active_release is None:
            return []
        return list(
            await self
            ._using_db(
                PublishedGraphRecord.filter(
                    release_id=active_release.id,
                    site_id=site_id,
                    route_contract__not_isnull=True,
                ),
                self._conn,
            )
            .prefetch_related("item__model_definition", "item__model_definition__fields", "version")
            .all()
        )

    async def get_active_release_node_by_item_id(
        self,
        *,
        site_id: UUID,
        item_id: UUID,
        environment_id: UUID | None = None,
    ) -> PublishedGraphRecord | None:
        active_release = await self.get_active_release(site_id=site_id, environment_id=environment_id)
        if active_release is None:
            return None
        return (
            await self
            ._using_db(
                PublishedGraphRecord.filter(
                    release_id=active_release.id,
                    site_id=site_id,
                    item_id=item_id,
                    route_contract__not_isnull=True,
                ),
                self._conn,
            )
            .prefetch_related("item__model_definition", "version")
            .first()
        )

    async def get_release_node_by_item_id(
        self,
        *,
        site_id: UUID,
        release_id: UUID,
        item_id: UUID,
    ) -> PublishedGraphRecord | None:
        return (
            await self
            ._using_db(
                PublishedGraphRecord.filter(release_id=release_id, site_id=site_id, item_id=item_id),
                self._conn,
            )
            .prefetch_related("item__model_definition", "version")
            .first()
        )

    async def list_active_release_nodes_by_model_key(
        self,
        *,
        site_id: UUID,
        model_key: str,
        environment_id: UUID | None = None,
    ) -> list[PublishedGraphRecord]:
        active_release = await self.get_active_release(site_id=site_id, environment_id=environment_id)
        if active_release is None:
            return []
        qs = PublishedGraphRecord.filter(
            release_id=active_release.id,
            site_id=site_id,
            item__model_definition__singular_key=model_key,
        )
        if environment_id is not None:
            qs = qs.filter(item__environment_id=environment_id, item__model_definition__environment_id=environment_id)
        return list(
            await self
            ._using_db(qs, self._conn)
            .prefetch_related("item__model_definition", "item__model_definition__fields", "version")
            .all()
        )

    async def get_content_revision_by_number(self, *, entry_id: UUID, revision: int) -> ContentVersionRecord | None:
        return await self._using_db(
            ContentVersionRecord.filter(item_id=entry_id, version=int(revision)),
            self._conn,
        ).first()

    async def list_content_presentations(self, *, version_id: UUID) -> list[PresentationDocumentRecord]:
        return list(
            await self
            ._using_db(PresentationDocumentRecord.filter(version_id=version_id), self._conn)
            .order_by("kind", "id")
            .all()
        )

    async def get_content_seo_profile(self, *, version_id: UUID) -> SEOProfileRecord | None:
        return await self._using_db(SEOProfileRecord.filter(version_id=version_id), self._conn).first()
