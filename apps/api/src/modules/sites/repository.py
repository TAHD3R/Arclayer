from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.domains.domain_binding import DomainBindingRecord
from src.models.sites.site import SiteRecord
from src.modules.sites.routing.repository import SiteRoutingRepository
from src.modules.sites.runtime.repository import RuntimeRepositoryMixin
from src.modules.sites.settings.repository import SettingsRepositoryMixin


class SitesRepository(
    RuntimeRepositoryMixin,
    SettingsRepositoryMixin,
    TortoiseORMRepository,
):
    def __init__(self, conn: BaseDBAsyncClient | None = None) -> None:
        super().__init__(conn=conn)
        self._conn = conn
        self._routing_repo = SiteRoutingRepository(conn=conn)

    async def list_public_sitemap_paths(self, *, site_id):
        return await self._routing_repo.list_public_sitemap_paths(site_id=site_id)

    async def list_hosting_delivery_sites(self, *, workspace_id: UUID) -> list[SiteRecord]:
        return list(
            await SiteRecord
            .filter(
                workspace_id=workspace_id,
                is_active=True,
                workspace__is_active=True,
                project_id__not_isnull=True,
                project__is_active=True,
                runtime_id__not_isnull=True,
                runtime__is_active=True,
            )
            .order_by("created_at", "id")
            .all()
        )

    async def get_hosting_delivery_site(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        runtime_id: UUID,
    ) -> SiteRecord | None:
        return await SiteRecord.filter(
            id=site_id,
            runtime_id=runtime_id,
            workspace_id=workspace_id,
            is_active=True,
            workspace__is_active=True,
            project_id__not_isnull=True,
            project__is_active=True,
            runtime__is_active=True,
        ).first()

    async def list_hosting_delivery_hostnames_for_site(self, *, site_id: UUID) -> tuple[str, ...]:
        hostnames = (
            await DomainBindingRecord
            .filter(
                site_id=site_id,
                is_active=True,
                is_verified=True,
            )
            .order_by("hostname")
            .values_list("hostname", flat=True)
        )
        return tuple(str(hostname) for hostname in hostnames)
