from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.common.utils.public_ids import encode_uuid
from src.models.commerce.billing import BillingCycle, PlanRevisionStatus, SubscriptionStatus
from src.models.commerce.payments import CommercePaymentCorrectionDisposition, CommerceRefundStatus
from src.modules.commerce import platform_router
from src.modules.commerce.billing_payment_reconciliation_service import ProviderPaymentCorrectionResult
from src.modules.commerce.billing_top_up_refund_application_service import BillingTopUpRefundResult
from src.modules.commerce.platform_payment_read_schema import (
    PlatformInvoiceListOut,
    PlatformRefundListOut,
    PlatformTransactionListOut,
)
from src.modules.commerce.platform_schema import (
    PlatformCommercePlanCatalogOut,
    PlatformCommercePlanIdentityOut,
    PlatformCommercePlanRevisionMutationOut,
    PlatformCommerceRevisionSummaryOut,
    PlatformCommerceSubscriptionListOut,
)
from src.modules.commerce.schema import WorkspaceCommerceOverviewOut
from src.modules.commerce.simulated_checkout_outcome_service import (
    SimulatedCheckoutOutcomeOut,
)
from src.modules.platform_identity.http import get_current_platform_session
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


def _overview() -> WorkspaceCommerceOverviewOut:
    now = datetime.now(UTC)
    period_end = now + timedelta(days=30)
    return WorkspaceCommerceOverviewOut.model_validate({
        "billing_provider": "disabled",
        "plan_revision": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "plan_id": uuid4(),
            "plan_code": "free",
            "sequence": 1,
            "name_i18n_key": "PLAN_DEFAULT_FREE_NAME",
            "description_i18n_key": "PLAN_DEFAULT_FREE_DESCRIPTION",
            "credit_grant_amount": 70,
            "credit_refresh_interval": "daily",
            "credit_value_micros": 1_000,
            "currency": "USD",
            "prices": [
                {
                    "provider": "stripe",
                    "provider_mode": "test",
                    "billing_cycle": "monthly",
                    "currency": "USD",
                    "amount_micros": 1_000_000,
                },
                {
                    "provider": "stripe",
                    "provider_mode": "test",
                    "billing_cycle": "yearly",
                    "currency": "USD",
                    "amount_micros": 10_000_000,
                },
            ],
            "resource_allowances": [{"key": "projects.active", "limit_kind": "limited", "limit_value": 3}],
            "entitlements": [
                {
                    "key": "sites.generate",
                    "is_included": True,
                    "allocation_mode": "workspace",
                    "seat_limit_kind": None,
                    "seat_limit_value": None,
                }
            ],
            "is_selling": True,
        },
        "subscription": {
            "id": uuid4(),
            "created_at": now,
            "updated_at": now,
            "plan_revision_id": uuid4(),
            "subscription_revision": 1,
            "status": "active",
            "billing_cycle": "monthly",
            "current_period_start": now,
            "current_period_end": period_end,
            "cancel_at_period_end": False,
        },
        "credits": {
            "account_revision": 4,
            "balance": 70,
            "reserved": 2,
            "available": 68,
            "period_start": now,
            "period_end": period_end,
            "next_refresh_at": period_end,
        },
        "usage": {
            "period_cost_micros": 25_000,
            "requests": 4,
            "prompt_tokens": 120,
            "completion_tokens": 48,
        },
    })


