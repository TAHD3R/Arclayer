from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable, Iterator
from types import MappingProxyType
from typing import Any, Protocol, TypeVar, cast, runtime_checkable
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.jobs.background_job import JobWorkloadClass
from src.modules.jobs.execution_errors import (
    JobExecutionRegistryError,
    PermanentJobExecutionError,
    TransientJobExecutionError,
    UnexpectedJobExecutionError,
)
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot, JobExecutionLease, JobProgressUpdate
from src.modules.jobs.registry import (
    JobContractSchema,
    JobResultSemanticValidator,
    JobTerminalErrorContract,
    JobTypeDefinition,
    JobTypeRegistry,
)
from src.platform.jobs.durable.errors import DurableTaskManifestError
from src.platform.jobs.durable.manifest import DurableTaskDefinition, DurableTaskManifest

ContextTargetT_co = TypeVar("ContextTargetT_co", bound=BaseSchema, covariant=True)
ContextInputT_co = TypeVar("ContextInputT_co", bound=BaseSchema, covariant=True)
HandlerTargetT_contra = TypeVar("HandlerTargetT_contra", bound=BaseSchema, contravariant=True)
HandlerInputT_contra = TypeVar("HandlerInputT_contra", bound=BaseSchema, contravariant=True)
HandlerResultT_co = TypeVar("HandlerResultT_co", bound=BaseSchema, covariant=True)
type JobHandlerTerminalError = PermanentJobExecutionError | TransientJobExecutionError | UnexpectedJobExecutionError


class JobHandledFailure(BaseSchema):
    """A durable domain failure already projected by an opt-in Job handler."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    code: str = Field(..., min_length=1, max_length=96)
    safe_message: str = Field(..., min_length=1, max_length=4000)
    metadata: JsonObject | None = None


class JobHandledInterruption(BaseSchema):
    """A durable owning-domain checkpoint that releases the current worker Attempt."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    reason: str = Field(..., min_length=1, max_length=96)
    phase: str = Field(..., min_length=1, max_length=96)
    status_key: str = Field(..., min_length=1, max_length=160)
    continuation_reference: JsonObject


class JobExecutionContext(Protocol[ContextTargetT_co, ContextInputT_co]):
    """Fenced services and typed references available to one handler Attempt."""

    @property
    def lease(self) -> JobExecutionLease: ...

    @property
    def target(self) -> ContextTargetT_co: ...

    @property
    def input_reference(self) -> ContextInputT_co: ...

    @property
    def actor_user_id(self) -> UUID | None: ...

    @property
    def source_revision(self) -> str | None: ...

    @property
    def request_fingerprint(self) -> str: ...

    def idempotency_key(self, *, step: str) -> str:
        """Return the stable Job-and-step key required by a domain/provider effect."""
        ...

    async def checkpoint(self) -> JobExecutionControlSnapshot:
        """Heartbeat the fence and return current cancellation/deadline control."""
        ...

    async def report_progress(self, update: JobProgressUpdate) -> JobExecutionControlSnapshot:
        """Persist absolute progress under the fence and return current control."""
        ...

    async def run_fenced_domain_commit[ResultT](
        self,
        operation: Callable[[], Awaitable[ResultT]],
    ) -> ResultT:
        """Run one short domain commit while the public Job/Attempt fence is locked."""
        ...


@runtime_checkable
class DurableJobHandler(Protocol[HandlerTargetT_contra, HandlerInputT_contra, HandlerResultT_co]):
    """Domain handler contract; the executor owns retries and terminal projection."""

    async def reconcile(
        self,
        *,
        context: JobExecutionContext[HandlerTargetT_contra, HandlerInputT_contra],
    ) -> HandlerResultT_co | JobHandledFailure | JobHandledInterruption | None:
        """Return a canonical prior outcome, or ``None`` when no outcome exists."""
        ...

    async def execute(
        self,
        *,
        context: JobExecutionContext[HandlerTargetT_contra, HandlerInputT_contra],
    ) -> HandlerResultT_co | JobHandledFailure | JobHandledInterruption:
        """Persist the canonical domain outcome and return its typed reference."""
        ...


