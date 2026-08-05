from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import BadRequest, Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import BillingProviderMode
from src.models.commerce.payments import (
    CommerceCheckoutKind,
    CommerceCheckoutSession,
    CommerceCheckoutStatus,
    CommerceCreditTopUpOffer,
    CommerceCreditTopUpOfferPrice,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.top_up_checkout_repository import (
    TopUpCheckoutCreate,
    TortoiseTopUpCheckoutRepository,
)
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def test_top_up_checkout_repository_serializes_replay_and_snapshots_offer_revision(db_schema) -> None:
    _ = db_schema
    owner = await User.create(
        username=f"top-up-{uuid4().hex[:12]}",
        email=f"top-up-{uuid4().hex[:12]}@example.com",
        display_name="Top-up Owner",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"top-up-{uuid4().hex}",
        name="Top-up checkout persistence",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Top-up checkout persistence",
        is_active=True,
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
    )
    await WorkspaceMembership.create(
        workspace_id=workspace.id,
        user_id=owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )
    offer = await CommerceCreditTopUpOffer.create(
        code=f"credits-{uuid4().hex[:8]}",
        credit_amount=2_000,
        name_i18n_key="commerce:TOP_UP_2000_NAME",
        description_i18n_key="commerce:TOP_UP_2000_DESCRIPTION",
        is_active=True,
        sort_order=10,
        revision=4,
    )
    price = await CommerceCreditTopUpOfferPrice.create(
        offer_id=offer.id,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        currency="USD",
        amount_micros=20_000_000,
        external_price_id=f"sim_price_{uuid4().hex}",
    )
    now = datetime.now(UTC)
    command = TopUpCheckoutCreate(
        workspace_id=workspace.id,
        top_up_offer_id=offer.id,
        top_up_offer_revision=offer.revision,
        credit_amount=offer.credit_amount,
        provider="simulated",
        provider_mode=BillingProviderMode.TEST,
        provider_account_id="platform",
        currency="USD",
        amount_micros=20_000_000,
        external_price_id=price.external_price_id,
        external_session_id=f"sim_top_up_{uuid4().hex}",
        checkout_url="https://app.example.test/?billingProvider=simulated",
        idempotency_key="arclayer:top-up-checkout:" + uuid4().hex,
        request_fingerprint=uuid4().hex + uuid4().hex,
        actor_user_id=owner.id,
        expires_at=now + timedelta(minutes=30),
    )
    repository = TortoiseTopUpCheckoutRepository()
    start = asyncio.Event()

    async def claim_checkout():
        await start.wait()
        async with in_transaction() as conn:
            await repository.lock_idempotency_scope(idempotency_key=command.idempotency_key, conn=conn)
            replay = await repository.require_replay(
                idempotency_key=command.idempotency_key,
                request_fingerprint=command.request_fingerprint,
                conn=conn,
            )
            if replay is not None:
                return replay
            return await repository.create_top_up_checkout(settings=get_settings(), command=command, conn=conn)

    tasks = [asyncio.create_task(claim_checkout()) for _ in range(2)]
    start.set()
    results = await asyncio.gather(*tasks)

    assert results[0].id == results[1].id
    checkout = await CommerceCheckoutSession.get(id=results[0].id)
    assert checkout.kind == CommerceCheckoutKind.TOP_UP
    assert checkout.status == CommerceCheckoutStatus.PENDING
    assert checkout.subscription_id is None
    assert checkout.target_plan_revision_id is None
    assert checkout.plan_code is None
    assert checkout.billing_cycle is None
    assert checkout.top_up_offer_id == offer.id
    assert checkout.top_up_offer_revision == 4
    assert checkout.credit_amount == 2_000
    assert checkout.provider == "simulated"
    assert checkout.provider_mode == BillingProviderMode.TEST
    assert checkout.provider_account_id == "platform"
    assert checkout.amount_micros == 20_000_000
    assert checkout.request_fingerprint == command.request_fingerprint
    assert checkout.revision == 1
    assert await CommerceCheckoutSession.filter(idempotency_key=command.idempotency_key).count() == 1
    assert await AuditEvent.filter(event_name="commerce.top_up_checkout.created", entity_id=checkout.id).count() == 1

    await CommerceCreditTopUpOffer.filter(id=offer.id).update(revision=5, credit_amount=2_500)
    await CommerceCreditTopUpOfferPrice.filter(id=price.id).update(
        amount_micros=25_000_000,
        external_price_id="sim_price_credits_2500",
    )
    async with in_transaction() as conn:
        replay = await repository.require_replay(
            idempotency_key=command.idempotency_key,
            request_fingerprint=command.request_fingerprint,
            conn=conn,
        )
    assert replay is not None
    assert replay.top_up_offer_revision == 4
    assert replay.credit_amount == 2_000
    assert replay.amount_micros == 20_000_000
    assert replay.external_price_id == command.external_price_id

    async with in_transaction() as conn:
        await repository.lock_idempotency_scope(idempotency_key=command.idempotency_key, conn=conn)
        with pytest.raises(Conflict) as captured:
            await repository.require_replay(
                idempotency_key=command.idempotency_key,
                request_fingerprint="f" * 64,
                conn=conn,
            )
    assert captured.value.error == "BILLING_TOP_UP_CHECKOUT_IDEMPOTENCY_CONFLICT"

    stale_command = command.model_copy(
        update={
            "idempotency_key": "arclayer:top-up-checkout:" + uuid4().hex,
            "request_fingerprint": uuid4().hex + uuid4().hex,
            "top_up_offer_revision": 3,
        }
    )
    async with in_transaction() as conn:
        with pytest.raises(Conflict) as stale:
            await repository.create_top_up_checkout(settings=get_settings(), command=stale_command, conn=conn)
    assert stale.value.error == "BILLING_TOP_UP_CHECKOUT_SELECTION_STALE"

    non_member = await User.create(
        username=f"top-up-non-member-{uuid4().hex[:8]}",
        email=f"top-up-non-member-{uuid4().hex[:8]}@example.com",
        display_name="Top-up Non-member",
    )
    non_member_command = command.model_copy(
        update={
            "actor_user_id": non_member.id,
            "idempotency_key": "arclayer:top-up-checkout:" + uuid4().hex,
            "request_fingerprint": uuid4().hex + uuid4().hex,
        }
    )
    async with in_transaction() as conn:
        with pytest.raises(BadRequest) as inactive_membership:
            await repository.create_top_up_checkout(settings=get_settings(), command=non_member_command, conn=conn)
    assert inactive_membership.value.error == "MEMBERSHIP_NOT_ACTIVE"
