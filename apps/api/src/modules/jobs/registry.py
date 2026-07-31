from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from enum import StrEnum
from types import MappingProxyType
from typing import TYPE_CHECKING, Final
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.models.jobs.background_job import (
    JobAuthorityMode,
    JobRetryClass,
    JobWorkloadClass,
)
from src.modules.commerce.dunning.schema import PaymentRestrictedErrorMeta, RestrictedRecoveryEffect
from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    JOB_HANDLER_UNEXPECTED_ERROR_CODE,
    JOB_RESULT_CONTRACT_MISMATCH_CODE,
    JOB_WORKER_LOST_ERROR_CODE,
    UnexpectedJobExecutionMetadata,
    validate_job_execution_error_code,
)
from src.modules.jobs.retry import JobRetryPolicy

if TYPE_CHECKING:
    from src.config import Settings

type JobContractSchema = type[BaseSchema]
type JobCrossFieldValidator = Callable[[BaseSchema, BaseSchema], None]
type JobResultSemanticValidator = Callable[[JobResultSemanticContext], None]


class JobResultSemanticContext(BaseSchema):
    """Canonical references available to a Job type's result binding validator."""

    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    job_id: UUID
    source_revision: str | None
    target: BaseSchema
    input_reference: BaseSchema
    result_reference: BaseSchema


class JobTerminalErrorContract(BaseSchema):
    """One terminal error code and its exact persisted metadata shape."""

    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    code: str
    metadata_schema: JobContractSchema | None = Field(exclude=True, repr=False)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        return validate_job_execution_error_code(value)


COMMON_JOB_TERMINAL_ERROR_CONTRACTS: Final = (
    JobTerminalErrorContract(code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=JOB_RESULT_CONTRACT_MISMATCH_CODE, metadata_schema=None),
    JobTerminalErrorContract(code=JOB_WORKER_LOST_ERROR_CODE, metadata_schema=None),
    JobTerminalErrorContract(
        code=JOB_HANDLER_UNEXPECTED_ERROR_CODE,
        metadata_schema=UnexpectedJobExecutionMetadata,
    ),
    JobTerminalErrorContract(code="WORKSPACE_PAYMENT_RESTRICTED", metadata_schema=PaymentRestrictedErrorMeta),
)


class JobTargetScope(StrEnum):
    SYSTEM = "system"
    WORKSPACE = "workspace"
    PROJECT = "project"
    RUNTIME = "runtime"


class JobVisibility(StrEnum):
    OWNER_ONLY = "owner_only"
    PROJECT = "project"
    WORKSPACE = "workspace"
    SYSTEM = "system"


class JobPermissionScope(StrEnum):
    WORKSPACE = "workspace"
    PROJECT = "project"


