from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.operations_signals import (
    OperationalSignalProjection,
    OperationalSignalProjectionLifecycle,
    OperationalSignalTriage,
    OperationalSignalTriageAction,
    OperationalSignalTriageState,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.operational_signals.repository import OperationalSignalRepository
from src.modules.operational_signals.schema import (
    OperationalSignalAssigneeOut,
    OperationalSignalCopyOut,
    OperationalSignalDestinationOut,
    OperationalSignalDetailOut,
    OperationalSignalEvidenceOut,
    OperationalSignalFreshnessOut,
    OperationalSignalListQuery,
    OperationalSignalOut,
    OperationalSignalPriorityOut,
    OperationalSignalSeverity,
    OperationalSignalSourceLifecycle,
    OperationalSignalSourceReferenceOut,
    OperationalSignalTriageHistoryOut,
    OperationalSignalTriageNoteOut,
    OperationalSignalTriageOut,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode

_AUDIT_EVENTS = {
    OperationalSignalTriageAction.CLAIM: "platform.operational_signal.claimed",
    OperationalSignalTriageAction.ASSIGN: "platform.operational_signal.assigned",
    OperationalSignalTriageAction.TRANSFER: "platform.operational_signal.transferred",
    OperationalSignalTriageAction.IN_PROGRESS: "platform.operational_signal.in_progress",
    OperationalSignalTriageAction.REMIND_LATER: "platform.operational_signal.reminded_later",
    OperationalSignalTriageAction.NEEDS_ATTENTION: "platform.operational_signal.needs_attention",
    OperationalSignalTriageAction.REMINDER_RETURNED: "platform.operational_signal.reminder_returned",
    OperationalSignalTriageAction.NOTE_ADDED: "platform.operational_signal.note_added",
}


class _TriageChange(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    action: OperationalSignalTriageAction
    state: OperationalSignalTriageState
    assignee_user_id: UUID | None
    reminder_at: datetime | None = None
    reminder_reason: str | None = None
    note_body: str | None = None


class OperationalSignalService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: OperationalSignalRepository | None = None,
    ) -> None:
        super().__init__(settings)
        self.repository = repository or OperationalSignalRepository()

    async def list_signals(
        self,
        *,
        filters: OperationalSignalListQuery,
        params: PageParams,
        permission_codes: frozenset[str],
    ) -> PageData[OperationalSignalOut]:
        now = datetime.now(UTC)
        await self._return_due_reminders(now=now)
        projections, total, pages = await self.repository.list_projections(filters=filters, params=params, now=now)
        signal_ids = [projection.id for projection in projections]
        triage_by_signal = await self.repository.list_triage(signal_ids=signal_ids)
        items = [
            self._project_signal(
                projection=projection,
                triage=triage_by_signal.get(projection.id),
                observed_at=now,
                permission_codes=permission_codes,
            )
            for projection in projections
        ]
        return PageData[OperationalSignalOut](
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
        )

    async def get_signal(
        self,
        *,
        signal_id: UUID,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        now = datetime.now(UTC)
        await self._return_due_reminders(now=now)
        projection = await self.repository.get_projection(signal_id=signal_id)
        if projection is None:
            raise NotFound(error="OPERATIONAL_SIGNAL_NOT_FOUND")
        triage = await self.repository.get_triage(signal_id=signal_id)
        history = await self.repository.list_history(triage_id=UUID(str(triage.id))) if triage else []
        notes = await self.repository.list_notes(triage_id=UUID(str(triage.id))) if triage else []
        projected = self._project_signal(
            projection=projection,
            triage=triage,
            observed_at=now,
            permission_codes=permission_codes,
        )
        return OperationalSignalDetailOut(
            **projected.model_dump(),
            triage_history=tuple(
                OperationalSignalTriageHistoryOut.model_validate(row, from_attributes=True) for row in history
            ),
            notes=tuple(OperationalSignalTriageNoteOut.model_validate(row, from_attributes=True) for row in notes),
        )

    async def list_eligible_assignees(self) -> tuple[OperationalSignalAssigneeOut, ...]:
        users = await self.repository.list_eligible_assignee_users()
        return tuple(
            OperationalSignalAssigneeOut(
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
            )
            for user in users
        )

    async def claim(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            if triage is not None and triage.assignee_user_id is not None:
                raise Conflict(error="OPERATIONAL_SIGNAL_ALREADY_CLAIMED")
            await self._require_eligible_assignee(user_id=actor_user_id, conn=conn)
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.CLAIM,
                    state=triage.state if triage else OperationalSignalTriageState.UNCLAIMED,
                    assignee_user_id=actor_user_id,
                    reminder_at=triage.reminder_at if triage else None,
                    reminder_reason=triage.reminder_reason if triage else None,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def assign(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        assignee_user_id: UUID,
        expected_revision: int,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._require_eligible_assignee(user_id=assignee_user_id, conn=conn)
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=(
                        OperationalSignalTriageAction.TRANSFER
                        if triage is not None
                        and triage.assignee_user_id is not None
                        and UUID(str(triage.assignee_user_id)) != assignee_user_id
                        else OperationalSignalTriageAction.ASSIGN
                    ),
                    state=triage.state if triage else OperationalSignalTriageState.UNCLAIMED,
                    assignee_user_id=assignee_user_id,
                    reminder_at=triage.reminder_at if triage else None,
                    reminder_reason=triage.reminder_reason if triage else None,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def mark_in_progress(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            if triage is None or triage.assignee_user_id is None:
                raise Conflict(error="OPERATIONAL_SIGNAL_ASSIGNEE_REQUIRED")
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.IN_PROGRESS,
                    state=OperationalSignalTriageState.IN_PROGRESS,
                    assignee_user_id=UUID(str(triage.assignee_user_id)),
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def remind_later(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        reminder_at: datetime,
        reason: str,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        now = datetime.now(UTC)
        if reminder_at <= now:
            raise Conflict(error="OPERATIONAL_SIGNAL_REMINDER_INVALID")
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.REMIND_LATER,
                    state=OperationalSignalTriageState.WAITING,
                    assignee_user_id=UUID(str(triage.assignee_user_id)) if triage and triage.assignee_user_id else None,
                    reminder_at=reminder_at,
                    reminder_reason=reason,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def mark_needs_attention(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.NEEDS_ATTENTION,
                    state=OperationalSignalTriageState.UNCLAIMED,
                    assignee_user_id=UUID(str(triage.assignee_user_id)) if triage and triage.assignee_user_id else None,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def add_note(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID,
        expected_revision: int,
        body: str,
        permission_codes: frozenset[str],
    ) -> OperationalSignalDetailOut:
        async with self.tx() as conn:
            projection, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._apply_change(
                projection=projection,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.NOTE_ADDED,
                    state=triage.state if triage else OperationalSignalTriageState.UNCLAIMED,
                    assignee_user_id=UUID(str(triage.assignee_user_id)) if triage and triage.assignee_user_id else None,
                    reminder_at=triage.reminder_at if triage else None,
                    reminder_reason=triage.reminder_reason if triage else None,
                    note_body=body,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def _lock_mutable_signal(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[OperationalSignalProjection, OperationalSignalTriage | None]:
        projection = await self.repository.get_projection(signal_id=signal_id, conn=conn, for_update=True)
        if projection is None:
            raise NotFound(error="OPERATIONAL_SIGNAL_NOT_FOUND")
        triage = await self.repository.get_triage(signal_id=signal_id, conn=conn, for_update=True)
        if projection.source_lifecycle != OperationalSignalProjectionLifecycle.UNRESOLVED:
            raise Conflict(error="OPERATIONAL_SIGNAL_SOURCE_RESOLVED")
        return projection, triage

    @staticmethod
    def _require_revision(*, triage: OperationalSignalTriage | None, expected_revision: int) -> None:
        current_revision = int(triage.revision) if triage else 0
        if current_revision != expected_revision:
            raise Conflict(
                error="OPERATIONAL_SIGNAL_TRIAGE_REVISION_CONFLICT",
                meta={"expectedRevision": expected_revision, "currentRevision": current_revision},
            )

    async def _require_eligible_assignee(self, *, user_id: UUID, conn: BaseDBAsyncClient) -> None:
        if not await self.repository.assignee_is_eligible(user_id=user_id, conn=conn):
            raise Conflict(error="OPERATIONAL_SIGNAL_ASSIGNEE_INELIGIBLE")

    async def _apply_change(
        self,
        *,
        projection: OperationalSignalProjection,
        triage: OperationalSignalTriage | None,
        actor_user_id: UUID | None,
        change: _TriageChange,
        conn: BaseDBAsyncClient,
    ) -> OperationalSignalTriage:
        previous_state = triage.state if triage else None
        previous_assignee = UUID(str(triage.assignee_user_id)) if triage and triage.assignee_user_id else None
        previous_reminder_at = triage.reminder_at if triage else None
        previous_reminder_reason = triage.reminder_reason if triage else None
        if triage is None:
            triage = await self.repository.create_triage(projection_id=projection.id, conn=conn)
            revision = 1
        else:
            revision = int(triage.revision) + 1
        triage = await self.repository.save_triage(
            triage,
            fields={
                "state": change.state,
                "assignee_user_id": change.assignee_user_id,
                "reminder_at": change.reminder_at,
                "reminder_reason": change.reminder_reason,
                "revision": revision,
                "last_actor_user_id": actor_user_id,
            },
            conn=conn,
        )
        await self.repository.append_history(
            conn=conn,
            triage_id=triage.id,
            revision=revision,
            action=change.action,
            actor_user_id=actor_user_id,
            from_state=previous_state,
            to_state=change.state,
            from_assignee_user_id=previous_assignee,
            to_assignee_user_id=change.assignee_user_id,
            reminder_at=previous_reminder_at
            if change.action == OperationalSignalTriageAction.REMINDER_RETURNED
            else change.reminder_at,
            reminder_reason=previous_reminder_reason
            if change.action == OperationalSignalTriageAction.REMINDER_RETURNED
            else change.reminder_reason,
        )
        if change.note_body is not None:
            if actor_user_id is None:
                raise Conflict(error="OPERATIONAL_SIGNAL_NOTE_ACTOR_REQUIRED")
            await self.repository.append_note(
                conn=conn,
                triage_id=triage.id,
                revision=revision,
                actor_user_id=actor_user_id,
                body=change.note_body,
            )
        await self._write_audit(
            signal_id=projection.id,
            actor_user_id=actor_user_id,
            change=change,
            revision=revision,
            conn=conn,
        )
        return triage

    async def _return_due_reminders(self, *, now: datetime) -> None:
        signal_ids = await self.repository.list_due_reminder_signal_ids(now=now)
        for signal_id in signal_ids:
            async with self.tx() as conn:
                projection = await self.repository.get_projection(
                    signal_id=signal_id,
                    conn=conn,
                    for_update=True,
                )
                if projection is None or projection.source_lifecycle != OperationalSignalProjectionLifecycle.UNRESOLVED:
                    continue
                triage = await self.repository.get_triage(
                    signal_id=signal_id,
                    conn=conn,
                    for_update=True,
                )
                if (
                    triage is None
                    or triage.state != OperationalSignalTriageState.WAITING
                    or triage.reminder_at is None
                    or triage.reminder_at > now
                ):
                    continue
                await self._apply_change(
                    projection=projection,
                    triage=triage,
                    actor_user_id=None,
                    change=_TriageChange(
                        action=OperationalSignalTriageAction.REMINDER_RETURNED,
                        state=OperationalSignalTriageState.UNCLAIMED,
                        assignee_user_id=UUID(str(triage.assignee_user_id)) if triage.assignee_user_id else None,
                    ),
                    conn=conn,
                )

    async def _write_audit(
        self,
        *,
        signal_id: UUID,
        actor_user_id: UUID | None,
        change: _TriageChange,
        revision: int,
        conn: BaseDBAsyncClient,
    ) -> None:
        properties: JsonObject = {
            "action": change.action.value,
            "resultRevision": revision,
            "signalId": str(signal_id),
        }
        if change.assignee_user_id is not None:
            properties["assigneeUserId"] = str(change.assignee_user_id)
        if change.reminder_at is not None:
            properties["reminderAt"] = change.reminder_at.isoformat()
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=_AUDIT_EVENTS[change.action],
                actor_user_id=actor_user_id,
                entity_type="operational_signal",
                entity_id=signal_id,
                properties=properties,
            ),
            conn=conn,
        )

    def _project_signal(
        self,
        *,
        projection: OperationalSignalProjection,
        triage: OperationalSignalTriage | None,
        observed_at: datetime,
        permission_codes: frozenset[str],
    ) -> OperationalSignalOut:
        lifecycle = OperationalSignalSourceLifecycle(projection.source_lifecycle)
        required_permission = PlatformPermissionCode(projection.required_permission)
        return OperationalSignalOut(
            id=projection.id,
            source_domain=projection.source_domain,
            signal_type=projection.signal_type,
            source_reference=OperationalSignalSourceReferenceOut(
                type=projection.source_reference_type,
                id=projection.source_reference_id,
            ),
            severity=OperationalSignalSeverity(projection.severity),
            detected_at=projection.detected_at,
            freshness=OperationalSignalFreshnessOut(
                observed_at=observed_at,
                source_updated_at=projection.source_observed_at,
                age_seconds=max(0, int((observed_at - projection.source_observed_at).total_seconds())),
            ),
            priority=OperationalSignalPriorityOut(
                rank=projection.priority_rank,
                reason_keys=tuple(projection.priority_reason_keys),
            ),
            copy_keys=OperationalSignalCopyOut(
                title_key=projection.title_key,
                explanation_key=projection.explanation_key,
                impact_key=projection.impact_key,
            ),
            evidence=OperationalSignalEvidenceOut(summary=projection.sanitized_evidence),
            affected_scope=projection.affected_scope,
            required_permission=required_permission,
            destination=OperationalSignalDestinationOut(
                route_target=projection.destination_target,
                required_permission=required_permission,
                authorized=required_permission in permission_codes,
            ),
            source_lifecycle=lifecycle,
            resolution_condition_key=projection.resolution_condition_key,
            resolved_at=projection.resolved_at,
            policy_id=projection.policy_id,
            policy_revision=projection.policy_revision,
            triage=self._project_triage(triage, lifecycle=lifecycle),
            allowed_triage_actions=self._allowed_triage_actions(
                lifecycle=lifecycle,
                triage=triage,
                permission_codes=permission_codes,
            ),
        )

    @staticmethod
    def _allowed_triage_actions(
        *,
        lifecycle: OperationalSignalSourceLifecycle,
        triage: OperationalSignalTriage | None,
        permission_codes: frozenset[str],
    ) -> tuple[OperationalSignalTriageAction, ...]:
        if lifecycle is OperationalSignalSourceLifecycle.RESOLVED:
            return ()
        state = triage.state if triage else OperationalSignalTriageState.UNCLAIMED
        has_assignee = triage is not None and triage.assignee_user_id is not None
        actions: list[OperationalSignalTriageAction] = []
        if PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM in permission_codes and not has_assignee:
            actions.append(OperationalSignalTriageAction.CLAIM)
        if PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN in permission_codes:
            actions.append(
                OperationalSignalTriageAction.TRANSFER if has_assignee else OperationalSignalTriageAction.ASSIGN
            )
        if PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE in permission_codes:
            if has_assignee and state is not OperationalSignalTriageState.IN_PROGRESS:
                actions.append(OperationalSignalTriageAction.IN_PROGRESS)
            if state is not OperationalSignalTriageState.WAITING:
                actions.append(OperationalSignalTriageAction.REMIND_LATER)
            if state is not OperationalSignalTriageState.UNCLAIMED:
                actions.append(OperationalSignalTriageAction.NEEDS_ATTENTION)
            actions.append(OperationalSignalTriageAction.NOTE_ADDED)
        return tuple(actions)

    @staticmethod
    def _project_triage(
        triage: OperationalSignalTriage | None,
        *,
        lifecycle: OperationalSignalSourceLifecycle,
    ) -> OperationalSignalTriageOut:
        if lifecycle is OperationalSignalSourceLifecycle.RESOLVED:
            return OperationalSignalTriageOut(
                revision=int(triage.revision) if triage else 0,
                state=OperationalSignalTriageState.SOURCE_RECOVERED,
                assignee_user_id=triage.assignee_user_id if triage else None,
                reminder_at=triage.reminder_at if triage else None,
                reminder_reason=triage.reminder_reason if triage else None,
                last_actor_user_id=triage.last_actor_user_id if triage else None,
                updated_at=triage.updated_at if triage else None,
            )
        if triage is None:
            return OperationalSignalTriageOut(
                revision=0,
                state=OperationalSignalTriageState.UNCLAIMED,
            )
        return OperationalSignalTriageOut(
            revision=int(triage.revision),
            state=triage.state,
            assignee_user_id=triage.assignee_user_id,
            reminder_at=triage.reminder_at,
            reminder_reason=triage.reminder_reason,
            last_actor_user_id=triage.last_actor_user_id,
            updated_at=triage.updated_at,
        )
