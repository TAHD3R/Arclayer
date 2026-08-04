from __future__ import annotations

from datetime import UTC, datetime
from math import ceil
from typing import Final, Literal, Protocol
from uuid import UUID

from tortoise.expressions import Q

from src.config import Settings
from src.core.exceptions import NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService, ServiceContractError
from src.models.agents.runtime_recovery_v1 import (
    AgentRunExecutionEffectDisposition,
    AgentRunExecutionEffectRecord,
)
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
)
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobAttemptRecord,
    JobFailureClassification,
    JobInternalStatus,
)
from src.modules.ai.runtime_platform_recovery_port import AgentRunPlatformRecoveryPort
from src.modules.ai.runtime_platform_recovery_schema import PlatformAIRecoveryCommand, PlatformAIRecoveryReceipt
from src.modules.platform_ai.schema import (
    PlatformAIProviderActionAvailabilityOut,
    PlatformAIProviderOut,
    PlatformAIProviderReadinessOut,
    PlatformAITaskAction,
    PlatformAITaskActionAvailabilityOut,
    PlatformAITaskListQuery,
    PlatformAITaskOut,
)
from src.modules.system.ai_providers.schema import SystemAIProviderOut

_ACTIONABLE_STATUSES: Final[tuple[AgentRunStatusV1, ...]] = (
    AgentRunStatusV1.CREATED,
    AgentRunStatusV1.QUEUED,
    AgentRunStatusV1.RUNNING,
    AgentRunStatusV1.CANCELLATION_REQUESTED,
    AgentRunStatusV1.INTERRUPTED,
    AgentRunStatusV1.FAILED,
)
_FAILED_JOB_STATUSES: Final[frozenset[JobInternalStatus]] = frozenset({
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
})
_RETRYABLE_FAILURES: Final[frozenset[JobFailureClassification]] = frozenset({
    JobFailureClassification.TRANSIENT,
    JobFailureClassification.WORKER_LOST,
})
_TERMINAL_JOB_STATUSES: Final[frozenset[JobInternalStatus]] = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})


