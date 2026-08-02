"""Catalog lifecycle service for stable Plans and immutable published Revisions."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.config import Settings
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
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanIdentityOut,
    PlatformCommercePlanRevisionMutationOut,
)

ACTIVE_PROJECT_RESOURCE_KEY = "projects.active"
CREATE_PLAN_ACTION = "create_plan"
CREATE_DRAFT_ACTION = "create_draft"
UPDATE_DRAFT_ACTION = "update_draft"
PUBLISH_DRAFT_ACTION = "publish_draft"


class CommerceCatalogCommandReceipt(Protocol):
    result_snapshot: dict[str, object]


class CommerceCatalogPersistence(Protocol):
    async def get_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def lock_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

    async def lock_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan | None: ...

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
        expected_revision: int,
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision: ...

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
        expected_revision: int,
        conn: BaseDBAsyncClient,
    ) -> CommercePlanRevision: ...

    async def set_plan_active(
        self, *, plan: CommercePlan, is_active: bool, conn: BaseDBAsyncClient
    ) -> CommercePlan: ...

    async def require_command_replay(
        self,
        *,
        target_plan_code: str,
        action: str,
        idempotency_key_hash: str,
        request_fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCatalogCommandReceipt | None: ...

    async def lock_command_scope(
        self,
        *,
        target_plan_code: str,
        action: str,
        idempotency_key_hash: str,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def record_command_outcome(
        self,
        *,
        settings: Settings,
        action: str,
        target_plan: CommercePlan,
        target_revision: CommercePlanRevision | None,
        idempotency_key_hash: str,
        request_fingerprint: str,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        result_snapshot: dict[str, object],
        event_name: str,
        event_properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> CommerceCatalogCommandReceipt: ...


class CommerceCatalogService(BaseService):
    """Coordinates catalog draft writes without ever rebinding a Subscription."""

    def __init__(self, *, repository: CommerceCatalogPersistence) -> None:
        super().__init__()
        self._repository = repository

    async def create_plan(
        self,
        *,
        request: PlanIdentityCreate,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        idempotency_key: str,
        settings: Settings,
        conn: BaseDBAsyncClient | None = None,
    ) -> PlatformCommercePlanIdentityOut:
        fingerprint = _command_fingerprint(action=CREATE_PLAN_ACTION, target_plan_code=request.code, payload=request)
        async with self.tx(conn=conn) as tx_conn:
            await self._lock_command_scope(
                target_plan_code=request.code,
                action=CREATE_PLAN_ACTION,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                conn=tx_conn,
            )
            replay = await self._repository.require_command_replay(
                target_plan_code=request.code,
                action=CREATE_PLAN_ACTION,
                idempotency_key_hash=_idempotency_key_hash(
                    actor_user_id=actor_user_id, idempotency_key=idempotency_key
                ),
                request_fingerprint=fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return PlatformCommercePlanIdentityOut.model_validate(replay.result_snapshot)
            if await self._repository.get_plan_by_code(code=request.code, conn=tx_conn) is not None:
                raise Conflict(error="COMMERCE_CATALOG_PLAN_CODE_EXISTS")
            plan = await self._repository.create_plan(code=request.code, sort_order=request.sort_order, conn=tx_conn)
            result = PlatformCommercePlanIdentityOut(id=plan.id, code=plan.code)
            await self._record_command_outcome(
                settings=settings,
                action=CREATE_PLAN_ACTION,
                plan=plan,
                revision=None,
                actor_user_id=actor_user_id,
                actor_session_id=actor_session_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                result=result,
                event_name="commerce.catalog.plan_created",
                event_properties={"plan_code": plan.code, "sort_order": plan.sort_order},
                conn=tx_conn,
            )
            return result

    async def create_draft(
        self,
        *,
        plan_code: str,
        terms: PlanRevisionTermsInput,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        idempotency_key: str,
        settings: Settings,
        conn: BaseDBAsyncClient | None = None,
    ) -> PlatformCommercePlanRevisionMutationOut:
        fingerprint = _command_fingerprint(
            action=CREATE_DRAFT_ACTION,
            target_plan_code=plan_code,
            payload=terms,
        )
        async with self.tx(conn=conn) as tx_conn:
            await self._lock_command_scope(
                target_plan_code=plan_code,
                action=CREATE_DRAFT_ACTION,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                conn=tx_conn,
            )
            replay = await self._repository.require_command_replay(
                target_plan_code=plan_code,
                action=CREATE_DRAFT_ACTION,
                idempotency_key_hash=_idempotency_key_hash(
                    actor_user_id=actor_user_id, idempotency_key=idempotency_key
                ),
                request_fingerprint=fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return PlatformCommercePlanRevisionMutationOut.model_validate(replay.result_snapshot)
            plan = await self._require_plan_by_code(code=plan_code, conn=tx_conn)
            resources, entitlements = await self._resolve_declarations(terms=terms, conn=tx_conn)
            sequence = await self._repository.next_revision_sequence(plan_id=plan.id, conn=tx_conn)
            draft = await self._repository.create_draft(
                plan_id=plan.id,
                sequence=sequence,
                terms=terms,
                resources=resources,
                entitlements=entitlements,
                conn=tx_conn,
            )
            result = _revision_result(draft)
            await self._record_command_outcome(
                settings=settings,
                action=CREATE_DRAFT_ACTION,
                plan=plan,
                revision=draft,
                actor_user_id=actor_user_id,
                actor_session_id=actor_session_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                result=result,
                event_name="commerce.catalog.draft_created",
                event_properties={"plan_code": plan.code, "revision_id": str(draft.id), "sequence": draft.sequence},
                conn=tx_conn,
            )
            return result

    async def update_draft(
        self,
        *,
        plan_code: str,
        revision_id: UUID,
        terms: PlanRevisionTermsInput,
        expected_revision: int,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        idempotency_key: str,
        settings: Settings,
        conn: BaseDBAsyncClient | None = None,
    ) -> PlatformCommercePlanRevisionMutationOut:
        fingerprint = _command_fingerprint(
            action=UPDATE_DRAFT_ACTION,
            target_plan_code=plan_code,
            payload={"revision_id": str(revision_id), "expected_revision": expected_revision, "terms": terms},
        )
        async with self.tx(conn=conn) as tx_conn:
            await self._lock_command_scope(
                target_plan_code=plan_code,
                action=UPDATE_DRAFT_ACTION,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                conn=tx_conn,
            )
            replay = await self._repository.require_command_replay(
                target_plan_code=plan_code,
                action=UPDATE_DRAFT_ACTION,
                idempotency_key_hash=_idempotency_key_hash(
                    actor_user_id=actor_user_id, idempotency_key=idempotency_key
                ),
                request_fingerprint=fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return PlatformCommercePlanRevisionMutationOut.model_validate(replay.result_snapshot)
            plan = await self._require_plan_by_code(code=plan_code, conn=tx_conn)
            draft = await self._require_draft(revision_id=revision_id, plan_id=plan.id, conn=tx_conn)
            resources, entitlements = await self._resolve_declarations(terms=terms, conn=tx_conn)
            updated = await self._repository.replace_draft_terms(
                draft=draft,
                terms=terms,
                resources=resources,
                entitlements=entitlements,
                expected_revision=expected_revision,
                conn=tx_conn,
            )
            result = _revision_result(updated)
            await self._record_command_outcome(
                settings=settings,
                action=UPDATE_DRAFT_ACTION,
                plan=plan,
                revision=updated,
                actor_user_id=actor_user_id,
                actor_session_id=actor_session_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                result=result,
                event_name="commerce.catalog.draft_updated",
                event_properties={
                    "plan_code": plan.code,
                    "revision_id": str(updated.id),
                    "expected_revision": expected_revision,
                    "result_revision": updated.revision,
                },
                conn=tx_conn,
            )
            return result

    async def publish_draft(
        self,
        *,
        plan_code: str,
        revision_id: UUID,
        expected_revision: int,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        idempotency_key: str,
        settings: Settings,
        conn: BaseDBAsyncClient | None = None,
    ) -> PlatformCommercePlanRevisionMutationOut:
        fingerprint = _command_fingerprint(
            action=PUBLISH_DRAFT_ACTION,
            target_plan_code=plan_code,
            payload={"revision_id": str(revision_id), "expected_revision": expected_revision},
        )
        async with self.tx(conn=conn) as tx_conn:
            await self._lock_command_scope(
                target_plan_code=plan_code,
                action=PUBLISH_DRAFT_ACTION,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                conn=tx_conn,
            )
            replay = await self._repository.require_command_replay(
                target_plan_code=plan_code,
                action=PUBLISH_DRAFT_ACTION,
                idempotency_key_hash=_idempotency_key_hash(
                    actor_user_id=actor_user_id, idempotency_key=idempotency_key
                ),
                request_fingerprint=fingerprint,
                conn=tx_conn,
            )
            if replay is not None:
                return PlatformCommercePlanRevisionMutationOut.model_validate(replay.result_snapshot)
            plan = await self._require_plan_by_code(code=plan_code, conn=tx_conn)
            if not plan.is_active:
                raise Conflict(error="COMMERCE_CATALOG_PLAN_INACTIVE")
            draft = await self._require_draft(revision_id=revision_id, plan_id=plan.id, conn=tx_conn)
            terms = await self._repository.load_terms(revision_id=draft.id, conn=tx_conn)
            await self._validate_publishable_terms(terms=terms, revision_id=draft.id, conn=tx_conn)
            published = await self._repository.publish_draft(
                plan=plan,
                draft=draft,
                content_hash=_content_hash(plan_id=plan.id, terms=terms),
                published_at=_now(),
                expected_revision=expected_revision,
                conn=tx_conn,
            )
            result = _revision_result(published)
            await self._record_command_outcome(
                settings=settings,
                action=PUBLISH_DRAFT_ACTION,
                plan=plan,
                revision=published,
                actor_user_id=actor_user_id,
                actor_session_id=actor_session_id,
                idempotency_key=idempotency_key,
                fingerprint=fingerprint,
                result=result,
                event_name="commerce.catalog.revision_published",
                event_properties={
                    "plan_code": plan.code,
                    "revision_id": str(published.id),
                    "sequence": published.sequence,
                    "expected_revision": expected_revision,
                    "content_hash": published.content_hash,
                },
                conn=tx_conn,
            )
            return result

    async def deactivate_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient | None = None) -> CommercePlan:
        async with self.tx(conn=conn) as tx_conn:
            plan = await self._require_plan(plan_id=plan_id, conn=tx_conn)
            return await self._repository.set_plan_active(plan=plan, is_active=False, conn=tx_conn)

    async def _require_plan(self, *, plan_id: UUID, conn: BaseDBAsyncClient) -> CommercePlan:
        plan = await self._repository.lock_plan(plan_id=plan_id, conn=conn)
        if plan is None:
            raise NotFound(error="COMMERCE_CATALOG_PLAN_NOT_FOUND")
        return plan

    async def _require_plan_by_code(self, *, code: str, conn: BaseDBAsyncClient) -> CommercePlan:
        plan = await self._repository.lock_plan_by_code(code=code, conn=conn)
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

    async def _record_command_outcome(
        self,
        *,
        settings: Settings,
        action: str,
        plan: CommercePlan,
        revision: CommercePlanRevision | None,
        actor_user_id: UUID,
        actor_session_id: UUID | None,
        idempotency_key: str,
        fingerprint: str,
        result: PlatformCommercePlanIdentityOut | PlatformCommercePlanRevisionMutationOut,
        event_name: str,
        event_properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.record_command_outcome(
            settings=settings,
            action=action,
            target_plan=plan,
            target_revision=revision,
            idempotency_key_hash=_idempotency_key_hash(actor_user_id=actor_user_id, idempotency_key=idempotency_key),
            request_fingerprint=fingerprint,
            actor_user_id=actor_user_id,
            actor_session_id=actor_session_id,
            result_snapshot=result.model_dump(mode="json", by_alias=True),
            event_name=event_name,
            event_properties=event_properties,
            conn=conn,
        )

    async def _lock_command_scope(
        self,
        *,
        target_plan_code: str,
        action: str,
        actor_user_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repository.lock_command_scope(
            target_plan_code=target_plan_code,
            action=action,
            idempotency_key_hash=_idempotency_key_hash(actor_user_id=actor_user_id, idempotency_key=idempotency_key),
            conn=conn,
        )


def _content_hash(*, plan_id: UUID, terms: PlanRevisionTermsInput) -> str:
    payload = _terms_payload(terms)
    payload = {"plan_id": str(plan_id), "terms": payload}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def _revision_result(revision: CommercePlanRevision) -> PlatformCommercePlanRevisionMutationOut:
    return PlatformCommercePlanRevisionMutationOut(
        id=revision.id,
        plan_id=revision.plan_id,
        sequence=revision.sequence,
        revision=revision.revision,
        status=revision.status,
    )


def _command_fingerprint(*, action: str, target_plan_code: str, payload: object) -> str:
    value = payload.model_dump(mode="json", by_alias=True) if isinstance(payload, BaseModel) else payload
    encoded = json.dumps(
        {"action": action, "target_plan_code": target_plan_code, "payload": _canonicalize(value)},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _idempotency_key_hash(*, actor_user_id: UUID, idempotency_key: str) -> str:
    return hashlib.sha256(f"{actor_user_id}:commerce-catalog:{idempotency_key.strip()}".encode()).hexdigest()


def _terms_payload(terms: PlanRevisionTermsInput) -> JsonObject:
    canonical_terms = _canonicalize(terms.model_dump(mode="json"))
    if not isinstance(canonical_terms, dict):
        raise TypeError("Plan Revision terms must serialize to a JSON object")
    return canonical_terms


def _canonicalize(value: object) -> JsonValue:
    if isinstance(value, BaseModel):
        return _canonicalize(value.model_dump(mode="json", by_alias=True))
    if isinstance(value, dict):
        return {str(key): _canonicalize(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return sorted((_canonicalize(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
    if isinstance(value, tuple):
        return _canonicalize(list(value))
    if value is None or isinstance(value, str | int | float | bool):
        return value
    raise TypeError(f"Unsupported value in catalog command payload: {type(value).__name__}")


def _now() -> datetime:
    return datetime.now(UTC)


def build_commerce_catalog_service() -> CommerceCatalogService:
    return CommerceCatalogService(repository=CommerceCatalogRepository())
