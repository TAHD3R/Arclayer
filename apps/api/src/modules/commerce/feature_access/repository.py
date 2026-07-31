from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    FeatureAccessCommandReceipt,
)
from src.models.workspaces.workspace import Workspace
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.feature_access.contracts import (
    AssignFeatureAccessCommand,
    FeatureAccessAllocationState,
    FeatureAccessCapacity,
    FeatureAccessMembershipRelease,
    FeatureAccessMutationResult,
    FeatureAccessOperation,
    FeatureAccessWriteConflict,
    LimitedFeatureAccessCapacity,
    MoveFeatureAccessCommand,
    RevokeFeatureAccessCommand,
)

type ActivityWriter = Callable[..., Awaitable[object]]

_REVOKED_REASON = "revoked"
_MOVED_REASON = "moved"
_MEMBERSHIP_ENDED_REASON = "membership_ended"


class TortoiseFeatureAccessRepository:
    """PostgreSQL-serialized Feature access allocation persistence."""

    def __init__(
        self,
        settings: Settings,
        *,
        activity_writer: ActivityWriter = write_required_activity_event,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._settings = settings
        self._activity_writer = activity_writer
        self._now = now or (lambda: datetime.now(UTC))

    async def assign_serialized(
        self,
        *,
        command: AssignFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        scope = await self._lock_scope(command.workspace_id, command.entitlement_key, conn)
        replay = await self._mutation_replay(
            scope=scope,
            command_key=command.idempotency_key,
            fingerprint=fingerprint,
            operation="assign",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            conn=conn,
        )
        if replay is not None:
            return replay
        state = await self._state(scope=scope, entitlement_key=command.entitlement_key, capacity=capacity, conn=conn)
        self._require_revision(command.expected_revision, state)
        if command.membership_id in state.assigned_membership_ids:
            raise FeatureAccessWriteConflict("already_assigned", state)
        if isinstance(capacity, LimitedFeatureAccessCapacity) and len(state.assigned_membership_ids) >= capacity.limit:
            raise FeatureAccessWriteConflict("capacity_exhausted", state)
        key_hash = _idempotency_hash(scope.id, command.idempotency_key)
        assignment = await FeatureAccessAssignment.create(
            using_db=conn,
            workspace_id=command.workspace_id,
            entitlement_id=scope.entitlement_id,
            membership_id=command.membership_id,
            assigned_by_user_id=command.actor_user_id,
            started_at=self._now(),
            revision=1,
            idempotency_key=key_hash,
        )
        result = await self._finish_mutation(
            scope=scope,
            operation="assign",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            fingerprint=fingerprint,
            key_hash=key_hash,
            actor_user_id=command.actor_user_id,
            entity_id=assignment.id,
            membership_ids=(command.membership_id,),
            conn=conn,
        )
        return result

    async def revoke_serialized(
        self,
        *,
        command: RevokeFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        scope = await self._lock_scope(command.workspace_id, command.entitlement_key, conn)
        replay = await self._mutation_replay(
            scope=scope,
            command_key=command.idempotency_key,
            fingerprint=fingerprint,
            operation="revoke",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            conn=conn,
        )
        if replay is not None:
            return replay
        state = await self._state(scope=scope, entitlement_key=command.entitlement_key, capacity=capacity, conn=conn)
        self._require_revision(command.expected_revision, state)
        assignment = await self._lock_active_assignment(scope, command.membership_id, conn)
        if assignment is None:
            raise FeatureAccessWriteConflict("not_assigned", state)
        await self._end_assignment(assignment, reason=_REVOKED_REASON, conn=conn)
        return await self._finish_mutation(
            scope=scope,
            operation="revoke",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            fingerprint=fingerprint,
            key_hash=_idempotency_hash(scope.id, command.idempotency_key),
            actor_user_id=command.actor_user_id,
            entity_id=assignment.id,
            membership_ids=(command.membership_id,),
            conn=conn,
        )

    async def move_serialized(
        self,
        *,
        command: MoveFeatureAccessCommand,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        scope = await self._lock_scope(command.workspace_id, command.entitlement_key, conn)
        replay = await self._mutation_replay(
            scope=scope,
            command_key=command.idempotency_key,
            fingerprint=fingerprint,
            operation="move",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            conn=conn,
        )
        if replay is not None:
            return replay
        state = await self._state(scope=scope, entitlement_key=command.entitlement_key, capacity=capacity, conn=conn)
        self._require_revision(command.expected_revision, state)
        assignments = await self._lock_active_assignments(
            scope,
            (command.source_membership_id, command.target_membership_id),
            conn,
        )
        source = assignments.get(command.source_membership_id)
        if source is None:
            raise FeatureAccessWriteConflict("not_assigned", state)
        if command.target_membership_id in assignments:
            raise FeatureAccessWriteConflict("already_assigned", state)
        await self._end_assignment(source, reason=_MOVED_REASON, conn=conn)
        key_hash = _idempotency_hash(scope.id, command.idempotency_key)
        target = await FeatureAccessAssignment.create(
            using_db=conn,
            workspace_id=command.workspace_id,
            entitlement_id=scope.entitlement_id,
            membership_id=command.target_membership_id,
            assigned_by_user_id=command.actor_user_id,
            started_at=self._now(),
            revision=1,
            idempotency_key=key_hash,
        )
        return await self._finish_mutation(
            scope=scope,
            operation="move",
            entitlement_key=command.entitlement_key,
            capacity=capacity,
            fingerprint=fingerprint,
            key_hash=key_hash,
            actor_user_id=command.actor_user_id,
            entity_id=target.id,
            membership_ids=(command.source_membership_id, command.target_membership_id),
            conn=conn,
        )

    async def release_membership_assignments(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        lifecycle_idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMembershipRelease:
        await self._lock_workspace(workspace_id, conn)
        scopes = await (
            FeatureAccessAllocationScope
            .filter(workspace_id=workspace_id)
            .using_db(conn)
            .select_for_update()
            .order_by("entitlement_id")
            .all()
        )
        fingerprint = _release_fingerprint(workspace_id, membership_id)
        released = 0
        for scope in scopes:
            key_hash = _idempotency_hash(scope.id, lifecycle_idempotency_key)
            receipt = await self._receipt(key_hash=key_hash, conn=conn)
            if receipt is not None:
                released += self._release_replay_count(
                    receipt=receipt,
                    scope=scope,
                    fingerprint=fingerprint,
                    workspace_id=workspace_id,
                    membership_id=membership_id,
                )
                continue
            assignment = await self._lock_active_assignment(scope, membership_id, conn)
            released_here = int(assignment is not None)
            if assignment is not None:
                await self._end_assignment(assignment, reason=_MEMBERSHIP_ENDED_REASON, conn=conn)
                await self._increment_scope(scope, conn=conn)
                await self._write_audit(
                    event_name="workspace.feature_access.membership_released",
                    scope=scope,
                    actor_user_id=None,
                    entity_id=assignment.id,
                    membership_ids=(membership_id,),
                    conn=conn,
                )
            await FeatureAccessCommandReceipt.create(
                using_db=conn,
                scope_id=scope.id,
                idempotency_key_hash=key_hash,
                fingerprint=fingerprint,
                operation="release",
                result_revision=scope.revision,
                result_snapshot={
                    "workspaceId": str(workspace_id),
                    "membershipId": str(membership_id),
                    "releasedAssignmentCount": released_here,
                    "resultRevision": scope.revision,
                },
            )
            released += released_here
        return FeatureAccessMembershipRelease(
            workspace_id=workspace_id,
            membership_id=membership_id,
            released_assignment_count=released,
        )

    async def _lock_scope(
        self,
        workspace_id: UUID,
        entitlement_key: str,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessAllocationScope:
        await self._lock_workspace(workspace_id, conn)
        entitlement = await (
            CommerceEntitlementDefinition.filter(key=entitlement_key).using_db(conn).select_for_update().first()
        )
        if entitlement is None:
            raise _persistence_contract_invalid(workspace_id)
        scope = await (
            FeatureAccessAllocationScope
            .filter(workspace_id=workspace_id, entitlement_id=entitlement.id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if scope is not None:
            return scope
        return await FeatureAccessAllocationScope.create(
            using_db=conn,
            workspace_id=workspace_id,
            entitlement_id=entitlement.id,
            revision=0,
        )

    @staticmethod
    async def _lock_workspace(workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace:
        workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
        if workspace is None:
            raise _persistence_contract_invalid(workspace_id)
        return workspace

    async def _mutation_replay(
        self,
        *,
        scope: FeatureAccessAllocationScope,
        command_key: str,
        fingerprint: str,
        operation: FeatureAccessOperation,
        entitlement_key: str,
        capacity: FeatureAccessCapacity,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult | None:
        receipt = await self._receipt(key_hash=_idempotency_hash(scope.id, command_key), conn=conn)
        if receipt is None:
            return None
        if receipt.fingerprint != fingerprint or receipt.operation != operation:
            state = await self._state(
                scope=scope,
                entitlement_key=entitlement_key,
                capacity=capacity,
                conn=conn,
            )
            raise FeatureAccessWriteConflict("idempotency_conflict", state)
        return _mutation_result_from_receipt(receipt)

    @staticmethod
    async def _receipt(*, key_hash: str, conn: BaseDBAsyncClient) -> FeatureAccessCommandReceipt | None:
        return await FeatureAccessCommandReceipt.get_or_none(
            idempotency_key_hash=key_hash,
            using_db=conn,
        )

    async def _finish_mutation(
        self,
        *,
        scope: FeatureAccessAllocationScope,
        operation: FeatureAccessOperation,
        entitlement_key: str,
        capacity: FeatureAccessCapacity,
        fingerprint: str,
        key_hash: str,
        actor_user_id: UUID,
        entity_id: UUID,
        membership_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessMutationResult:
        await self._increment_scope(scope, conn=conn)
        state = await self._state(scope=scope, entitlement_key=entitlement_key, capacity=capacity, conn=conn)
        result = FeatureAccessMutationResult(operation=operation, state=state, replayed=False)
        await self._write_audit(
            event_name=f"workspace.feature_access.{operation}",
            scope=scope,
            actor_user_id=actor_user_id,
            entity_id=entity_id,
            membership_ids=membership_ids,
            conn=conn,
        )
        await FeatureAccessCommandReceipt.create(
            using_db=conn,
            scope_id=scope.id,
            idempotency_key_hash=key_hash,
            fingerprint=fingerprint,
            operation=operation,
            result_revision=state.revision,
            result_snapshot=state.model_dump(mode="json"),
        )
        return result

    @staticmethod
    async def _increment_scope(scope: FeatureAccessAllocationScope, *, conn: BaseDBAsyncClient) -> None:
        scope.revision += 1
        await scope.save(update_fields=["revision", "updated_at"], using_db=conn)

    @staticmethod
    async def _state(
        *,
        scope: FeatureAccessAllocationScope,
        entitlement_key: str,
        capacity: FeatureAccessCapacity,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessAllocationState:
        membership_ids = await (
            FeatureAccessAssignment
            .filter(
                workspace_id=scope.workspace_id,
                entitlement_id=scope.entitlement_id,
                ended_at=None,
            )
            .using_db(conn)
            .order_by("membership_id")
            .values_list("membership_id", flat=True)
        )
        return FeatureAccessAllocationState(
            workspace_id=UUID(str(scope.workspace_id)),
            entitlement_key=entitlement_key,
            revision=scope.revision,
            capacity=capacity,
            assigned_membership_ids=tuple(UUID(str(value)) for value in membership_ids),
        )

    @staticmethod
    def _require_revision(expected_revision: int, state: FeatureAccessAllocationState) -> None:
        if expected_revision != state.revision:
            raise FeatureAccessWriteConflict("revision_conflict", state)

    @staticmethod
    async def _lock_active_assignment(
        scope: FeatureAccessAllocationScope,
        membership_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessAssignment | None:
        return await (
            FeatureAccessAssignment
            .filter(
                workspace_id=scope.workspace_id,
                entitlement_id=scope.entitlement_id,
                membership_id=membership_id,
                ended_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def _lock_active_assignments(
        scope: FeatureAccessAllocationScope,
        membership_ids: tuple[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, FeatureAccessAssignment]:
        assignments = await (
            FeatureAccessAssignment
            .filter(
                workspace_id=scope.workspace_id,
                entitlement_id=scope.entitlement_id,
                membership_id__in=membership_ids,
                ended_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .order_by("membership_id")
            .all()
        )
        return {UUID(str(assignment.membership_id)): assignment for assignment in assignments}

    async def _end_assignment(
        self,
        assignment: FeatureAccessAssignment,
        *,
        reason: str,
        conn: BaseDBAsyncClient,
    ) -> None:
        assignment.ended_at = self._now()
        assignment.ended_reason = reason
        assignment.revision += 1
        await assignment.save(
            update_fields=["ended_at", "ended_reason", "revision", "updated_at"],
            using_db=conn,
        )

    async def _write_audit(
        self,
        *,
        event_name: str,
        scope: FeatureAccessAllocationScope,
        actor_user_id: UUID | None,
        entity_id: UUID,
        membership_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._activity_writer(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                workspace_id=UUID(str(scope.workspace_id)),
                entity_type="feature_access_assignment",
                entity_id=entity_id,
                properties={
                    "entitlement_id": str(scope.entitlement_id),
                    "membership_ids": [str(value) for value in membership_ids],
                    "allocation_revision": scope.revision,
                },
            ),
            conn=conn,
        )

    @staticmethod
    def _release_replay_count(
        *,
        receipt: FeatureAccessCommandReceipt,
        scope: FeatureAccessAllocationScope,
        fingerprint: str,
        workspace_id: UUID,
        membership_id: UUID,
    ) -> int:
        snapshot = receipt.result_snapshot
        if receipt.operation != "release" or receipt.fingerprint != fingerprint:
            raise Conflict(
                message=t("errors", "BAD_REQUEST"),
                error="IDEMPOTENCY_KEY_CONFLICT",
                meta={"workspaceId": str(workspace_id), "revision": scope.revision},
            )
        if not isinstance(snapshot, dict):
            raise _persistence_contract_invalid(workspace_id)
        if snapshot.get("workspaceId") != str(workspace_id) or snapshot.get("membershipId") != str(membership_id):
            raise _persistence_contract_invalid(workspace_id)
        released = snapshot.get("releasedAssignmentCount")
        if not isinstance(released, int) or released not in {0, 1}:
            raise _persistence_contract_invalid(workspace_id)
        return released


def _mutation_result_from_receipt(receipt: FeatureAccessCommandReceipt) -> FeatureAccessMutationResult:
    try:
        state = FeatureAccessAllocationState.model_validate(receipt.result_snapshot)
    except ValueError as exc:
        raise _persistence_contract_invalid(None) from exc
    if receipt.result_revision != state.revision or receipt.operation not in {"assign", "revoke", "move"}:
        raise _persistence_contract_invalid(state.workspace_id)
    return FeatureAccessMutationResult(
        operation=cast(FeatureAccessOperation, receipt.operation),
        state=state,
        replayed=True,
    )


def _idempotency_hash(scope_id: UUID, key: str) -> str:
    return hashlib.sha256(f"{scope_id}:{key}".encode()).hexdigest()


def _release_fingerprint(workspace_id: UUID, membership_id: UUID) -> str:
    payload = json.dumps(
        {
            "membershipId": str(membership_id),
            "operation": "release",
            "workspaceId": str(workspace_id),
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _persistence_contract_invalid(workspace_id: UUID | None) -> Conflict:
    meta = {"workspaceId": str(workspace_id)} if workspace_id is not None else None
    return Conflict(
        message=t("errors", "BAD_REQUEST"),
        error="FEATURE_ACCESS_PERSISTENCE_CONTRACT_INVALID",
        meta=meta,
    )
