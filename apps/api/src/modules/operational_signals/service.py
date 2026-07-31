from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.services import BaseService
from src.models.jobs.background_job import BackgroundJobRecord, JobInternalStatus
from src.models.operations_signals import (
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
    OperationalSignalTriageOut,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode

_SIGNAL_SOURCE_DOMAIN = "jobs"
_SIGNAL_TYPE = "background_job_failed"
_PRIORITY_RANK = 300

_AUDIT_EVENTS = {
    OperationalSignalTriageAction.CLAIM: "platform.operational_signal.claimed",
    OperationalSignalTriageAction.ASSIGN: "platform.operational_signal.assigned",
    OperationalSignalTriageAction.IN_PROGRESS: "platform.operational_signal.in_progress",
    OperationalSignalTriageAction.REMIND_LATER: "platform.operational_signal.reminded_later",
    OperationalSignalTriageAction.NEEDS_ATTENTION: "platform.operational_signal.needs_attention",
    OperationalSignalTriageAction.REMINDER_RETURNED: "platform.operational_signal.reminder_returned",
}


class _TriageChange(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    action: OperationalSignalTriageAction
    state: OperationalSignalTriageState
    assignee_user_id: UUID | None
    reminder_at: datetime | None = None
    reminder_reason: str | None = None


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
        jobs, total, pages = await self.repository.list_source_jobs(filters=filters, params=params, now=now)
        signal_ids = [UUID(str(job.id)) for job in jobs]
        triage_by_signal = await self.repository.list_triage(signal_ids=signal_ids)
        items = [
            self._project_signal(
                job=job,
                triage=triage_by_signal.get(UUID(str(job.id))),
                observed_at=now,
                permission_codes=permission_codes,
            )
            for job in jobs
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
        job = await self.repository.get_source_job(signal_id=signal_id)
        if job is None:
            raise NotFound(error="OPERATIONAL_SIGNAL_NOT_FOUND")
        triage = await self.repository.get_triage(signal_id=signal_id)
        history = await self.repository.list_history(triage_id=UUID(str(triage.id))) if triage else []
        projected = self._project_signal(
            job=job,
            triage=triage,
            observed_at=now,
            permission_codes=permission_codes,
        )
        return OperationalSignalDetailOut(
            **projected.model_dump(),
            triage_history=tuple(
                OperationalSignalTriageHistoryOut.model_validate(row, from_attributes=True) for row in history
            ),
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
            job, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            if triage is not None and triage.assignee_user_id is not None:
                raise Conflict(error="OPERATIONAL_SIGNAL_ALREADY_CLAIMED")
            await self._require_eligible_assignee(user_id=actor_user_id, conn=conn)
            await self._apply_change(
                job=job,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.CLAIM,
                    state=triage.state if triage else OperationalSignalTriageState.NEEDS_ATTENTION,
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
            job, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._require_eligible_assignee(user_id=assignee_user_id, conn=conn)
            await self._apply_change(
                job=job,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.ASSIGN,
                    state=triage.state if triage else OperationalSignalTriageState.NEEDS_ATTENTION,
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
            job, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            if triage is None or triage.assignee_user_id is None:
                raise Conflict(error="OPERATIONAL_SIGNAL_ASSIGNEE_REQUIRED")
            await self._apply_change(
                job=job,
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
            job, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._apply_change(
                job=job,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.REMIND_LATER,
                    state=OperationalSignalTriageState.REMIND_LATER,
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
            job, triage = await self._lock_mutable_signal(signal_id=signal_id, conn=conn)
            self._require_revision(triage=triage, expected_revision=expected_revision)
            await self._apply_change(
                job=job,
                triage=triage,
                actor_user_id=actor_user_id,
                change=_TriageChange(
                    action=OperationalSignalTriageAction.NEEDS_ATTENTION,
                    state=OperationalSignalTriageState.NEEDS_ATTENTION,
                    assignee_user_id=UUID(str(triage.assignee_user_id)) if triage and triage.assignee_user_id else None,
                ),
                conn=conn,
            )
        return await self.get_signal(signal_id=signal_id, permission_codes=permission_codes)

    async def _lock_mutable_signal(
        self,
        *,
        signal_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, OperationalSignalTriage | None]:
        job = await self.repository.get_source_job(signal_id=signal_id, conn=conn, for_update=True)
        if job is None:
            raise NotFound(error="OPERATIONAL_SIGNAL_NOT_FOUND")
        triage = await self.repository.get_triage(signal_id=signal_id, conn=conn, for_update=True)
        if job.internal_status != JobInternalStatus.FAILED:
            raise Conflict(error="OPERATIONAL_SIGNAL_SOURCE_RESOLVED")
        return job, triage

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
        job: BackgroundJobRecord,
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
            triage = await self.repository.create_triage(signal_id=UUID(str(job.id)), conn=conn)
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
        await self._write_audit(
            signal_id=UUID(str(job.id)),
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
                job = await self.repository.get_source_job(
                    signal_id=signal_id,
                    conn=conn,
                    for_update=True,
                )
                if job is None or job.internal_status != JobInternalStatus.FAILED:
                    continue
                triage = await self.repository.get_triage(
                    signal_id=signal_id,
                    conn=conn,
                    for_update=True,
                )
                if (
                    triage is None
                    or triage.state != OperationalSignalTriageState.REMIND_LATER
                    or triage.reminder_at is None
                    or triage.reminder_at > now
                ):
                    continue
                await self._apply_change(
                    job=job,
                    triage=triage,
                    actor_user_id=None,
                    change=_TriageChange(
                        action=OperationalSignalTriageAction.REMINDER_RETURNED,
                        state=OperationalSignalTriageState.NEEDS_ATTENTION,
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
            "sourceJobId": str(signal_id),
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
        job: BackgroundJobRecord,
        triage: OperationalSignalTriage | None,
        observed_at: datetime,
        permission_codes: frozenset[str],
    ) -> OperationalSignalOut:
        signal_id = UUID(str(job.id))
        detected_at = job.completed_at or job.updated_at
        source_updated_at = job.updated_at
        lifecycle = (
            OperationalSignalSourceLifecycle.UNRESOLVED
            if job.internal_status == JobInternalStatus.FAILED
            else OperationalSignalSourceLifecycle.RESOLVED
        )
        return OperationalSignalOut(
            id=signal_id,
            source_domain=_SIGNAL_SOURCE_DOMAIN,
            signal_type=_SIGNAL_TYPE,
            source_reference=OperationalSignalSourceReferenceOut(type="background_job", id=signal_id),
            severity=OperationalSignalSeverity.HIGH,
            detected_at=detected_at,
            freshness=OperationalSignalFreshnessOut(
                observed_at=observed_at,
                source_updated_at=source_updated_at,
                age_seconds=max(0, int((observed_at - source_updated_at).total_seconds())),
            ),
            priority=OperationalSignalPriorityOut(
                rank=_PRIORITY_RANK,
                reason_keys=("inbox:BACKGROUND_JOB_FAILED_PRIORITY",),
            ),
            copy_keys=OperationalSignalCopyOut(
                title_key="inbox:BACKGROUND_JOB_FAILED_TITLE",
                explanation_key="inbox:BACKGROUND_JOB_FAILED_EXPLANATION",
                impact_key="inbox:BACKGROUND_JOB_FAILED_IMPACT",
            ),
            evidence=OperationalSignalEvidenceOut(
                job_type=job.job_type,
                workload_class=str(job.workload_class),
                attempt_count=job.attempt_count,
                error_code=job.error_code,
                status_key=job.status_key,
                workspace_id=job.workspace_id,
                project_id=job.project_id,
                site_id=job.site_id,
            ),
            required_permission=PlatformPermissionCode.JOBS_MANAGE,
            destination=OperationalSignalDestinationOut(
                path=f"/operations/jobs?jobId={encode_uuid(signal_id)}",
                label_key="inbox:BACKGROUND_JOB_DESTINATION",
            ),
            source_lifecycle=lifecycle,
            resolution_condition_key="inbox:BACKGROUND_JOB_RESOLUTION_CONDITION",
            resolved_at=job.updated_at if lifecycle == OperationalSignalSourceLifecycle.RESOLVED else None,
            triage=self._project_triage(triage),
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
        state = triage.state if triage else OperationalSignalTriageState.NEEDS_ATTENTION
        has_assignee = triage is not None and triage.assignee_user_id is not None
        actions: list[OperationalSignalTriageAction] = []
        if PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM in permission_codes and not has_assignee:
            actions.append(OperationalSignalTriageAction.CLAIM)
        if PlatformPermissionCode.OPERATIONS_SIGNALS_ASSIGN in permission_codes:
            actions.append(OperationalSignalTriageAction.ASSIGN)
        if PlatformPermissionCode.OPERATIONS_SIGNALS_TRIAGE in permission_codes:
            if has_assignee and state is not OperationalSignalTriageState.IN_PROGRESS:
                actions.append(OperationalSignalTriageAction.IN_PROGRESS)
            if state is not OperationalSignalTriageState.REMIND_LATER:
                actions.append(OperationalSignalTriageAction.REMIND_LATER)
            if state is not OperationalSignalTriageState.NEEDS_ATTENTION:
                actions.append(OperationalSignalTriageAction.NEEDS_ATTENTION)
        return tuple(actions)

    @staticmethod
    def _project_triage(triage: OperationalSignalTriage | None) -> OperationalSignalTriageOut:
        if triage is None:
            return OperationalSignalTriageOut(
                revision=0,
                state=OperationalSignalTriageState.NEEDS_ATTENTION,
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
