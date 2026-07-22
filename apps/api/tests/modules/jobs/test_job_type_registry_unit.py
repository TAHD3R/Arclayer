from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import Settings
from src.models.jobs.background_job import JobAuthorityMode, JobRetryClass, JobWorkloadClass
from src.modules.assets.jobs.thumbnail_contract import (
    ASSET_THUMBNAIL_RETRYABLE_CODES,
    ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS,
    AssetThumbnailJobInput,
    AssetThumbnailJobResult,
    AssetThumbnailJobTarget,
    validate_asset_thumbnail_result_semantics,
    validate_asset_thumbnail_target_input,
)
from src.modules.jobs.execution_errors import (
    JOB_HANDLER_UNEXPECTED_ERROR_CODE,
)
from src.modules.jobs.registry import (
    COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
    JobPermissionRequirement,
    JobPermissionScope,
    JobResultSemanticContext,
    JobTargetScope,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobTypeNotRegisteredError,
    JobTypeRegistry,
    JobVisibility,
    get_job_type_registry,
)
from src.modules.jobs.retry import JobRetryPolicy


class RegistryJobTarget(BaseSchema):
    model_config = BaseSchema.model_config | {"extra": "forbid", "frozen": True}

    workspace_id: PublicUUID
    project_id: PublicUUID


class RegistryJobInput(BaseSchema):
    model_config = BaseSchema.model_config | {"extra": "forbid", "frozen": True}

    revision: int


class RegistryJobResult(BaseSchema):
    model_config = BaseSchema.model_config | {"extra": "forbid", "frozen": True}

    outcome_id: PublicUUID


class NonStrictErrorMetadata(BaseSchema):
    evidence_id: str


def validate_registry_contract(target: BaseSchema, input_reference: BaseSchema) -> None:
    if not isinstance(target, RegistryJobTarget) or not isinstance(input_reference, RegistryJobInput):
        raise TypeError("registry test validator received an unexpected bound schema")


def validate_registry_result(context: JobResultSemanticContext) -> None:
    if not isinstance(context.result_reference, RegistryJobResult):
        raise TypeError("registry test result validator received an unexpected bound schema")


def create_definition(**updates: object) -> JobTypeDefinition:
    values: dict[str, object] = {
        "job_type": "asset.thumbnail.generate",
        "job_type_version": 1,
        "task_name": "jobs:asset-cpu:asset-thumbnail-generate:v1",
        "workload_class": JobWorkloadClass.ASSET_CPU,
        "target_scope": JobTargetScope.PROJECT,
        "visibility": JobVisibility.PROJECT,
        "authority_mode": JobAuthorityMode.ACTOR_REVALIDATED,
        "required_permission": JobPermissionRequirement(
            scope=JobPermissionScope.WORKSPACE,
            action="system:assets:manage",
        ),
        "manage_permission": JobPermissionRequirement(
            scope=JobPermissionScope.WORKSPACE,
            action="system:assets:manage",
        ),
        "initial_phase": "queued",
        "phases": frozenset({"queued", "generating"}),
        "cancellable_phases": frozenset({"queued", "generating"}),
        "retry_class": JobRetryClass.TRANSIENT,
        "retry_policy": JobRetryPolicy(
            max_attempts=3,
            initial_delay_seconds=5,
            multiplier=2,
            maximum_delay_seconds=60,
            retryable_codes=frozenset({
                "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                "BACKGROUND_JOB_WORKER_LOST",
            }),
        ),
        "timeout_seconds": 120,
        "lease_seconds": 90,
        "heartbeat_seconds": 30,
        "idempotency_namespace": "asset-thumbnail",
        "target_schema": RegistryJobTarget,
        "input_reference_schema": RegistryJobInput,
        "result_reference_schema": RegistryJobResult,
        "cross_field_validator": validate_registry_contract,
        "result_semantic_validator": validate_registry_result,
        "terminal_error_contracts": (
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                metadata_schema=None,
            ),
        ),
    }
    values.update(updates)
    return JobTypeDefinition.model_validate(values)


def test_registry_resolves_immutable_versioned_definition() -> None:
    definition = create_definition()
    registry = JobTypeRegistry([definition], strict_contracts=False)

    resolved = registry.resolve(job_type=definition.job_type, job_type_version=1)

    assert resolved is definition
    assert registry.list_definitions(visibility=JobVisibility.PROJECT) == (definition,)
    assert registry.resolve(job_type=definition.job_type, job_type_version=2) is None


def test_registry_require_rejects_unknown_type_version() -> None:
    registry = JobTypeRegistry([create_definition()], strict_contracts=False)

    with pytest.raises(JobTypeNotRegisteredError, match="is not registered"):
        registry.require(job_type="asset.thumbnail.generate", job_type_version=2)