class PlatformAIRecoveryPort(Protocol):
    async def execute(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt: ...


class SystemAIProviderReader(Protocol):
    async def list_providers(self) -> list[SystemAIProviderOut]: ...


class PlatformAIOperationsService(BaseService):
    """Safe Platform projections over durable AI Run and Job facts.

    This module delegates mutations to the Run/Job-owned platform authority port
    and re-projects its durable receipt without impersonating a Workspace actor.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        *,
        provider_reader: SystemAIProviderReader | None = None,
        recovery_port: PlatformAIRecoveryPort | None = None,
    ) -> None:
        super().__init__(settings=settings)
        self._provider_reader = provider_reader
        self._recovery_port = recovery_port or AgentRunPlatformRecoveryPort(self.settings)

    async def list_tasks(
        self,
        *,
        params: PageParams,
        query: PlatformAITaskListQuery,
    ) -> PageData[PlatformAITaskOut]:
        runs = AgentRunV1Record.all().order_by("-updated_at", "-id")
        runs = runs.filter(status=query.status) if query.status is not None else runs.filter(_attention_task_filter())
        total = await runs.count()
        page_runs = await runs.offset((params.page - 1) * params.size).limit(params.size)
        jobs = await self._jobs_by_run(page_runs)
        effects, attempts = await _recovery_evidence_by_job(job_ids=tuple(jobs))
        pending_approval_run_ids = await self._pending_approval_run_ids(page_runs)
        items = tuple(
            self._to_task_out(
                run=run,
                job=jobs.get(run.job_id) if run.job_id is not None else None,
                execution_effect=effects.get(run.job_id) if run.job_id is not None else None,
                latest_attempt=attempts.get(run.job_id) if run.job_id is not None else None,
                waiting_for_workspace_approval=run.id in pending_approval_run_ids,
            )
            for run in page_runs
        )
        pages = ceil(total / params.size) if total else 0
        return PageData(
            items=items,
            total=total,
            page=params.page,
            size=params.size,
            pages=pages,
            next=params.page + 1 if params.page < pages else None,
            prev=params.page - 1 if params.page > 1 else None,
        )

    async def execute_task_recovery(
        self,
        *,
        command: PlatformAIRecoveryCommand,
    ) -> PlatformAITaskOut:
        receipt = await self._recovery_port.execute(command=command)
        return await self.get_task(task_id=receipt.task_id)

    async def get_task(self, *, task_id: UUID) -> PlatformAITaskOut:
        run = await AgentRunV1Record.filter(id=task_id).first()
        if run is None:
            raise NotFound(error="AI_PLATFORM_TASK_NOT_FOUND", message=t("errors", "AI_PLATFORM_TASK_NOT_FOUND"))
        job = await BackgroundJobRecord.filter(id=run.job_id).first() if run.job_id is not None else None
        effects, attempts = await _recovery_evidence_by_job(job_ids=(job.id,) if job is not None else ())
        waiting_for_workspace_approval = await AgentApprovalV1Record.filter(
            run_id=run.id,
            status=AgentApprovalStatusV1.PENDING,
        ).exists()
        return self._to_task_out(
            run=run,
            job=job,
            execution_effect=effects.get(job.id) if job is not None else None,
            latest_attempt=attempts.get(job.id) if job is not None else None,
            waiting_for_workspace_approval=waiting_for_workspace_approval,
        )

    async def provider_readiness(self) -> PlatformAIProviderReadinessOut:
        if self._provider_reader is None:
            raise ServiceContractError("AI provider readiness requires a provider reader")
        providers = await self._provider_reader.list_providers()
        now = datetime.now(UTC)
        items = tuple(self._to_provider_out(provider=provider, now=now) for provider in providers)
        missing = () if any(item.routable for item in items) else ("AI_PROVIDER_ROUTABLE",)
        return PlatformAIProviderReadinessOut(items=items, missing_prerequisite_codes=missing)

    async def _jobs_by_run(self, runs: list[AgentRunV1Record]) -> dict[UUID, BackgroundJobRecord]:
        job_ids = [run.job_id for run in runs if run.job_id is not None]
        if not job_ids:
            return {}
        jobs = await BackgroundJobRecord.filter(id__in=job_ids).all()
        return {job.id: job for job in jobs}

    async def _pending_approval_run_ids(self, runs: list[AgentRunV1Record]) -> frozenset[UUID]:
        run_ids = [run.id for run in runs]
        if not run_ids:
            return frozenset()
        rows = await AgentApprovalV1Record.filter(
            run_id__in=run_ids,
            status=AgentApprovalStatusV1.PENDING,
        ).values("run_id")
        return frozenset(UUID(str(row["run_id"])) for row in rows)

    def _to_task_out(
        self,
        *,
        run: AgentRunV1Record,
        job: BackgroundJobRecord | None,
        execution_effect: AgentRunExecutionEffectRecord | None = None,
        latest_attempt: JobAttemptRecord | None = None,
        waiting_for_workspace_approval: bool,
    ) -> PlatformAITaskOut:
        outcome = _task_outcome(run=run, job=job, waiting_for_workspace_approval=waiting_for_workspace_approval)
        return PlatformAITaskOut(
            id=run.id,
            workspace_id=run.workspace_id,
            project_id=run.project_id,
            job_id=run.job_id,
            status=run.status,
            durable_job_status=job.internal_status if job is not None else None,
            execution_mode=run.execution_mode,
            outcome=outcome,
            created_at=run.created_at,
            updated_at=run.updated_at,
            terminal_at=run.terminal_at,
            interrupt_reason=run.interrupt_reason,
            waiting_for_workspace_approval=waiting_for_workspace_approval,
            status_key=job.status_key if job is not None else None,
            progress_completed=job.progress_completed if job is not None else 0,
            progress_total=job.progress_total if job is not None else None,
            error_code=_safe_error_code(run=run, job=job),
            last_sequence=run.last_sequence,
            evidence_updated_at=max(run.updated_at, job.updated_at) if job is not None else run.updated_at,
            actions=_task_actions(
                run=run,
                job=job,
                outcome=outcome,
                execution_effect=execution_effect,
                latest_attempt=latest_attempt,
            ),
        )

    @staticmethod
    def _to_provider_out(*, provider: SystemAIProviderOut, now: datetime) -> PlatformAIProviderOut:
        permitted = (
            provider.is_active
            and not provider.is_archived
            and not provider.cleanup_required
            and (provider.expires_at is None or provider.expires_at > now)
        )
        response_mismatch = provider.readiness_failure_code == "AI_PROVIDER_READINESS_RESPONSE_MISMATCH"
        reachable = (
            True
            if provider.readiness_status == "healthy" or response_mismatch
            else False
            if provider.readiness_status == "unhealthy"
            else None
        )
        routable = provider.has_virtual_key and permitted and provider.readiness_status == "healthy"
        credential_port_unavailable = "AI_PROVIDER_CREDENTIAL_REVOCATION_PORT_UNAVAILABLE"
        return PlatformAIProviderOut(
            id=provider.id,
            provider=provider.provider,
            label=provider.label,
            default_model=provider.default_model,
            desired_is_active=provider.is_active,
            archived=provider.is_archived,
            cleanup_required=provider.cleanup_required,
            configured=provider.has_virtual_key,
            reachable=reachable,
            permitted=permitted,
            routable=routable,
            health=provider.readiness_status,
            health_failure_code=provider.readiness_failure_code,
            freshness_at=provider.readiness_checked_at,
            expires_at=provider.expires_at,
            last_used_at=provider.last_used_at,
            actions=(
                PlatformAIProviderActionAvailabilityOut(
                    action="test_readiness",
                    available=provider.has_virtual_key and not provider.is_archived,
                ),
                PlatformAIProviderActionAvailabilityOut(
                    action="enable",
                    available=not provider.is_active and not provider.is_archived,
                ),
                PlatformAIProviderActionAvailabilityOut(action="disable", available=provider.is_active),
                PlatformAIProviderActionAvailabilityOut(
                    action="rotate_credentials",
                    available=provider.has_virtual_key and not provider.is_archived,
                ),
                PlatformAIProviderActionAvailabilityOut(
                    action="remove_credentials", available=False, reason_code=credential_port_unavailable
                ),
                PlatformAIProviderActionAvailabilityOut(
                    action="archive",
                    available=not provider.is_active and not provider.is_archived,
                ),
                PlatformAIProviderActionAvailabilityOut(
                    action="restore",
                    available=provider.is_archived,
                ),
                PlatformAIProviderActionAvailabilityOut(
                    action="delete",
                    available=(provider.is_archived and not provider.is_active and not provider.cleanup_required),
                    reason_code=("AI_PROVIDER_LITELLM_CLEANUP_REQUIRED" if provider.cleanup_required else None),
                ),
            ),
        )


def _task_outcome(
    *,
    run: AgentRunV1Record,
    job: BackgroundJobRecord | None,
    waiting_for_workspace_approval: bool,
) -> Literal["active", "waiting_workspace_approval", "succeeded", "failed", "partial", "unknown", "cancelled"]:
    if waiting_for_workspace_approval:
        return "waiting_workspace_approval"
    if job is None:
        terminal = {AgentRunStatusV1.COMPLETED, AgentRunStatusV1.CANCELLED, AgentRunStatusV1.FAILED}
        return "unknown" if run.status in terminal else "active"
    if run.status == AgentRunStatusV1.COMPLETED and job.internal_status == JobInternalStatus.SUCCEEDED:
        return "succeeded"
    if run.status == AgentRunStatusV1.CANCELLED and job.internal_status == JobInternalStatus.CANCELLED:
        return "cancelled"
    if run.status == AgentRunStatusV1.FAILED and job.internal_status in _FAILED_JOB_STATUSES:
        return "partial" if job.result_reference is not None else "failed"
    terminal = {AgentRunStatusV1.COMPLETED, AgentRunStatusV1.CANCELLED, AgentRunStatusV1.FAILED}
    if run.status in terminal:
        return "unknown"
    return "active"


def _safe_error_code(*, run: AgentRunV1Record, job: BackgroundJobRecord | None) -> str | None:
    if job is not None and job.error_code:
        return job.error_code
    if isinstance(run.error, dict):
        for key in ("public_error_code", "code"):
            value = run.error.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _task_actions(
    *,
    run: AgentRunV1Record,
    job: BackgroundJobRecord | None,
    outcome: str,
    execution_effect: AgentRunExecutionEffectRecord | None,
    latest_attempt: JobAttemptRecord | None,
) -> tuple[PlatformAITaskActionAvailabilityOut, ...]:
    retry_eligible = (
        run.status == AgentRunStatusV1.FAILED
        and job is not None
        and job.internal_status in _FAILED_JOB_STATUSES
        and execution_effect is None
        and latest_attempt is not None
        and latest_attempt.failure_classification in _RETRYABLE_FAILURES
    )
    reconcile_eligible = (
        outcome in {"partial", "unknown"}
        and execution_effect is not None
        and execution_effect.disposition == AgentRunExecutionEffectDisposition.COMMITTED
    )
    cancel_eligible = (
        run.status in {AgentRunStatusV1.CREATED, AgentRunStatusV1.QUEUED, AgentRunStatusV1.RUNNING}
        and outcome == "active"
    )
    return (
        _task_action_availability(
            action="retry",
            state_eligible=retry_eligible,
        ),
        _task_action_availability(
            action="cancel",
            state_eligible=cancel_eligible,
        ),
        _task_action_availability(
            action="reconcile",
            state_eligible=reconcile_eligible,
        ),
    )


def _attention_task_filter() -> Q:
    completed_mismatch = Q(status=AgentRunStatusV1.COMPLETED) & (
        Q(job_id=None) | ~Q(job__internal_status=JobInternalStatus.SUCCEEDED)
    )
    cancelled_mismatch = Q(status=AgentRunStatusV1.CANCELLED) & (
        Q(job_id=None) | ~Q(job__internal_status=JobInternalStatus.CANCELLED)
    )
    return Q(status__in=_ACTIONABLE_STATUSES) | completed_mismatch | cancelled_mismatch


def _task_action_availability(
    *,
    action: PlatformAITaskAction,
    state_eligible: bool,
) -> PlatformAITaskActionAvailabilityOut:
    reason_code = None if state_eligible else _action_state_error(action)
    return PlatformAITaskActionAvailabilityOut(
        action=action,
        state_eligible=state_eligible,
        available=True,
        reason_code=reason_code,
    )


def _action_state_error(action: PlatformAITaskAction) -> str:
    return f"AI_PLATFORM_TASK_{action.upper()}_NOT_ELIGIBLE"


async def _recovery_evidence_by_job(
    *,
    job_ids: tuple[UUID, ...],
) -> tuple[dict[UUID, AgentRunExecutionEffectRecord], dict[UUID, JobAttemptRecord]]:
    if not job_ids:
        return {}, {}
    effects = await (
        AgentRunExecutionEffectRecord.filter(job_id__in=job_ids).order_by("job_id", "-registered_at", "-id").all()
    )
    attempts = await JobAttemptRecord.filter(job_id__in=job_ids).order_by("job_id", "-attempt_number").all()
    latest_effects: dict[UUID, AgentRunExecutionEffectRecord] = {}
    latest_attempts: dict[UUID, JobAttemptRecord] = {}
    for effect in effects:
        latest_effects.setdefault(effect.job_id, effect)
    for attempt in attempts:
        latest_attempts.setdefault(attempt.job_id, attempt)
    return latest_effects, latest_attempts
