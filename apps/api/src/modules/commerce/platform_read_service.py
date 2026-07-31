from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, cast

from src.core.services import BaseService
from src.models.commerce.billing import CommercePlanRevision
from src.modules.commerce.catalog_repository import CommerceCatalogRepository
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommercePlanOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
    PlatformCommerceSubscriptionOut,
    PlatformCommerceSubscriptionQuery,
)
from src.modules.commerce.repository import CommerceRepository


class _PlanWithRevisions(Protocol):
    revisions: Sequence[CommercePlanRevision]


class PlatformCommerceReadService(BaseService):
    def __init__(self, *, catalog: CommerceCatalogRepository, commerce: CommerceRepository) -> None:
        super().__init__()
        self._catalog = catalog
        self._commerce = commerce

    async def list_plan_catalog(self, *, include_inactive: bool) -> PlatformCommercePlanCatalogOut:
        plans = await self._catalog.list_plans_with_revisions(include_inactive=include_inactive)
        return PlatformCommercePlanCatalogOut(
            items=tuple(
                PlatformCommercePlanOut(
                    id=plan.id,
                    code=plan.code,
                    is_active=plan.is_active,
                    sort_order=plan.sort_order,
                    revisions=tuple(
                        PlatformCommerceRevisionSummaryOut(
                            id=revision.id,
                            sequence=revision.sequence,
                            status=revision.status,
                            is_selling=revision.is_selling,
                            name_i18n_key=revision.name_i18n_key,
                            description_i18n_key=revision.description_i18n_key,
                            published_at=revision.published_at,
                        )
                        for revision in sorted(cast(_PlanWithRevisions, plan).revisions, key=lambda item: item.sequence)
                    ),
                )
                for plan in plans
            )
        )

    async def list_plan_revisions(
        self, *, code: str, include_inactive: bool
    ) -> tuple[PlatformCommerceRevisionSummaryOut, ...]:
        plan = await self._catalog.get_plan_with_revisions(code=code, include_inactive=include_inactive)
        if plan is None:
            return ()
        return tuple(
            PlatformCommerceRevisionSummaryOut(
                id=revision.id,
                sequence=revision.sequence,
                status=revision.status,
                is_selling=revision.is_selling,
                name_i18n_key=revision.name_i18n_key,
                description_i18n_key=revision.description_i18n_key,
                published_at=revision.published_at,
            )
            for revision in sorted(cast(_PlanWithRevisions, plan).revisions, key=lambda item: item.sequence)
        )

    async def list_subscriptions(
        self, *, query: PlatformCommerceSubscriptionQuery
    ) -> PlatformCommerceSubscriptionListOut:
        rows, total = await self._commerce.list_platform_subscriptions(query=query)
        return PlatformCommerceSubscriptionListOut(
            total=total,
            items=tuple(
                PlatformCommerceSubscriptionOut(
                    workspace_id=row.workspace_id,
                    subscription_id=row.id,
                    plan_revision_id=row.plan_revision_id,
                    plan_code=row.plan_revision.plan.code,
                    plan_revision=row.revision,
                    status=row.status,
                    billing_cycle=row.billing_cycle,
                    current_period_start=row.current_period_start,
                    current_period_end=row.current_period_end,
                    cancel_at_period_end=row.cancel_at_period_end,
                    billing_provider=row.billing_provider,
                )
                for row in rows
            ),
        )


def build_platform_commerce_read_service() -> PlatformCommerceReadService:
    return PlatformCommerceReadService(catalog=CommerceCatalogRepository(), commerce=CommerceRepository())
