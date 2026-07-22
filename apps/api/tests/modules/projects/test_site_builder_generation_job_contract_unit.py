from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.registry import (
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobVisibility,
)
from src.modules.jobs.schema import BackgroundJobCreate
from src.modules.jobs.service import _create_policy_matches, _target_matches_definition, _validate_create_contract
from src.modules.projects.builder.generation_job_contract import (
    BUILDER_DESIGN_GENERATION_JOB_TASK_NAME,
    BUILDER_DESIGN_GENERATION_JOB_TYPE,
    BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
    BUILDER_GENERATION_JOB_TASK_NAME,
    BUILDER_GENERATION_JOB_TYPE,
    BUILDER_GENERATION_JOB_TYPE_VERSION,
    BUILDER_WIREFRAME_GENERATION_JOB_TASK_NAME,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
    BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
    BuilderDesignGenerationJobInput,
    BuilderDesignGenerationJobResult,
    BuilderGenerationJobInput,
    BuilderGenerationJobResult,
    BuilderGenerationJobTarget,
    BuilderWireframeGenerationJobInput,
    BuilderWireframeGenerationJobResult,
    build_builder_design_generation_job_definition,
    build_builder_generation_job_definition,
    build_builder_wireframe_generation_job_definition,
)
from src.modules.projects.builder.generation_repository import BuilderGenerationRepository
from src.modules.projects.builder.generation_schema import (
    BuilderGenerationCreateRequest,
    BuilderGenerationTargetV1,
)
from src.modules.projects.builder.generation_service import BuilderGenerationService, _generation_identity
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.settings.env_models import BackgroundJobExecutionSettings

pytestmark = pytest.mark.unit


def test_wireframe_generation_request_requires_typed_unique_targets_and_one_agent_authority() -> None:
    page_target = BuilderGenerationTargetV1(kind="page", item_id=uuid4())
    global_target = BuilderGenerationTargetV1(kind="global_section", item_id=uuid4())
    request = BuilderGenerationCreateRequest(
        target_stage="wireframe",
        base_revision_id=uuid4(),
        base_etag="sha256:" + "b" * 64,
        agent_id=uuid4(),
        objective="Compose the selected site flow.",
        targets=(page_target, global_target),
    )

    assert request.agent_run_id is None
    assert request.agent_id is not None
    assert request.targets == (page_target, global_target)
    with pytest.raises(ValidationError, match="at least one target"):
        BuilderGenerationCreateRequest(
            target_stage="wireframe",
            base_revision_id=uuid4(),
            base_etag="sha256:" + "b" * 64,
            agent_id=uuid4(),
            objective="Compose the selected site flow.",
        )
    with pytest.raises(ValidationError, match="targets must be unique"):
        BuilderGenerationCreateRequest(
            target_stage="wireframe",
            base_revision_id=uuid4(),
            base_etag="sha256:" + "b" * 64,
            agent_id=uuid4(),
            objective="Compose the selected site flow.",
            targets=(page_target, page_target),
        )
    with pytest.raises(ValidationError, match="exactly one of agentRunId or agentId"):
        BuilderGenerationCreateRequest(
            target_stage="wireframe",
            base_revision_id=uuid4(),
            base_etag="sha256:" + "b" * 64,
            agent_id=uuid4(),
            agent_run_id=uuid4(),
            objective="Compose the selected site flow.",
            targets=(page_target,),
        )
    with pytest.raises(ValidationError, match="Sitemap generation does not accept targets"):
        BuilderGenerationCreateRequest(
            target_stage="sitemap",
            base_revision_id=uuid4(),
            base_etag="sha256:" + "b" * 64,
            agent_run_id=uuid4(),
            objective="Plan the site.",
            targets=(page_target,),
        )
    with pytest.raises(ValidationError, match="selected_page_ids"):
        BuilderGenerationCreateRequest(
            target_stage="wireframe",
            base_revision_id=uuid4(),
            base_etag="sha256:" + "b" * 64,
            agent_id=uuid4(),
            objective="Compose the selected site flow.",
            targets=(page_target,),
            selected_page_ids=(page_target.item_id,),
        )


def test_wireframe_generation_has_a_distinct_durable_job_contract() -> None:
    definition = build_builder_wireframe_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())
    target = BuilderGenerationJobTarget(
        workspace_id=uuid4(),
        project_id=uuid4(),
        runtime_id=uuid4(),
        environment_id=uuid4(),
    )
    input_reference = BuilderWireframeGenerationJobInput(
        generation_id=uuid4(),
        base_site_revision_id=uuid4(),
        agent_version_id=uuid4(),
        request_hash="f" * 64,
    )

    assert definition.job_type == BUILDER_WIREFRAME_GENERATION_JOB_TYPE
    assert definition.job_type_version == BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION
    assert definition.task_name == BUILDER_WIREFRAME_GENERATION_JOB_TASK_NAME
    validator = definition.result_semantic_validator
    assert validator is not None
    validator(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision="sha256:" + "a" * 64,
            target=target,
            input_reference=input_reference,
            result_reference=BuilderWireframeGenerationJobResult(
                generation_id=input_reference.generation_id,
                base_site_revision_id=input_reference.base_site_revision_id,
                status="succeeded",
                candidate_change_set_ids=(uuid4(),),
                failed_candidate_count=0,
            ),
        )
    )


