from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.models.ai.ai_budget_reservation import AIBudgetReservation
from src.models.commerce.billing import ResourceLimitKind, WorkspaceCreditAccount
from src.models.commerce.credit_allocation import (
    CreditLotAllocationStatus,
    CreditUsageEventType,
    WorkspaceCreditGrantLot,
    WorkspaceCreditLotAllocation,
    WorkspaceCreditUsageEvent,
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
    WorkspaceMemberCreditUsagePeriod,
)
from src.models.workspaces.workspace import WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.commerce.credit_lot_ordering import credit_lot_depletion_key


class CreditMemberUnavailableError(Exception):
    def __init__(self, *, workspace_id: UUID, actor_user_id: UUID) -> None:
        self.workspace_id = workspace_id
        self.actor_user_id = actor_user_id
        super().__init__(f"User {actor_user_id} is not an active member of Workspace {workspace_id}")


class MemberCreditsExceededError(Exception):
    def __init__(self, *, membership_id: UUID, available: int, requested: int) -> None:
        self.membership_id = membership_id
        self.available = available
        self.requested = requested
        super().__init__(
            f"Workspace member {membership_id} credit limit exhausted: available={available}, requested={requested}"
        )


@dataclass(frozen=True, slots=True)
class CreditAllocationResult:
    membership_id: UUID
    reserved_credits: int


@dataclass(frozen=True, slots=True)
class CreditSettlementResult:
    reserved_credits: int
    committed_credits: int
    released_credits: int