@runtime_checkable
class CancellableDurableJobHandler(
    DurableJobHandler[HandlerTargetT_contra, HandlerInputT_contra, HandlerResultT_co],
    Protocol[HandlerTargetT_contra, HandlerInputT_contra, HandlerResultT_co],
):
    """Additional cleanup contract required only by definitions with cancellable phases."""

    async def cancel(
        self,
        *,
        context: JobExecutionContext[HandlerTargetT_contra, HandlerInputT_contra],
    ) -> None:
        """Release domain reservations and return only after cancellation is safe."""
        ...


@runtime_checkable
class FailureProjectingDurableJobHandler(
    DurableJobHandler[HandlerTargetT_contra, HandlerInputT_contra, HandlerResultT_co],
    Protocol[HandlerTargetT_contra, HandlerInputT_contra, HandlerResultT_co],
):
    """Opt-in hook for projecting pre-handler boundary failures into domain authority."""

    async def project_failure(
        self,
        *,
        context: JobExecutionContext[HandlerTargetT_contra, HandlerInputT_contra],
        error: JobHandlerTerminalError,
    ) -> JobHandledFailure | None:
        """Persist an owning-domain failure; return a replacement only when classification changes."""
        ...


type JobHandlerFactory = Callable[[], DurableJobHandler[Any, Any, Any]]


def derive_durable_task_manifest(job_types: JobTypeRegistry) -> DurableTaskManifest:
    """Derive producer-safe transport bindings without importing domain handlers."""

    if not job_types.strict_contracts:
        raise JobExecutionRegistryError("durable Taskiq manifest requires a strict JobTypeRegistry")
    try:
        return DurableTaskManifest(
            DurableTaskDefinition(
                job_type=definition.job_type,
                job_type_version=definition.job_type_version,
                task_name=definition.task_name,
                workload_class=JobWorkloadClass(definition.workload_class),
                message_schema_version=1,
            )
            for definition in job_types.list_definitions()
        )
    except (DurableTaskManifestError, ValueError) as exc:
        raise JobExecutionRegistryError("Job definitions produce an invalid Taskiq manifest") from exc


