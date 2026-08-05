from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.registries import ConnectorRegistry
from src.models.commerce.billing import (
    CommerceCreditAdjustmentReceipt,
    CommercePlan,
    CommercePlanRevision,
    CreditLedgerEntryType,
    CreditRefreshInterval,
    PlanRevisionStatus,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
)
from src.models.commerce.credit_allocation import (
    CreditGrantSource,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotMutation,
)
from src.models.organization.user import User
from src.models.workspaces.workspace import Workspace
from src.modules.commerce.platform_operations import PlatformCommerceOperationsService
from src.modules.commerce.platform_operations_schema import CreditAdjustmentRequest
from src.modules.commerce.service import build_commerce_service
from src.modules.organization.repository import OrganizationRepository

pytestmark = pytest.mark.integration


async def _create_selling_free_revision(*, credits: int = 100) -> CommercePlanRevision:
    plan = await CommercePlan.create(code="free", is_active=True, sort_order=10)
    return await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_FREE_NAME",
        description_i18n_key="commerce:PLAN_FREE_DESCRIPTION",
        credit_grant_amount=credits,
        credit_refresh_interval=CreditRefreshInterval.MONTHLY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )


async def _create_workspace(*, label: str) -> tuple[Workspace, User, WorkspaceCreditAccount]:
    suffix = uuid4().hex[:12]
    owner = await User.create(
        username=f"adjustment-{label}-{suffix}",
        email=f"adjustment-{label}-{suffix}@example.com",
        display_name=f"Adjustment {label}",
    )
    organization = await OrganizationRepository().create_organization(
        slug=f"adjustment-{label}-{suffix}",
        name=f"Adjustment {label}",
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name=f"Adjustment {label}",
        owner_user_id=owner.id,
        created_by_user_id=owner.id,
        is_active=True,
    )
    async with in_transaction() as conn:
        _, account, _ = await build_commerce_service(get_settings()).initialize_free_workspace_in_transaction(
            workspace_id=workspace.id,
            conn=conn,
        )
    return workspace, owner, account


def _request(
    *,
    delta: int,
    revision: int,
    key: str,
    expires_at: datetime | None,
) -> CreditAdjustmentRequest:
    return CreditAdjustmentRequest(
        delta_credits=delta,
        reason="Support correction",
        evidence_reference="case-42",
        expires_at=expires_at,
        expected_account_revision=revision,
        idempotency_key=key,
    )


async def test_adjustment_is_concurrent_replay_safe_and_workspace_scoped(db_schema) -> None:
    _ = db_schema
    await _create_selling_free_revision()
    workspace, owner, account = await _create_workspace(label="primary")
    other_workspace, other_owner, other_account = await _create_workspace(label="secondary")
    service = PlatformCommerceOperationsService(settings=get_settings(), connectors=ConnectorRegistry())
    expires_at = datetime.now(UTC) + timedelta(days=7)
    request = _request(delta=10, revision=int(account.revision), key="shared-adjustment-key", expires_at=expires_at)
    start = asyncio.Event()

    async def adjust():
        await start.wait()
        return await service.adjust_credits(
            workspace_id=workspace.id,
            request=request,
            actor_user_id=owner.id,
        )

    tasks = [asyncio.create_task(adjust()) for _ in range(2)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks)
    other_result = await service.adjust_credits(
        workspace_id=other_workspace.id,
        request=_request(
            delta=10,
            revision=int(other_account.revision),
            key="shared-adjustment-key",
            expires_at=expires_at,
        ),
        actor_user_id=other_owner.id,
    )

    assert results[0] == results[1]
    assert other_result.workspace_id == other_workspace.id
    assert await CommerceCreditAdjustmentReceipt.filter(workspace_id=workspace.id).count() == 1
    assert (
        await WorkspaceCreditLedger.filter(
            workspace_id=workspace.id,
            entry_type=CreditLedgerEntryType.ADJUSTMENT,
        ).count()
        == 1
    )
    primary_lot = await WorkspaceCreditGrantLot.get(
        workspace_id=workspace.id,
        source=CreditGrantSource.ADJUSTMENT,
    )
    other_lot = await WorkspaceCreditGrantLot.get(
        workspace_id=other_workspace.id,
        source=CreditGrantSource.ADJUSTMENT,
    )
    assert primary_lot.source_identity != other_lot.source_identity
    assert primary_lot.expires_at == expires_at
    assert other_lot.expires_at == expires_at