async def _lock_active_membership(
    *, workspace_id: UUID, actor_user_id: UUID, conn: BaseDBAsyncClient
) -> WorkspaceMembership:
    membership = await (
        WorkspaceMembership
        .filter(
            workspace_id=workspace_id,
            user_id=actor_user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        .using_db(conn)
        .select_for_update()
        .first()
    )
    if membership is None:
        raise CreditMemberUnavailableError(workspace_id=workspace_id, actor_user_id=actor_user_id)
    return membership


async def _lock_member_usage(
    *,
    account: WorkspaceCreditAccount,
    membership_id: UUID,
    conn: BaseDBAsyncClient,
) -> tuple[WorkspaceMemberCreditUsagePeriod, int | None]:
    policy, _ = await WorkspaceMemberCreditPolicy.get_or_create(
        workspace_id=account.workspace_id,
        defaults={
            "default_limit_kind": ResourceLimitKind.UNLIMITED,
            "default_limit_credits": None,
            "revision": 1,
            "updated_by_user_id": None,
        },
        using_db=conn,
    )
    policy = await WorkspaceMemberCreditPolicy.filter(id=policy.id).using_db(conn).select_for_update().get()
    override = await (
        WorkspaceMemberCreditLimitOverride
        .filter(workspace_id=account.workspace_id, membership_id=membership_id)
        .using_db(conn)
        .select_for_update()
        .first()
    )
    usage, _ = await WorkspaceMemberCreditUsagePeriod.get_or_create(
        workspace_id=account.workspace_id,
        membership_id=membership_id,
        period_start=account.period_start,
        period_end=account.period_end,
        defaults={"reserved_credits": 0, "committed_credits": 0, "revision": 1},
        using_db=conn,
    )
    usage = await WorkspaceMemberCreditUsagePeriod.filter(id=usage.id).using_db(conn).select_for_update().get()
    limit_kind = policy.default_limit_kind if override is None else override.limit_kind
    limit_credits = policy.default_limit_credits if override is None else override.limit_credits
    return usage, None if limit_kind is ResourceLimitKind.UNLIMITED else int(limit_credits or 0)


def _assert_member_capacity(
    *, usage: WorkspaceMemberCreditUsagePeriod, limit_credits: int | None, requested: int
) -> None:
    if limit_credits is None:
        return
    consumed = int(usage.reserved_credits) + int(usage.committed_credits)
    available = max(limit_credits - consumed, 0)
    if available < requested:
        raise MemberCreditsExceededError(
            membership_id=UUID(str(usage.membership_id)),
            available=available,
            requested=requested,
        )


async def _lock_lots(*, account_id: UUID, conn: BaseDBAsyncClient) -> list[WorkspaceCreditGrantLot]:
    now = datetime.now(UTC)
    lots = await (
        WorkspaceCreditGrantLot
        .filter(
            Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            account_id=account_id,
            remaining_credits__gt=0,
        )
        .using_db(conn)
        .select_for_update()
        .all()
    )
    return sorted(lots, key=credit_lot_depletion_key)


async def _reserve_lots(
    *,
    reservation: AIBudgetReservation,
    lots: list[WorkspaceCreditGrantLot],
    requested: int,
    conn: BaseDBAsyncClient,
) -> None:
    remaining = requested
    existing = {
        UUID(str(row.lot_id)): row
        for row in await WorkspaceCreditLotAllocation.filter(reservation_id=reservation.id).using_db(conn).all()
    }
    for lot in lots:
        available = max(int(lot.remaining_credits) - int(lot.reserved_credits), 0)
        allocated = min(available, remaining)
        if allocated == 0:
            continue
        allocation = existing.get(UUID(str(lot.id)))
        if allocation is None:
            await WorkspaceCreditLotAllocation.create(
                lot_id=lot.id,
                reservation_id=reservation.id,
                request_id=reservation.request_id,
                reserved_credits=allocated,
                using_db=conn,
            )
        else:
            allocation.reserved_credits += allocated
            await allocation.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        lot.reserved_credits += allocated
        await lot.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        remaining -= allocated
        if remaining == 0:
            return
    raise RuntimeError("Credit account balance is not backed by sufficient source-attributed grant lots")


async def _expand_reservation_lots(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    actual_credits: int,
    conn: BaseDBAsyncClient,
) -> int:
    reserved = int(reservation.reserved_credits or 0)
    if actual_credits <= reserved:
        return reserved
    additional = actual_credits - reserved
    await _reserve_lots(
        reservation=reservation,
        lots=await _lock_lots(account_id=UUID(str(account.id)), conn=conn),
        requested=additional,
        conn=conn,
    )
    account.reserved_credits += additional
    reservation.reserved_credits = actual_credits
    await reservation.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
    return actual_credits


async def _settle_lot_allocations(
    *,
    reservation: AIBudgetReservation,
    actual_credits: int,
    conn: BaseDBAsyncClient,
) -> tuple[int, int]:
    reserved = int(reservation.reserved_credits or 0)
    allocation_lots = await _lock_reservation_allocations(reservation=reservation, conn=conn)
    remaining_commit = actual_credits
    for allocation, lot in allocation_lots:
        committed = min(int(allocation.reserved_credits), remaining_commit)
        released = int(allocation.reserved_credits) - committed
        lot.reserved_credits -= int(allocation.reserved_credits)
        lot.remaining_credits -= committed
        allocation.committed_credits = committed
        allocation.released_credits = released
        allocation.status = CreditLotAllocationStatus.SETTLED
        await lot.save(using_db=conn, update_fields=["remaining_credits", "reserved_credits", "updated_at"])
        await allocation.save(
            using_db=conn,
            update_fields=["committed_credits", "released_credits", "status", "updated_at"],
        )
        remaining_commit -= committed
    if remaining_commit != 0:
        raise RuntimeError("Credit reservation allocations do not cover the committed amount")
    return reserved, reserved - actual_credits


async def _lock_reservation_allocations(
    *, reservation: AIBudgetReservation, conn: BaseDBAsyncClient
) -> list[tuple[WorkspaceCreditLotAllocation, WorkspaceCreditGrantLot]]:
    allocations = await (
        WorkspaceCreditLotAllocation
        .filter(reservation_id=reservation.id, status=CreditLotAllocationStatus.RESERVED)
        .using_db(conn)
        .select_for_update()
        .all()
    )
    lot_ids = [allocation.lot_id for allocation in allocations]
    lots = await WorkspaceCreditGrantLot.filter(id__in=lot_ids).using_db(conn).select_for_update().all()
    lots_by_id = {UUID(str(lot.id)): lot for lot in lots}
    if len(lots_by_id) != len(set(lot_ids)):
        raise RuntimeError("Credit reservation allocation references a missing grant lot")
    result = [(allocation, lots_by_id[UUID(str(allocation.lot_id))]) for allocation in allocations]
    result.sort(key=lambda row: credit_lot_depletion_key(row[1]))
    return result


async def _release_lot_allocations(*, reservation: AIBudgetReservation, conn: BaseDBAsyncClient) -> int:
    released = 0
    for allocation, lot in await _lock_reservation_allocations(reservation=reservation, conn=conn):
        amount = int(allocation.reserved_credits)
        allocation.released_credits = amount
        allocation.status = CreditLotAllocationStatus.SETTLED
        lot.reserved_credits -= amount
        await lot.save(using_db=conn, update_fields=["reserved_credits", "updated_at"])
        await allocation.save(using_db=conn, update_fields=["released_credits", "status", "updated_at"])
        released += amount
    expected = int(reservation.reserved_credits or 0)
    if released != expected:
        raise RuntimeError("Credit reservation allocations do not match the reserved amount")
    return released


async def reserve_member_credits(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    workspace_id: UUID,
    actor_user_id: UUID,
    project_id: UUID | None,
    agent_run_id: UUID | None,
    capability_key: str,
    requested: int,
    estimated_cost_micros: int,
    conn: BaseDBAsyncClient,
) -> CreditAllocationResult:
    membership = await _lock_active_membership(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        conn=conn,
    )
    membership_id = UUID(str(membership.id))
    usage, limit_credits = await _lock_member_usage(account=account, membership_id=membership_id, conn=conn)
    _assert_member_capacity(usage=usage, limit_credits=limit_credits, requested=requested)
    await _reserve_lots(
        reservation=reservation,
        lots=await _lock_lots(account_id=UUID(str(account.id)), conn=conn),
        requested=requested,
        conn=conn,
    )
    usage.reserved_credits += requested
    usage.revision += 1
    await usage.save(using_db=conn, update_fields=["reserved_credits", "revision", "updated_at"])
    await WorkspaceCreditUsageEvent.create(
        workspace_id=workspace_id,
        membership_id=membership_id,
        actor_user_id=actor_user_id,
        account_id=account.id,
        reservation_id=reservation.id,
        request_id=reservation.request_id,
        event_type=CreditUsageEventType.RESERVED,
        credits=requested,
        cost_micros=estimated_cost_micros,
        project_id=project_id,
        agent_run_id=agent_run_id,
        capability_key=capability_key,
        occurred_at=datetime.now(UTC),
        using_db=conn,
    )
    return CreditAllocationResult(membership_id=membership_id, reserved_credits=requested)


async def settle_member_credits(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    actual_credits: int,
    actual_cost_micros: int,
    conn: BaseDBAsyncClient,
) -> CreditSettlementResult:
    membership_id = reservation.workspace_membership_id
    actor_user_id = reservation.actor_user_id
    capability_key = reservation.capability_key
    if membership_id is None or actor_user_id is None or capability_key is None:
        raise RuntimeError("Credit reservation is missing member attribution")
    usage, limit_credits = await _lock_member_usage(
        account=account,
        membership_id=UUID(str(membership_id)),
        conn=conn,
    )
    reserved = int(reservation.reserved_credits or 0)
    if actual_credits > reserved:
        additional = actual_credits - reserved
        _assert_member_capacity(usage=usage, limit_credits=limit_credits, requested=additional)
        usage.reserved_credits += additional
    reserved = await _expand_reservation_lots(
        reservation=reservation,
        account=account,
        actual_credits=actual_credits,
        conn=conn,
    )
    reserved, released = await _settle_lot_allocations(
        reservation=reservation,
        actual_credits=actual_credits,
        conn=conn,
    )
    usage.reserved_credits -= reserved
    usage.committed_credits += actual_credits
    usage.revision += 1
    await usage.save(
        using_db=conn,
        update_fields=["reserved_credits", "committed_credits", "revision", "updated_at"],
    )
    await _write_settlement_events(
        reservation=reservation,
        account=account,
        actor_user_id=UUID(str(actor_user_id)),
        membership_id=UUID(str(membership_id)),
        actual_credits=actual_credits,
        released_credits=released,
        actual_cost_micros=actual_cost_micros,
        conn=conn,
    )
    return CreditSettlementResult(
        reserved_credits=reserved,
        committed_credits=actual_credits,
        released_credits=released,
    )


async def settle_legacy_unattributed_credits(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    actual_credits: int,
    conn: BaseDBAsyncClient,
) -> CreditSettlementResult:
    if reservation.credit_attribution_version != 0:
        raise RuntimeError("Legacy Credit settlement requires attribution version 0")
    await _expand_reservation_lots(
        reservation=reservation,
        account=account,
        actual_credits=actual_credits,
        conn=conn,
    )
    reserved, released = await _settle_lot_allocations(
        reservation=reservation,
        actual_credits=actual_credits,
        conn=conn,
    )
    return CreditSettlementResult(
        reserved_credits=reserved,
        committed_credits=actual_credits,
        released_credits=released,
    )


async def _write_settlement_events(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    actor_user_id: UUID,
    membership_id: UUID,
    actual_credits: int,
    released_credits: int,
    actual_cost_micros: int,
    conn: BaseDBAsyncClient,
) -> None:
    common = {
        "workspace_id": account.workspace_id,
        "membership_id": membership_id,
        "actor_user_id": actor_user_id,
        "account_id": account.id,
        "reservation_id": reservation.id,
        "request_id": reservation.request_id,
        "project_id": reservation.project_id,
        "agent_run_id": reservation.agent_run_id,
        "capability_key": reservation.capability_key,
        "occurred_at": datetime.now(UTC),
        "using_db": conn,
    }
    await WorkspaceCreditUsageEvent.create(
        event_type=CreditUsageEventType.COMMITTED,
        credits=actual_credits,
        cost_micros=actual_cost_micros,
        **common,
    )
    if released_credits > 0:
        await WorkspaceCreditUsageEvent.create(
            event_type=CreditUsageEventType.RELEASED,
            credits=released_credits,
            cost_micros=None,
            **common,
        )


async def release_member_credits(
    *,
    reservation: AIBudgetReservation,
    account: WorkspaceCreditAccount,
    conn: BaseDBAsyncClient,
) -> int:
    membership_id = reservation.workspace_membership_id
    actor_user_id = reservation.actor_user_id
    capability_key = reservation.capability_key
    if membership_id is None or actor_user_id is None or capability_key is None:
        raise RuntimeError("Credit reservation is missing member attribution")
    usage, _ = await _lock_member_usage(
        account=account,
        membership_id=UUID(str(membership_id)),
        conn=conn,
    )
    released = await _release_lot_allocations(reservation=reservation, conn=conn)
    usage.reserved_credits -= released
    usage.revision += 1
    await usage.save(using_db=conn, update_fields=["reserved_credits", "revision", "updated_at"])
    await WorkspaceCreditUsageEvent.create(
        workspace_id=account.workspace_id,
        membership_id=membership_id,
        actor_user_id=actor_user_id,
        account_id=account.id,
        reservation_id=reservation.id,
        request_id=reservation.request_id,
        event_type=CreditUsageEventType.RELEASED,
        credits=released,
        cost_micros=None,
        project_id=reservation.project_id,
        agent_run_id=reservation.agent_run_id,
        capability_key=capability_key,
        occurred_at=datetime.now(UTC),
        using_db=conn,
    )
    return released


async def release_legacy_unattributed_credits(*, reservation: AIBudgetReservation, conn: BaseDBAsyncClient) -> int:
    if reservation.credit_attribution_version != 0:
        raise RuntimeError("Legacy Credit release requires attribution version 0")
    return await _release_lot_allocations(reservation=reservation, conn=conn)