class JobTypeRegistration(BaseSchema):
    """Immutable executable binding kept separate from persistence policy definitions."""

    model_config = BaseSchema.model_config | ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)
    task_name: str = Field(..., min_length=1, max_length=192)
    workload_class: JobWorkloadClass
    message_schema_version: int = Field(default=1, ge=1)
    target_schema: JobContractSchema = Field(..., exclude=True, repr=False)
    input_reference_schema: JobContractSchema = Field(..., exclude=True, repr=False)
    result_reference_schema: JobContractSchema = Field(..., exclude=True, repr=False)
    result_semantic_validator: JobResultSemanticValidator = Field(..., exclude=True, repr=False)
    terminal_error_contracts: tuple[JobTerminalErrorContract, ...] = Field(exclude=True, repr=False)
    handler_factory: JobHandlerFactory = Field(..., exclude=True, repr=False)

    @field_validator("job_type", "task_name")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized

    @field_validator("terminal_error_contracts")
    @classmethod
    def validate_terminal_error_contracts(
        cls,
        contracts: tuple[JobTerminalErrorContract, ...],
    ) -> tuple[JobTerminalErrorContract, ...]:
        if not contracts:
            raise ValueError("terminalErrorContracts must be explicitly registered")
        codes = [contract.code for contract in contracts]
        if len(codes) != len(set(codes)):
            raise ValueError("terminalErrorContracts must contain unique error codes")
        return tuple(sorted(contracts, key=lambda contract: contract.code))

    @classmethod
    def from_definition(
        cls,
        *,
        definition: JobTypeDefinition,
        handler_factory: JobHandlerFactory,
        message_schema_version: int = 1,
    ) -> JobTypeRegistration:
        schemas = (
            definition.target_schema,
            definition.input_reference_schema,
            definition.result_reference_schema,
        )
        if any(schema is None for schema in schemas):
            raise JobExecutionRegistryError(
                f"{definition.job_type} v{definition.job_type_version} is missing an execution schema"
            )
        if definition.result_semantic_validator is None:
            raise JobExecutionRegistryError(
                f"{definition.job_type} v{definition.job_type_version} is missing a result semantic validator"
            )
        if not definition.terminal_error_contracts:
            raise JobExecutionRegistryError(
                f"{definition.job_type} v{definition.job_type_version} is missing terminal error contracts"
            )
        return cls(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=JobWorkloadClass(definition.workload_class),
            message_schema_version=message_schema_version,
            target_schema=cast(JobContractSchema, definition.target_schema),
            input_reference_schema=cast(JobContractSchema, definition.input_reference_schema),
            result_reference_schema=cast(JobContractSchema, definition.result_reference_schema),
            result_semantic_validator=definition.result_semantic_validator,
            terminal_error_contracts=definition.terminal_error_contracts,
            handler_factory=handler_factory,
        )

    @property
    def job_identity(self) -> tuple[str, int]:
        return self.job_type, self.job_type_version

    def resolve_terminal_error_contract(self, *, code: str) -> JobTerminalErrorContract | None:
        return next((contract for contract in self.terminal_error_contracts if contract.code == code), None)


class JobExecutionRegistry:
    """Exact startup-validated bindings for every persisted Job type definition."""

    __slots__ = (
        "_by_identity",
        "_cancellation_requirements",
        "_handler_factories",
        "_registrations",
        "_task_manifest",
    )

    def __init__(
        self,
        *,
        job_types: JobTypeRegistry,
        registrations: Iterable[JobTypeRegistration],
    ) -> None:
        if not job_types.strict_contracts:
            raise JobExecutionRegistryError("execution registry requires a strict JobTypeRegistry")

        supplied = tuple(registrations)
        by_identity: dict[tuple[str, int], JobTypeRegistration] = {}
        for registration in supplied:
            if registration.job_identity in by_identity:
                raise JobExecutionRegistryError(
                    f"duplicate handler registration for {_format_identity(registration.job_identity)}"
                )
            by_identity[registration.job_identity] = registration

        definitions = job_types.list_definitions()
        expected = {(definition.job_type, definition.job_type_version) for definition in definitions}
        actual = set(by_identity)
        if actual != expected:
            missing = sorted(_format_identity(identity) for identity in expected - actual)
            unexpected = sorted(_format_identity(identity) for identity in actual - expected)
            raise JobExecutionRegistryError(
                f"handler registrations must match Job types; missing={missing}, unexpected={unexpected}"
            )

        ordered: list[JobTypeRegistration] = []
        handler_factories: dict[tuple[str, int], JobHandlerFactory] = {}
        cancellation_requirements: dict[tuple[str, int], bool] = {}
        for definition in definitions:
            registration = by_identity[(definition.job_type, definition.job_type_version)]
            _validate_exact_binding(definition=definition, registration=registration)
            ordered.append(registration)
            requires_cancellation = bool(definition.cancellable_phases)
            _instantiate_handler(
                identity=registration.job_identity,
                handler_factory=registration.handler_factory,
                requires_cancellation=requires_cancellation,
            )
            handler_factories[registration.job_identity] = registration.handler_factory
            cancellation_requirements[registration.job_identity] = requires_cancellation

        self._registrations = tuple(ordered)
        self._by_identity = MappingProxyType(by_identity)
        self._handler_factories = MappingProxyType(handler_factories)
        self._cancellation_requirements = MappingProxyType(cancellation_requirements)
        self._task_manifest = _derive_task_manifest(self._registrations)

    def resolve(self, *, job_type: str, job_type_version: int) -> JobTypeRegistration | None:
        return self._by_identity.get((job_type, job_type_version))

    def require(self, *, job_type: str, job_type_version: int) -> JobTypeRegistration:
        registration = self.resolve(job_type=job_type, job_type_version=job_type_version)
        if registration is None:
            raise JobExecutionRegistryError(f"no handler for {job_type} v{job_type_version}")
        return registration

    def create_handler(
        self,
        *,
        job_type: str,
        job_type_version: int,
    ) -> DurableJobHandler[Any, Any, Any]:
        identity = (job_type, job_type_version)
        handler_factory = self._handler_factories.get(identity)
        if handler_factory is None:
            raise JobExecutionRegistryError(f"no handler for {job_type} v{job_type_version}")
        return _instantiate_handler(
            identity=identity,
            handler_factory=handler_factory,
            requires_cancellation=self._cancellation_requirements[identity],
        )

    def derive_task_manifest(self) -> DurableTaskManifest:
        return self._task_manifest

    def __iter__(self) -> Iterator[JobTypeRegistration]:
        return iter(self._registrations)

    def __len__(self) -> int:
        return len(self._registrations)


