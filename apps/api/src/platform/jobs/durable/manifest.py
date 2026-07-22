from __future__ import annotations

from collections.abc import Iterable, Iterator
from types import MappingProxyType

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.models.jobs.background_job import JobWorkloadClass
from src.platform.jobs.durable.errors import DurableTaskManifestError

CANONICAL_JOB_WORKLOADS: tuple[JobWorkloadClass, ...] = (
    JobWorkloadClass.AGENT_IO,
    JobWorkloadClass.RENDER_BROWSER,
    JobWorkloadClass.ASSET_CPU,
    JobWorkloadClass.PUBLISH,
    JobWorkloadClass.CONNECTOR,
    JobWorkloadClass.MAINTENANCE,
)


class WorkloadRoute(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, use_enum_values=False)

    workload_class: JobWorkloadClass
    stream_name: str = Field(..., min_length=1, max_length=256)
    consumer_group_name: str = Field(..., min_length=1, max_length=256)

    @field_validator("stream_name", "consumer_group_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must contain non-whitespace characters")
        return normalized


class TaskiqWorkloadManifest:
    """Immutable, exhaustive physical routing manifest for durable workloads."""

    __slots__ = ("_by_workload", "_routes")

    def __init__(self, routes: Iterable[WorkloadRoute]) -> None:
        self._routes = tuple(routes)
        by_workload = {route.workload_class: route for route in self._routes}
        expected = set(CANONICAL_JOB_WORKLOADS)
        actual = set(by_workload)
        if len(by_workload) != len(self._routes):
            raise DurableTaskManifestError("workload routes must be globally unique")
        if actual != expected:
            missing = sorted(workload.value for workload in expected - actual)
            unexpected = sorted(workload.value for workload in actual - expected)
            raise DurableTaskManifestError(
                f"workload routes must be exhaustive; missing={missing}, unexpected={unexpected}"
            )
        if len({route.stream_name for route in self._routes}) != len(self._routes):
            raise DurableTaskManifestError("workload stream names must be globally unique")
        if len({route.consumer_group_name for route in self._routes}) != len(self._routes):
            raise DurableTaskManifestError("consumer group names must be globally unique")
        self._by_workload = MappingProxyType(by_workload)

    @classmethod
    def for_prefixes(cls, *, stream_prefix: str, consumer_group_prefix: str) -> TaskiqWorkloadManifest:
        normalized_stream_prefix = _normalize_prefix(stream_prefix, label="stream")
        normalized_group_prefix = _normalize_prefix(consumer_group_prefix, label="consumer group")
        return cls(
            WorkloadRoute(
                workload_class=workload,
                stream_name=f"{normalized_stream_prefix}:{workload.value}",
                consumer_group_name=f"{normalized_group_prefix}:{workload.value}",
            )
            for workload in CANONICAL_JOB_WORKLOADS
        )

    def route_for(self, workload_class: JobWorkloadClass) -> WorkloadRoute:
        try:
            normalized = JobWorkloadClass(workload_class)
            return self._by_workload[normalized]
        except (KeyError, ValueError) as exc:
            raise DurableTaskManifestError(f"unknown workload class {workload_class!r}") from exc

    def __iter__(self) -> Iterator[WorkloadRoute]:
        return iter(self._routes)

    def __len__(self) -> int:
        return len(self._routes)


class DurableTaskDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, use_enum_values=False)

    job_type: str = Field(..., min_length=1, max_length=128)
    job_type_version: int = Field(..., ge=1)
    task_name: str = Field(..., min_length=1, max_length=192)
    workload_class: JobWorkloadClass
    message_schema_version: int = Field(default=1, ge=1)

    @field_validator("job_type", "task_name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized

    @model_validator(mode="after")
    def validate_task_name(self) -> DurableTaskDefinition:
        prefix = f"jobs:{self.workload_class.value}:"
        suffix = f":v{self.job_type_version}"
        if not self.task_name.startswith(prefix) or not self.task_name.endswith(suffix):
            raise ValueError(f"taskName must match {prefix}<stable-job-name>{suffix}")
        return self

    @property
    def job_identity(self) -> tuple[str, int]:
        return self.job_type, self.job_type_version


class DurableTaskManifest:
    """Global manifest that compensates for Taskiq's overwrite-on-duplicate registry."""

    __slots__ = ("_by_identity", "_by_task_name", "_definitions")

    def __init__(self, definitions: Iterable[DurableTaskDefinition]) -> None:
        self._definitions = tuple(definitions)
        by_task_name: dict[str, DurableTaskDefinition] = {}
        by_identity: dict[tuple[str, int], DurableTaskDefinition] = {}
        for definition in self._definitions:
            if definition.task_name in by_task_name:
                raise DurableTaskManifestError(f"duplicate Taskiq task name {definition.task_name!r}")
            if definition.job_identity in by_identity:
                job_type, version = definition.job_identity
                raise DurableTaskManifestError(f"duplicate durable job type/version {job_type!r}/v{version}")
            by_task_name[definition.task_name] = definition
            by_identity[definition.job_identity] = definition
        self._by_task_name = MappingProxyType(by_task_name)
        self._by_identity = MappingProxyType(by_identity)

    def definition_for_task(self, task_name: str) -> DurableTaskDefinition | None:
        return self._by_task_name.get(task_name)

    def definition_for_job(self, *, job_type: str, job_type_version: int) -> DurableTaskDefinition | None:
        return self._by_identity.get((job_type, job_type_version))

    def for_workload(self, workload_class: JobWorkloadClass) -> DurableTaskManifest:
        try:
            normalized = JobWorkloadClass(workload_class)
        except ValueError as exc:
            raise DurableTaskManifestError(f"unknown workload class {workload_class!r}") from exc
        return DurableTaskManifest(
            definition for definition in self._definitions if definition.workload_class == normalized
        )

    def __iter__(self) -> Iterator[DurableTaskDefinition]:
        return iter(self._definitions)

    def __len__(self) -> int:
        return len(self._definitions)


def _normalize_prefix(value: str, *, label: str) -> str:
    normalized = value.strip().rstrip(":")
    if not normalized:
        raise DurableTaskManifestError(f"{label} prefix must contain non-whitespace characters")
    return normalized