class JobPermissionRequirement(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    scope: JobPermissionScope
    action: str = Field(..., min_length=1, max_length=160)

    @field_validator("action")
    @classmethod
    def normalize_action(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("permission action must contain non-whitespace characters")
        return normalized


class JobTypeKey(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)


class JobTypeDefinition(BaseSchema):
    """Immutable policy manifest for one executable Job type/version."""

    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
    )

    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)
    task_name: str = Field(..., min_length=1, max_length=192)
    workload_class: JobWorkloadClass
    target_scope: JobTargetScope
    visibility: JobVisibility
    authority_mode: JobAuthorityMode
    required_permission: JobPermissionRequirement | None = None
    required_entitlement: str | None = Field(default=None, min_length=1, max_length=160)
    commercial_effects: frozenset[RestrictedRecoveryEffect] | None = None
    manage_permission: JobPermissionRequirement | None = None
    initial_phase: str = Field(..., min_length=1, max_length=96)
    initial_status_key: str | None = Field(default=None, min_length=1, max_length=160)
    phases: frozenset[str]
    cancellable_phases: frozenset[str] = Field(default_factory=frozenset)
    retry_class: JobRetryClass
    retry_policy: JobRetryPolicy
    timeout_seconds: int | None = Field(default=None, ge=1)
    lease_seconds: int = Field(..., ge=3)
    heartbeat_seconds: int = Field(..., ge=1)
    idempotency_namespace: str = Field(..., min_length=1, max_length=128)
    target_schema: JobContractSchema | None = Field(default=None, exclude=True, repr=False)
    input_reference_schema: JobContractSchema | None = Field(default=None, exclude=True, repr=False)
    result_reference_schema: JobContractSchema | None = Field(default=None, exclude=True, repr=False)
    cross_field_validator: JobCrossFieldValidator | None = Field(default=None, exclude=True, repr=False)
    result_semantic_validator: JobResultSemanticValidator | None = Field(default=None, exclude=True, repr=False)
    terminal_error_contracts: tuple[JobTerminalErrorContract, ...] = Field(
        default=(),
        exclude=True,
        repr=False,
    )

    @field_validator(
        "job_type",
        "task_name",
        "required_entitlement",
        "initial_phase",
        "initial_status_key",
        "idempotency_namespace",
    )
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized

    @field_validator("phases", "cancellable_phases")
    @classmethod
    def normalize_phases(cls, values: frozenset[str]) -> frozenset[str]:
        normalized = frozenset(value.strip() for value in values if value.strip())
        if len(normalized) != len(values):
            raise ValueError("phases must contain unique non-empty values")
        return normalized

    @field_validator("terminal_error_contracts")
    @classmethod
    def normalize_terminal_error_contracts(
        cls,
        contracts: tuple[JobTerminalErrorContract, ...],
    ) -> tuple[JobTerminalErrorContract, ...]:
        codes = [contract.code for contract in contracts]
        if len(codes) != len(set(codes)):
            raise ValueError("terminalErrorContracts must contain unique error codes")
        return tuple(sorted(contracts, key=lambda contract: contract.code))

    @model_validator(mode="after")
    def validate_policy(self) -> JobTypeDefinition:
        if self.lease_seconds < self.heartbeat_seconds * 3:
            raise ValueError("leaseSeconds must allow at least three heartbeat intervals")
        if self.target_scope == JobTargetScope.SYSTEM and self.visibility != JobVisibility.SYSTEM:
            raise ValueError("system-scoped Jobs must use system visibility")
        if self.target_scope != JobTargetScope.SYSTEM and self.visibility == JobVisibility.SYSTEM:
            raise ValueError("tenant-scoped Jobs cannot use system visibility")
        if self.authority_mode == JobAuthorityMode.ACTOR_REVALIDATED and self.required_permission is None:
            raise ValueError("actor-revalidated Jobs must declare a required permission")
        if self.cancellable_phases and self.manage_permission is None:
            raise ValueError("cancellable Jobs must declare a manage permission")
        if self.initial_phase not in self.phases:
            raise ValueError("initialPhase must belong to phases")
        if not self.cancellable_phases.issubset(self.phases):
            raise ValueError("cancellablePhases must be a subset of phases")
        if self.retry_class == JobRetryClass.NONE and (
            self.retry_policy.max_attempts != 1 or self.retry_policy.retryable_codes
        ):
            raise ValueError("non-retryable Jobs require maxAttempts=1 and no retryableCodes")
        if self.retry_class == JobRetryClass.TRANSIENT and (
            self.retry_policy.max_attempts == 1 or not self.retry_policy.retryable_codes
        ):
            raise ValueError("transient Jobs require maxAttempts>1 and explicit retryableCodes")
        if (
            self.retry_class == JobRetryClass.TRANSIENT
            and JOB_WORKER_LOST_ERROR_CODE not in self.retry_policy.retryable_codes
        ):
            raise ValueError("transient Jobs must allow retry after worker lease loss")
        return self

    @property
    def key(self) -> JobTypeKey:
        return JobTypeKey(job_type=self.job_type, job_type_version=self.job_type_version)

    @property
    def max_attempts(self) -> int:
        """Read-only derived view; ``retry_policy`` is the only definition truth."""

        return self.retry_policy.max_attempts


