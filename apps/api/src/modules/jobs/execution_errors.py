from __future__ import annotations

from copy import deepcopy
from json import dumps
from math import isfinite
from re import fullmatch
from typing import Final, cast
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.modules.jobs.execution_schema import JobExecutionControlSnapshot

JOB_ERROR_CONTRACT_MISMATCH_CODE: Final = "BACKGROUND_JOB_ERROR_CONTRACT_MISMATCH"
JOB_EXECUTION_CONTRACT_MISMATCH_CODE: Final = "BACKGROUND_JOB_EXECUTION_CONTRACT_MISMATCH"
JOB_HANDLER_UNEXPECTED_ERROR_CODE: Final = "BACKGROUND_JOB_HANDLER_UNEXPECTED"
JOB_RESULT_CONTRACT_MISMATCH_CODE: Final = "BACKGROUND_JOB_RESULT_CONTRACT_MISMATCH"
JOB_WORKER_LOST_ERROR_CODE: Final = "BACKGROUND_JOB_WORKER_LOST"

_MAX_ERROR_CODE_LENGTH = 96
_MAX_ERROR_MESSAGE_LENGTH = 4000
_MAX_ERROR_METADATA_BYTES = 8192
_MAX_ERROR_METADATA_DEPTH = 4
_MAX_ERROR_METADATA_ENTRIES = 64
_MAX_ERROR_METADATA_KEY_LENGTH = 96
_MAX_ERROR_METADATA_STRING_LENGTH = 512
_SENSITIVE_METADATA_KEY_PARTS = frozenset({
    "body",
    "content",
    "credential",
    "document",
    "password",
    "prompt",
    "raw",
    "secret",
    "token",
})


class JobExecutionError(RuntimeError):
    """Visible typed failure at the durable executor or handler boundary."""

    def __init__(
        self,
        *,
        code: str,
        safe_message: str,
        metadata: JsonObject | None = None,
    ) -> None:
        self.code = validate_job_execution_error_code(code)
        self.safe_message = _validate_text(
            safe_message,
            label="safe_message",
            max_length=_MAX_ERROR_MESSAGE_LENGTH,
        )
        self._metadata = _validate_metadata(metadata)
        super().__init__(f"{self.code}: {self.safe_message}")

    @property
    def metadata(self) -> JsonObject | None:
        return deepcopy(self._metadata)


class JobExecutionLeaseLostError(JobExecutionError):
    """The worker no longer owns the Attempt fence and must stop immediately."""

    def __init__(
        self,
        *,
        job_id: UUID,
        attempt_id: UUID,
        reason: str,
    ) -> None:
        self.job_id = job_id
        self.attempt_id = attempt_id
        super().__init__(
            code="BACKGROUND_JOB_LEASE_LOST",
            safe_message=_validate_text(reason, label="reason", max_length=_MAX_ERROR_MESSAGE_LENGTH),
            metadata={
                "jobId": str(job_id),
                "attemptId": str(attempt_id),
            },
        )


class PermanentJobExecutionError(JobExecutionError):
    """A validated deterministic failure that must not be retried automatically."""


class JobExecutionResultContractError(PermanentJobExecutionError):
    """A handler returned a value outside its registered result schema."""

    def __init__(self) -> None:
        super().__init__(
            code=JOB_RESULT_CONTRACT_MISMATCH_CODE,
            safe_message="The durable Job handler returned an invalid result reference",
        )


class JobExecutionErrorContractError(PermanentJobExecutionError):
    """A terminal failure violated its registered code or metadata contract."""

    def __init__(self) -> None:
        super().__init__(
            code=JOB_ERROR_CONTRACT_MISMATCH_CODE,
            safe_message="The durable Job handler returned invalid terminal error evidence",
        )


class TransientJobExecutionError(JobExecutionError):
    """A retry-eligible failure; central policy computes the absolute retry time."""

    def __init__(
        self,
        *,
        code: str,
        safe_message: str,
        metadata: JsonObject | None = None,
        provider_retry_after_seconds: int | float | None = None,
    ) -> None:
        self.provider_retry_after_seconds = provider_retry_after_seconds
        super().__init__(code=code, safe_message=safe_message, metadata=metadata)


class WorkerLostJobExecutionError(TransientJobExecutionError):
    """The current worker lease expired before the Attempt completed."""

    def __init__(self) -> None:
        super().__init__(
            code=JOB_WORKER_LOST_ERROR_CODE,
            safe_message="The durable Job worker lost its execution lease",
        )