def test_registry_rejects_duplicate_type_version() -> None:
    definition = create_definition()

    with pytest.raises(ValueError, match="Duplicate background Job type registration"):
        JobTypeRegistry([definition, definition], strict_contracts=False)


def test_registry_rejects_duplicate_task_name_across_types() -> None:
    first = create_definition()
    second = create_definition(job_type="asset.metadata.extract")

    with pytest.raises(ValueError, match="Duplicate background Job task registration"):
        JobTypeRegistry([first, second], strict_contracts=False)


def test_registry_validates_workspace_permission_actions() -> None:
    registry = JobTypeRegistry([create_definition()], strict_contracts=False)

    with pytest.raises(ValueError, match="system:assets:manage"):
        registry.validate_permission_actions(
            workspace_actions={"system:jobs:read"},
            project_actions=set(),
        )

    registry.validate_permission_actions(
        workspace_actions={"system:jobs:read", "system:assets:manage"},
        project_actions=set(),
    )


def test_builtin_registry_contains_canonical_asset_thumbnail_definition() -> None:
    registry = get_job_type_registry()
    definition = registry.require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )

    assert definition.task_name == "jobs:asset-cpu:asset-thumbnail-generate:v1"
    assert definition.workload_class == JobWorkloadClass.ASSET_CPU
    assert definition.target_scope == JobTargetScope.PROJECT
    assert definition.visibility == JobVisibility.PROJECT
    assert definition.authority_mode == JobAuthorityMode.SYSTEM_SERVICE
    assert definition.required_permission is None
    assert definition.manage_permission == JobPermissionRequirement(
        scope=JobPermissionScope.WORKSPACE,
        action="system:assets:manage",
    )
    assert registry.strict_contracts is True
    assert definition.target_schema is AssetThumbnailJobTarget
    assert definition.input_reference_schema is AssetThumbnailJobInput
    assert definition.result_reference_schema is AssetThumbnailJobResult
    assert definition.cross_field_validator is validate_asset_thumbnail_target_input
    assert definition.result_semantic_validator is validate_asset_thumbnail_result_semantics
    assert definition.terminal_error_contracts == tuple(
        sorted(ASSET_THUMBNAIL_TERMINAL_ERROR_CONTRACTS, key=lambda contract: contract.code)
    )
    registered_error_codes = {contract.code for contract in definition.terminal_error_contracts}
    assert ASSET_THUMBNAIL_RETRYABLE_CODES.issubset(registered_error_codes)
    assert JOB_HANDLER_UNEXPECTED_ERROR_CODE in registered_error_codes


def test_builtin_registry_snapshots_the_explicit_settings_instance() -> None:
    settings = Settings(
        app_env="test",
        database={"enabled": False},
        background_jobs={
            "asset_thumbnail": {
                "max_attempts": 7,
                "initial_delay_seconds": 11,
                "multiplier": 3,
                "maximum_delay_seconds": 120,
                "timeout_seconds": 600,
                "lease_seconds": 120,
                "heartbeat_seconds": 40,
            }
        },
    )

    definition = get_job_type_registry(settings).require(
        job_type="asset.thumbnail.generate",
        job_type_version=1,
    )

    assert definition.max_attempts == 7
    assert definition.retry_policy == JobRetryPolicy(
        max_attempts=7,
        initial_delay_seconds=11,
        multiplier=3,
        maximum_delay_seconds=120,
        retryable_codes=definition.retry_policy.retryable_codes,
    )
    assert definition.retry_policy.retryable_codes == ASSET_THUMBNAIL_RETRYABLE_CODES
    assert definition.timeout_seconds == 600
    assert definition.lease_seconds == 120
    assert definition.heartbeat_seconds == 40


def test_asset_thumbnail_settings_cannot_override_handler_retry_codes() -> None:
    with pytest.raises(ValidationError, match="retryable_codes"):
        Settings(
            app_env="test",
            database={"enabled": False},
            background_jobs={
                "asset_thumbnail": {
                    "retryable_codes": ["ASSET_THUMBNAIL_DECODE_FAILED"],
                }
            },
        )


def test_definition_runtime_bindings_are_frozen_hashable_and_not_serialized() -> None:
    definition = create_definition()

    serialized = definition.model_dump(mode="json", by_alias=True)

    assert hash(definition)
    assert "targetSchema" not in serialized
    assert "inputReferenceSchema" not in serialized
    assert "resultReferenceSchema" not in serialized
    assert "crossFieldValidator" not in serialized
    assert "resultSemanticValidator" not in serialized
    assert "terminalErrorContracts" not in serialized
    assert "maxAttempts" not in serialized
    assert serialized["retryPolicy"] == {
        "maxAttempts": 3,
        "initialDelaySeconds": 5.0,
        "multiplier": 2.0,
        "maximumDelaySeconds": 60.0,
        "jitterStrategy": "full",
        "retryableCodes": [
            "ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
            "BACKGROUND_JOB_WORKER_LOST",
        ],
    }
    with pytest.raises(ValidationError, match="frozen_instance"):
        definition.target_schema = AssetThumbnailJobTarget