def _validate_exact_binding(
    *,
    definition: JobTypeDefinition,
    registration: JobTypeRegistration,
) -> None:
    mismatches: list[str] = []
    if registration.task_name != definition.task_name:
        mismatches.append("taskName")
    if registration.workload_class != JobWorkloadClass(definition.workload_class):
        mismatches.append("workloadClass")
    if registration.target_schema is not definition.target_schema:
        mismatches.append("targetSchema")
    if registration.input_reference_schema is not definition.input_reference_schema:
        mismatches.append("inputReferenceSchema")
    if registration.result_reference_schema is not definition.result_reference_schema:
        mismatches.append("resultReferenceSchema")
    if registration.result_semantic_validator is not definition.result_semantic_validator:
        mismatches.append("resultSemanticValidator")
    if registration.terminal_error_contracts != definition.terminal_error_contracts:
        mismatches.append("terminalErrorContracts")

    if mismatches:
        identity = f"{definition.job_type} v{definition.job_type_version}"
        raise JobExecutionRegistryError(
            f"execution binding for {identity} differs from Job definition: {', '.join(mismatches)}"
        )


def _instantiate_handler(
    *,
    identity: tuple[str, int],
    handler_factory: JobHandlerFactory,
    requires_cancellation: bool,
) -> DurableJobHandler[Any, Any, Any]:
    formatted_identity = _format_identity(identity)
    try:
        handler = handler_factory()
    except Exception as exc:
        raise JobExecutionRegistryError(f"handler factory for {formatted_identity} failed to create a handler") from exc

    required_methods = ["reconcile", "execute"]
    if requires_cancellation:
        required_methods.append("cancel")
    missing = [method_name for method_name in required_methods if not callable(getattr(handler, method_name, None))]
    if missing:
        raise JobExecutionRegistryError(
            f"handler factory for {formatted_identity} returned an invalid handler; missing={missing}"
        )
    return handler


def _derive_task_manifest(registrations: Iterable[JobTypeRegistration]) -> DurableTaskManifest:
    try:
        return DurableTaskManifest(
            DurableTaskDefinition(
                job_type=registration.job_type,
                job_type_version=registration.job_type_version,
                task_name=registration.task_name,
                workload_class=registration.workload_class,
                message_schema_version=registration.message_schema_version,
            )
            for registration in registrations
        )
    except (DurableTaskManifestError, ValueError) as exc:
        raise JobExecutionRegistryError("derived Taskiq manifest is invalid") from exc


def _format_identity(identity: tuple[str, int]) -> str:
    job_type, version = identity
    return f"{job_type} v{version}"
