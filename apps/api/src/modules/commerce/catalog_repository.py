"""Tortoise persistence for mutable catalog drafts and immutable published revisions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    CommercePlanRevisionPrice,
    CommercePlanRevisionResourceAllowance,
    CommerceResourceDefinition,
    PlanRevisionStatus,
)
from src.modules.commerce.catalog_schema import PlanRevisionTermsInput


class CommerceCatalogRepository(TortoiseORMRepository[CommercePlan]):
    """Persists catalog identities and revision terms without Subscription authority."""

    def __init__(self) -> None:
        super().__init__(CommercePlan)

    async def get_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None:
        return await CommercePlan.filter(code=code).using_db(conn).first()

    async def lock_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan | None:
        return await CommercePlan.filter(id=plan_id).using_db(conn).select_for_update().first()

    async def create_plan(self, *, code: str, sort_order: int, conn: BaseDBAsyncClient) -> CommercePlan:
        return await CommercePlan.create(code=code, sort_order=sort_order, using_db=conn)

    async def next_revision_sequence(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> int:
        latest = await CommercePlanRevision.filter(plan_id=plan_id).using_db(conn).order_by("-sequence").first()
        return 1 if latest is None else latest.sequence + 1

    async def create_draft(
        self,
        *,
        plan_id: UUID,
        sequence: int,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision:
        draft = await CommercePlanRevision.create(
            plan_id=plan_id,
            sequence=sequence,
            status=PlanRevisionStatus.DRAFT,
            is_selling=False,
            content_hash=None,
            published_at=None,
            using_db=conn,
            **_revision_fields(terms),
        )
        await self.replace_draft_terms(
            draft=draft,
            terms=terms,
            resources=resources,
            entitlements=entitlements,
            conn=conn,
        )
        return draft

    async def lock_draft(
        self, *, revision_id: UUID, plan_id: UUID, conn: BaseDBAsyncClient
    ) -> CommercePlanRevision | None:
        return await (
            CommercePlanRevision.filter(id=revision_id, plan_id=plan_id).using_db(conn).select_for_update().first()
        )

    async def replace_draft_terms(
        self,
        *,
        draft: CommercePlanRevision,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> None:
        for field, value in _revision_fields(terms).items():
            setattr(draft, field, value)
        await draft.save(update_fields=list(_revision_fields(terms)), using_db=conn)
        await CommercePlanRevisionPrice.filter(plan_revision_id=draft.id).using_db(conn).delete()
        await CommercePlanRevisionResourceAllowance.filter(plan_revision_id=draft.id).using_db(conn).delete()
        await CommercePlanRevisionEntitlement.filter(plan_revision_id=draft.id).using_db(conn).delete()
        await CommercePlanRevisionPrice.bulk_create(
            [
                CommercePlanRevisionPrice(
                    plan_revision_id=draft.id,
                    provider=price.provider,
                    provider_mode=price.provider_mode,
                    billing_cycle=price.billing_cycle,
                    currency=price.currency,
                    amount_micros=price.amount_micros,
                    external_price_id=price.external_price_id,
                )
                for price in terms.prices
            ],
            using_db=conn,
        )
        await CommercePlanRevisionResourceAllowance.bulk_create(
            [
                CommercePlanRevisionResourceAllowance(
                    plan_revision_id=draft.id,
                    resource_id=resources[allowance.key].id,
                    limit_kind=allowance.limit_kind,
                    limit_value=allowance.limit_value,
                )
                for allowance in terms.resource_allowances
            ],
            using_db=conn,
        )
        await CommercePlanRevisionEntitlement.bulk_create(
            [
                CommercePlanRevisionEntitlement(
                    plan_revision_id=draft.id,
                    entitlement_id=entitlements[entitlement.key].id,
                    is_included=entitlement.is_included,
                    allocation_mode=entitlement.allocation_mode,
                    seat_limit_kind=entitlement.seat_limit_kind,
                    seat_limit_value=entitlement.seat_limit_value,
                )
                for entitlement in terms.entitlements
            ],
            using_db=conn,
        )

    async def load_terms(self, *, revision_id: UUID, conn: BaseDBAsyncClient) -> PlanRevisionTermsInput:
        revision = await CommercePlanRevision.get(id=revision_id, using_db=conn)
        prices = await CommercePlanRevisionPrice.filter(plan_revision_id=revision_id).using_db(conn).all()
        allowances = await (
            CommercePlanRevisionResourceAllowance
            .filter(plan_revision_id=revision_id)
            .using_db(conn)
            .select_related("resource")
            .all()
        )
        entitlements = await (
            CommercePlanRevisionEntitlement
            .filter(plan_revision_id=revision_id)
            .using_db(conn)
            .select_related("entitlement")
            .all()
        )
        return PlanRevisionTermsInput(
            name_i18n_key=revision.name_i18n_key,
            description_i18n_key=revision.description_i18n_key,
            credit_grant_amount=revision.credit_grant_amount,
            credit_refresh_interval=revision.credit_refresh_interval,
            credit_value_micros=revision.credit_value_micros,
            currency=revision.currency,
            prices=tuple(
                {
                    "provider": price.provider,
                    "provider_mode": price.provider_mode,
                    "billing_cycle": price.billing_cycle,
                    "currency": price.currency,
                    "amount_micros": price.amount_micros,
                    "external_price_id": price.external_price_id,
                }
                for price in prices
            ),
            resource_allowances=tuple(
                {
                    "key": allowance.resource.key,
                    "limit_kind": allowance.limit_kind,
                    "limit_value": allowance.limit_value,
                }
                for allowance in allowances
            ),
            entitlements=tuple(
                {
                    "key": entitlement.entitlement.key,
                    "is_included": entitlement.is_included,
                    "allocation_mode": entitlement.allocation_mode,
                    "seat_limit_kind": entitlement.seat_limit_kind,
                    "seat_limit_value": entitlement.seat_limit_value,
                }
                for entitlement in entitlements
            ),
        )

    async def list_entitlement_definitions(self, *, conn: BaseDBAsyncClient) -> list[CommerceEntitlementDefinition]:
        return await CommerceEntitlementDefinition.all().using_db(conn).order_by("key")

    async def get_resource_definitions(
        self, *, keys: Sequence[str], conn: BaseDBAsyncClient
    ) -> list[CommerceResourceDefinition]:
        if not keys:
            return []
        return await CommerceResourceDefinition.filter(key__in=keys).using_db(conn).all()

    async def has_published_external_price_collision(
        self, *, revision_id: UUID, terms: PlanRevisionTermsInput, conn: BaseDBAsyncClient
    ) -> bool:
        for price in terms.prices:
            exists = await (
                CommercePlanRevisionPrice
                .filter(
                    provider=price.provider,
                    provider_mode=price.provider_mode,
                    external_price_id=price.external_price_id,
                    plan_revision__status=PlanRevisionStatus.PUBLISHED,
                )
                .exclude(plan_revision_id=revision_id)
                .using_db(conn)
                .exists()
            )
            if exists:
                return True
        return False

    async def publish_draft(
        self,
        *,
        plan: CommercePlan,
        draft: CommercePlanRevision,
        content_hash: str,
        published_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision:
        await (
            CommercePlanRevision
            .filter(
                plan_id=plan.id,
                status=PlanRevisionStatus.PUBLISHED,
                is_selling=True,
            )
            .using_db(conn)
            .update(is_selling=False)
        )
        draft.status = PlanRevisionStatus.PUBLISHED
        draft.is_selling = True
        draft.content_hash = content_hash
        draft.published_at = published_at
        await draft.save(
            update_fields=["status", "is_selling", "content_hash", "published_at"],
            using_db=conn,
        )
        return draft

    async def set_plan_active(self, *, plan: CommercePlan, is_active: bool, conn: BaseDBAsyncClient) -> CommercePlan:
        plan.is_active = is_active
        await plan.save(update_fields=["is_active"], using_db=conn)
        return plan

    async def list_plans_with_revisions(self, *, include_inactive: bool) -> list[CommercePlan]:
        query = CommercePlan.all().prefetch_related("revisions")
        if not include_inactive:
            query = query.filter(is_active=True)
        return await query.order_by("sort_order", "code")

    async def get_plan_with_revisions(self, *, code: str, include_inactive: bool) -> CommercePlan | None:
        query = CommercePlan.filter(code=code).prefetch_related("revisions")
        if not include_inactive:
            query = query.filter(is_active=True)
        return await query.first()


def _revision_fields(terms: PlanRevisionTermsInput) -> dict[str, object]:
    return {
        "name_i18n_key": terms.name_i18n_key,
        "description_i18n_key": terms.description_i18n_key,
        "credit_grant_amount": terms.credit_grant_amount,
        "credit_refresh_interval": terms.credit_refresh_interval,
        "credit_value_micros": terms.credit_value_micros,
        "currency": terms.currency,
    }
