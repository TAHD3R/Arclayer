"""Tortoise persistence for mutable catalog drafts and immutable published revisions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommerceCatalogCommandAction,
    CommerceCatalogCommandReceipt,
    CommerceEntitlementDefinition,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    CommercePlanRevisionPrice,
    CommercePlanRevisionResourceAllowance,
    CommerceResourceDefinition,
    PlanRevisionStatus,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.catalog_schema import (
    PlanRevisionEntitlementInput,
    PlanRevisionPriceInput,
    PlanRevisionResourceAllowanceInput,
    PlanRevisionTermsInput,
)

_COMMAND_SCOPE_LOCK_NAMESPACE = "commerce-catalog-command"


class CommerceCatalogRepository(TortoiseORMRepository[CommercePlan]):
    """Persists catalog identities and revision terms without Subscription authority."""

    def __init__(self) -> None:
        super().__init__(CommercePlan)

    async def get_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None:
        return await CommercePlan.filter(code=code).using_db(conn).first()

    async def lock_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None:
        return await CommercePlan.filter(code=code).using_db(conn).select_for_update().first()

    async def lock_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan | None:
        return await CommercePlan.filter(id=plan_id).using_db(conn).select_for_update().first()

    async def create_plan(self, *, code: str, sort_order: int, conn: BaseDBAsyncClient) -> CommercePlan:
        try:
            return await CommercePlan.create(code=code, sort_order=sort_order, using_db=conn)
        except IntegrityError as exc:
            raise Conflict(error="COMMERCE_CATALOG_PLAN_CODE_EXISTS") from exc

    async def lock_command_scope(
        self,
        *,
        target_plan_code: str,
        action: CommerceCatalogCommandAction | str,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [f"{_COMMAND_SCOPE_LOCK_NAMESPACE}:{target_plan_code}:{action}:{idempotency_key_hash}"],
        )

    async def require_command_replay(
        self,
        *,
        target_plan_code: str,
        action: CommerceCatalogCommandAction | str,
        idempotency_key_hash: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCatalogCommandReceipt | None:
        receipt = await self.load_command_receipt(
            target_plan_code=target_plan_code,
            action=action,
            idempotency_key_hash=idempotency_key_hash,
            conn=conn,
        )
        if receipt is None:
            return None
        if receipt.request_fingerprint != request_fingerprint:
            raise Conflict(error="COMMERCE_CATALOG_IDEMPOTENCY_CONFLICT")
        return receipt

    async def load_command_receipt(
        self,
        *,
        target_plan_code: str,
        action: CommerceCatalogCommandAction | str,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCatalogCommandReceipt | None:
        return await (
            CommerceCatalogCommandReceipt
            .filter(
                target_plan_code=target_plan_code,
                action=action,
                idempotency_key_hash=idempotency_key_hash,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def record_command_outcome(
        self,
        *,
        settings: Settings,
        action: CommerceCatalogCommandAction | str,
        target_plan: CommercePlan,
        target_revision: CommercePlanRevision | None,
        idempotency_key_hash: str,
        request_fingerprint: str,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        result_snapshot: dict[str, Any],
        event_name: str,
        event_properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> CommerceCatalogCommandReceipt:
        activity_properties = dict(event_properties)
        if actor_session_id is not None:
            activity_properties["actor_session_id"] = str(actor_session_id)
        event = await write_required_activity_event(
            settings=settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                entity_type="commerce_plan_revision" if target_revision is not None else "commerce_plan",
                entity_id=target_revision.id if target_revision is not None else target_plan.id,
                source="api",
                properties=activity_properties,
            ),
            conn=conn,
        )
        return await CommerceCatalogCommandReceipt.create(
            using_db=conn,
            action=action,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            actor_user_id=actor_user_id,
            actor_session_id=actor_session_id,
            target_plan_code=target_plan.code,
            plan_id=target_plan.id,
            plan_revision_id=None if target_revision is None else target_revision.id,
            result_revision=0 if target_revision is None else target_revision.revision,
            result_snapshot=result_snapshot,
            audit_event_id=event.id,
        )

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
        await self._replace_draft_declarations(
            draft=draft, terms=terms, resources=resources, entitlements=entitlements, conn=conn
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
        expected_revision: int,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision:
        self._require_mutable_draft(draft=draft, expected_revision=expected_revision)
        revision_fields = _revision_fields(terms)
        updated_at = datetime.now(UTC)
        updated = await (
            CommercePlanRevision
            .filter(
                id=draft.id,
                status=PlanRevisionStatus.DRAFT,
                revision=expected_revision,
            )
            .using_db(conn)
            .update(**revision_fields, revision=expected_revision + 1, updated_at=updated_at)
        )
        if updated != 1:
            await self._raise_draft_mutation_conflict(
                revision_id=draft.id,
                expected_revision=expected_revision,
                conn=conn,
            )
        for field, value in revision_fields.items():
            setattr(draft, field, value)
        draft.revision = expected_revision + 1
        draft.updated_at = updated_at
        await self._replace_draft_declarations(
            draft=draft, terms=terms, resources=resources, entitlements=entitlements, conn=conn
        )
        return draft

    async def _replace_draft_declarations(
        self,
        *,
        draft: CommercePlanRevision,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> None:
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
                PlanRevisionPriceInput(
                    provider=price.provider,
                    provider_mode=price.provider_mode,
                    billing_cycle=price.billing_cycle,
                    currency=price.currency,
                    amount_micros=price.amount_micros,
                    external_price_id=price.external_price_id,
                )
                for price in prices
            ),
            resource_allowances=tuple(
                PlanRevisionResourceAllowanceInput(
                    key=allowance.resource.key,
                    limit_kind=allowance.limit_kind,
                    limit_value=allowance.limit_value,
                )
                for allowance in allowances
            ),
            entitlements=tuple(
                PlanRevisionEntitlementInput(
                    key=entitlement.entitlement.key,
                    is_included=entitlement.is_included,
                    allocation_mode=entitlement.allocation_mode,
                    seat_limit_kind=entitlement.seat_limit_kind,
                    seat_limit_value=entitlement.seat_limit_value,
                )
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
        expected_revision: int,
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision:
        locked_plan = await self.lock_plan(plan_id=plan.id, conn=conn)
        if locked_plan is None:
            raise Conflict(error="COMMERCE_CATALOG_PLAN_NOT_FOUND")
        self._require_mutable_draft(draft=draft, expected_revision=expected_revision)
        await (
            CommercePlanRevision
            .filter(
                plan_id=locked_plan.id,
                status=PlanRevisionStatus.PUBLISHED,
                is_selling=True,
            )
            .using_db(conn)
            .update(is_selling=False)
        )
        updated_at = datetime.now(UTC)
        updated = await (
            CommercePlanRevision
            .filter(
                id=draft.id,
                status=PlanRevisionStatus.DRAFT,
                revision=expected_revision,
            )
            .using_db(conn)
            .update(
                status=PlanRevisionStatus.PUBLISHED,
                is_selling=True,
                content_hash=content_hash,
                published_at=published_at,
                revision=expected_revision + 1,
                updated_at=updated_at,
            )
        )
        if updated != 1:
            await self._raise_draft_mutation_conflict(
                revision_id=draft.id,
                expected_revision=expected_revision,
                conn=conn,
            )
        draft.status = PlanRevisionStatus.PUBLISHED
        draft.is_selling = True
        draft.content_hash = content_hash
        draft.published_at = published_at
        draft.revision = expected_revision + 1
        draft.updated_at = updated_at
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

    @staticmethod
    def _require_mutable_draft(*, draft: CommercePlanRevision, expected_revision: int) -> None:
        if draft.status != PlanRevisionStatus.DRAFT:
            raise Conflict(error="COMMERCE_CATALOG_REVISION_IMMUTABLE")
        if draft.revision != expected_revision:
            raise Conflict(
                error="COMMERCE_CATALOG_REVISION_CONFLICT",
                meta={"expectedRevision": expected_revision, "currentRevision": draft.revision},
            )

    @staticmethod
    async def _raise_draft_mutation_conflict(
        *, revision_id: UUID, expected_revision: int, conn: BaseDBAsyncClient
    ) -> None:
        current = await CommercePlanRevision.filter(id=revision_id).using_db(conn).first()
        if current is None:
            raise Conflict(error="COMMERCE_CATALOG_DRAFT_NOT_FOUND")
        if current.status != PlanRevisionStatus.DRAFT:
            raise Conflict(error="COMMERCE_CATALOG_REVISION_IMMUTABLE")
        raise Conflict(
            error="COMMERCE_CATALOG_REVISION_CONFLICT",
            meta={"expectedRevision": expected_revision, "currentRevision": current.revision},
        )


def _revision_fields(terms: PlanRevisionTermsInput) -> dict[str, object]:
    return {
        "name_i18n_key": terms.name_i18n_key,
        "description_i18n_key": terms.description_i18n_key,
        "credit_grant_amount": terms.credit_grant_amount,
        "credit_refresh_interval": terms.credit_refresh_interval,
        "credit_value_micros": terms.credit_value_micros,
        "currency": terms.currency,
    }
