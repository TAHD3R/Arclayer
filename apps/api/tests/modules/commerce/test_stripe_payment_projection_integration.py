from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr

from src.config import Settings, get_settings
from src.core.connectors import ConnectorDefinition, ConnectorKind, ConnectorTrustLevel
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import (
    BillingCycle,
    BillingProviderMode,
    CommercePlan,
    CommercePlanRevision,
    CommercePlanRevisionPrice,
    CommerceProviderEventApplication,
    CommercialAccessState,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceCommercialAccess,
    WorkspaceCreditAccount,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import CommercePlanPeriodGrant
from src.models.commerce.payments import (
    CommerceInvoice,
    CommerceProviderPaymentProjection,
    CommerceProviderPaymentTransactionProjection,
    CommerceTransaction,
)
from src.models.connectors.inbox import ConnectorEventInbox
from src.models.jobs.background_job import BackgroundJobRecord
from src.models.organization.organization import Organization
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.billing_connector import BillingConnector
from src.modules.commerce.billing_event_acceptance_service import BillingEventAcceptanceService
from src.modules.commerce.billing_event_job_contract import (
    BillingConnectorEventJobInput,
    BillingConnectorEventJobTarget,
)
from src.modules.commerce.billing_event_job_handler import BillingConnectorEventJobHandler
from src.modules.commerce.billing_event_repository import BillingEventInboxRepository
from src.modules.jobs.execution_registry import JobExecutionContext
from src.modules.jobs.service import BackgroundJobService
from src.settings.crypto import ensure_master_key

pytestmark = pytest.mark.integration

_WEBHOOK_EVENTS = (
    "invoice.marked_uncollectible",
    "invoice.overpaid",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
    "invoice_payment.paid",
)


def _stripe_connector_type() -> type:
    plugin_path = Path(__file__).resolve().parents[5] / "plugins" / "arclayer-stripe" / "src" / "plugin.py"
    spec = importlib.util.spec_from_file_location("integration_stripe_payment_plugin", plugin_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Stripe Connector from {plugin_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(type, module.__dict__["StripeBillingConnector"])


StripeBillingConnector: Any = _stripe_connector_type()


def _settings(tmp_path: Path, *, webhook_secret: str) -> Settings:
    settings = get_settings()
    key_path = tmp_path / "stripe-payment-events.key"
    ensure_master_key(key_path)
    return settings.model_copy(
        update={
            "app_env": "test",
            "billing": settings.billing.model_copy(
                update={
                    "provider": "stripe",
                    "stripe_secret_key": SecretStr("sk_test_integration"),
                    "stripe_webhook_secret": SecretStr(webhook_secret),
                    "stripe_api_base_url": "https://stripe.test/v1",
                }
            ),
            "security": settings.security.model_copy(update={"master_key_path": key_path}),
        }
    )


def _registry(connector: BillingConnector) -> ConnectorRegistry:
    registry = ConnectorRegistry()
    registry.register(
        extension="arclayer-stripe",
        definition=ConnectorDefinition(
            key="billing.stripe",
            kind=ConnectorKind.BILLING,
            version="1.0.0",
            trust_level=ConnectorTrustLevel.OFFICIAL,
            webhook_events=_WEBHOOK_EVENTS,
        ),
        factory=lambda: connector,
    )
    return registry


def _context(inbox: ConnectorEventInbox):  # type: ignore[no-untyped-def]
    async def run(operation):  # type: ignore[no-untyped-def]
        return await operation()

    return cast(
        JobExecutionContext[BillingConnectorEventJobTarget, BillingConnectorEventJobInput],
        SimpleNamespace(
            target=BillingConnectorEventJobTarget(inbox_id=inbox.id),
            input_reference=BillingConnectorEventJobInput(
                inbox_id=inbox.id,
                connector_key=inbox.connector_key,
                connector_version=inbox.connector_version,
                payload_sha256=inbox.payload_sha256,
            ),
            report_progress=AsyncMock(),
            checkpoint=AsyncMock(),
            run_fenced_domain_commit=AsyncMock(side_effect=run),
        ),
    )


def _signature(payload: bytes, *, timestamp: int, secret: str) -> str:
    digest = hmac.new(
        secret.encode(),
        str(timestamp).encode() + b"." + payload,
        hashlib.sha256,
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def _event_payload(
    *,
    event_id: str,
    event_type: str,
    event_timestamp: int,
    event_object: dict[str, object],
) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "type": event_type,
            "created": event_timestamp,
            "livemode": False,
            "data": {"object": event_object},
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def _invoice_payment(
    *,
    invoice_id: str,
    payment_id: str,
    amount_paid: int,
    paid_at: int,
) -> dict[str, object]:
    return {
        "object": "invoice_payment",
        "id": payment_id,
        "invoice": invoice_id,
        "status": "paid",
        "amount_requested": amount_paid,
        "amount_paid": amount_paid,
        "currency": "usd",
        "created": paid_at - 10,
        "status_transitions": {"paid_at": paid_at},
    }


@pytest.mark.asyncio
async def test_signed_stripe_partial_then_paid_invoice_projects_before_granting_period_credits(
    db_schema,
    tmp_path: Path,
) -> None:
    _ = db_schema
    now = datetime.now(UTC).replace(microsecond=0)
    suffix = uuid4().hex[:16]
    organization = await Organization.create(slug=f"stripe-payment-{suffix}", name="Stripe payment")
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Stripe payment",
        owner_user_id=uuid4(),
        created_by_user_id=uuid4(),
    )
    plan = await CommercePlan.create(code=f"stripe-payment-{suffix}")
    revision = await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key=f"commerce:PLAN_STRIPE_{suffix}",
        description_i18n_key=f"commerce:PLAN_STRIPE_DESCRIPTION_{suffix}",
        credit_grant_amount=100,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=now,
    )
    price = await CommercePlanRevisionPrice.create(
        plan_revision_id=revision.id,
        provider="stripe",
        provider_mode=BillingProviderMode.TEST,
        billing_cycle=BillingCycle.MONTHLY,
        currency="USD",
        amount_micros=9_000_000,
        external_price_id=f"price_stripe{suffix}",
    )
    previous_period_start = now - timedelta(days=60)
    previous_period_end = now - timedelta(days=30)
    next_period_start = previous_period_end
    next_period_end = now
    subscription = await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=previous_period_start,
        current_period_end=previous_period_end,
        billing_provider="stripe",
        provider_mode=BillingProviderMode.TEST,
    )
    account = await WorkspaceCreditAccount.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        plan_revision_id=revision.id,
        period_start=previous_period_start,
        period_end=previous_period_end,
        period_identity=f"bootstrap:{subscription.id}",
    )
    await WorkspaceCommercialAccess.create(
        workspace_id=workspace.id,
        subscription_id=subscription.id,
        state=CommercialAccessState.NORMAL,
        source_identity=f"bootstrap:{subscription.id}",
    )

    provider_subscription = {
        "id": f"sub_stripe{suffix}",
        "customer": f"cus_stripe{suffix}",
        "status": "active",
        "metadata": {
            "workspace_id": str(workspace.id),
            "plan_id": str(plan.id),
            "plan_revision_id": str(revision.id),
            "external_price_id": price.external_price_id,
            "billing_cycle": "monthly",
            "currency": "USD",
        },
        "items": {"data": [{"price": {"id": price.external_price_id, "currency": "usd"}}]},
        "current_period_start": int(next_period_start.timestamp()),
        "current_period_end": int(next_period_end.timestamp()),
        "cancel_at_period_end": False,
    }
    invoice_period_start = previous_period_start
    invoice_period_end = previous_period_end
    finalized_at = int(invoice_period_end.timestamp()) - 60
    invoice_id = f"in_stripe{suffix}"
    first_paid_at = int(invoice_period_end.timestamp()) - 30
    second_paid_at = int(invoice_period_end.timestamp())
    first_payment = _invoice_payment(
        invoice_id=invoice_id,
        payment_id=f"inpay_first{suffix}",
        amount_paid=400,
        paid_at=first_paid_at,
    )
    base_invoice = {
        "object": "invoice",
        "id": invoice_id,
        "subscription": provider_subscription["id"],
        "currency": "usd",
        "amount_due": 900,
        "period_start": int(invoice_period_start.timestamp()),
        "period_end": int(invoice_period_end.timestamp()),
        "created": finalized_at - 60,
        "billing_reason": "subscription_cycle",
        "hosted_invoice_url": f"https://invoice.stripe.test/{invoice_id}",
        "attempt_count": 1,
    }
    partial_timestamp = int(now.timestamp()) - 2
    partial_invoice = {
        **base_invoice,
        "status": "open",
        "amount_paid": 400,
        "payments": {"data": [first_payment], "has_more": False},
        "status_transitions": {"finalized_at": finalized_at},
    }
    partial_payload = _event_payload(
        event_id=f"evt_partial{suffix}",
        event_type="invoice_payment.paid",
        event_timestamp=partial_timestamp,
        event_object=first_payment,
    )
    webhook_secret = "whsec_stripe_payment_integration"

    def provider_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == f"/v1/invoices/{invoice_id}":
            assert request.url.params.get("expand[]") == "payments.data"
            return httpx.Response(200, json=partial_invoice)
        assert request.url.path == f"/v1/subscriptions/{provider_subscription['id']}"
        return httpx.Response(200, json=provider_subscription)

    connector = cast(
        BillingConnector,
        StripeBillingConnector(
            secret_key="sk_test_integration",
            webhook_secret=webhook_secret,
            api_base_url="https://stripe.test/v1",
            webhook_tolerance_seconds=300,
            client=httpx.AsyncClient(transport=httpx.MockTransport(provider_handler)),
        ),
    )
    settings = _settings(tmp_path, webhook_secret=webhook_secret)
    acceptance = BillingEventAcceptanceService(
        settings=settings,
        provider_name="stripe",
        connector_key="billing.stripe",
        connector_version="1.0.0",
        webhook_events=_WEBHOOK_EVENTS,
        connector=connector,
        repository=BillingEventInboxRepository(),
        jobs=BackgroundJobService(settings, event_publisher=None),
    )
    handler = BillingConnectorEventJobHandler(settings=settings, connectors=_registry(connector))

    partial = await acceptance.accept(
        payload=partial_payload,
        signature=_signature(partial_payload, timestamp=partial_timestamp, secret=webhook_secret),
    )
    partial_inbox = await ConnectorEventInbox.get(id=partial.inbox_id)
    partial_result = await handler.execute(context=_context(partial_inbox))
    partial_replayed = await handler.execute(context=_context(await ConnectorEventInbox.get(id=partial.inbox_id)))

    await subscription.refresh_from_db()
    await account.refresh_from_db()
    partial_application = await CommerceProviderEventApplication.get(provider_event_id=f"evt_partial{suffix}")
    invoice = await CommerceInvoice.get(external_invoice_id=invoice_id)
    assert partial_result == partial_replayed
    assert partial_application.result_code == "payment_projected"
    assert subscription.current_period_start == previous_period_start
    assert subscription.current_period_end == previous_period_end
    assert account.balance_credits == 0
    assert await CommercePlanPeriodGrant.all().count() == 0
    assert invoice.status == "open"
    assert invoice.amount_paid_micros == 4_000_000
    assert invoice.period_start == invoice_period_start
    assert invoice.period_end == invoice_period_end

    second_payment = _invoice_payment(
        invoice_id=invoice_id,
        payment_id=f"inpay_second{suffix}",
        amount_paid=500,
        paid_at=second_paid_at,
    )
    paid_timestamp = int(now.timestamp()) - 1
    paid_payload = _event_payload(
        event_id=f"evt_paid{suffix}",
        event_type="invoice.paid",
        event_timestamp=paid_timestamp,
        event_object={
            **base_invoice,
            "status": "paid",
            "amount_paid": 900,
            "payments": {"data": [first_payment, second_payment], "has_more": False},
            "status_transitions": {"finalized_at": finalized_at, "paid_at": second_paid_at},
        },
    )
    paid = await acceptance.accept(
        payload=paid_payload,
        signature=_signature(paid_payload, timestamp=paid_timestamp, secret=webhook_secret),
    )
    paid_inbox = await ConnectorEventInbox.get(id=paid.inbox_id)
    result = await handler.execute(context=_context(paid_inbox))
    replayed = await handler.execute(context=_context(await ConnectorEventInbox.get(id=paid.inbox_id)))

    await subscription.refresh_from_db()
    await account.refresh_from_db()
    await invoice.refresh_from_db()
    transactions = await CommerceTransaction.filter(invoice_id=invoice.id).order_by("external_transaction_id")
    assert result == replayed
    assert subscription.current_period_start == next_period_start
    assert subscription.current_period_end == next_period_end
    assert account.balance_credits == 100
    assert await CommercePlanPeriodGrant.all().count() == 1
    assert invoice.status == "paid"
    assert invoice.amount_paid_micros == 9_000_000
    assert [transaction.amount_micros for transaction in transactions] == [4_000_000, 5_000_000]
    assert await CommerceProviderPaymentProjection.all().count() == 2
    assert await CommerceProviderPaymentTransactionProjection.all().count() == 3
    assert await CommerceInvoice.all().count() == 1
    assert await CommerceTransaction.all().count() == 2
    assert await BackgroundJobRecord.all().count() == 2
