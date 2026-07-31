from __future__ import annotations

from typing import cast

from tortoise.expressions import Q

from src.core.http.pagination import PageParams, paginate_items, paginate_queryset
from src.core.services import BaseService
from src.models.content._enums import PublishJobStatus
from src.models.content.publish_job import PublishJobRecord
from src.models.domains.domain_binding import DomainBindingRecord
from src.models.hosting.commercial_access import HostingCommercialAccessProjection
from src.models.storage.storage_profile import StorageProfile
from src.modules.platform_site_delivery.schema import (
    PlatformDeliveryDomainOut,
    PlatformDeliveryDomainPage,
    PlatformDeliveryIssueListQuery,
    PlatformDeliveryIssueOut,
    PlatformDeliveryIssuePage,
    PlatformDeliveryRuleOut,
    PlatformDeliveryRulePage,
    PlatformDeliveryStorageOut,
    PlatformDeliveryStoragePage,
)


class PlatformSiteDeliveryService(BaseService):
    """Expose delivery facts without making Product publication decisions."""

    async def list_issues(
        self,
        *,
        params: PageParams,
        query: PlatformDeliveryIssueListQuery,
    ) -> PlatformDeliveryIssuePage:
        publish_jobs = PublishJobRecord.filter(status=PublishJobStatus.FAILED).order_by("-updated_at", "-id")
        if query.kind in (None, "publish_job"):
            jobs = await publish_jobs
        else:
            jobs = []
        issues = [
            PlatformDeliveryIssueOut(
                id=job.id,
                kind="publish_job",
                workspace_id=job.workspace_id,
                project_id=job.project_id,
                site_id=job.site_id,
                state="failed",
                visitor_effect="site_unavailable",
                summary_key="siteDelivery:PUBLISH_FAILED",
                retryable=True,
                occurred_at=job.updated_at,
                correlation_id=None,
            )
            for job in jobs
        ]
        return cast(PlatformDeliveryIssuePage, paginate_items(issues, params=params))

    async def list_domains(self, *, params: PageParams) -> PlatformDeliveryDomainPage:
        query = DomainBindingRecord.filter(is_active=True).filter(Q(is_verified=False) | Q(certificate_status="error"))
        rows = await query.order_by("-updated_at", "-id")
        domains = [
            PlatformDeliveryDomainOut(
                id=row.id,
                workspace_id=row.workspace_id,
                project_id=row.project_id,
                site_id=row.site_id,
                hostname=row.hostname,
                source=str(row.source),
                is_verified=row.is_verified,
                is_active=row.is_active,
                certificate_status=str(row.certificate_status),
                readiness="certificate_error" if str(row.certificate_status) == "error" else "verification_required",
                updated_at=row.updated_at,
            )
            for row in rows
        ]
        return cast(PlatformDeliveryDomainPage, paginate_items(domains, params=params))

    async def list_storage(self, *, params: PageParams) -> PlatformDeliveryStoragePage:
        query = StorageProfile.all().order_by("-updated_at", "-id").filter(tombstoned_at=None)
        return await paginate_queryset(query, params=params, out_schema=PlatformDeliveryStorageOut)

    async def list_rules(self, *, params: PageParams) -> PlatformDeliveryRulePage:
        query = HostingCommercialAccessProjection.all().order_by("-updated_at", "-id")
        return await paginate_queryset(query, params=params, out_schema=PlatformDeliveryRuleOut)
