from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from src.core.exceptions import Conflict
from src.models.agents.runtime_recovery_v1 import AgentRunExecutionEffectDisposition
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunStatusV1
from src.models.jobs.background_job import JobFailureClassification, JobInternalStatus
from src.modules.ai.runtime_platform_recovery_actions import AgentRunPlatformRecoveryActionPort
from src.modules.ai.runtime_platform_recovery_port import AgentRunPlatformRecoveryPort
from src.modules.ai.runtime_platform_recovery_schema import (
    PlatformAIRecoveryAction,
    PlatformAIRecoveryAuthority,
    PlatformAIRecoveryCommand,
    PlatformAIRecoveryReceipt,
)
from src.modules.platform_ai.router import retry_platform_ai_task
from src.modules.platform_ai.schema import PlatformAITaskActionRequest
from src.modules.platform_ai.service import PlatformAIOperationsService
from src.modules.system.ai_providers.schema import SystemAIProviderOut


def _run(*, status: AgentRunStatusV1, job_id=None) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=uuid4(),
        workspace_id=uuid4(),
        project_id=uuid4(),
        job_id=job_id or uuid4(),
        status=status,
        execution_mode=AgentExecutionModeV1.BUILD,
        created_at=now,
        updated_at=now,
        terminal_at=now if status in {AgentRunStatusV1.COMPLETED, AgentRunStatusV1.FAILED} else None,
        interrupt_reason=None,
        last_sequence=3,
        error={"code": "AI_PROVIDER_UNAVAILABLE", "message": "workspace prompt must remain hidden"},
    )


def _job(*, status: JobInternalStatus, result_reference=None) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        internal_status=status,
        status_key="AI_AGENT_RUN_STATUS_FAILED",
        progress_completed=2,
        progress_total=3,
        error_code="AI_PROVIDER_UNAVAILABLE",
        updated_at=now,
        result_reference=result_reference,
    )


def _effect(*, disposition: AgentRunExecutionEffectDisposition) -> SimpleNamespace:
    return SimpleNamespace(disposition=disposition)


def _attempt(*, failure_classification: JobFailureClassification) -> SimpleNamespace:
    return SimpleNamespace(failure_classification=failure_classification)


def test_platform_ai_task_projection_marks_partial_outcomes_without_content() -> None:
    service = PlatformAIOperationsService()
    task = service._to_task_out(
        run=_run(status=AgentRunStatusV1.FAILED),
        job=_job(status=JobInternalStatus.FAILED, result_reference={"safe": "reference"}),
        execution_effect=_effect(disposition=AgentRunExecutionEffectDisposition.COMMITTED),
        waiting_for_workspace_approval=False,
    )

    assert task.outcome == "partial"
    assert task.error_code == "AI_PROVIDER_UNAVAILABLE"
    assert {item.action: item.state_eligible for item in task.actions} == {
        "retry": False,
        "cancel": False,
        "reconcile": True,
    }
    cancel = next(item for item in task.actions if item.action == "cancel")
    retry = next(item for item in task.actions if item.action == "retry")
    assert cancel.available
    assert cancel.reason_code == "AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE"
    assert retry.available
    assert retry.reason_code == "AI_PLATFORM_TASK_RETRY_NOT_ELIGIBLE"
    assert "workspace prompt" not in task.model_dump_json()


def test_platform_ai_task_projection_requires_pre_effect_transient_failure_for_retry() -> None:
    service = PlatformAIOperationsService()
    task = service._to_task_out(
        run=_run(status=AgentRunStatusV1.FAILED),
        job=_job(status=JobInternalStatus.DEAD_LETTERED),
        latest_attempt=_attempt(failure_classification=JobFailureClassification.WORKER_LOST),
        waiting_for_workspace_approval=False,
    )

    retry = next(item for item in task.actions if item.action == "retry")
    reconcile = next(item for item in task.actions if item.action == "reconcile")
    assert retry.available and retry.state_eligible
    assert not reconcile.state_eligible


def test_platform_ai_task_projection_marks_terminal_run_job_mismatch_unknown() -> None:
    service = PlatformAIOperationsService()
    task = service._to_task_out(
        run=_run(status=AgentRunStatusV1.COMPLETED),
        job=_job(status=JobInternalStatus.FAILED),
        execution_effect=_effect(disposition=AgentRunExecutionEffectDisposition.COMMITTED),
        waiting_for_workspace_approval=False,
    )

    assert task.outcome == "unknown"
    assert next(item for item in task.actions if item.action == "reconcile").state_eligible


def test_platform_ai_task_projection_marks_terminal_run_with_nonterminal_job_unknown() -> None:
    service = PlatformAIOperationsService()
    task = service._to_task_out(
        run=_run(status=AgentRunStatusV1.FAILED),
        job=_job(status=JobInternalStatus.RUNNING),
        waiting_for_workspace_approval=False,
    )

    assert task.outcome == "unknown"
    reconcile = next(item for item in task.actions if item.action == "reconcile")
    assert not reconcile.state_eligible
    assert reconcile.reason_code == "AI_PLATFORM_TASK_RECONCILE_NOT_ELIGIBLE"


class FakeRecoveryPort:
    def __init__(self, receipt: PlatformAIRecoveryReceipt | None = None, error: Exception | None = None) -> None:
        self.receipt = receipt
        self.error = error
        self.commands: list[PlatformAIRecoveryCommand] = []

    async def execute(self, *, command: PlatformAIRecoveryCommand) -> PlatformAIRecoveryReceipt:
        self.commands.append(command)
        if self.error is not None:
            raise self.error
        assert self.receipt is not None
        return self.receipt


