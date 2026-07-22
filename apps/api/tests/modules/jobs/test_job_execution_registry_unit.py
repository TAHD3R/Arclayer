from __future__ import annotations

from typing import cast
from uuid import uuid4

import pytest
from pydantic import ConfigDict, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.jobs.execution_errors import JobExecutionRegistryError
from src.modules.jobs.execution_registry import (
    CancellableDurableJobHandler,
    DurableJobHandler,
    JobExecutionContext,
    JobExecutionRegistry,
    JobHandlerFactory,
    JobTypeRegistration,
)
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobPermissionRequirement,
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobTypeRegistry,
    JobVisibility,
)
from src.modules.jobs.retry import JobRetryPolicy

pytestmark = pytest.mark.unit


class ExecutionTarget(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    project_id: PublicUUID


class AlternateExecutionTarget(ExecutionTarget):
    source_revision: str


class ExecutionInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    entity_id: PublicUUID


class ExecutionResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    outcome_id: PublicUUID


class ExecutionHandler:
    async def reconcile(
        self,
        *,
        context: JobExecutionContext[ExecutionTarget, ExecutionInput],
    ) -> ExecutionResult | None:
        return None

    async def execute(
        self,
        *,
        context: JobExecutionContext[ExecutionTarget, ExecutionInput],
    ) -> ExecutionResult:
        return ExecutionResult(outcome_id=uuid4())

    async def cancel(
        self,
        *,
        context: JobExecutionContext[ExecutionTarget, ExecutionInput],
    ) -> None:
        return None


def validate_execution_result(context: JobResultSemanticContext) -> None:
    if not isinstance(context.result_reference, ExecutionResult):
        raise TypeError("execution result validator received an unexpected bound schema")


def alternate_result_validator(context: JobResultSemanticContext) -> None:
    _ = context


class InvalidExecutionHandler:
    async def reconcile(self, *, context: object) -> None:
        return None

    async def execute(self, *, context: object) -> ExecutionResult:
        return ExecutionResult(outcome_id=uuid4())


def _definition(
    *,
    job_type: str = "asset.thumbnail.generate",
    version: int = 1,
    task_slug: str = "asset-thumbnail-generate",
    workload: JobWorkloadClass = JobWorkloadClass.ASSET_CPU,
    cancellable: bool = True,
) -> JobTypeDefinition:
    return JobTypeDefinition(
        job_type=job_type,
        job_type_version=version,
        task_name=f"jobs:{workload.value}:{task_slug}:v{version}",
        workload_class=workload,
        target_scope=JobTargetScope.PROJECT,
        visibility=JobVisibility.PROJECT,
        authority_mode=JobAuthorityMode.SYSTEM_SERVICE,
        manage_permission=(
            JobPermissionRequirement(
                scope=JobPermissionScope.WORKSPACE,
                action="system:assets:manage",
            )
            if cancellable
            else None
        ),
        initial_phase="queued",
        phases=frozenset({"queued", "generating"}),
        cancellable_phases=frozenset({"queued", "generating"}) if cancellable else frozenset(),
        retry_class=JobRetryClass.TRANSIENT,
        retry_policy=JobRetryPolicy(
            max_attempts=3,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=frozenset({
                "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                "BACKGROUND_JOB_WORKER_LOST",
            }),
        ),
        timeout_seconds=600,
        lease_seconds=90,
        heartbeat_seconds=30,
        idempotency_namespace=job_type,
        target_schema=ExecutionTarget,
        input_reference_schema=ExecutionInput,
        result_reference_schema=ExecutionResult,
        result_semantic_validator=validate_execution_result,
        terminal_error_contracts=(
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                metadata_schema=None,
            ),
        ),
    )


def _registration(
    definition: JobTypeDefinition,
    *,
    factory: JobHandlerFactory | None = None,
) -> JobTypeRegistration:
    return JobTypeRegistration.from_definition(
        definition=definition,
        handler_factory=factory or ExecutionHandler,
    )


def test_registration_is_frozen_and_runtime_bindings_are_not_serialized() -> None:
    registration = _registration(_definition())

    serialized = registration.model_dump(mode="json", by_alias=True)

    assert "targetSchema" not in serialized
    assert "inputReferenceSchema" not in serialized
    assert "resultReferenceSchema" not in serialized
    assert "resultSemanticValidator" not in serialized
    assert "terminalErrorContracts" not in serialized
    assert "handlerFactory" not in serialized
    with pytest.raises(ValidationError, match="frozen_instance"):
        registration.task_name = "jobs:asset-cpu:other:v1"


def test_execution_registry_requires_one_handler_registration_per_definition() -> None:
    first = _definition()
    second = _definition(
        job_type="asset.metadata.extract",
        task_slug="asset-metadata-extract",
    )
    job_types = JobTypeRegistry([first, second], strict_contracts=True)

    with pytest.raises(JobExecutionRegistryError, match="missing=.*asset.metadata.extract v1"):
        JobExecutionRegistry(job_types=job_types, registrations=[_registration(first)])