async def test_negative_adjustment_records_exact_mutations_and_skips_expired_lots(db_schema) -> None:
    _ = db_schema
    await _create_selling_free_revision()
    workspace, owner, account = await _create_workspace(label="depletion")
    plan_lot = await WorkspaceCreditGrantLot.get(account_id=account.id)
    now = datetime.now(UTC)
    lots = [
        await WorkspaceCreditGrantLot.create(
            workspace_id=workspace.id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            source=CreditGrantSource.PROMOTIONAL,
            source_identity=f"test:promotional:{uuid4()}",
            granted_credits=20,
            remaining_credits=20,
            reserved_credits=0,
            issued_at=now - timedelta(days=2),
            expires_at=now + timedelta(days=5),
            actor_user_id=owner.id,
            description_key="TEST_PROMOTIONAL",
        ),
        await WorkspaceCreditGrantLot.create(
            workspace_id=workspace.id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            source=CreditGrantSource.ADJUSTMENT,
            source_identity=f"test:adjustment:{uuid4()}",
            granted_credits=10,
            remaining_credits=10,
            reserved_credits=0,
            issued_at=now - timedelta(days=1),
            expires_at=now + timedelta(days=10),
            actor_user_id=owner.id,
            description_key="TEST_ADJUSTMENT",
        ),
        await WorkspaceCreditGrantLot.create(
            workspace_id=workspace.id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            source=CreditGrantSource.ADJUSTMENT,
            source_identity=f"test:expired:{uuid4()}",
            granted_credits=40,
            remaining_credits=40,
            reserved_credits=0,
            issued_at=now - timedelta(days=10),
            expires_at=now - timedelta(days=1),
            actor_user_id=owner.id,
            description_key="TEST_EXPIRED",
        ),
        await WorkspaceCreditGrantLot.create(
            workspace_id=workspace.id,
            account_id=account.id,
            subscription_id=account.subscription_id,
            plan_revision_id=account.plan_revision_id,
            source=CreditGrantSource.TOP_UP,
            source_identity=f"test:top-up:{uuid4()}",
            granted_credits=30,
            remaining_credits=30,
            reserved_credits=0,
            issued_at=now,
            expires_at=None,
            actor_user_id=owner.id,
            description_key="TEST_TOP_UP",
        ),
    ]
    account.balance_credits = int(plan_lot.remaining_credits) + sum(int(lot.remaining_credits) for lot in lots)
    await account.save(update_fields=["balance_credits", "updated_at"])
    service = PlatformCommerceOperationsService(settings=get_settings(), connectors=ConnectorRegistry())
    await service.adjust_credits(
        workspace_id=workspace.id,
        request=_request(
            delta=-25,
            revision=int(account.revision),
            key="negative-adjustment",
            expires_at=None,
        ),
        actor_user_id=owner.id,
    )

    promotional, adjustment, expired, top_up = [await WorkspaceCreditGrantLot.get(id=lot.id) for lot in lots]
    mutations = await WorkspaceCreditLotMutation.all().order_by("lot_id")
    assert adjustment.remaining_credits == 0
    assert promotional.remaining_credits == 5
    assert expired.remaining_credits == 40
    assert top_up.remaining_credits == 30
    assert plan_lot.remaining_credits == 100
    assert {(mutation.lot_id, int(mutation.delta_remaining_credits)) for mutation in mutations} == {
        (adjustment.id, -10),
        (promotional.id, -15),
    }