def _command(*, task_id, action: PlatformAIRecoveryAction = "cancel") -> PlatformAIRecoveryCommand:
    return PlatformAIRecoveryCommand(
        task_id=task_id,
        action=action,
        authority=PlatformAIRecoveryAuthority(actor_user_id=uuid4(), correlation_id=uuid4()),
        idempotency_key="platform-task-command",
        reason="operator investigation",
    )


async def test_recovery_receipt_reprojects_the_current_task() -> None:
    task_id = uuid4()
    receipt = PlatformAIRecoveryReceipt(
        task_id=task_id,
        action="cancel",
        disposition="already_applied",
        workspace_id=uuid4(),
        job_id=uuid4(),
    )
    port = FakeRecoveryPort(receipt)
    service = PlatformAIOperationsService(recovery_port=port)
    expected = service._to_task_out(
        run=_run(status=AgentRunStatusV1.CANCELLATION_REQUESTED, job_id=receipt.job_id),
        job=_job(status=JobInternalStatus.RUNNING),
        waiting_for_workspace_approval=False,
    )
    with patch.object(service, "get_task", new_callable=AsyncMock) as get_task:
        get_task.return_value = expected

        result = await service.execute_task_recovery(command=_command(task_id=task_id))

        assert result == expected
        assert port.commands[0].task_id == task_id
        get_task.assert_awaited_once_with(task_id=task_id)


async def test_pending_workspace_approval_denial_propagates_without_reprojection() -> None:
    task_id = uuid4()
    port = FakeRecoveryPort(error=Conflict(error="AI_PLATFORM_TASK_WORKSPACE_APPROVAL_NON_AUTHORITY"))
    service = PlatformAIOperationsService(recovery_port=port)
    with patch.object(service, "get_task", new_callable=AsyncMock) as get_task:
        with pytest.raises(Conflict, match="AI_PLATFORM_TASK_WORKSPACE_APPROVAL_NON_AUTHORITY"):
            await service.execute_task_recovery(command=_command(task_id=task_id))

        get_task.assert_not_awaited()


async def test_exact_replay_receipt_is_reprojected_without_reissuing_the_command() -> None:
    task_id = uuid4()
    receipt = PlatformAIRecoveryReceipt(
        task_id=task_id,
        action="cancel",
        disposition="already_applied",
        workspace_id=uuid4(),
        job_id=uuid4(),
    )
    port = FakeRecoveryPort(receipt)
    service = PlatformAIOperationsService(recovery_port=port)
    expected = service._to_task_out(
        run=_run(status=AgentRunStatusV1.CANCELLATION_REQUESTED, job_id=receipt.job_id),
        job=_job(status=JobInternalStatus.RUNNING),
        waiting_for_workspace_approval=False,
    )
    with patch.object(service, "get_task", new_callable=AsyncMock) as get_task:
        get_task.return_value = expected

        command = _command(task_id=task_id)
        assert await service.execute_task_recovery(command=command) == expected
        assert await service.execute_task_recovery(command=command) == expected
        assert port.commands == [command, command]
        assert port.commands[0].idempotency_key == "platform-task-command"


def test_default_recovery_port_owns_retry_and_reconcile_actions() -> None:
    port = AgentRunPlatformRecoveryPort()

    assert isinstance(port._port_for(action="retry"), AgentRunPlatformRecoveryActionPort)
    assert isinstance(port._port_for(action="reconcile"), AgentRunPlatformRecoveryActionPort)


async def test_route_maps_payload_and_platform_principal_to_recovery_command() -> None:
    task_id = uuid4()
    expected = PlatformAIOperationsService()._to_task_out(
        run=_run(status=AgentRunStatusV1.RUNNING),
        job=_job(status=JobInternalStatus.RUNNING),
        waiting_for_workspace_approval=False,
    )
    service = SimpleNamespace(execute_task_recovery=AsyncMock(return_value=expected))
    principal = SimpleNamespace(actor_id=uuid4())

    await retry_platform_ai_task(
        task_id=task_id,
        payload=PlatformAITaskActionRequest(idempotency_key="retry-operation-1", reason="operator investigation"),
        service=service,
        principal=principal,
    )

    command = service.execute_task_recovery.await_args.kwargs["command"]
    assert command.task_id == task_id
    assert command.action == "retry"
    assert command.idempotency_key == "retry-operation-1"
    assert command.authority.kind == "platform_operator"
    assert command.authority.actor_user_id == principal.actor_id


def test_provider_projection_hides_internal_litellm_key_id() -> None:
    now = datetime.now(UTC)
    provider = SystemAIProviderOut(
        id=uuid4(),
        provider="deepseek",
        label="DeepSeek",
        compatibility="deepseek",
        is_active=True,
        has_virtual_key=True,
        litellm_key_id="internal-key-id",
        request_model="deepseek-v4-pro",
        created_at=now,
        updated_at=now,
        readiness_status="healthy",
        readiness_checked_at=now,
    )

    projection = PlatformAIOperationsService._to_provider_out(provider=provider, now=now)

    assert projection.routable
    assert "internal-key-id" not in projection.model_dump_json()
    unavailable = {item.action: item.reason_code for item in projection.actions if not item.available}
    assert unavailable["rotate_credentials"] == "AI_PROVIDER_CREDENTIAL_REVOCATION_PORT_UNAVAILABLE"