async def test_system_operator_can_read_workspace_commerce_overview(monkeypatch) -> None:
    workspace_id = uuid4()
    overview = _overview()
    get_overview = AsyncMock(return_value=overview)
    service = SimpleNamespace(get_overview=get_overview)
    monkeypatch.setattr(platform_router, "build_commerce_service", lambda _settings: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner

    async with asgi_client(app) as client:
        response = await client.get(f"/platform-api/v1/commerce/workspaces/{encode_uuid(workspace_id)}/overview")

    assert response.status_code == 200
    assert response.json()["data"]["planRevision"]["planCode"] == "free"
    assert response.json()["data"]["credits"]["available"] == 68
    get_overview.assert_awaited_once_with(workspace_id=workspace_id)


async def test_system_operator_can_read_platform_commerce_catalog_and_subscriptions(monkeypatch) -> None:
    now = datetime.now(UTC)
    plan_id = uuid4()
    revision_id = uuid4()
    workspace_id = uuid4()
    subscription_id = uuid4()
    catalog = PlatformCommercePlanCatalogOut(
        items=(
            {
                "id": plan_id,
                "code": "premium",
                "is_active": True,
                "sort_order": 10,
                "revisions": (
                    PlatformCommerceRevisionSummaryOut(
                        id=revision_id,
                        sequence=2,
                        revision=1,
                        status=PlanRevisionStatus.PUBLISHED,
                        is_selling=True,
                        name_i18n_key="PLAN_PREMIUM_NAME",
                        description_i18n_key="PLAN_PREMIUM_DESCRIPTION",
                        published_at=now,
                    ),
                ),
            },
        ),
    )
    subscriptions = PlatformCommerceSubscriptionListOut(
        total=1,
        items=(
            {
                "workspace_id": workspace_id,
                "subscription_id": subscription_id,
                "plan_revision_id": revision_id,
                "plan_code": "premium",
                "plan_revision": 2,
                "status": SubscriptionStatus.ACTIVE,
                "billing_cycle": BillingCycle.MONTHLY,
                "current_period_start": now,
                "current_period_end": now + timedelta(days=30),
                "cancel_at_period_end": False,
                "billing_provider": "stripe",
            },
        ),
    )
    service = SimpleNamespace(
        list_plan_catalog=AsyncMock(return_value=catalog),
        list_plan_revisions=AsyncMock(return_value=catalog.items[0].revisions),
        list_subscriptions=AsyncMock(return_value=subscriptions),
    )
    monkeypatch.setattr(platform_router, "build_platform_commerce_read_service", lambda: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner

    async with asgi_client(app) as client:
        plans_response = await client.get("/platform-api/v1/commerce/plans?includeInactive=true")
        revisions_response = await client.get("/platform-api/v1/commerce/plans/premium/revisions")
        subscriptions_response = await client.get(
            "/platform-api/v1/commerce/subscriptions?page=2&pageSize=25&status=active&provider=stripe"
        )

    assert plans_response.status_code == 200
    assert plans_response.json()["data"]["items"][0]["revisions"][0]["sequence"] == 2
    assert plans_response.json()["data"]["items"][0]["revisions"][0]["revision"] == 1
    assert revisions_response.status_code == 200
    assert revisions_response.json()["data"][0]["nameI18NKey"] == "PLAN_PREMIUM_NAME"
    assert subscriptions_response.status_code == 200
    assert subscriptions_response.json()["data"]["items"][0]["workspaceId"] == encode_uuid(workspace_id)
    service.list_plan_catalog.assert_awaited_once_with(include_inactive=True)
    service.list_plan_revisions.assert_awaited_once_with(code="premium", include_inactive=False)
    query = service.list_subscriptions.await_args.kwargs["query"]
    assert query.page == 2
    assert query.page_size == 25
    assert query.status == SubscriptionStatus.ACTIVE
    assert query.provider == "stripe"


async def test_system_operator_can_read_payment_projections(monkeypatch) -> None:
    service = SimpleNamespace(
        list_transactions=AsyncMock(return_value=PlatformTransactionListOut(items=(), total=0)),
        list_invoices=AsyncMock(return_value=PlatformInvoiceListOut(items=(), total=0)),
        list_refunds=AsyncMock(return_value=PlatformRefundListOut(items=(), total=0)),
    )
    monkeypatch.setattr(platform_router, "build_platform_commerce_read_service", lambda: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=uuid4(), is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner

    async with asgi_client(app) as client:
        transactions = await client.get("/platform-api/v1/commerce/transactions?page=2&pageSize=10&provider=stripe")
        invoices = await client.get("/platform-api/v1/commerce/invoices?page=1&pageSize=20&status=paid")
        refunds = await client.get("/platform-api/v1/commerce/refunds?page=3&pageSize=5&status=pending")

    assert transactions.status_code == 200
    assert invoices.status_code == 200
    assert refunds.status_code == 200
    assert transactions.json()["data"] == {"items": [], "total": 0}
    assert invoices.json()["data"] == {"items": [], "total": 0}
    assert refunds.json()["data"] == {"items": [], "total": 0}
    assert service.list_transactions.await_args.kwargs["query"].page == 2
    assert service.list_invoices.await_args.kwargs["query"].status == "paid"
    assert service.list_refunds.await_args.kwargs["query"].page_size == 5


async def test_catalog_mutations_use_canonical_plan_scoped_paths(monkeypatch) -> None:
    actor_id = uuid4()
    session_id = uuid4()
    plan_id = uuid4()
    draft_id = uuid4()
    identity = PlatformCommercePlanIdentityOut(id=plan_id, code="premium")
    draft = PlatformCommercePlanRevisionMutationOut(
        id=draft_id,
        plan_id=plan_id,
        sequence=2,
        revision=1,
        status=PlanRevisionStatus.DRAFT,
    )
    published = draft.model_copy(update={"revision": 2, "status": PlanRevisionStatus.PUBLISHED})
    service = SimpleNamespace(
        create_plan=AsyncMock(return_value=identity),
        create_draft=AsyncMock(return_value=draft),
        update_draft=AsyncMock(return_value=published),
        publish_draft=AsyncMock(return_value=published),
    )
    monkeypatch.setattr(platform_router, "build_commerce_catalog_service", lambda: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=actor_id, session_id=session_id, is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    terms = {
        "nameI18NKey": "commerce.plan.premium.name",
        "descriptionI18NKey": "commerce.plan.premium.description",
        "creditGrantAmount": 1000,
        "creditRefreshInterval": "monthly",
        "creditValueMicros": 1000,
        "currency": "USD",
    }

    async with asgi_client(app) as client:
        headers = {"Idempotency-Key": "catalog-command-1"}
        create_plan_response = await client.post(
            "/platform-api/v1/commerce/plans", headers=headers, json={"code": "premium"}
        )
        create_draft_response = await client.post(
            "/platform-api/v1/commerce/plans/premium/revisions",
            headers=headers,
            json={"terms": terms},
        )
        update_response = await client.put(
            f"/platform-api/v1/commerce/plans/premium/revisions/{encode_uuid(draft_id)}",
            headers=headers,
            json={"expectedRevision": 1, "terms": terms},
        )
        publish_response = await client.post(
            f"/platform-api/v1/commerce/plans/premium/revisions/{encode_uuid(draft_id)}/publish",
            headers=headers,
            json={"expectedRevision": 1},
        )
        legacy_response = await client.post(
            "/platform-api/v1/commerce/plan-revisions", headers=headers, json={"terms": terms}
        )

    assert create_plan_response.status_code == 200
    assert create_draft_response.status_code == 200
    assert update_response.status_code == 200
    assert publish_response.status_code == 200
    assert legacy_response.status_code == 404
    assert create_draft_response.json()["data"]["revision"] == 1
    assert publish_response.json()["data"]["status"] == "published"
    assert service.create_plan.await_args.kwargs["actor_user_id"] == actor_id
    assert service.create_plan.await_args.kwargs["actor_session_id"] == session_id
    assert service.create_draft.await_args.kwargs["plan_code"] == "premium"
    assert service.update_draft.await_args.kwargs["expected_revision"] == 1
    assert service.publish_draft.await_args.kwargs["expected_revision"] == 1


async def test_platform_top_up_refund_route_uses_idempotency_and_operator_authority(monkeypatch) -> None:
    actor_id = uuid4()
    transaction_id = uuid4()
    result = BillingTopUpRefundResult(
        refund_id=uuid4(),
        workspace_id=uuid4(),
        transaction_id=transaction_id,
        status=CommerceRefundStatus.PENDING,
        amount_micros=5_000_000,
        credit_amount=500,
        external_refund_id=None,
        held_credits=500,
    )
    request_refund = AsyncMock(return_value=result)
    service = SimpleNamespace(request_top_up_refund=request_refund)
    monkeypatch.setattr(platform_router, "build_platform_commerce_operations_service", lambda **_: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=actor_id, is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    app.dependency_overrides[platform_router.get_connector_registry] = lambda: SimpleNamespace()

    async with asgi_client(app) as client:
        response = await client.post(
            f"/platform-api/v1/commerce/transactions/{encode_uuid(transaction_id)}/refunds",
            headers={"Idempotency-Key": "refund-route-1"},
            json={"reason": "confirmed provider refund"},
        )

    assert response.status_code == 200
    assert response.json()["data"]["transactionId"] == encode_uuid(transaction_id)
    request_refund.assert_awaited_once_with(
        transaction_id=transaction_id,
        reason="confirmed provider refund",
        idempotency_key="refund-route-1",
        actor_user_id=actor_id,
    )


async def test_platform_payment_correction_route_separates_provider_facts_from_operator_evidence(monkeypatch) -> None:
    actor_id = uuid4()
    result = ProviderPaymentCorrectionResult(
        correction_id=uuid4(),
        disposition=CommercePaymentCorrectionDisposition.RECONCILIATION_REQUIRED,
        workspace_id=None,
        transaction_id=None,
        invoice_id=None,
        refund_id=None,
        credit_consequence=None,
        failure_code="BILLING_PAYMENT_RECONCILIATION_REQUIRED",
    )
    record = AsyncMock(return_value=result)
    service = SimpleNamespace(record_payment_correction=record)
    monkeypatch.setattr(platform_router, "build_platform_commerce_operations_service", lambda **_: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=actor_id, is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    app.dependency_overrides[platform_router.get_connector_registry] = lambda: SimpleNamespace()

    payload = {
        "provider": "stripe",
        "providerMode": "test",
        "providerAccountId": "acct_test",
        "providerEventId": "evt_correction",
        "externalTransactionId": "pi_123",
        "transactionStatus": "succeeded",
        "currency": "USD",
        "amountMicros": 5_000_000,
        "amountRefundedMicros": 5_000_000,
        "creditAmount": 500,
        "providerEventOccurredAt": "2026-08-06T00:00:00Z",
        "reason": "provider refund consequence review",
        "evidenceReference": "ticket-123",
        "idempotencyKey": "correction-123",
    }

    async with asgi_client(app) as client:
        response = await client.post(
            "/platform-api/v1/commerce/payment-corrections",
            json=payload,
        )

    assert response.status_code == 200
    call = record.await_args
    assert call is not None
    facts = call.kwargs["facts"]
    assert facts.provider == "stripe"
    assert facts.external_transaction_id == "pi_123"
    assert not hasattr(facts, "reason")
    assert call.kwargs["reason"] == payload["reason"]
    assert call.kwargs["evidence_reference"] == payload["evidenceReference"]
    assert call.kwargs["idempotency_key"] == payload["idempotencyKey"]
    assert call.kwargs["actor_user_id"] == actor_id


async def test_platform_simulator_routes_expose_readiness_and_signed_outcome_command(monkeypatch) -> None:
    actor_id = uuid4()
    workspace_id = uuid4()
    checkout_id = uuid4()
    result = SimulatedCheckoutOutcomeOut(
        checkout_session_id=checkout_id,
        outcome="succeeded",
        provider_event_id="sim_evt_platform_route",
        accepted=True,
        event_created=True,
        inbox_id=uuid4(),
        job_id=uuid4(),
    )
    readiness = SimpleNamespace(
        enabled=True,
        environment="test",
        provider="simulated",
        signing_configured=True,
        connector_registered=True,
        supported_outcomes=("pending", "succeeded", "failed", "canceled"),
        rejection_code=None,
    )
    simulator_readiness = AsyncMock(return_value=readiness)
    submit_outcome = AsyncMock(return_value=result)
    service = SimpleNamespace(simulator_readiness=simulator_readiness, submit_simulator_outcome=submit_outcome)
    monkeypatch.setattr(platform_router, "build_platform_commerce_operations_service", lambda **_: service)

    async def _platform_owner() -> SimpleNamespace:
        return SimpleNamespace(actor_id=actor_id, is_instance_owner=True)

    app = FastAPI()
    app.include_router(platform_router.router, prefix="/platform-api/v1/commerce")
    app.dependency_overrides[get_current_platform_session] = _platform_owner
    app.dependency_overrides[platform_router.get_connector_registry] = lambda: SimpleNamespace()

    async with asgi_client(app) as client:
        readiness_response = await client.get("/platform-api/v1/commerce/simulator")
        outcome_response = await client.post(
            f"/platform-api/v1/commerce/simulator/workspaces/{encode_uuid(workspace_id)}/top-up-checkout-sessions/{encode_uuid(checkout_id)}/outcome",
            headers={"Idempotency-Key": "sim-route-1"},
            json={"outcome": "succeeded", "expectedRevision": 1},
        )

    assert readiness_response.status_code == 200
    assert readiness_response.json()["data"]["enabled"] is True
    assert outcome_response.status_code == 200
    assert outcome_response.json()["data"]["providerEventId"] == "sim_evt_platform_route"
    simulator_readiness.assert_awaited_once_with()
    submit_outcome.assert_awaited_once()
    call = submit_outcome.await_args
    assert call is not None
    assert call.kwargs["kind"] == "top_up"
    assert call.kwargs["workspace_id"] == workspace_id
    assert call.kwargs["actor_user_id"] == actor_id
