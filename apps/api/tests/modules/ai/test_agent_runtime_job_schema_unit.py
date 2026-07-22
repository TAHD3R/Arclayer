from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import Settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.ai.runtime_job_schema import (
    AGENT_RUN_JOB_FAILURE_CODE,
    AGENT_RUN_JOB_TASK_NAME,
    AGENT_RUN_SETTLEMENT_PENDING_CODE,
    AgentRunJobInput,
    AgentRunJobResult,
    AgentRunJobTarget,
    build_agent_run_job_definition,
)
from src.modules.jobs.registry import JobPermissionScope, JobResultSemanticContext, JobTargetScope, JobVisibility

pytestmark = pytest.mark.unit


def test_agent_run_job_definition_is_workspace_actor_revalidated_and_retry_bounded() -> None:
    settings = Settings(app_env="test", database={"enabled": False})
    definition = build_agent_run_job_definition(
        execution_policy=settings.background_jobs.agent_run,
    )

    assert definition.task_name == AGENT_RUN_JOB_TASK_NAME
    assert definition.workload_class == JobWorkloadClass.AGENT_IO
    assert definition.target_scope == JobTargetScope.WORKSPACE
    assert definition.visibility == JobVisibility.OWNER_ONLY
    assert definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED
    assert definition.required_permission is not None
    assert definition.required_permission.scope == JobPermissionScope.WORKSPACE
    assert definition.required_permission.action == "system:content:manage"
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.retry_policy.max_attempts == 3
    assert definition.retry_policy.initial_delay_seconds == 300
    assert definition.retry_policy.retryable_codes == {
        "BACKGROUND_JOB_WORKER_LOST",
        AGENT_RUN_SETTLEMENT_PENDING_CODE,
    }
    assert AGENT_RUN_JOB_FAILURE_CODE in {contract.code for contract in definition.terminal_error_contracts}


def test_agent_run_job_result_binding_rejects_cross_run_replay() -> None:
    settings = Settings(app_env="test", database={"enabled": False})
    definition = build_agent_run_job_definition(
        execution_policy=settings.background_jobs.agent_run,
    )
    workspace_id = uuid4()
    thread_id = uuid4()
    input_reference = AgentRunJobInput(
        run_id=uuid4(),
        thread_id=thread_id,
        project_id=None,
        request_hash="a" * 64,
    )
    result = AgentRunJobResult(
        run_id=uuid4(),
        thread_id=thread_id,
        status="completed",
        last_sequence=8,
        last_cursor="cursor-8",
    )
    assert definition.result_semantic_validator is not None

    with pytest.raises(ValueError, match="does not belong"):
        definition.result_semantic_validator(
            JobResultSemanticContext(
                job_id=uuid4(),
                source_revision=None,
                target=AgentRunJobTarget(workspace_id=workspace_id),
                input_reference=input_reference,
                result_reference=result,
            )
        )