class JobTypeRegistry:
    """Read-only, startup-validated Job type manifest."""

    __slots__ = ("_definitions", "_strict_contracts")

    def __init__(
        self,
        definitions: Iterable[JobTypeDefinition] = (),
        *,
        strict_contracts: bool = False,
    ) -> None:
        definitions_by_key: dict[JobTypeKey, JobTypeDefinition] = {}
        task_owners: dict[str, JobTypeKey] = {}
        for definition in definitions:
            key = definition.key
            if key in definitions_by_key:
                raise ValueError(f"Duplicate background Job type registration: {key.job_type} v{key.job_type_version}")
            existing_task_owner = task_owners.get(definition.task_name)
            if existing_task_owner is not None:
                raise ValueError(
                    "Duplicate background Job task registration: "
                    f"{definition.task_name} is owned by "
                    f"{existing_task_owner.job_type} v{existing_task_owner.job_type_version}"
                )
            definitions_by_key[key] = definition
            task_owners[definition.task_name] = key

        self._definitions: Mapping[JobTypeKey, JobTypeDefinition] = MappingProxyType(definitions_by_key)
        self._strict_contracts = strict_contracts
        if strict_contracts:
            self._validate_runtime_contracts()

    @property
    def strict_contracts(self) -> bool:
        return self._strict_contracts

    def resolve(self, *, job_type: str, job_type_version: int) -> JobTypeDefinition | None:
        key = JobTypeKey(job_type=job_type, job_type_version=job_type_version)
        return self._definitions.get(key)

    def require(self, *, job_type: str, job_type_version: int) -> JobTypeDefinition:
        definition = self.resolve(job_type=job_type, job_type_version=job_type_version)
        if definition is None:
            raise JobTypeNotRegisteredError(job_type=job_type, job_type_version=job_type_version)
        return definition

    def list_definitions(self, *, visibility: JobVisibility | None = None) -> tuple[JobTypeDefinition, ...]:
        definitions = self._definitions.values()
        if visibility is not None:
            definitions = (definition for definition in definitions if definition.visibility == visibility)
        return tuple(sorted(definitions, key=lambda item: (item.job_type, item.job_type_version)))

    def validate_permission_actions(
        self,
        *,
        workspace_actions: Iterable[str],
        project_actions: Iterable[str],
    ) -> None:
        available_by_scope = {
            JobPermissionScope.WORKSPACE: frozenset(action.strip() for action in workspace_actions if action.strip()),
            JobPermissionScope.PROJECT: frozenset(action.strip() for action in project_actions if action.strip()),
        }
        missing: list[str] = []
        for definition in self._definitions.values():
            for requirement in (definition.required_permission, definition.manage_permission):
                if requirement is None:
                    continue
                if requirement.action not in available_by_scope[requirement.scope]:
                    missing.append(
                        f"{definition.job_type} v{definition.job_type_version}: "
                        f"{requirement.scope}:{requirement.action}"
                    )
        if missing:
            raise ValueError("Unknown permission actions in Job registry: " + ", ".join(sorted(missing)))

    def _validate_runtime_contracts(self) -> None:
        invalid: list[str] = []
        for definition in self._definitions.values():
            identity = f"{definition.job_type} v{definition.job_type_version}"
            schemas = {
                "targetSchema": definition.target_schema,
                "inputReferenceSchema": definition.input_reference_schema,
                "resultReferenceSchema": definition.result_reference_schema,
            }
            for field_name, schema in schemas.items():
                if schema is None:
                    invalid.append(f"{identity}: missing {field_name}")
                    continue
                if schema.model_config.get("extra") != "forbid":
                    invalid.append(f"{identity}: {field_name} must forbid extra fields")
                if schema.model_config.get("frozen") is not True:
                    invalid.append(f"{identity}: {field_name} must be frozen")

            if definition.result_semantic_validator is None:
                invalid.append(f"{identity}: missing resultSemanticValidator")
            invalid.extend(_terminal_error_contract_violations(definition=definition, identity=identity))

            target_schema = definition.target_schema
            if target_schema is not None:
                required_fields = required_target_id_fields(definition.target_scope)
                missing_fields = required_fields.difference(target_schema.model_fields)
                if missing_fields:
                    fields = ", ".join(sorted(missing_fields))
                    invalid.append(f"{identity}: targetSchema is missing scope fields: {fields}")

        if invalid:
            raise ValueError("Invalid runtime contracts in Job registry: " + "; ".join(sorted(invalid)))


def _terminal_error_contract_violations(
    *,
    definition: JobTypeDefinition,
    identity: str,
) -> list[str]:
    contracts = definition.terminal_error_contracts
    violations: list[str] = []
    if not contracts:
        violations.append(f"{identity}: missing terminalErrorContracts")
    registered = {contract.code: contract for contract in contracts}
    if len(registered) != len(contracts):
        violations.append(f"{identity}: terminalErrorContracts contain duplicate error codes")
    for common_contract in COMMON_JOB_TERMINAL_ERROR_CONTRACTS:
        if registered.get(common_contract.code) != common_contract:
            violations.append(
                f"{identity}: terminalErrorContracts must declare the canonical {common_contract.code} contract"
            )
    missing_retryable_codes = definition.retry_policy.retryable_codes.difference(registered)
    if missing_retryable_codes:
        violations.append(
            f"{identity}: terminalErrorContracts are missing retryable codes: "
            + ", ".join(sorted(missing_retryable_codes))
        )
    for contract in contracts:
        schema = contract.metadata_schema
        if schema is None:
            continue
        if schema.model_config.get("extra") != "forbid":
            violations.append(f"{identity}: terminal metadata schema for {contract.code} must forbid extra fields")
        if schema.model_config.get("frozen") is not True:
            violations.append(f"{identity}: terminal metadata schema for {contract.code} must be frozen")
    return violations


def required_target_id_fields(target_scope: JobTargetScope) -> frozenset[str]:
    if target_scope == JobTargetScope.SYSTEM:
        return frozenset()
    if target_scope == JobTargetScope.WORKSPACE:
        return frozenset({"workspace_id"})
    if target_scope == JobTargetScope.PROJECT:
        return frozenset({"workspace_id", "project_id"})
    return frozenset({"workspace_id", "project_id", "site_id"})


class JobTypeNotRegisteredError(LookupError):
    def __init__(self, *, job_type: str, job_type_version: int) -> None:
        self.job_type = job_type
        self.job_type_version = job_type_version
        super().__init__(f"Background Job type is not registered: {job_type} v{job_type_version}")


def get_job_type_registry(settings: Settings | None = None) -> JobTypeRegistry:
    # Local import keeps policy types independent from their composition root.
    from src.modules.jobs.builtin_registry import (
        build_builtin_job_type_registry,
        get_builtin_job_type_registry,
    )

    if settings is None:
        return get_builtin_job_type_registry()
    return build_builtin_job_type_registry(settings)
