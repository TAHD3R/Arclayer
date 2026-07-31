from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from tortoise.transactions import in_transaction

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.analytics.audit_event import AuditEvent
from src.models.commerce.billing import (
    BillingCycle,
    CommercePlan,
    CommercePlanRevision,
    CreditRefreshInterval,
    PlanRevisionStatus,
    SubscriptionStatus,
    WorkspaceSubscription,
)
from src.models.organization.organization import Organization
from src.models.projects.membership import ProjectMemberRole, ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.commerce.service import build_commerce_service
from src.modules.workspaces.ownership_service import WorkspaceOwnershipService
from src.modules.workspaces.schema import WorkspaceOwnershipTransferRequest

pytestmark = pytest.mark.integration


async def _create_user(label: str):
    settings = get_settings()
    suffix = uuid4().hex[:8]
    return await UserRepository().create_user(
        username=f"{label}_{suffix}",
        email=f"{label}_{suffix}@example.com",
        display_name=label,
        password_hash=hash_password("owner_pass_123", settings.auth),
    )


async def _create_free_revision() -> CommercePlanRevision:
    plan = await CommercePlan.create(code="free", is_active=True, sort_order=10)
    return await CommercePlanRevision.create(
        plan_id=plan.id,
        sequence=1,
        status=PlanRevisionStatus.PUBLISHED,
        name_i18n_key="commerce:PLAN_FREE_NAME",
        description_i18n_key="commerce:PLAN_FREE_DESCRIPTION",
        credit_grant_amount=70,
        credit_refresh_interval=CreditRefreshInterval.DAILY,
        credit_value_micros=1_000,
        currency="USD",
        content_hash=uuid4().hex,
        published_at=datetime.now(UTC),
        is_selling=True,
    )


async def test_owner_transfers_free_workspace_to_eligible_active_member(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    previous_owner = await _create_user("Previous Owner")
    next_owner = await _create_user("Next Owner")
    stale_project_owner = await _create_user("Stale Project Owner")
    organization = await Organization.create(
        slug=f"org-{uuid4().hex}",
        name="Ownership Transfer Org",
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        owner_user_id=previous_owner.id,
        created_by_user_id=previous_owner.id,
        name="Transfer Workspace",
    )
    for user in (previous_owner, next_owner):
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=user.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=f"transfer-project-{uuid4().hex[:8]}",
        name="Transfer Project",
        created_by_user_id=previous_owner.id,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=previous_owner.id,
        role=ProjectMemberRole.OWNER,
        created_by_user_id=previous_owner.id,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=next_owner.id,
        role=ProjectMemberRole.VIEWER,
        created_by_user_id=previous_owner.id,
    )
    await ProjectMembership.create(
        project_id=project.id,
        user_id=stale_project_owner.id,
        role=ProjectMemberRole.OWNER,
        created_by_user_id=previous_owner.id,
    )
    plan_revision = await _create_free_revision()
    now = datetime.now(UTC)
    await WorkspaceSubscription.create(
        workspace_id=workspace.id,
        plan_revision_id=plan_revision.id,
        status=SubscriptionStatus.ACTIVE,
        billing_cycle=BillingCycle.MONTHLY,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
        billing_provider="local",
    )

    result = await WorkspaceOwnershipService(settings).transfer(
        workspace_id=workspace.id,
        actor_user_id=previous_owner.id,
        payload=WorkspaceOwnershipTransferRequest(next_owner_user_id=next_owner.id),
        idempotency_key="transfer-owner-1",
    )

    await workspace.refresh_from_db()
    assert workspace.owner_user_id == next_owner.id
    assert result.previous_owner_user_id == previous_owner.id
    assert result.next_owner_user_id == next_owner.id
    project_owner_bindings = await ProjectMembership.filter(
        project_id=project.id,
        role=ProjectMemberRole.OWNER,
    ).all()
    assert [binding.user_id for binding in project_owner_bindings] == [next_owner.id]
    event = await AuditEvent.get(event_name="workspace.ownership.transferred", workspace_id=workspace.id)
    assert event.actor_user_id == previous_owner.id
    assert event.properties["previousOwnerUserId"] == str(previous_owner.id)
    assert event.properties["nextOwnerUserId"] == str(next_owner.id)

    replay = await WorkspaceOwnershipService(settings).transfer(
        workspace_id=workspace.id,
        actor_user_id=previous_owner.id,
        payload=WorkspaceOwnershipTransferRequest(next_owner_user_id=next_owner.id),
        idempotency_key="transfer-owner-1",
    )
    assert replay == result
    assert await AuditEvent.filter(event_name="workspace.ownership.transferred", workspace_id=workspace.id).count() == 1


