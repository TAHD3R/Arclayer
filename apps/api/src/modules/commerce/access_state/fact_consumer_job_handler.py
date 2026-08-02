from __future__ import annotations

from src.core.exceptions import APIError
from src.models.commerce.access_facts import CommercialAccessFactKind
from src.modules.commerce.access_state.fact_consumer_job_contract import (
    COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE_CODE,
    COMMERCE_ACCESS_FACT_INVALID_CODE,
    CommercialAccessFactJobInput,
    CommercialAccessFactJobResult,
    CommercialAccessFactJobTarget,
)
from src.modules.hosting.commercial_access_consumer import HostingCommercialAccessConsumer
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError
from src.modules.jobs.execution_registry import JobExecutionContext, JobHandlerTerminalError
from src.modules.jobs.execution_schema import JobProgressUpdate
from src.modules.system.admin.notifications.commercial_lifecycle_consumer import (
    CommercialLifecycleNotificationConsumer,
)


class CommercialAccessFactJobHandler:
    """Drive one committed Commerce fact through its owning idempotent consumer."""

    def __init__(
        self,
        *,
        hosting: HostingCommercialAccessConsumer,
        notifications: CommercialLifecycleNotificationConsumer,
    ) -> None:
        self._hosting = hosting
        self._notifications = notifications

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[CommercialAccessFactJobTarget, CommercialAccessFactJobInput],
    ) -> CommercialAccessFactJobResult | None:
        _ = context
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[CommercialAccessFactJobTarget, CommercialAccessFactJobInput],
    ) -> CommercialAccessFactJobResult:
        target = context.target
        await context.report_progress(_progress("consuming", 0))
        try:
            if target.kind == CommercialAccessFactKind.HOSTING_HANDOFF:
                await self._hosting.consume(source_identity=target.source_identity)
            elif target.kind == CommercialAccessFactKind.LIFECYCLE_NOTIFICATION:
                await self._notifications.consume(
                    source_identity=target.source_identity,
                    lease=context.lease,
                )
            else:
                raise PermanentJobExecutionError(
                    code=COMMERCE_ACCESS_FACT_INVALID_CODE,
                    safe_message="Commerce access fact kind is not supported by the worker",
                )
        except APIError as exc:
            if exc.status_code >= 500:
                raise TransientJobExecutionError(
                    code=COMMERCE_ACCESS_FACT_CONSUMER_UNAVAILABLE_CODE,
                    safe_message="Commerce access fact consumer is temporarily unavailable",
                ) from exc
            raise PermanentJobExecutionError(
                code=COMMERCE_ACCESS_FACT_INVALID_CODE,
                safe_message="Commerce access fact was rejected by its consumer",
            ) from exc
        await context.report_progress(_progress("settling", 1))
        return CommercialAccessFactJobResult(
            fact_kind=target.kind,
            source_identity=target.source_identity,
        )

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[CommercialAccessFactJobTarget, CommercialAccessFactJobInput],
        error: JobHandlerTerminalError,
    ) -> None:
        _ = context, error


def _progress(phase: str, completed: int) -> JobProgressUpdate:
    return JobProgressUpdate(
        phase=phase,
        progress_completed=completed,
        progress_total=1,
    )
