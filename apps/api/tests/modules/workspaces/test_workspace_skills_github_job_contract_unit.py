from __future__ import annotations

from typing import Literal
from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.builtin_registry import build_builtin_job_type_registry
from src.modules.jobs.execution_registry import derive_durable_task_manifest
from src.modules.jobs.registry import JobPermissionScope, JobResultSemanticContext, JobTargetScope, JobVisibility
from src.modules.workspaces.skills.github_import_contract import (
    SKILL_GITHUB_IMPORT_JOB_TYPE,
    SKILL_GITHUB_IMPORT_TASK_NAME,
    SKILL_GITHUB_JOB_TYPE_VERSION,
    SKILL_GITHUB_REFRESH_JOB_TYPE,
    SKILL_GITHUB_REFRESH_TASK_NAME,
    SkillGitHubImportJobInput,
    SkillGitHubImportJobResult,
    SkillGitHubImportJobTarget,
    build_skill_github_import_job_definition,
    build_skill_github_refresh_job_definition,
    validate_skill_github_initial_target_input,
    validate_skill_github_refresh_target_input,
    validate_skill_github_result,
)

_REVISION = "sha256:" + "a" * 64
_CHECKSUM = "sha256:" + "b" * 64


def _input(operation: Literal["initial", "refresh"]) -> SkillGitHubImportJobInput:
    return SkillGitHubImportJobInput(
        operation=operation,
        repository_url="https://github.com/acme/site-skill",
        requested_ref="main",
        subpath="skills/site",
        slug="site-skill",
        display_name="Site Skill",
        description="Plans and reviews a site.",
        request_revision=_REVISION,
    )


@pytest.mark.parametrize(
    ("job_type", "task_name", "builder", "policy_name"),
    (
        (
            SKILL_GITHUB_IMPORT_JOB_TYPE,
            SKILL_GITHUB_IMPORT_TASK_NAME,
            build_skill_github_import_job_definition,
            "skill_github_import",
        ),
        (
            SKILL_GITHUB_REFRESH_JOB_TYPE,
            SKILL_GITHUB_REFRESH_TASK_NAME,
            build_skill_github_refresh_job_definition,
            "skill_github_refresh",
        ),
    ),
)
def test_github_skill_job_definitions_use_actor_revalidated_connector_authority(
    job_type: str,
    task_name: str,
    builder,
    policy_name: str,
) -> None:
    settings = get_settings()
    definition = builder(execution_policy=getattr(settings.background_jobs, policy_name))

    assert definition.job_type == job_type
    assert definition.job_type_version == SKILL_GITHUB_JOB_TYPE_VERSION == 1
    assert definition.task_name == task_name
    assert definition.workload_class == JobWorkloadClass.CONNECTOR
    assert definition.target_scope == JobTargetScope.WORKSPACE
    assert definition.visibility == JobVisibility.WORKSPACE
    assert definition.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED
    assert definition.required_permission is not None
    assert definition.required_permission.scope == JobPermissionScope.WORKSPACE
    assert definition.required_permission.action == "system:settings:manage"
    assert definition.manage_permission == definition.required_permission
    assert definition.retry_class == JobRetryClass.TRANSIENT
    assert definition.target_schema is SkillGitHubImportJobTarget
    assert definition.input_reference_schema is SkillGitHubImportJobInput
    assert definition.result_reference_schema is SkillGitHubImportJobResult


def test_builtin_registry_and_transport_manifest_include_both_github_operations() -> None:
    registry = build_builtin_job_type_registry(get_settings())
    manifest = derive_durable_task_manifest(registry)

    for job_type, task_name in (
        (SKILL_GITHUB_IMPORT_JOB_TYPE, SKILL_GITHUB_IMPORT_TASK_NAME),
        (SKILL_GITHUB_REFRESH_JOB_TYPE, SKILL_GITHUB_REFRESH_TASK_NAME),
    ):
        definition = registry.require(job_type=job_type, job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION)
        task = manifest.definition_for_job(job_type=job_type, job_type_version=SKILL_GITHUB_JOB_TYPE_VERSION)
        assert task is not None
        assert definition.task_name == task.task_name == task_name
        assert task.workload_class == JobWorkloadClass.CONNECTOR


def test_initial_and_refresh_targets_bind_exact_package_authority() -> None:
    workspace_id = uuid4()
    import_id = uuid4()
    initial_target = SkillGitHubImportJobTarget(
        workspace_id=workspace_id,
        import_id=import_id,
        entity_id=import_id,
    )
    validate_skill_github_initial_target_input(initial_target, _input("initial"))

    package_id = uuid4()
    refresh_target = initial_target.model_copy(update={"package_id": package_id})
    validate_skill_github_refresh_target_input(refresh_target, _input("refresh"))

    with pytest.raises(ValueError, match="Only a GitHub Skill refresh"):
        validate_skill_github_initial_target_input(refresh_target, _input("initial"))
    with pytest.raises(ValueError, match="Only a GitHub Skill refresh"):
        validate_skill_github_refresh_target_input(initial_target, _input("refresh"))
    with pytest.raises(ValueError, match="does not match its operation"):
        validate_skill_github_initial_target_input(
            initial_target.model_copy(update={"entity_id": uuid4()}),
            _input("initial"),
        )


def test_result_semantics_pin_job_import_and_refresh_package_ownership() -> None:
    job_id = uuid4()
    import_id = uuid4()
    package_id = uuid4()
    target = SkillGitHubImportJobTarget(
        workspace_id=uuid4(),
        import_id=import_id,
        package_id=package_id,
        entity_id=import_id,
    )
    result = SkillGitHubImportJobResult(
        import_id=import_id,
        package_id=package_id,
        version_id=uuid4(),
        resolved_commit="1" * 40,
        resolved_tree="2" * 40,
        package_checksum=_CHECKSUM,
        outcome_job_id=job_id,
    )
    context = JobResultSemanticContext(
        job_id=job_id,
        source_revision=_REVISION,
        target=target,
        input_reference=_input("refresh"),
        result_reference=result,
    )
    validate_skill_github_result(context)

    with pytest.raises(ValueError, match="changed package authority"):
        validate_skill_github_result(
            context.model_copy(update={"result_reference": result.model_copy(update={"package_id": uuid4()})})
        )
    with pytest.raises(ValueError, match="does not belong"):
        validate_skill_github_result(
            context.model_copy(update={"result_reference": result.model_copy(update={"outcome_job_id": uuid4()})})
        )
    with pytest.raises(ValueError, match="source revision"):
        validate_skill_github_result(context.model_copy(update={"source_revision": "sha256:" + "c" * 64}))