async def test_owner_cannot_transfer_free_workspace_to_member_who_already_owns_one(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    previous_owner = await _create_user("Allowance Previous Owner")
    target_owner = await _create_user("Allowance Target Owner")
    organization = await Organization.create(
        slug=f"org-{uuid4().hex}",
        name="Transfer Allowance Org",
        is_active=True,
    )
    plan_revision = await _create_free_revision()
    now = datetime.now(UTC)
    existing_workspace = await Workspace.create(
        organization_id=organization.id,
        owner_user_id=target_owner.id,
        created_by_user_id=target_owner.id,
        name="Existing Free Workspace",
    )
    transfer_workspace = await Workspace.create(
        organization_id=organization.id,
        owner_user_id=previous_owner.id,
        created_by_user_id=previous_owner.id,
        name="Transfer Free Workspace",
    )
    for workspace, owner in ((existing_workspace, target_owner), (transfer_workspace, previous_owner)):
        await WorkspaceMembership.create(
            workspace_id=workspace.id,
            user_id=owner.id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        await WorkspaceSubscription.create(
            workspace_id=workspace.id,
            plan_revision_id=plan_revision.id,
            status=SubscriptionStatus.ACTIVE,
            billing_cycle=BillingCycle.MONTHLY,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            billing_provider="local",
        )
    await WorkspaceMembership.create(
        workspace_id=transfer_workspace.id,
        user_id=target_owner.id,
        status=WorkspaceMembershipStatus.ACTIVE,
    )

    with pytest.raises(Conflict) as exc_info:
        await WorkspaceOwnershipService(get_settings()).transfer(
            workspace_id=transfer_workspace.id,
            actor_user_id=previous_owner.id,
            payload=WorkspaceOwnershipTransferRequest(next_owner_user_id=target_owner.id),
            idempotency_key="transfer-owner-allowance-exhausted",
        )

    assert exc_info.value.error == "FREE_WORKSPACE_ALLOWANCE_EXHAUSTED"
    await transfer_workspace.refresh_from_db()
    assert transfer_workspace.owner_user_id == previous_owner.id
    assert not await AuditEvent.filter(
        event_name="workspace.ownership.transferred",
        workspace_id=transfer_workspace.id,
    ).exists()


async def test_concurrent_free_workspace_initialization_allows_only_one_owned_workspace(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    owner = await _create_user("Concurrent Free Owner")
    organization = await Organization.create(
        slug=f"org-{uuid4().hex}",
        name="Concurrent Free Workspace Org",
        is_active=True,
    )
    commerce = build_commerce_service(get_settings())
    await _create_free_revision()
    start = asyncio.Event()
    ready = asyncio.Barrier(2)

    async def initialize(index: int):
        await start.wait()
        async with in_transaction() as conn:
            workspace = await Workspace.create(
                using_db=conn,
                organization_id=organization.id,
                owner_user_id=owner.id,
                created_by_user_id=owner.id,
                name=f"Concurrent Free Workspace {index}",
            )
            await ready.wait()
            subscription = await commerce.initialize_free_workspace_in_transaction(
                workspace_id=workspace.id,
                conn=conn,
            )
            return workspace.id, subscription

    tasks = [asyncio.create_task(initialize(index)) for index in range(2)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)

    assert sum(not isinstance(result, BaseException) for result in results) == 1, results
    conflicts = [result for result in results if isinstance(result, Conflict)]
    assert len(conflicts) == 1
    assert conflicts[0].error == "FREE_WORKSPACE_ALLOWANCE_EXHAUSTED"
    assert await Workspace.filter(owner_user_id=owner.id, deleted_at__isnull=True).count() == 1
    assert await WorkspaceSubscription.filter(workspace__owner_user_id=owner.id).count() == 1


async def test_concurrent_free_workspace_transfers_to_same_owner_allow_only_one(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    target_owner = await _create_user("Concurrent Transfer Target")
    previous_owners = [await _create_user(f"Concurrent Previous Owner {index}") for index in range(2)]
    organization = await Organization.create(
        slug=f"org-{uuid4().hex}",
        name="Concurrent Transfer Org",
        is_active=True,
    )
    plan_revision = await _create_free_revision()
    now = datetime.now(UTC)
    workspaces: list[Workspace] = []
    for index, previous_owner in enumerate(previous_owners):
        workspace = await Workspace.create(
            organization_id=organization.id,
            owner_user_id=previous_owner.id,
            created_by_user_id=previous_owner.id,
            name=f"Concurrent Transfer Workspace {index}",
        )
        workspaces.append(workspace)
        for user in (previous_owner, target_owner):
            await WorkspaceMembership.create(
                workspace_id=workspace.id,
                user_id=user.id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
        await WorkspaceSubscription.create(
            workspace_id=workspace.id,
            plan_revision_id=plan_revision.id,
            status=SubscriptionStatus.ACTIVE,
            billing_cycle=BillingCycle.MONTHLY,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            billing_provider="local",
        )

    start = asyncio.Event()

    async def transfer(index: int):
        await start.wait()
        return await WorkspaceOwnershipService(settings).transfer(
            workspace_id=workspaces[index].id,
            actor_user_id=previous_owners[index].id,
            payload=WorkspaceOwnershipTransferRequest(next_owner_user_id=target_owner.id),
            idempotency_key=f"concurrent-transfer-{index}",
        )

    tasks = [asyncio.create_task(transfer(index)) for index in range(2)]
    await asyncio.sleep(0)
    start.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)

    assert sum(not isinstance(result, BaseException) for result in results) == 1
    conflicts = [result for result in results if isinstance(result, Conflict)]
    assert len(conflicts) == 1
    assert conflicts[0].error == "FREE_WORKSPACE_ALLOWANCE_EXHAUSTED"
    assert await Workspace.filter(owner_user_id=target_owner.id, deleted_at__isnull=True).count() == 1
    assert await AuditEvent.filter(event_name="workspace.ownership.transferred").count() == 1
