from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.i18n import t
from src.models.commerce.billing import (
    CommerceEntitlementDefinition,
    CommercePlanRevision,
    CommercePlanRevisionEntitlement,
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    PlanAccessConvergence,
    PlanAccessConvergenceFeatureOutcome,
    PlanRevisionStatus,
    ResourceLimitKind,
)
from src.models.workspaces.workspace import Workspace
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.convergence.schema import FeatureAccessConvergenceCommand
from src.modules.commerce.feature_access.contracts import (
    FeatureAccessConvergenceOutbox,
    FeatureAccessConvergenceResult,
    FeatureAccessConvergenceScopeResult,
)
from src.modules.commerce.feature_access.convergence_receipts import (
    convergence_fingerprint,
    convergence_result,
    load_convergence_replay,
    write_convergence_receipts,
)

type ActivityWriter = Callable[..., Awaitable[object]]

_CONVERGENCE_END_REASON = "plan_convergence"


class _PlanAccessConvergenceIds(Protocol):
    workspace_id: UUID
    target_plan_revision_id: UUID


class TortoiseFeatureAccessConvergenceRepository:
    """Apply one fully reviewed Feature Seat convergence in the caller transaction."""

    def __init__(
        self,
        settings: Settings,
        *,
        outbox: FeatureAccessConvergenceOutbox,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        self._settings = settings
        self._outbox = outbox
        self._activity_writer = activity_writer

    async def apply_convergence_serialized(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessConvergenceResult:
        if self._outbox is None:
            raise ServiceUnavailable(
                message=t("errors", "BAD_REQUEST"),
                error="FEATURE_ACCESS_CONVERGENCE_OUTBOX_REQUIRED",
            )
        await self._lock_workspace(command.workspace_id, conn)
        await self._lock_convergence(command, conn)
        scopes_by_key, definitions_by_id = await self._lock_expected_scopes(command, conn)
        fingerprint = convergence_fingerprint(command)
        try:
            replay = await load_convergence_replay(
                command=command,
                scopes_by_key=scopes_by_key,
                fingerprint=fingerprint,
                conn=conn,
            )
        except KeyError as exc:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_IDEMPOTENCY_CONFLICT", command.workspace_id) from exc
        except ValueError as exc:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_RECEIPT_INVALID", command.workspace_id) from exc
        if replay is not None:
            return replay
        self._require_scope_revisions(command, scopes_by_key)
        assignments = await self._lock_active_assignments(command.workspace_id, conn)
        self._require_reviewed_assignment_set(command, assignments)
        target_limits = await self._lock_target_limits(
            command=command,
            definition_ids=tuple(definitions_by_id),
            conn=conn,
        )
        self._require_retained_assignments(command, assignments, target_limits)
        scope_results = await self._apply_reviewed_outcomes(
            command=command,
            assignments=assignments,
            scopes_by_key=scopes_by_key,
            definitions_by_id=definitions_by_id,
            fingerprint=fingerprint,
            conn=conn,
        )
        result = convergence_result(command, scope_results, replayed=False)
        await self._outbox.append_feature_access_convergence(result=result, conn=conn)
        return result

    @staticmethod
    async def _lock_workspace(workspace_id: UUID, conn: BaseDBAsyncClient) -> None:
        workspace = await Workspace.filter(id=workspace_id).using_db(conn).select_for_update().first()
        if workspace is None:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_WORKSPACE_INVALID", workspace_id)

    @staticmethod
    async def _lock_convergence(command: FeatureAccessConvergenceCommand, conn: BaseDBAsyncClient) -> None:
        convergence = await (
            PlanAccessConvergence.filter(id=command.convergence_id).using_db(conn).select_for_update().first()
        )
        if (
            convergence is None
            or cast(_PlanAccessConvergenceIds, convergence).workspace_id != command.workspace_id
            or cast(_PlanAccessConvergenceIds, convergence).target_plan_revision_id != command.target_revision_id
            or str(convergence.status) not in {"scheduled", "applied"}
        ):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_IDENTITY_INVALID", command.workspace_id)

    @staticmethod
    async def _lock_expected_scopes(
        command: FeatureAccessConvergenceCommand,
        conn: BaseDBAsyncClient,
    ) -> tuple[dict[str, FeatureAccessAllocationScope], dict[UUID, str]]:
        expected = {item.entitlement_key: item.revision for item in command.expected_scope_revisions}
        if not expected or len(expected) != len(command.expected_scope_revisions):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_SCOPE_EXPECTATION_INVALID", command.workspace_id)
        definitions = await (
            CommerceEntitlementDefinition.filter(key__in=tuple(expected)).using_db(conn).select_for_update().all()
        )
        definitions_by_id = {definition.id: str(definition.key) for definition in definitions}
        if set(definitions_by_id.values()) != set(expected):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_SCOPE_EXPECTATION_INVALID", command.workspace_id)
        scopes = await (
            FeatureAccessAllocationScope
            .filter(workspace_id=command.workspace_id, entitlement_id__in=tuple(definitions_by_id))
            .using_db(conn)
            .select_for_update()
            .order_by("entitlement_id")
            .all()
        )
        scopes_by_key = {definitions_by_id[scope.entitlement_id]: scope for scope in scopes}
        if set(scopes_by_key) != set(expected):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_SCOPE_EXPECTATION_INVALID", command.workspace_id)
        return scopes_by_key, definitions_by_id

    @staticmethod
    def _require_scope_revisions(
        command: FeatureAccessConvergenceCommand,
        scopes_by_key: dict[str, FeatureAccessAllocationScope],
    ) -> None:
        expected = {item.entitlement_key: item.revision for item in command.expected_scope_revisions}
        if any(scopes_by_key[key].revision != revision for key, revision in expected.items()):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_SCOPE_REVISION_STALE", command.workspace_id)

    @staticmethod
    async def _lock_active_assignments(
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[FeatureAccessAssignment, ...]:
        assignments = await (
            FeatureAccessAssignment
            .filter(workspace_id=workspace_id, ended_at=None)
            .using_db(conn)
            .select_for_update()
            .order_by("id")
            .all()
        )
        return tuple(assignments)

    @staticmethod
    def _require_reviewed_assignment_set(
        command: FeatureAccessConvergenceCommand,
        assignments: tuple[FeatureAccessAssignment, ...],
    ) -> None:
        reviewed = set(command.reviewed_assignment_ids)
        retained = set(command.retained_assignment_ids)
        if len(reviewed) != len(command.reviewed_assignment_ids) or len(retained) != len(
            command.retained_assignment_ids
        ):
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_REVIEW_INVALID", command.workspace_id)
        if not retained.issubset(reviewed) or {UUID(str(assignment.id)) for assignment in assignments} != reviewed:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_ASSIGNMENTS_STALE", command.workspace_id)

    @staticmethod
    async def _lock_target_limits(
        *,
        command: FeatureAccessConvergenceCommand,
        definition_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, int | None]:
        revision = await (
            CommercePlanRevision.filter(id=command.target_revision_id).using_db(conn).select_for_update().first()
        )
        if revision is None or revision.status != PlanRevisionStatus.PUBLISHED or revision.published_at is None:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_TARGET_INVALID", command.workspace_id)
        decisions = await (
            CommercePlanRevisionEntitlement
            .filter(plan_revision_id=revision.id, entitlement_id__in=definition_ids)
            .using_db(conn)
            .select_for_update()
            .all()
        )
        limits: dict[UUID, int | None] = {}
        for decision in decisions:
            if not decision.is_included:
                continue
            if str(decision.allocation_mode) != "member_seat":
                raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_TARGET_INVALID", command.workspace_id)
            if decision.seat_limit_kind == ResourceLimitKind.UNLIMITED and decision.seat_limit_value is None:
                limits[decision.entitlement_id] = None
            elif (
                decision.seat_limit_kind == ResourceLimitKind.LIMITED
                and decision.seat_limit_value is not None
                and decision.seat_limit_value > 0
            ):
                limits[decision.entitlement_id] = decision.seat_limit_value
            else:
                raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_TARGET_INVALID", command.workspace_id)
        return limits

    @staticmethod
    def _require_retained_assignments(
        command: FeatureAccessConvergenceCommand,
        assignments: tuple[FeatureAccessAssignment, ...],
        target_limits: dict[UUID, int | None],
    ) -> None:
        retained = set(command.retained_assignment_ids)
        retained_counts: dict[UUID, int] = {}
        for assignment in assignments:
            if assignment.id not in retained:
                continue
            if assignment.entitlement_id not in target_limits:
                raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_RETAINED_UNSUPPORTED", command.workspace_id)
            count = retained_counts.get(assignment.entitlement_id, 0) + 1
            retained_counts[assignment.entitlement_id] = count
            limit = target_limits[assignment.entitlement_id]
            if limit is not None and count > limit:
                raise _convergence_invalid(
                    "FEATURE_ACCESS_CONVERGENCE_RETAINED_CAPACITY_EXCEEDED", command.workspace_id
                )

    async def _apply_reviewed_outcomes(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        assignments: tuple[FeatureAccessAssignment, ...],
        scopes_by_key: dict[str, FeatureAccessAllocationScope],
        definitions_by_id: dict[UUID, str],
        fingerprint: str,
        conn: BaseDBAsyncClient,
    ) -> tuple[FeatureAccessConvergenceScopeResult, ...]:
        retained = set(command.retained_assignment_ids)
        assignments_by_key: dict[str, list[FeatureAccessAssignment]] = {key: [] for key in scopes_by_key}
        for assignment in assignments:
            key = definitions_by_id.get(assignment.entitlement_id)
            if key is None:
                raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_SCOPE_EXPECTATION_INVALID", command.workspace_id)
            assignments_by_key[key].append(assignment)
            await self._require_reviewed_outcome(
                convergence_id=command.convergence_id,
                assignment_id=assignment.id,
                is_retained=assignment.id in retained,
                workspace_id=command.workspace_id,
                conn=conn,
            )
            if assignment.id not in retained:
                await self._end_for_convergence(command=command, assignment=assignment, conn=conn)
        return await write_convergence_receipts(
            command=command,
            assignments_by_key=assignments_by_key,
            scopes_by_key=scopes_by_key,
            fingerprint=fingerprint,
            conn=conn,
        )

    @staticmethod
    async def _require_reviewed_outcome(
        *,
        convergence_id: UUID,
        assignment_id: UUID,
        is_retained: bool,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        outcome = await (
            PlanAccessConvergenceFeatureOutcome
            .filter(
                convergence_id=convergence_id,
                assignment_id=assignment_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if outcome is None or outcome.is_retained != is_retained:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_OUTCOME_INVALID", workspace_id)

    async def _end_for_convergence(
        self,
        *,
        command: FeatureAccessConvergenceCommand,
        assignment: FeatureAccessAssignment,
        conn: BaseDBAsyncClient,
    ) -> None:
        if command.effective_at < assignment.started_at:
            raise _convergence_invalid("FEATURE_ACCESS_CONVERGENCE_EFFECTIVE_AT_INVALID", command.workspace_id)
        assignment.ended_at = command.effective_at
        assignment.ended_reason = _CONVERGENCE_END_REASON
        assignment.revision += 1
        await assignment.save(
            update_fields=["ended_at", "ended_reason", "revision", "updated_at"],
            using_db=conn,
        )
        await self._activity_writer(
            settings=self._settings,
            payload=ActivityAuditPayload(
                event_name="workspace.feature_access.plan_converged",
                actor_user_id=None,
                workspace_id=command.workspace_id,
                entity_type="feature_access_assignment",
                entity_id=assignment.id,
                properties={
                    "convergence_id": str(command.convergence_id),
                    "entitlement_id": str(assignment.entitlement_id),
                    "membership_id": str(assignment.membership_id),
                },
            ),
            conn=conn,
        )


def _convergence_invalid(error: str, workspace_id: UUID) -> Conflict:
    return Conflict(
        message=t("errors", "BAD_REQUEST"),
        error=error,
        meta={"workspaceId": str(workspace_id)},
    )
