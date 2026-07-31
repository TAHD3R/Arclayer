from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import get_settings
from src.core.exceptions import APIError, BadRequest, Conflict, Forbidden
from src.modules.commerce.feature_access.contracts import (
    FEATURE_ACCESS_MANAGE_PERMISSION,
    ActiveFeatureAccessMembership,
    AssignFeatureAccessCommand,
    CommercialAccessState,
    FeatureAccessActor,
    FeatureAccessAllocationState,
    FeatureAccessCommercialSnapshot,
    FeatureAccessEntitlement,
    FeatureAccessMembershipRelease,
    FeatureAccessMutationResult,
    FeatureAccessWriteConflict,
    LimitedFeatureAccessCapacity,
    MoveFeatureAccessCommand,
    RevokeFeatureAccessCommand,
    UnlimitedFeatureAccessCapacity,
)
from src.modules.commerce.feature_access.service import (
    FeatureAccessMembershipReleaseParticipant,
    FeatureAccessService,
)


class _FeatureAccessService(FeatureAccessService):
    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        yield conn or cast(BaseDBAsyncClient, object())


class _CommercialAuthority:
    def __init__(self, snapshot: FeatureAccessCommercialSnapshot | object | None) -> None:
        self.snapshot = snapshot

    async def resolve_feature_access(
        self,
        *,
        workspace_id: UUID,
        entitlement_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessCommercialSnapshot | None:
        _ = workspace_id, entitlement_key, conn
        return cast(FeatureAccessCommercialSnapshot | None, self.snapshot)


class _ActorAuthority:
    def __init__(self, actor: FeatureAccessActor) -> None:
        self.actor = actor

    async def resolve_actor(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessActor | None:
        _ = workspace_id, actor_user_id, conn
        return self.actor


class _MembershipAuthority:
    def __init__(self, memberships: tuple[ActiveFeatureAccessMembership, ...]) -> None:
        self.memberships = {membership.membership_id: membership for membership in memberships}

    async def require_active_membership(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ActiveFeatureAccessMembership | None:
        _ = conn
        membership = self.memberships.get(membership_id)
        if membership is None or membership.workspace_id != workspace_id:
            return None
        return membership


class _Persistence:
    def __init__(self) -> None:
        self.revision = 0
        self.assignments: set[UUID] = set()
        self.idempotency: dict[str, tuple[str, FeatureAccessMutationResult]] = {}
        self.lock = asyncio.Lock()
        self.release_calls: list[tuple[UUID, UUID, str]] = []

    async def assign_serialized(
        self,
        *,
        command: AssignFeatureAccessCommand,
        capacity: LimitedFeatureAccessCapacity | UnlimitedFeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        _ = conn
        async with self.lock:
            replay = self._replay(command.idempotency_key, fingerprint)
            if replay is not None:
                return replay
            self._require_revision(command.expected_revision, command.workspace_id, command.entitlement_key, capacity)
            if command.membership_id in self.assignments:
                self._raise("already_assigned", command.workspace_id, command.entitlement_key, capacity)
            if isinstance(capacity, LimitedFeatureAccessCapacity) and len(self.assignments) >= capacity.limit:
                self._raise("capacity_exhausted", command.workspace_id, command.entitlement_key, capacity)
            self.assignments.add(command.membership_id)
            return self._record("assign", command, capacity, fingerprint)

    async def revoke_serialized(
        self,
        *,
        command: RevokeFeatureAccessCommand,
        capacity: LimitedFeatureAccessCapacity | UnlimitedFeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        _ = conn
        async with self.lock:
            replay = self._replay(command.idempotency_key, fingerprint)
            if replay is not None:
                return replay
            self._require_revision(command.expected_revision, command.workspace_id, command.entitlement_key, capacity)
            if command.membership_id not in self.assignments:
                self._raise("not_assigned", command.workspace_id, command.entitlement_key, capacity)
            self.assignments.remove(command.membership_id)
            return self._record("revoke", command, capacity, fingerprint)

    async def move_serialized(
        self,
        *,
        command: MoveFeatureAccessCommand,
        capacity: LimitedFeatureAccessCapacity | UnlimitedFeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        _ = conn
        async with self.lock:
            replay = self._replay(command.idempotency_key, fingerprint)
            if replay is not None:
                return replay
            self._require_revision(command.expected_revision, command.workspace_id, command.entitlement_key, capacity)
            if command.source_membership_id not in self.assignments:
                self._raise("not_assigned", command.workspace_id, command.entitlement_key, capacity)
            if command.target_membership_id in self.assignments:
                self._raise("already_assigned", command.workspace_id, command.entitlement_key, capacity)
            self.assignments.remove(command.source_membership_id)
            self.assignments.add(command.target_membership_id)
            return self._record("move", command, capacity, fingerprint)

    async def release_membership_assignments(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        lifecycle_idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMembershipRelease:
        _ = conn
        self.release_calls.append((workspace_id, membership_id, lifecycle_idempotency_key))
        released = int(membership_id in self.assignments)
        self.assignments.discard(membership_id)
        if released:
            self.revision += 1
        return FeatureAccessMembershipRelease(
            workspace_id=workspace_id,
            membership_id=membership_id,
            released_assignment_count=released,
        )

    def _record(self, operation, command, capacity, fingerprint) -> FeatureAccessMutationResult:
        self.revision += 1
        result = FeatureAccessMutationResult(
            operation=operation,
            state=self._state(command.workspace_id, command.entitlement_key, capacity),
            replayed=False,
        )
        self.idempotency[command.idempotency_key] = (fingerprint, result)
        return result

    def _replay(self, key: str, fingerprint: str) -> FeatureAccessMutationResult | None:
        existing = self.idempotency.get(key)
        if existing is None:
            return None
        stored_fingerprint, result = existing
        if stored_fingerprint != fingerprint:
            raise FeatureAccessWriteConflict("idempotency_conflict", result.state)
        return result.model_copy(update={"replayed": True})

    def _require_revision(self, expected: int, workspace_id: UUID, entitlement_key: str, capacity) -> None:
        if expected != self.revision:
            self._raise("revision_conflict", workspace_id, entitlement_key, capacity)

    def _raise(self, code, workspace_id: UUID, entitlement_key: str, capacity) -> None:
        raise FeatureAccessWriteConflict(code, self._state(workspace_id, entitlement_key, capacity))

    def _state(self, workspace_id: UUID, entitlement_key: str, capacity) -> FeatureAccessAllocationState:
        return FeatureAccessAllocationState(
            workspace_id=workspace_id,
            entitlement_key=entitlement_key,
            revision=self.revision,
            capacity=capacity,
            assigned_membership_ids=tuple(self.assignments),
        )


class _Harness:
    def __init__(
        self,
        *,
        capacity: LimitedFeatureAccessCapacity | UnlimitedFeatureAccessCapacity | None = None,
        commercial_access_state: CommercialAccessState = "normal",
        role_management_included: bool = True,
        actor: FeatureAccessActor | None = None,
        snapshot: FeatureAccessCommercialSnapshot | object | None = None,
    ) -> None:
        self.workspace_id = uuid4()
        self.owner_user_id = uuid4()
        self.actor_user_id = actor.user_id if actor is not None else self.owner_user_id
        self.memberships = tuple(
            ActiveFeatureAccessMembership(
                workspace_id=self.workspace_id,
                membership_id=uuid4(),
                user_id=uuid4(),
            )
            for _ in range(3)
        )
        self.capacity = capacity or LimitedFeatureAccessCapacity(limit=1)
        resolved_snapshot = snapshot
        if resolved_snapshot is None:
            resolved_snapshot = FeatureAccessCommercialSnapshot(
                workspace_id=self.workspace_id,
                subscription_revision=1,
                subscription_active=True,
                role_management_included=role_management_included,
                commercial_access_state=commercial_access_state,
                entitlement=FeatureAccessEntitlement(
                    key="agents.member-access",
                    included=True,
                    allocation_mode="member_seat",
                    capacity=self.capacity,
                ),
            )
        self.snapshot = resolved_snapshot
        self.actor = actor or FeatureAccessActor(
            user_id=self.owner_user_id,
            active_member=True,
            is_workspace_owner=True,
            workspace_permissions=(),
        )
        self.persistence = _Persistence()
        self.service = _FeatureAccessService(
            get_settings(),
            persistence=self.persistence,
            commercial_authority=_CommercialAuthority(self.snapshot),
            actor_authority=_ActorAuthority(self.actor),
            membership_authority=_MembershipAuthority(self.memberships),
        )

    def assign(self, membership_id: UUID, *, revision: int = 0, key: str = "assign-1"):
        return self.service.assign(
            AssignFeatureAccessCommand(
                workspace_id=self.workspace_id,
                actor_user_id=self.actor_user_id,
                membership_id=membership_id,
                entitlement_key="agents.member-access",
                expected_revision=revision,
                idempotency_key=key,
            )
        )


async def test_owner_assigns_active_member_without_role_derived_authority() -> None:
    harness = _Harness(role_management_included=False)

    result = await harness.assign(harness.memberships[0].membership_id)

    assert result.state.assigned_membership_ids == (harness.memberships[0].membership_id,)
    assert harness.actor.workspace_permissions == ()


async def test_non_owner_requires_exact_permission_and_role_management_entitlement() -> None:
    actor = FeatureAccessActor(
        user_id=uuid4(),
        active_member=True,
        is_workspace_owner=False,
        workspace_permissions=("workspace:members:manage",),
    )
    harness = _Harness(actor=actor)

    with pytest.raises(Forbidden) as exc:
        await harness.assign(harness.memberships[0].membership_id)

    assert exc.value.error == "WORKSPACE_FEATURE_ACCESS_MANAGE_REQUIRED"

    authorized = FeatureAccessActor(
        user_id=actor.user_id,
        active_member=True,
        is_workspace_owner=False,
        workspace_permissions=(FEATURE_ACCESS_MANAGE_PERMISSION,),
    )
    without_roles = _Harness(actor=authorized, role_management_included=False)
    with pytest.raises(Forbidden) as roles_exc:
        await without_roles.assign(without_roles.memberships[0].membership_id)
    assert roles_exc.value.error == "WORKSPACE_FEATURE_ACCESS_MANAGE_REQUIRED"


async def test_non_owner_exact_permission_may_self_assign_without_receiving_feature_permission() -> None:
    actor_user_id = uuid4()
    actor = FeatureAccessActor(
        user_id=actor_user_id,
        active_member=True,
        is_workspace_owner=False,
        workspace_permissions=(FEATURE_ACCESS_MANAGE_PERMISSION,),
    )
    harness = _Harness(actor=actor)
    actor_membership = harness.memberships[0].model_copy(update={"user_id": actor_user_id})
    harness.service = _FeatureAccessService(
        get_settings(),
        persistence=harness.persistence,
        commercial_authority=_CommercialAuthority(harness.snapshot),
        actor_authority=_ActorAuthority(actor),
        membership_authority=_MembershipAuthority((actor_membership, *harness.memberships[1:])),
    )

    result = await harness.assign(actor_membership.membership_id)

    assert result.state.assigned_membership_ids == (actor_membership.membership_id,)
    assert actor.workspace_permissions == (FEATURE_ACCESS_MANAGE_PERMISSION,)


async def test_assignment_requires_active_membership() -> None:
    harness = _Harness()

    with pytest.raises(BadRequest) as exc:
        await harness.assign(uuid4())

    assert exc.value.error == "FEATURE_ACCESS_ACTIVE_MEMBERSHIP_REQUIRED"


async def test_missing_subscription_entitlement_and_malformed_capacity_fail_closed() -> None:
    missing_subscription = _Harness(
        snapshot=FeatureAccessCommercialSnapshot(
            workspace_id=uuid4(),
            subscription_revision=None,
            subscription_active=False,
            role_management_included=False,
            commercial_access_state="normal",
            entitlement=None,
        )
    )
    with pytest.raises(Conflict) as subscription_exc:
        await missing_subscription.assign(missing_subscription.memberships[0].membership_id)
    assert subscription_exc.value.error == "WORKSPACE_SUBSCRIPTION_REQUIRED"

    missing_entitlement = _Harness()
    assert isinstance(missing_entitlement.snapshot, FeatureAccessCommercialSnapshot)
    missing_entitlement.snapshot = missing_entitlement.snapshot.model_copy(update={"entitlement": None})
    missing_entitlement.service = _FeatureAccessService(
        get_settings(),
        persistence=missing_entitlement.persistence,
        commercial_authority=_CommercialAuthority(missing_entitlement.snapshot),
        actor_authority=_ActorAuthority(missing_entitlement.actor),
        membership_authority=_MembershipAuthority(missing_entitlement.memberships),
    )
    with pytest.raises(Forbidden) as entitlement_exc:
        await missing_entitlement.assign(missing_entitlement.memberships[0].membership_id)
    assert entitlement_exc.value.error == "WORKSPACE_FEATURE_ENTITLEMENT_REQUIRED"

    malformed = _Harness(snapshot=object())
    with pytest.raises(Conflict) as capacity_exc:
        await malformed.assign(malformed.memberships[0].membership_id)
    assert capacity_exc.value.error == "FEATURE_ACCESS_COMMERCIAL_CONTRACT_INVALID"

    malformed_capacity = _Harness()
    assert isinstance(malformed_capacity.snapshot, FeatureAccessCommercialSnapshot)
    assert malformed_capacity.snapshot.entitlement is not None
    malformed_capacity.snapshot = malformed_capacity.snapshot.model_copy(
        update={
            "entitlement": malformed_capacity.snapshot.entitlement.model_construct(
                key="agents.member-access",
                included=True,
                allocation_mode="member_seat",
                capacity={"kind": "limited", "limit": 0},
            )
        }
    )
    malformed_capacity.service = _FeatureAccessService(
        get_settings(),
        persistence=malformed_capacity.persistence,
        commercial_authority=_CommercialAuthority(malformed_capacity.snapshot),
        actor_authority=_ActorAuthority(malformed_capacity.actor),
        membership_authority=_MembershipAuthority(malformed_capacity.memberships),
    )
    with pytest.raises(Conflict) as malformed_capacity_exc:
        await malformed_capacity.assign(malformed_capacity.memberships[0].membership_id)
    assert malformed_capacity_exc.value.error == "FEATURE_ACCESS_CAPACITY_INVALID"


async def test_limited_last_allocation_is_serialized_and_returns_current_state_to_loser() -> None:
    harness = _Harness(capacity=LimitedFeatureAccessCapacity(limit=1))

    results = await asyncio.gather(
        harness.assign(harness.memberships[0].membership_id, key="race-a"),
        harness.assign(harness.memberships[1].membership_id, key="race-b"),
        return_exceptions=True,
    )

    successes = [result for result in results if isinstance(result, FeatureAccessMutationResult)]
    failures = [result for result in results if isinstance(result, Conflict)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert failures[0].meta is not None
    assert failures[0].meta["revision"] == 1
    assert len(failures[0].meta["assignedMembershipIds"]) == 1


async def test_unlimited_capacity_accepts_multiple_members() -> None:
    harness = _Harness(capacity=UnlimitedFeatureAccessCapacity())

    await harness.assign(harness.memberships[0].membership_id, key="unlimited-a")
    second = await harness.assign(harness.memberships[1].membership_id, revision=1, key="unlimited-b")

    assert len(second.state.assigned_membership_ids) == 2


async def test_idempotency_replays_same_fingerprint_and_rejects_key_reuse() -> None:
    harness = _Harness()
    membership_id = harness.memberships[0].membership_id

    first = await harness.assign(membership_id, key="same-key")
    replay = await harness.assign(membership_id, key="same-key")

    assert first.state == replay.state
    assert replay.replayed is True

    with pytest.raises(Conflict) as exc:
        await harness.assign(harness.memberships[1].membership_id, revision=1, key="same-key")
    assert exc.value.error == "IDEMPOTENCY_KEY_CONFLICT"


async def test_revocation_replays_idempotently() -> None:
    harness = _Harness()
    membership_id = harness.memberships[0].membership_id
    harness.persistence.assignments.add(membership_id)
    command = RevokeFeatureAccessCommand(
        workspace_id=harness.workspace_id,
        actor_user_id=harness.actor_user_id,
        membership_id=membership_id,
        entitlement_key="agents.member-access",
        expected_revision=0,
        idempotency_key="revoke-replay",
    )

    first = await harness.service.revoke(command)
    replay = await harness.service.revoke(command)

    assert first.state == replay.state
    assert replay.replayed is True


async def test_restricted_mode_rejects_assign_and_move_but_allows_revoke() -> None:
    harness = _Harness(commercial_access_state="payment_restricted")
    first = harness.memberships[0].membership_id
    second = harness.memberships[1].membership_id
    harness.persistence.assignments.add(first)

    with pytest.raises(APIError) as assign_exc:
        await harness.assign(second, key="restricted-assign")
    assert assign_exc.value.status_code == 402
    assert assign_exc.value.error == "WORKSPACE_PAYMENT_RESTRICTED"

    with pytest.raises(APIError) as move_exc:
        await harness.service.move(
            MoveFeatureAccessCommand(
                workspace_id=harness.workspace_id,
                actor_user_id=harness.actor_user_id,
                source_membership_id=first,
                target_membership_id=second,
                entitlement_key="agents.member-access",
                expected_revision=0,
                idempotency_key="restricted-move",
            )
        )
    assert move_exc.value.status_code == 402

    revoked = await harness.service.revoke(
        RevokeFeatureAccessCommand(
            workspace_id=harness.workspace_id,
            actor_user_id=harness.actor_user_id,
            membership_id=first,
            entitlement_key="agents.member-access",
            expected_revision=0,
            idempotency_key="restricted-revoke",
        )
    )
    assert revoked.state.assigned_membership_ids == ()


async def test_restricted_revocation_remains_available_after_subscription_cancels() -> None:
    harness = _Harness(commercial_access_state="payment_restricted")
    assert isinstance(harness.snapshot, FeatureAccessCommercialSnapshot)
    harness.snapshot = harness.snapshot.model_copy(update={"subscription_active": False})
    harness.service = _FeatureAccessService(
        get_settings(),
        persistence=harness.persistence,
        commercial_authority=_CommercialAuthority(harness.snapshot),
        actor_authority=_ActorAuthority(harness.actor),
        membership_authority=_MembershipAuthority(harness.memberships),
    )
    membership_id = harness.memberships[0].membership_id
    harness.persistence.assignments.add(membership_id)

    revoked = await harness.service.revoke(
        RevokeFeatureAccessCommand(
            workspace_id=harness.workspace_id,
            actor_user_id=harness.actor_user_id,
            membership_id=membership_id,
            entitlement_key="agents.member-access",
            expected_revision=0,
            idempotency_key="restricted-canceled-revoke",
        )
    )

    assert revoked.state.assigned_membership_ids == ()


async def test_payment_grace_keeps_assignment_and_move_available() -> None:
    harness = _Harness(commercial_access_state="payment_grace")
    source = harness.memberships[0].membership_id
    target = harness.memberships[1].membership_id

    assigned = await harness.assign(source, key="grace-assign")
    moved = await harness.service.move(
        MoveFeatureAccessCommand(
            workspace_id=harness.workspace_id,
            actor_user_id=harness.actor_user_id,
            source_membership_id=source,
            target_membership_id=target,
            entitlement_key="agents.member-access",
            expected_revision=assigned.state.revision,
            idempotency_key="grace-move",
        )
    )

    assert moved.state.assigned_membership_ids == (target,)


async def test_move_is_atomic_and_revisioned() -> None:
    harness = _Harness()
    source = harness.memberships[0].membership_id
    target = harness.memberships[1].membership_id
    harness.persistence.assignments.add(source)

    result = await harness.service.move(
        MoveFeatureAccessCommand(
            workspace_id=harness.workspace_id,
            actor_user_id=harness.actor_user_id,
            source_membership_id=source,
            target_membership_id=target,
            entitlement_key="agents.member-access",
            expected_revision=0,
            idempotency_key="move-1",
        )
    )

    assert result.state.assigned_membership_ids == (target,)
    assert result.state.revision == 1


async def test_membership_end_releases_in_callers_transaction_and_rejoin_does_not_restore() -> None:
    harness = _Harness()
    membership_id = harness.memberships[0].membership_id
    harness.persistence.assignments.add(membership_id)
    participant = FeatureAccessMembershipReleaseParticipant(harness.persistence)
    conn = cast(BaseDBAsyncClient, object())

    released = await participant.release_for_membership_end(
        workspace_id=harness.workspace_id,
        membership_id=membership_id,
        lifecycle_idempotency_key="membership-ended-1",
        conn=conn,
    )

    assert released.released_assignment_count == 1
    assert harness.persistence.assignments == set()
    assert harness.persistence.release_calls == [(harness.workspace_id, membership_id, "membership-ended-1")]
    assert membership_id not in harness.persistence.assignments