def test_execution_registry_rejects_duplicate_identity_before_building_manifest() -> None:
    definition = _definition()
    registration = _registration(definition)

    with pytest.raises(JobExecutionRegistryError, match="duplicate handler registration"):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=True),
            registrations=[registration, registration],
        )


def test_registration_rejects_definition_without_result_semantic_validator() -> None:
    definition = _definition().model_copy(update={"result_semantic_validator": None})

    with pytest.raises(JobExecutionRegistryError, match="missing a result semantic validator"):
        _registration(definition)


@pytest.mark.parametrize(
    ("update", "mismatch"),
    [
        ({"task_name": "jobs:asset-cpu:asset-thumbnail-refresh:v1"}, "taskName"),
        ({"workload_class": JobWorkloadClass.AGENT_IO}, "workloadClass"),
        ({"target_schema": AlternateExecutionTarget}, "targetSchema"),
        ({"input_reference_schema": ExecutionTarget}, "inputReferenceSchema"),
        ({"result_reference_schema": ExecutionInput}, "resultReferenceSchema"),
        ({"result_semantic_validator": alternate_result_validator}, "resultSemanticValidator"),
        ({"terminal_error_contracts": ()}, "terminalErrorContracts"),
    ],
)
def test_execution_registry_rejects_policy_or_schema_drift(
    update: dict[str, object],
    mismatch: str,
) -> None:
    definition = _definition()
    registration = _registration(definition).model_copy(update=update)

    with pytest.raises(JobExecutionRegistryError, match=mismatch):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=True),
            registrations=[registration],
        )


def test_execution_registry_rejects_missing_cancel_capability_at_startup() -> None:
    definition = _definition(cancellable=True)
    invalid_factory = cast(JobHandlerFactory, InvalidExecutionHandler)

    with pytest.raises(JobExecutionRegistryError, match=r"missing=\['cancel'\]"):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=True),
            registrations=[_registration(definition, factory=invalid_factory)],
        )


def test_non_cancellable_definition_does_not_require_cancel_method() -> None:
    definition = _definition(cancellable=False)
    factory = cast(JobHandlerFactory, InvalidExecutionHandler)

    registry = JobExecutionRegistry(
        job_types=JobTypeRegistry([definition], strict_contracts=True),
        registrations=[_registration(definition, factory=factory)],
    )

    handler = registry.create_handler(job_type=definition.job_type, job_type_version=1)
    assert isinstance(handler, DurableJobHandler)
    assert not isinstance(handler, CancellableDurableJobHandler)


def test_execution_registry_derives_exact_deterministic_task_manifest() -> None:
    first = _definition()
    second = _definition(
        job_type="asset.metadata.extract",
        task_slug="asset-metadata-extract",
        cancellable=False,
    )
    registry = JobExecutionRegistry(
        job_types=JobTypeRegistry([second, first], strict_contracts=True),
        registrations=[_registration(first), _registration(second)],
    )

    manifest = registry.derive_task_manifest()
    first_task = manifest.definition_for_job(
        job_type=first.job_type,
        job_type_version=first.job_type_version,
    )

    assert [registration.job_type for registration in registry] == sorted([first.job_type, second.job_type])
    assert first_task is not None
    assert first_task.task_name == first.task_name
    assert first_task.workload_class == JobWorkloadClass.ASSET_CPU
    assert first_task.message_schema_version == 1


def test_execution_registry_validates_derived_task_manifest_at_startup() -> None:
    definition = _definition().model_copy(update={"task_name": "invalid-task-name"})

    with pytest.raises(JobExecutionRegistryError, match="Taskiq manifest is invalid"):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=True),
            registrations=[_registration(definition)],
        )


def test_registry_creates_an_independent_validated_handler_for_each_execution() -> None:
    definition = _definition()
    registry = JobExecutionRegistry(
        job_types=JobTypeRegistry([definition], strict_contracts=True),
        registrations=[_registration(definition)],
    )

    first_handler = registry.create_handler(job_type=definition.job_type, job_type_version=1)
    second_handler = registry.create_handler(job_type=definition.job_type, job_type_version=1)

    assert isinstance(first_handler, DurableJobHandler)
    assert isinstance(second_handler, DurableJobHandler)
    assert first_handler is not second_handler


def test_registry_rejects_factory_without_full_handler_protocol_at_startup() -> None:
    definition = _definition()

    invalid_factory = cast(JobHandlerFactory, InvalidExecutionHandler)
    with pytest.raises(JobExecutionRegistryError, match="returned an invalid handler"):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=True),
            registrations=[_registration(definition, factory=invalid_factory)],
        )


def test_execution_registry_rejects_non_strict_definition_registry() -> None:
    definition = _definition()

    with pytest.raises(JobExecutionRegistryError, match="strict JobTypeRegistry"):
        JobExecutionRegistry(
            job_types=JobTypeRegistry([definition], strict_contracts=False),
            registrations=[_registration(definition)],
        )