@pytest.mark.parametrize(
    "missing_field",
    [
        "target_schema",
        "input_reference_schema",
        "result_reference_schema",
        "result_semantic_validator",
    ],
)
def test_strict_registry_rejects_missing_runtime_binding(missing_field: str) -> None:
    definition = create_definition(**{missing_field: None})

    with pytest.raises(ValueError, match="Invalid runtime contracts"):
        JobTypeRegistry([definition], strict_contracts=True)


def test_non_strict_registry_must_be_explicit_for_incomplete_test_definition() -> None:
    definition = create_definition(
        target_schema=None,
        input_reference_schema=None,
        result_reference_schema=None,
        cross_field_validator=None,
        result_semantic_validator=None,
    )

    registry = JobTypeRegistry([definition], strict_contracts=False)

    assert registry.strict_contracts is False
    assert registry.require(job_type=definition.job_type, job_type_version=1) is definition


def test_strict_registry_rejects_missing_terminal_error_contracts() -> None:
    definition = create_definition(terminal_error_contracts=())

    with pytest.raises(ValueError, match="missing terminalErrorContracts"):
        JobTypeRegistry([definition], strict_contracts=True)


def test_strict_registry_rejects_retryable_code_without_terminal_error_contract() -> None:
    definition = create_definition(terminal_error_contracts=COMMON_JOB_TERMINAL_ERROR_CONTRACTS)

    with pytest.raises(ValueError, match="missing retryable codes"):
        JobTypeRegistry([definition], strict_contracts=True)


def test_strict_registry_rejects_non_strict_terminal_metadata_schema() -> None:
    definition = create_definition(
        terminal_error_contracts=(
            *COMMON_JOB_TERMINAL_ERROR_CONTRACTS,
            JobTerminalErrorContract(
                code="ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE",
                metadata_schema=NonStrictErrorMetadata,
            ),
        )
    )

    with pytest.raises(ValueError, match="must forbid extra fields"):
        JobTypeRegistry([definition], strict_contracts=True)


def test_definition_rejects_duplicate_terminal_error_codes() -> None:
    contracts = create_definition().terminal_error_contracts

    with pytest.raises(ValidationError, match="unique error codes"):
        create_definition(terminal_error_contracts=(*contracts, contracts[0]))


def test_strict_registry_revalidates_copied_duplicate_terminal_error_codes() -> None:
    definition = create_definition()
    copied = definition.model_copy(
        update={
            "terminal_error_contracts": (*definition.terminal_error_contracts, definition.terminal_error_contracts[0])
        }
    )

    with pytest.raises(ValueError, match="duplicate error codes"):
        JobTypeRegistry([copied], strict_contracts=True)


def test_strict_registry_rejects_drifted_common_terminal_error_contract() -> None:
    contracts = tuple(
        JobTerminalErrorContract(code=contract.code, metadata_schema=None)
        if contract.code == JOB_HANDLER_UNEXPECTED_ERROR_CODE
        else contract
        for contract in create_definition().terminal_error_contracts
    )
    definition = create_definition(terminal_error_contracts=contracts)

    with pytest.raises(ValueError, match="canonical BACKGROUND_JOB_HANDLER_UNEXPECTED contract"):
        JobTypeRegistry([definition], strict_contracts=True)


@pytest.mark.parametrize(
    ("updates", "message"),
    [
        ({"lease_seconds": 89}, "three heartbeat intervals"),
        ({"target_scope": JobTargetScope.SYSTEM}, "system-scoped Jobs must use system visibility"),
        ({"visibility": JobVisibility.SYSTEM}, "tenant-scoped Jobs cannot use system visibility"),
        ({"required_permission": None}, "actor-revalidated Jobs must declare a required permission"),
        ({"manage_permission": None}, "cancellable Jobs must declare a manage permission"),
        (
            {
                "retry_class": JobRetryClass.NONE,
                "retry_policy": JobRetryPolicy(
                    max_attempts=3,
                    initial_delay_seconds=5,
                    multiplier=2,
                    maximum_delay_seconds=60,
                    retryable_codes=frozenset({"ASSET_THUMBNAIL_STORAGE_TEMPORARILY_UNAVAILABLE"}),
                ),
            },
            "non-retryable Jobs",
        ),
        (
            {
                "retry_class": JobRetryClass.TRANSIENT,
                "retry_policy": JobRetryPolicy(
                    max_attempts=1,
                    initial_delay_seconds=5,
                    multiplier=2,
                    maximum_delay_seconds=60,
                    retryable_codes=frozenset(),
                ),
            },
            "transient Jobs",
        ),
    ],
)
def test_definition_rejects_incoherent_policy(updates: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        create_definition(**updates)