def test_design_generation_has_a_distinct_durable_job_contract() -> None:
    definition = build_builder_design_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())
    target = BuilderGenerationJobTarget(
        workspace_id=uuid4(),
        project_id=uuid4(),
        runtime_id=uuid4(),
        environment_id=uuid4(),
    )
    input_reference = BuilderDesignGenerationJobInput(
        generation_id=uuid4(),
        base_site_revision_id=uuid4(),
        agent_version_id=uuid4(),
        request_hash="f" * 64,
    )

    assert definition.job_type == BUILDER_DESIGN_GENERATION_JOB_TYPE
    assert definition.job_type_version == BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION
    assert definition.task_name == BUILDER_DESIGN_GENERATION_JOB_TASK_NAME
    validator = definition.result_semantic_validator
    assert validator is not None
    validator(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision="sha256:" + "a" * 64,
            target=target,
            input_reference=input_reference,
            result_reference=BuilderDesignGenerationJobResult(
                generation_id=input_reference.generation_id,
                base_site_revision_id=input_reference.base_site_revision_id,
                status="succeeded",
                candidate_change_set_ids=(uuid4(),),
                failed_candidate_count=0,
            ),
        )
    )


def test_builder_generation_job_definition_is_actor_revalidated_and_non_retryable() -> None:
    definition = build_builder_generation_job_definition(
        execution_policy=BackgroundJobExecutionSettings(
            max_attempts=5,
            initial_delay_seconds=2,
            multiplier=2,
            maximum_delay_seconds=30,
            timeout_seconds=300,
            lease_seconds=90,
            heartbeat_seconds=30,
        )
    )

    assert definition.job_type == BUILDER_GENERATION_JOB_TYPE
    assert definition.job_type_version == BUILDER_GENERATION_JOB_TYPE_VERSION
    assert definition.task_name == BUILDER_GENERATION_JOB_TASK_NAME
    assert definition.workload_class == JobWorkloadClass.AGENT_IO
    assert definition.target_scope == JobTargetScope.PROJECT
    assert definition.visibility == JobVisibility.OWNER_ONLY
    assert definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED
    assert definition.required_permission is not None
    assert definition.required_permission.scope == JobPermissionScope.PROJECT
    assert definition.required_permission.action == "project:content:site-builder:write"
    assert definition.manage_permission == definition.required_permission
    assert definition.retry_class == JobRetryClass.NONE
    assert definition.retry_policy.max_attempts == 1
    assert definition.retry_policy.retryable_codes == frozenset()
    assert definition.phases == frozenset({"queued", "preparing", "generating", "previewing", "finalizing"})
    assert definition.cancellable_phases == definition.phases


def test_builder_generation_result_must_bind_to_exact_generation_and_base_revision() -> None:
    target, input_reference = _references()
    definition = build_builder_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())
    validator = definition.result_semantic_validator
    assert validator is not None

    validator(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision="sha256:" + "a" * 64,
            target=target,
            input_reference=input_reference,
            result_reference=BuilderGenerationJobResult(
                generation_id=input_reference.generation_id,
                base_site_revision_id=input_reference.base_site_revision_id,
                status="partial",
                candidate_change_set_ids=(uuid4(),),
                failed_candidate_count=1,
            ),
        )
    )

    with pytest.raises(ValueError, match="does not belong to its canonical input"):
        validator(
            JobResultSemanticContext(
                job_id=uuid4(),
                source_revision="sha256:" + "a" * 64,
                target=target,
                input_reference=input_reference,
                result_reference=BuilderGenerationJobResult(
                    generation_id=uuid4(),
                    base_site_revision_id=input_reference.base_site_revision_id,
                    status="succeeded",
                    candidate_change_set_ids=(uuid4(),),
                    failed_candidate_count=0,
                ),
            )
        )


def test_builder_generation_create_command_matches_registered_project_contract() -> None:
    target, input_reference = _references()
    definition = build_builder_generation_job_definition(execution_policy=BackgroundJobExecutionSettings())
    command = BackgroundJobCreate(
        job_type=definition.job_type,
        job_type_version=definition.job_type_version,
        task_name=definition.task_name,
        workload_class=definition.workload_class,
        authority_mode=definition.authority_mode,
        workspace_id=target.workspace_id,
        project_id=target.project_id,
        site_id=None,
        actor_user_id=uuid4(),
        target_descriptor=target.model_dump(mode="json", by_alias=True),
        input_reference=input_reference.model_dump(mode="json", by_alias=True),
        idempotency_key="builder-generation:test",
        source_revision="sha256:" + "a" * 64,
        correlation_id="builder-generation-test",
        retry_class=definition.retry_class,
        max_attempts=definition.max_attempts,
        timeout_seconds=definition.timeout_seconds,
        lease_seconds=definition.lease_seconds,
        heartbeat_seconds=definition.heartbeat_seconds,
        status_key=definition.initial_status_key,
    )

    assert _create_policy_matches(command=command, definition=definition)
    assert _target_matches_definition(command, definition, target)
    validated = _validate_create_contract(command=command, definition=definition)
    assert validated.target_descriptor == target.model_dump(mode="json", by_alias=True)