class UnexpectedJobExecutionMetadata(BaseSchema):
    """Only bounded execution identifiers may accompany an unexpected failure."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    handler: str | None = Field(default=None, min_length=1, max_length=160)
    correlation_id: str | None = Field(default=None, min_length=1, max_length=128)


class UnexpectedJobExecutionError(JobExecutionError):
    """Sanitized boundary error for an exception not declared by a handler."""

    def __init__(
        self,
        *,
        handler: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        metadata: JsonObject = {}
        if handler is not None:
            metadata["handler"] = _validate_text(handler, label="handler", max_length=160)
        if correlation_id is not None:
            metadata["correlationId"] = _validate_text(
                correlation_id,
                label="correlation_id",
                max_length=128,
            )
        super().__init__(
            code=JOB_HANDLER_UNEXPECTED_ERROR_CODE,
            safe_message="Unexpected durable Job handler failure",
            metadata=metadata or None,
        )


class JobExecutionRegistryError(JobExecutionError):
    """Process-startup failure from an incomplete or drifting execution registry."""

    def __init__(self, message: str) -> None:
        super().__init__(
            code="BACKGROUND_JOB_EXECUTION_REGISTRY_INVALID",
            safe_message=message,
        )


class JobExecutionCancellationRequestedError(RuntimeError):
    """Typed control flow raised only after a fenced checkpoint observes cancellation."""

    def __init__(self, *, control: JobExecutionControlSnapshot) -> None:
        if not control.cancellation_requested:
            raise ValueError("cancellation control flow requires cancelRequestedAt")
        self.control = control
        super().__init__("Durable Job cancellation was requested")


class JobExecutionStateInvariantError(RuntimeError):
    """Persisted Job/Attempt state contradicts the durable execution state machine."""


class JobExecutionOutcomeInvariantError(RuntimeError):
    """A handler result cannot be reconciled with its owning-domain marker."""


def _validate_text(value: str, *, label: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{label} must contain non-whitespace characters")
    if len(normalized) > max_length:
        raise ValueError(f"{label} must contain at most {max_length} characters")
    return normalized


def validate_job_execution_error_code(value: str) -> str:
    normalized = _validate_text(value, label="code", max_length=_MAX_ERROR_CODE_LENGTH)
    if fullmatch(r"[A-Z][A-Z0-9_]{0,95}", normalized) is None:
        raise ValueError("code must be a stable uppercase error code")
    return normalized


def _validate_metadata(metadata: JsonObject | None) -> JsonObject | None:
    if metadata is None:
        return None
    entry_count = [0]
    validated = cast(JsonObject, _validate_json_value(metadata, depth=1, entry_count=entry_count))
    encoded = dumps(validated, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
    if len(encoded) > _MAX_ERROR_METADATA_BYTES:
        raise ValueError(f"metadata must contain at most {_MAX_ERROR_METADATA_BYTES} encoded bytes")
    return validated


def _validate_json_value(value: object, *, depth: int, entry_count: list[int]) -> JsonValue:
    if depth > _MAX_ERROR_METADATA_DEPTH:
        raise ValueError(f"metadata nesting cannot exceed {_MAX_ERROR_METADATA_DEPTH} levels")
    entry_count[0] += 1
    if entry_count[0] > _MAX_ERROR_METADATA_ENTRIES:
        raise ValueError(f"metadata cannot contain more than {_MAX_ERROR_METADATA_ENTRIES} values")
    if value is None or isinstance(value, bool | int):
        return value
    if isinstance(value, float):
        if not isfinite(value):
            raise ValueError("metadata numbers must be finite")
        return value
    if isinstance(value, str):
        if len(value) > _MAX_ERROR_METADATA_STRING_LENGTH:
            raise ValueError(f"metadata strings must contain at most {_MAX_ERROR_METADATA_STRING_LENGTH} characters")
        return value
    if isinstance(value, list):
        return [_validate_json_value(item, depth=depth + 1, entry_count=entry_count) for item in value]
    if isinstance(value, dict):
        validated: JsonObject = {}
        for key, item in value.items():
            normalized_key = _validate_metadata_key(key)
            validated[normalized_key] = _validate_json_value(
                item,
                depth=depth + 1,
                entry_count=entry_count,
            )
        return validated
    raise ValueError("metadata must contain only JSON-compatible values")


def _validate_metadata_key(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("metadata keys must be strings")
    normalized = _validate_text(
        value,
        label="metadata key",
        max_length=_MAX_ERROR_METADATA_KEY_LENGTH,
    )
    lowered = normalized.casefold()
    if any(part in lowered for part in _SENSITIVE_METADATA_KEY_PARTS):
        raise ValueError("metadata keys cannot identify sensitive or unbounded content")
    return normalized
