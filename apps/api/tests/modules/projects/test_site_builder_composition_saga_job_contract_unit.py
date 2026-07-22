from __future__ import annotations

from uuid import uuid4

import pytest

from src.modules.jobs.registry import JobResultSemanticContext
from src.modules.projects.builder.composition_saga_job_contract import (
    BUILDER_PLANNING_GENERATION_JOB_TASK_NAME,
    BUILDER_PLANNING_GENERATION_JOB_TYPE,
    BuilderPlanningGenerationJobInput,
    BuilderPlanningGenerationJobResult,
    build_builder_planning_generation_job_definition,
)
from src.modules.projects.builder.generation_job_contract import BuilderGenerationJobTarget
from src.settings.env_models import BackgroundJobExecutionSettings


def test_plan_first_has_a_distinct_durable_planning_job_contract() -> None:
    definition = build_builder_planning_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())

    assert definition.job_type == BUILDER_PLANNING_GENERATION_JOB_TYPE
    assert definition.task_name == BUILDER_PLANNING_GENERATION_JOB_TASK_NAME
    assert definition.retry_policy.max_attempts == 1
    assert definition.phases == frozenset({"queued", "preparing", "generating", "previewing", "finalizing"})
    assert definition.cancellable_phases == definition.phases


def test_planning_job_result_binds_parent_child_and_initial_revision() -> None:
    saga_id = uuid4()
    generation_id = uuid4()
    revision_id = uuid4()
    definition = build_builder_planning_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())
    input_reference = BuilderPlanningGenerationJobInput(
        saga_id=saga_id,
        generation_id=generation_id,
        base_site_revision_id=revision_id,
        agent_version_id=uuid4(),
        request_hash="a" * 64,
    )
    result = BuilderPlanningGenerationJobResult(
        saga_id=saga_id,
        generation_id=generation_id,
        base_site_revision_id=revision_id,
        status="succeeded",
        candidate_change_set_ids=(uuid4(),),
        failed_candidate_count=0,
    )
    validate_result = definition.result_semantic_validator
    assert validate_result is not None

    validate_result(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision="sha256:" + "b" * 64,
            target=BuilderGenerationJobTarget(
                workspace_id=uuid4(),
                project_id=uuid4(),
                runtime_id=uuid4(),
                environment_id=uuid4(),
            ),
            input_reference=input_reference,
            result_reference=result,
        )
    )

    with pytest.raises(ValueError, match="canonical input"):
        validate_result(
            JobResultSemanticContext(
                job_id=uuid4(),
                source_revision="sha256:" + "b" * 64,
                target=BuilderGenerationJobTarget(
                    workspace_id=uuid4(),
                    project_id=uuid4(),
                    runtime_id=uuid4(),
                    environment_id=uuid4(),
                ),
                input_reference=input_reference,
                result_reference=result.model_copy(update={"saga_id": uuid4()}),
            )
        )
