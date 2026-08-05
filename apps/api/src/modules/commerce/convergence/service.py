from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.modules.commerce.convergence.schema import (
    ConvergenceAuditEvent,
    ConvergenceImpactSnapshot,
    ConvergencePreview,
    ConvergencePreviewRequest,
    ConvergenceReceipt,
    FeatureAccessConvergenceCommand,
    ProviderConfirmedConvergenceApplication,
)


class FreeAllowanceAuthority(Protocol):
    async def assert_eligible(
        self, *, prospective_owner_user_id: UUID, excluding_workspace_id: UUID, conn: BaseDBAsyncClient
    ) -> None: ...


class RoleAccessConvergenceParticipant(Protocol):
    """Applies Workspace role retirement in Commerce's enclosing transaction."""

    async def apply_role_management_removal(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        effective_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class FeatureAccessConvergenceParticipant(Protocol):
    """Applies reviewed Feature Seat outcomes in Commerce's enclosing transaction.

    Feature Access owns the assignment lifecycle and provides the transaction-bound
    participant required before a seat-impacting convergence is acknowledged.
    """

    async def apply_feature_access_convergence(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class ConvergenceRepository(Protocol):
    async def requires_transition_convergence(
        self,
        *,
        workspace_id: UUID,
        source_revision_id: UUID,
        target_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool: ...

    async def capture_impact_snapshot(
        self,
        *,
        workspace_id: UUID,
        source_revision_id: UUID,
        target_revision_id: UUID,
        effective_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> ConvergenceImpactSnapshot: ...

    async def save_preview(
        self, *, preview: ConvergencePreview, audit: ConvergenceAuditEvent, conn: BaseDBAsyncClient
    ) -> None: ...

    async def load_preview_for_update(self, *, preview_id: UUID, conn: BaseDBAsyncClient) -> ConvergencePreview: ...

    async def apply_convergence(
        self,
        *,
        preview: ConvergencePreview,
        request: ProviderConfirmedConvergenceApplication,
        applied_at: datetime,
        audit: ConvergenceAuditEvent,
        conn: BaseDBAsyncClient,
    ) -> ConvergenceReceipt: ...


class PlanAccessConvergenceService(BaseService):
    """Creates and applies exact, revision-bound authority convergence plans."""

    def __init__(
        self,
        *,
        repository: ConvergenceRepository,
        free_allowance: FreeAllowanceAuthority,
        role_access: RoleAccessConvergenceParticipant,
        feature_access: FeatureAccessConvergenceParticipant,
    ) -> None:
        super().__init__()
        if feature_access is None:
            raise ServiceUnavailable(error="PLAN_ACCESS_CONVERGENCE_FEATURE_PARTICIPANT_UNAVAILABLE")
        self._repository = repository
        self._free_allowance = free_allowance
        self._role_access = role_access
        self._feature_access = feature_access

    async def requires_transition_convergence(
        self,
        *,
        workspace_id: UUID,
        source_revision_id: UUID,
        target_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        return await self._repository.requires_transition_convergence(
            workspace_id=workspace_id,
            source_revision_id=source_revision_id,
            target_revision_id=target_revision_id,
            conn=conn,
        )

    async def create_preview(
        self, *, request: ConvergencePreviewRequest, conn: BaseDBAsyncClient | None = None
    ) -> ConvergencePreview:
        async with self.tx(conn=conn) as tx_conn:
            snapshot = await self._repository.capture_impact_snapshot(
                workspace_id=request.workspace_id,
                source_revision_id=request.source_revision_id,
                target_revision_id=request.target_revision_id,
                effective_at=request.effective_at,
                conn=tx_conn,
            )
            self._validate_snapshot(request=request, snapshot=snapshot)
            if snapshot.target_revision.is_free:
                await self._assert_free_allowance(snapshot=snapshot, conn=tx_conn)
            preview = ConvergencePreview(
                id=uuid4(),
                preview_revision=1,
                snapshot_hash=_snapshot_hash(snapshot=snapshot, request=request),
                effective_at=request.effective_at,
                snapshot=snapshot,
                retained_assignment_ids=request.retained_assignment_ids,
                idempotency_key=request.idempotency_key,
                correlation_id=request.correlation_id,
            )
            await self._repository.save_preview(
                preview=preview,
                audit=_audit("commerce.plan_access_convergence.previewed", preview),
                conn=tx_conn,
            )
            return preview

    async def apply_provider_confirmed(
        self, *, request: ProviderConfirmedConvergenceApplication, conn: BaseDBAsyncClient | None = None
    ) -> ConvergenceReceipt:
        async with self.tx(conn=conn) as tx_conn:
            preview = await self._repository.load_preview_for_update(preview_id=request.preview_id, conn=tx_conn)
            if (
                preview.snapshot.workspace_id != request.workspace_id
                or preview.snapshot.target_revision.id != request.target_revision_id
                or preview.effective_at != request.effective_at
            ):
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_PROVIDER_CONFIRMATION_MISMATCH")
            if preview.is_applied:
                return await self._repository.apply_convergence(
                    preview=preview,
                    request=request,
                    applied_at=datetime.now(UTC),
                    audit=_audit("commerce.plan_access_convergence.applied", preview, request.idempotency_key),
                    conn=tx_conn,
                )
            self._validate_retained_assignments(
                snapshot=preview.snapshot, retained_assignment_ids=preview.retained_assignment_ids
            )
            if preview.snapshot.target_revision.is_free:
                await self._assert_free_allowance(snapshot=preview.snapshot, conn=tx_conn)
            applied_at = datetime.now(UTC)
            if not preview.snapshot.target_revision.roles_manage_included:
                await self._role_access.apply_role_management_removal(
                    workspace_id=preview.snapshot.workspace_id,
                    owner_user_id=preview.snapshot.owner_user_id,
                    effective_at=applied_at,
                    conn=tx_conn,
                )
            if preview.snapshot.feature_assignments:
                await self._feature_access.apply_feature_access_convergence(
                    command=FeatureAccessConvergenceCommand(
                        convergence_id=preview.id,
                        workspace_id=preview.snapshot.workspace_id,
                        target_revision_id=preview.snapshot.target_revision.id,
                        effective_at=applied_at,
                        reviewed_assignment_ids=tuple(
                            assignment.assignment_id for assignment in preview.snapshot.feature_assignments
                        ),
                        retained_assignment_ids=preview.retained_assignment_ids,
                        expected_scope_revisions=preview.snapshot.feature_allocation_scope_revisions,
                        idempotency_key=f"provider:{request.provider_event_id}:{request.idempotency_key}",
                    ),
                    conn=tx_conn,
                )
            return await self._repository.apply_convergence(
                preview=preview,
                request=request,
                applied_at=applied_at,
                audit=_audit("commerce.plan_access_convergence.applied", preview, request.idempotency_key),
                conn=tx_conn,
            )

    @staticmethod
    def _validate_snapshot(*, request: ConvergencePreviewRequest, snapshot: ConvergenceImpactSnapshot) -> None:
        if snapshot.workspace_id != request.workspace_id:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_WORKSPACE_MISMATCH")
        if (
            snapshot.source_revision.id != request.source_revision_id
            or snapshot.target_revision.id != request.target_revision_id
        ):
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_REVISION_STALE")
        if snapshot.subscription_revision != request.expected_subscription_revision:
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_SUBSCRIPTION_STALE")
        assignment_ids = {assignment.assignment_id for assignment in snapshot.feature_assignments}
        if not set(request.retained_assignment_ids).issubset(assignment_ids):
            raise Conflict(error="PLAN_ACCESS_CONVERGENCE_RETAINED_ASSIGNMENT_INVALID")
        PlanAccessConvergenceService._validate_retained_assignments(
            snapshot=snapshot,
            retained_assignment_ids=request.retained_assignment_ids,
        )

    @staticmethod
    def _validate_retained_assignments(
        *, snapshot: ConvergenceImpactSnapshot, retained_assignment_ids: tuple[UUID, ...]
    ) -> None:
        retained = set(retained_assignment_ids)
        assignment_by_id = {assignment.assignment_id: assignment for assignment in snapshot.feature_assignments}
        retained_by_entitlement: dict[str, int] = {}
        for assignment_id in retained:
            assignment = assignment_by_id.get(assignment_id)
            if assignment is None:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_RETAINED_ASSIGNMENT_INVALID")
            limit = snapshot.target_revision.member_seat_limits.get(assignment.entitlement_key)
            if assignment.entitlement_key not in snapshot.target_revision.member_seat_limits:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_RETAINED_ASSIGNMENT_UNSUPPORTED")
            count = retained_by_entitlement.get(assignment.entitlement_key, 0) + 1
            retained_by_entitlement[assignment.entitlement_key] = count
            if limit is not None and count > limit:
                raise Conflict(error="PLAN_ACCESS_CONVERGENCE_RETAINED_ASSIGNMENT_CAPACITY_EXCEEDED")

    async def _assert_free_allowance(self, *, snapshot: ConvergenceImpactSnapshot, conn: BaseDBAsyncClient) -> None:
        await self._free_allowance.assert_eligible(
            prospective_owner_user_id=snapshot.owner_user_id,
            excluding_workspace_id=snapshot.workspace_id,
            conn=conn,
        )


def _snapshot_hash(*, snapshot: ConvergenceImpactSnapshot, request: ConvergencePreviewRequest) -> str:
    return f"{snapshot.workspace_id}:{snapshot.subscription_revision}:{request.source_revision_id}:{request.target_revision_id}"


def _audit(event_name: str, preview: ConvergencePreview, idempotency_key: str | None = None) -> ConvergenceAuditEvent:
    return ConvergenceAuditEvent(
        event_name=event_name,
        workspace_id=preview.snapshot.workspace_id,
        correlation_id=preview.correlation_id,
        idempotency_key=idempotency_key or preview.idempotency_key,
    )
