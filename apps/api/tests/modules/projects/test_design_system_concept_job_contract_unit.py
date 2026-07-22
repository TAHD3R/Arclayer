from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextV1
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextV1
from src.modules.jobs.registry import (
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobVisibility,
)
from src.modules.jobs.service import _target_matches_definition, _validate_create_contract
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.concept_job_contract import (
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TASK_NAME,
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
    DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
    DesignSystemConceptGenerationJobInput,
    DesignSystemConceptGenerationJobResult,
    DesignSystemConceptGenerationJobTarget,
    build_design_system_concept_generation_job_definition,
)
from src.modules.projects.design_systems.concept_repository import (
    DesignSystemConceptGenerationRepository,
)
from src.modules.projects.design_systems.concept_schema import (
    DesignSystemConceptGenerationCreateRequest,
)
from src.modules.projects.design_systems.concept_service import (
    DesignSystemConceptGenerationService,
    _generation_identity,
    _ResolvedConceptAuthority,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.settings.env_models import BackgroundJobExecutionSettings

pytestmark = pytest.mark.unit


def test_concept_generation_job_definition_is_actor_revalidated_and_non_retryable() -> None:
    definition = build_design_system_concept_generation_job_definition(
        execution_policy=BackgroundJobExecutionSettings(
            max_attempts=5,
            timeout_seconds=300,
            lease_seconds=90,
            heartbeat_seconds=30,
        )
    )

    assert definition.job_type == DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE
    assert definition.job_type_version == DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION
    assert definition.task_name == DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TASK_NAME
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
    assert definition.phases == frozenset({"queued", "preparing", "generating", "validating", "finalizing"})
    assert definition.cancellable_phases == definition.phases


def test_concept_generation_result_binds_to_exact_generation_and_base_version() -> None:
    target, input_reference = _references()
    definition = build_design_system_concept_generation_job_definition(
        execution_policy=BackgroundJobExecutionSettings()
    )
    validator = definition.result_semantic_validator
    assert validator is not None
    validator(
        JobResultSemanticContext(
            job_id=uuid4(),
            source_revision="sha256:" + "a" * 64,
            target=target,
            input_reference=input_reference,
            result_reference=DesignSystemConceptGenerationJobResult(
                generation_id=input_reference.generation_id,
                base_version_id=input_reference.base_version_id,
                status="partial",
                candidate_version_ids=(uuid4(),),
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
                result_reference=DesignSystemConceptGenerationJobResult(
                    generation_id=input_reference.generation_id,
                    base_version_id=uuid4(),
                    status="succeeded",
                    candidate_version_ids=(uuid4(),),
                    failed_candidate_count=0,
                ),
            )
        )


def test_production_concept_service_emits_registered_project_job_command() -> None:
    target, input_reference = _references()
    service = DesignSystemConceptGenerationService(
        repository=cast(DesignSystemConceptGenerationRepository, object()),
        design_system_repository=cast(ProjectDesignSystemsRepository, object()),
        builder_repository=cast(SiteBuilderRepository, object()),
        settings=get_settings(),
    )
    payload = DesignSystemConceptGenerationCreateRequest(
        base_version_id=input_reference.base_version_id,
        expected_base_checksum="sha256:" + "a" * 64,
        base_revision_id=input_reference.base_site_revision_id,
        base_etag="sha256:" + "b" * 64,
        agent_run_id=input_reference.agent_run_id,
        objective="Create two editorial Style Guide directions.",
        candidate_count=2,
    )
    command = service._job_command(
        generation_id=input_reference.generation_id,
        workspace_id=target.workspace_id,
        project_id=target.project_id,
        design_system_id=target.design_system_id,
        actor_user_id=uuid4(),
        request_fingerprint=input_reference.request_hash,
        payload=payload,
        authority=_ResolvedConceptAuthority(
            agent_run_id=input_reference.agent_run_id,
            agent_id=uuid4(),
            agent_version_id=input_reference.agent_version_id,
            agent_assignment_id=uuid4(),
            design_system_context=AgentRunDesignSystemContextV1.model_construct(),
            builder_context=AgentRunBuilderContextV1.model_construct(),
        ),
    )
    definition = service._jobs.registry.require(
        job_type=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE,
        job_type_version=DESIGN_SYSTEM_CONCEPT_GENERATION_JOB_TYPE_VERSION,
    )

    validated = _validate_create_contract(command=command, definition=definition)

    assert _target_matches_definition(command, definition, target)
    assert validated.site_id is None
    assert validated.source_revision == payload.expected_base_checksum


def test_concept_generation_identity_is_stable_and_system_scoped() -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    system_id = uuid4()
    first = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        design_system_id=system_id,
        idempotency_key="concept-generation-1",
    )
    replay = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        design_system_id=system_id,
        idempotency_key="concept-generation-1",
    )
    changed_system = _generation_identity(
        workspace_id=workspace_id,
        project_id=project_id,
        design_system_id=uuid4(),
        idempotency_key="concept-generation-1",
    )

    assert first == replay
    assert first.version == 4
    assert changed_system != first


def _references() -> tuple[DesignSystemConceptGenerationJobTarget, DesignSystemConceptGenerationJobInput]:
    target = DesignSystemConceptGenerationJobTarget(
        workspace_id=uuid4(),
        project_id=uuid4(),
        design_system_id=uuid4(),
    )
    return (
        target,
        DesignSystemConceptGenerationJobInput(
            generation_id=uuid4(),
            base_version_id=uuid4(),
            base_site_revision_id=uuid4(),
            agent_run_id=uuid4(),
            agent_version_id=uuid4(),
            request_hash="f" * 64,
        ),
    )
