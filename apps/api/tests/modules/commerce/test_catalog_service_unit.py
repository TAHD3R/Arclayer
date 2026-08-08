from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CreditRefreshInterval,
    EntitlementAllocationMode,
    PlanRevisionStatus,
    ResourceLimitKind,
)
from src.modules.commerce.catalog_schema import (
    PlanRevisionEntitlementInput,
    PlanRevisionPriceInput,
    PlanRevisionResourceAllowanceInput,
    PlanRevisionTermsInput,
)
from src.modules.commerce.catalog_service import CommerceCatalogService, _content_hash


class _Repository:
    def __init__(self, *, terms: PlanRevisionTermsInput, collision: bool = False) -> None:
        self.plan_id = uuid4()
        self.draft_id = uuid4()
        self.plan = SimpleNamespace(id=self.plan_id, code="premium", is_active=True, sort_order=100)
        self.draft = SimpleNamespace(
            id=self.draft_id,
            plan_id=self.plan_id,
            status=PlanRevisionStatus.DRAFT,
            sequence=4,
            revision=1,
            content_hash=None,
        )
        self.terms = terms
        self.collision = collision
        self.published_hash: str | None = None
        self.created_sequence: int | None = None
        self.subscription_bindings = ("bound-to-older-revision",)
        self.resources = {"projects.active": SimpleNamespace(id=uuid4(), key="projects.active", is_active=True)}
        self.receipts: dict[tuple[str, str, str], SimpleNamespace] = {}
        self.audit_events: list[dict[str, object]] = []
        self.entitlements = {
            "sites.generate": SimpleNamespace(
                id=uuid4(),
                key="sites.generate",
                is_active=True,
                supports_workspace_allocation=True,
                supports_member_seat_allocation=False,
            ),
            "ai.priority": SimpleNamespace(
                id=uuid4(),
                key="ai.priority",
                is_active=True,
                supports_workspace_allocation=False,
                supports_member_seat_allocation=True,
            ),
        }

    async def get_plan_by_code(self, *, code, conn):  # type: ignore[no-untyped-def]
        _ = (code, conn)
        return None

    async def lock_plan(self, *, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return self.plan if plan_id == self.plan_id else None

    async def lock_plan_by_code(self, *, code, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return self.plan if code == self.plan.code else None

    async def create_plan(self, *, code, sort_order, conn):  # type: ignore[no-untyped-def]
        _ = (code, sort_order, conn)
        return self.plan

    async def next_revision_sequence(self, *, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, conn)
        return 5

    async def create_draft(self, *, plan_id, sequence, terms, resources, entitlements, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, terms, resources, entitlements, conn)
        self.created_sequence = sequence
        return self.draft

    async def lock_draft(self, *, revision_id, plan_id, conn):  # type: ignore[no-untyped-def]
        _ = (plan_id, conn)
        return self.draft if revision_id == self.draft_id else None

    async def replace_draft_terms(  # type: ignore[no-untyped-def]
        self, *, draft, terms, resources, entitlements, expected_revision, conn
    ):
        _ = (resources, entitlements, conn)
        if draft.revision != expected_revision:
            raise Conflict(error="COMMERCE_CATALOG_REVISION_CONFLICT")
        self.terms = terms
        draft.revision += 1
        return draft

    async def load_terms(self, *, revision_id, conn):  # type: ignore[no-untyped-def]
        _ = (revision_id, conn)
        return self.terms

    async def list_entitlement_definitions(self, *, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return list(self.entitlements.values())

    async def get_resource_definitions(self, *, keys, conn):  # type: ignore[no-untyped-def]
        _ = conn
        return [self.resources[key] for key in keys if key in self.resources]

    async def has_published_external_price_collision(self, *, revision_id, terms, conn):  # type: ignore[no-untyped-def]
        _ = (revision_id, terms, conn)
        return self.collision

    async def publish_draft(self, *, plan, draft, content_hash, published_at, expected_revision, conn):  # type: ignore[no-untyped-def]
        _ = (plan, published_at, conn)
        if draft.revision != expected_revision:
            raise Conflict(error="COMMERCE_CATALOG_REVISION_CONFLICT")
        self.published_hash = content_hash
        draft.content_hash = content_hash
        draft.status = PlanRevisionStatus.PUBLISHED
        draft.revision += 1
        return draft

    async def set_plan_active(self, *, plan, is_active, conn):  # type: ignore[no-untyped-def]
        _ = conn
        plan.is_active = is_active
        return plan

    async def require_command_replay(  # type: ignore[no-untyped-def]
        self, *, target_plan_code, action, idempotency_key_hash, request_fingerprint, conn
    ):
        _ = conn
        receipt = self.receipts.get((target_plan_code, action, idempotency_key_hash))
        if receipt is not None and receipt.request_fingerprint != request_fingerprint:
            raise Conflict(error="COMMERCE_CATALOG_IDEMPOTENCY_CONFLICT")
        return receipt

    async def lock_command_scope(self, **kwargs):  # type: ignore[no-untyped-def]
        _ = kwargs

    async def record_command_outcome(self, **kwargs):  # type: ignore[no-untyped-def]
        key = (kwargs["target_plan"].code, kwargs["action"], kwargs["idempotency_key_hash"])
        receipt = SimpleNamespace(
            result_snapshot=kwargs["result_snapshot"],
            request_fingerprint=kwargs["request_fingerprint"],
        )
        self.receipts[key] = receipt
        self.audit_events.append(kwargs)
        return receipt


def _terms(*, prices_reversed: bool = False, include_ai: bool = True) -> PlanRevisionTermsInput:
    prices = (
        PlanRevisionPriceInput(
            provider="stripe",
            provider_mode=BillingProviderMode.LIVE,
            billing_cycle=BillingCycle.MONTHLY,
            currency="USD",
            amount_micros=10_000_000,
            external_price_id="price_monthly",
        ),
        PlanRevisionPriceInput(
            provider="stripe",
            provider_mode=BillingProviderMode.LIVE,
            billing_cycle=BillingCycle.YEARLY,
            currency="USD",
            amount_micros=100_000_000,
            external_price_id="price_yearly",
        ),
    )
    entitlements = [
        PlanRevisionEntitlementInput(
            key="sites.generate",
            is_included=True,
            allocation_mode=EntitlementAllocationMode.WORKSPACE,
        )
    ]
    if include_ai:
        entitlements.append(
            PlanRevisionEntitlementInput(
                key="ai.priority",
                is_included=True,
                allocation_mode=EntitlementAllocationMode.MEMBER_SEAT,
                seat_limit_kind=ResourceLimitKind.LIMITED,
                seat_limit_value=3,
            )
        )
    return PlanRevisionTermsInput(
        name_i18n_key="commerce.plan.premium.name",
        description_i18n_key="commerce.plan.premium.description",
        credit_grant_amount=1_000,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        prices=tuple(reversed(prices)) if prices_reversed else prices,
        resource_allowances=(
            PlanRevisionResourceAllowanceInput(
                key="projects.active",
                limit_kind=ResourceLimitKind.UNLIMITED,
            ),
        ),
        entitlements=tuple(entitlements),
    )


def _command_context() -> dict[str, object]:
    return {
        "actor_user_id": uuid4(),
        "actor_session_id": uuid4(),
        "idempotency_key": "catalog-command-1",
        "settings": cast(Settings, object()),
    }


async def test_catalog_creates_monotonic_draft_and_publishes_immutable_revision() -> None:
    repository = _Repository(terms=_terms())
    service = CommerceCatalogService(repository=repository)
    conn = cast(BaseDBAsyncClient, object())

    command = _command_context()
    draft = await service.create_draft(plan_code="premium", terms=_terms(), conn=conn, **command)
    published = await service.publish_draft(
        plan_code="premium",
        revision_id=draft.id,
        expected_revision=draft.revision,
        conn=conn,
        **{**command, "idempotency_key": "catalog-command-2"},
    )

    assert repository.created_sequence == 5
    assert published.status == PlanRevisionStatus.PUBLISHED
    assert published.revision == 2
    assert repository.published_hash == _content_hash(plan_id=repository.plan_id, terms=_terms())
    assert repository.subscription_bindings == ("bound-to-older-revision",)
    assert [event["event_name"] for event in repository.audit_events] == [
        "commerce.catalog.draft_created",
        "commerce.catalog.revision_published",
    ]


async def test_catalog_requires_every_registered_entitlement_before_publish() -> None:
    repository = _Repository(terms=_terms(include_ai=False))
    service = CommerceCatalogService(repository=repository)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_ENTITLEMENT_DECLARATION_INCOMPLETE"):
        await service.publish_draft(
            plan_code="premium",
            revision_id=repository.draft_id,
            expected_revision=1,
            **_command_context(),
            conn=cast(BaseDBAsyncClient, object()),
        )


async def test_catalog_rejects_provider_price_collision_before_publication() -> None:
    repository = _Repository(terms=_terms(), collision=True)
    service = CommerceCatalogService(repository=repository)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_PROVIDER_PRICE_COLLISION"):
        await service.publish_draft(
            plan_code="premium",
            revision_id=repository.draft_id,
            expected_revision=1,
            **_command_context(),
            conn=cast(BaseDBAsyncClient, object()),
        )


async def test_catalog_replays_an_identical_draft_command_without_a_second_audit_event() -> None:
    repository = _Repository(terms=_terms())
    service = CommerceCatalogService(repository=repository)
    command = _command_context()
    conn = cast(BaseDBAsyncClient, object())

    created = await service.create_draft(plan_code="premium", terms=_terms(), conn=conn, **command)
    replayed = await service.create_draft(plan_code="premium", terms=_terms(), conn=conn, **command)

    assert replayed == created
    assert repository.created_sequence == 5
    assert len(repository.audit_events) == 1


async def test_catalog_deactivates_plan_with_audited_idempotent_command() -> None:
    repository = _Repository(terms=_terms())
    service = CommerceCatalogService(repository=repository)
    command = _command_context()
    conn = cast(BaseDBAsyncClient, object())

    deactivated = await service.deactivate_plan(plan_code="premium", conn=conn, **command)
    replayed = await service.deactivate_plan(plan_code="premium", conn=conn, **command)

    assert deactivated == replayed
    assert repository.plan.is_active is False
    assert [event["event_name"] for event in repository.audit_events] == ["commerce.catalog.plan_deactivated"]


async def test_catalog_rejects_stale_draft_revision() -> None:
    repository = _Repository(terms=_terms())
    service = CommerceCatalogService(repository=repository)

    with pytest.raises(Conflict, match="COMMERCE_CATALOG_REVISION_CONFLICT"):
        await service.update_draft(
            plan_code="premium",
            revision_id=repository.draft_id,
            terms=_terms(),
            expected_revision=2,
            conn=cast(BaseDBAsyncClient, object()),
            **_command_context(),
        )


def test_catalog_terms_reject_excluded_feature_seat_capacity() -> None:
    with pytest.raises(ValueError, match="excluded entitlement"):
        PlanRevisionEntitlementInput(
            key="ai.priority",
            is_included=False,
            allocation_mode=EntitlementAllocationMode.MEMBER_SEAT,
            seat_limit_kind=ResourceLimitKind.LIMITED,
            seat_limit_value=1,
        )


def test_catalog_price_parses_typed_api_enum_values() -> None:
    price = PlanRevisionPriceInput.model_validate({
        "provider": "stripe",
        "provider_mode": "live",
        "billing_cycle": "monthly",
        "currency": "USD",
        "amount_micros": 0,
        "external_price_id": "price_free",
    })

    assert price.provider_mode == BillingProviderMode.LIVE
    assert price.billing_cycle == BillingCycle.MONTHLY


def test_catalog_content_hash_is_independent_of_declaration_order() -> None:
    plan_id = uuid4()
    assert _content_hash(plan_id=plan_id, terms=_terms()) == _content_hash(
        plan_id=plan_id,
        terms=_terms(prices_reversed=True),
    )