def test_production_generation_service_emits_a_registered_create_command() -> None:
    target, input_reference = _references()
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, object()),
        builder_repository=cast(SiteBuilderRepository, object()),
        settings=get_settings(),
    )
    definition = service._jobs.registry.require(
        job_type=BUILDER_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_GENERATION_JOB_TYPE_VERSION,
    )
    command = service._job_command(
        generation_id=input_reference.generation_id,
        workspace_id=target.workspace_id,
        project_id=target.project_id,
        runtime_id=target.runtime_id,
        environment_id=target.environment_id,
        actor_user_id=uuid4(),
        request_fingerprint=input_reference.request_hash,
        source_revision="sha256:" + "a" * 64,
        payload=BuilderGenerationCreateRequest(
            base_revision_id=input_reference.base_site_revision_id,
            base_etag="sha256:" + "b" * 64,
            agent_run_id=input_reference.agent_run_id,
            objective="Generate a Sitemap.",
        ),
    )

    validated = _validate_create_contract(command=command, definition=definition)
    assert validated.site_id is None


def test_production_generation_service_emits_wireframe_v1_create_command() -> None:
    workspace_id, project_id, runtime_id, environment_id = (uuid4() for _ in range(4))
    generation_id, revision_id, agent_id, agent_version_id, page_id = (uuid4() for _ in range(5))
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, object()),
        builder_repository=cast(SiteBuilderRepository, object()),
        settings=get_settings(),
    )
    definition = service._jobs.registry.require(
        job_type=BUILDER_WIREFRAME_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_WIREFRAME_GENERATION_JOB_TYPE_VERSION,
    )
    command = service._job_command(
        generation_id=generation_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        request_fingerprint="f" * 64,
        source_revision="sha256:" + "a" * 64,
        payload=BuilderGenerationCreateRequest(
            target_stage="wireframe",
            base_revision_id=revision_id,
            base_etag="sha256:" + "b" * 64,
            agent_id=agent_id,
            objective="Generate a reviewable Wireframe.",
            targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
        ),
        agent_version_id=agent_version_id,
    )

    validated = _validate_create_contract(command=command, definition=definition)
    input_reference = BuilderWireframeGenerationJobInput.model_validate(validated.input_reference)
    assert input_reference.generation_id == generation_id
    assert input_reference.base_site_revision_id == revision_id
    assert input_reference.agent_version_id == agent_version_id


def test_production_generation_service_emits_design_v1_create_command() -> None:
    workspace_id, project_id, runtime_id, environment_id = (uuid4() for _ in range(4))
    generation_id, revision_id, agent_id, agent_version_id, page_id = (uuid4() for _ in range(5))
    service = BuilderGenerationService(
        repository=cast(BuilderGenerationRepository, object()),
        builder_repository=cast(SiteBuilderRepository, object()),
        settings=get_settings(),
    )
    definition = service._jobs.registry.require(
        job_type=BUILDER_DESIGN_GENERATION_JOB_TYPE,
        job_type_version=BUILDER_DESIGN_GENERATION_JOB_TYPE_VERSION,
    )
    command = service._job_command(
        generation_id=generation_id,
        workspace_id=workspace_id,
        project_id=project_id,
        runtime_id=runtime_id,
        environment_id=environment_id,
        actor_user_id=uuid4(),
        request_fingerprint="f" * 64,
        source_revision="sha256:" + "a" * 64,
        payload=BuilderGenerationCreateRequest(
            target_stage="design",
            base_revision_id=revision_id,
            base_etag="sha256:" + "b" * 64,
            agent_id=agent_id,
            objective="Generate a reviewable Design direction.",
            targets=(BuilderGenerationTargetV1(kind="page", item_id=page_id),),
        ),
        agent_version_id=agent_version_id,
    )

    validated = _validate_create_contract(command=command, definition=definition)
    input_reference = BuilderDesignGenerationJobInput.model_validate(validated.input_reference)
    assert input_reference.generation_id == generation_id
    assert input_reference.base_site_revision_id == revision_id
    assert input_reference.agent_version_id == agent_version_id


def test_generation_identity_is_stable_and_public_uuid_compatible() -> None:
    workspace_id = uuid4()
    project_id = uuid4()

    first = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        idempotency_key="builder-generation-1",
    )
    replay = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        idempotency_key="builder-generation-1",
    )
    changed = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        idempotency_key="builder-generation-2",
    )

    assert first == replay
    assert first.version == 4
    assert changed != first


def _references() -> tuple[BuilderGenerationJobTarget, BuilderGenerationJobInput]:
    workspace_id = uuid4()
    project_id = uuid4()
    return (
        BuilderGenerationJobTarget(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=uuid4(),
            environment_id=uuid4(),
        ),
        BuilderGenerationJobInput(
            generation_id=uuid4(),
            base_site_revision_id=uuid4(),
            agent_run_id=uuid4(),
            request_hash="f" * 64,
        ),
    )
