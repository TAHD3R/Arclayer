"""Catalog lifecycle service for stable Plans and immutable published Revisions."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlan,
    CommercePlanRevision,
    CommerceResourceDefinition,
    EntitlementAllocationMode,
    PlanRevisionStatus,
)
from src.modules.commerce.catalog_repository import CommerceCatalogRepository
from src.modules.commerce.catalog_schema import PlanIdentityCreate, PlanRevisionTermsInput

ACTIVE_PROJECT_RESOURCE_KEY = "projects.active"


class CommerceCatalogPersistence(Protocol):
    async def get_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def lock_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def create_plan(self, *, code: str, sort_order: int, conn: BaseDBAsyncClient) -> CommercePlan: ...

    async def next_revision_sequence(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> int: ...

    async def create_draft(
        self,
        *,
        plan_id: UUID,
        sequence: int,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision: ...

    async def lock_draft(
        self, *, revision_id: UUID, plan_id: UUID, conn: BaseDBAsyncClient
    ) -> CommercePlanRevision | None: ...

    async def replace_draft_terms(
        self,
        *,
        draft: CommercePlanRevision,
        terms: PlanRevisionTermsInput,
        resources: Mapping[str, CommerceResourceDefinition],
        entitlements: Mapping[str, CommerceEntitlementDefinition],
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def load_terms(self, *, revision_id: UUID, conn: BaseDBAsyncClient) -> PlanRevisionTermsInput: ...

    async def list_entitlement_definitions(self, *, conn: BaseDBAsyncClient) -> list[CommerceEntitlementDefinition]: ...

    async def get_resource_definitions(
        self, *, keys: Sequence[str], conn: BaseDBAsyncClient
    ) -> list[CommerceResourceDefinition]: ...

    async def has_published_external_price_collision(
        self, *, revision_id: UUID, terms: PlanRevisionTermsInput, conn: BaseDBAsyncClient
    ) -> bool: ...

    async def publish_draft(
        self,
        *,
        plan: CommercePlan,
        draft: CommercePlanRevision,
        content_hash: str,
        published_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision: ...

    async def set_plan_active(
        self, *, plan: CommercePlan, is_active: bool, conn: BaseDBAsyncClient
    ) -> CommercePlan: ...


class CommerceCatalogService(BaseService):
    """Coordinates catalog draft writes without ever rebinding a Subscription."""

    def __init__(self, *, repository: CommerceCatalogPersistence) -> None:
        super().__init__()
        self._repository = repository

    async def create_plan(self, *, request: PlanIdentityCreate, conn: BaseDBAsyncClient | None = None) -> CommercePlan:
        async with self.tx(conn=conn) as tx_conn:
            if await self._repository.get_plan_by_code(code=request.code, conn=tx_conn) is not None:
                raise Conflict(error="COMMERCE_CATALOG_PLAN_CODE_EXISTS")
            return await self._repository.create_plan(code=request.code, sort_order=request.sort_order, conn=tx_conn)

    async def create_draft(
        self, *, plan_id: UUID, terms: PlanRevisionTermsInput, conn: BaseDBAsyncClient | None = None
    ) -> CommercePlanRevision:
        async with self.tx(conn=conn) as tx_conn:
            await self._require_plan(plan_id=plan_id, conn=tx_conn)
            resources, entitlements = await self._resolve_declarations(terms=terms, conn=tx_conn)
            sequence = await self._repository.next_revision_sequence(plan_id=plan_id, conn=tx_conn)
            return await self._repository.create_draft(
                plan_id=plan_id,
                sequence=sequence,
                terms=terms,
                resources=resources,
                entitlements=entitlements,
                conn=tx_conn,
            )

    async def update_draft(
        self,
        *,
        plan_id: UUID,
        revision_id: UUID,
        terms: PlanRevisionTermsInput,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercePlanRevision:
        async with self.tx(conn=conn) as tx_conn:
            await self._require_plan(plan_id=plan_id, conn=tx_conn)
            draft = await self._require_draft(revision_id=revision_id, plan_id=plan_id, conn=tx_conn)
            resources, entitlements = await self._resolve_declarations(terms=terms, conn=tx_conn)
            await self._repository.replace_draft_terms(
                draft=draft,
                terms=terms,
                resources=resources,
                entitlements=entitlements,
                conn=tx_conn,
            )
            return draft

    async def publish_draft(
        self,
        *,
        plan_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> CommercePlanRevision:
        async with self.tx(conn=conn) as tx_conn:
            plan = await self._require_plan(plan_id=plan_id, conn=tx_conn)
            if not plan.is_active:
                raise Conflict(error="COMMERCE_CATALOG_PLAN_INACTIVE")
            draft = await self._require_draft(revision_id=revision_id, plan_id=plan_id, conn=tx_conn)
            terms = await self._repository.load_terms(revision_id=draft.id, conn=tx_conn)
            await self._validate_publishable_terms(terms=terms, revision_id=draft.id, conn=tx_conn)
            return await self._repository.publish_draft(
                plan=plan,
                draft=draft,
                content_hash=_content_hash(plan_id=plan.id, terms=terms),
                published_at=_now(),
                conn=tx_conn,
            )

    async def deactivate_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient | None = None) -> CommercePlan:
        async with self.tx(conn=conn) as tx_conn:
            plan = await self._require_plan(plan_id=plan_id, conn=tx_conn)
            return await self._repository.set_plan_active(plan=plan, is_active=False, conn=tx_conn)

    async def _require_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan:
        plan = await self._repository.lock_plan(plan_id=plan_id, conn=conn)
        if plan is None:
            raise NotFound(error="COMMERCE_CATALOG_PLAN_NOT_FOUND")
        return plan

    async def _require_draft(
        self, *, revision_id: UUID, plan_id: UUID, conn: BaseDBAsyncClient
    ) -> CommercePlanRevision:
        draft = await self._repository.lock_draft(revision_id=revision_id, plan_id=plan_id, conn=conn)
        if draft is None:
            raise NotFound(error="COMMERCE_CATALOG_DRAFT_NOT_FOUND")
        if draft.status != PlanRevisionStatus.DRAFT:
            raise Conflict(error="COMMERCE_CATALOG_REVISION_IMMUTABLE")
        return draft

    async def _resolve_declarations(
        self, *, terms: PlanRevisionTermsInput, conn: BaseDBAsyncClient
    ) -> tuple[dict[str, CommerceResourceDefinition], dict[str, CommerceEntitlementDefinition]]:
        resource_keys = tuple(allowance.key for allowance in terms.resource_allowances)
        resources = await self._repository.get_resource_definitions(keys=resource_keys, conn=conn)
        resources_by_key = {resource.key: resource for resource in resources}
        if len(resources_by_key) != len(resource_keys) or any(not resource.is_active for resource in resources):
            raise Conflict(error="COMMERCE_CATALOG_RESOURCE_DEFINITION_INVALID")

        definitions = await self._repository.list_entitlement_definitions(conn=conn)
        definitions_by_key = {definition.key: definition for definition in definitions}
        declared_keys = {entitlement.key for entitlement in terms.entitlements}
        if not declared_keys.issubset(definitions_by_key):
            raise Conflict(error="COMMERCE_CATALOG_ENTITLEMENT_DEFINITION_UNKNOWN")
        for declaration in terms.entitlements:
            definition = definitions_by_key[declaration.key]
            if declaration.is_included and not definition.is_active:
                raise Conflict(error="COMMERCE_CATALOG_ENTITLEMENT_DEFINITION_INACTIVE")
            if (
                declaration.allocation_mode == EntitlementAllocationMode.WORKSPACE
                and not definition.supports_workspace_allocation
            ):
                raise Conflict(error="COMMERCE_CATALOG_ENTITLEMENT_ALLOCATION_UNSUPPORTED")
            if (
                declaration.allocation_mode == EntitlementAllocationMode.MEMBER_SEAT
                and not definition.supports_member_seat_allocation
            ):
                raise Conflict(error="COMMERCE_CATALOG_ENTITLEMENT_ALLOCATION_UNSUPPORTED")
        return resources_by_key, definitions_by_key

    async def _validate_publishable_terms(
        self, *, terms: PlanRevisionTermsInput, revision_id: UUID, conn: BaseDBAsyncClient
    ) -> None:
        resources, definitions = await self._resolve_declarations(terms=terms, conn=conn)
        active_project = [
            allowance for allowance in terms.resource_allowances if allowance.key == ACTIVE_PROJECT_RESOURCE_KEY
        ]
        if len(active_project) != 1 or ACTIVE_PROJECT_RESOURCE_KEY not in resources:
            raise Conflict(error="COMMERCE_CATALOG_ACTIVE_PROJECT_ALLOWANCE_REQUIRED")

        declared_keys = {entitlement.key for entitlement in terms.entitlements}
        required_keys = set(definitions)
        if declared_keys != required_keys:
            raise Conflict(error="COMMERCE_CATALOG_ENTITLEMENT_DECLARATION_INCOMPLETE")
        if await self._repository.has_published_external_price_collision(
            revision_id=revision_id,
            terms=terms,
            conn=conn,
        ):
            raise Conflict(error="COMMERCE_CATALOG_PROVIDER_PRICE_COLLISION")


def _content_hash(*, plan_id: UUID, terms: PlanRevisionTermsInput) -> str:
    payload = terms.model_dump(mode="json")
    payload["prices"].sort(
        key=lambda value: (value["provider"], value["provider_mode"], value["billing_cycle"], value["currency"])
    )
    payload["resource_allowances"].sort(key=lambda value: value["key"])
    payload["entitlements"].sort(key=lambda value: value["key"])
    payload = {"plan_id": str(plan_id), "terms": payload}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def build_commerce_catalog_service() -> CommerceCatalogService:
    return CommerceCatalogService(repository=CommerceCatalogRepository())
