from __future__ import annotations

import math
import re
from datetime import datetime
from typing import cast
from uuid import UUID

from pydantic import ConfigDict, Field, TypeAdapter, ValidationError, field_validator, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.models.jobs.provider_effect import ProviderEffectDisposition, ProviderEffectRecord
from src.modules.jobs.execution_errors import JobExecutionStateInvariantError
from src.modules.jobs.hashing import hash_json
from src.platform.storage.profile_routes import StorageProfileRouteBinding

_JSON_OBJECT_ADAPTER = TypeAdapter(JsonObject)
_SENSITIVE_KEY_MARKERS = (
    "accesskey",
    "apikey",
    "credential",
    "password",
    "privatekey",
    "secret",
    "token",
)


class ProviderEffectRegistration(BaseSchema):
    """Exact effect intent registered before the first provider mutation."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    route: StorageProfileRouteBinding
    effect_type: str = Field(..., min_length=1, max_length=128)
    effect_key: str = Field(..., min_length=1, max_length=256)
    schema_version: int = Field(..., strict=True, ge=1)
    manifest: JsonObject

    @field_validator("effect_type", "effect_key")
    @classmethod
    def normalize_identity(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("provider effect identity cannot be blank")
        return normalized

    @model_validator(mode="after")
    def reject_secrets(self) -> ProviderEffectRegistration:
        validate_non_secret_json(self.manifest, label="provider effect manifest")
        return self


class ProviderEffectSettlement(BaseSchema):
    """One fenced Attempt's requested terminal transition for exact effect rows."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    effect_ids: tuple[UUID, ...] = Field(..., min_length=1)
    disposition: ProviderEffectDisposition
    settlement_reference: JsonObject

    @field_validator("disposition")
    @classmethod
    def require_terminal_disposition(cls, value: ProviderEffectDisposition) -> ProviderEffectDisposition:
        if value == ProviderEffectDisposition.ACTIVE:
            raise ValueError("provider effects can only settle as committed or cleaned")
        return value

    @field_validator("effect_ids")
    @classmethod
    def canonicalize_effect_ids(cls, value: tuple[UUID, ...]) -> tuple[UUID, ...]:
        if len(set(value)) != len(value):
            raise ValueError("effectIds cannot contain duplicates")
        return tuple(sorted(value, key=lambda effect_id: effect_id.int))

    @model_validator(mode="after")
    def validate_settlement(self) -> ProviderEffectSettlement:
        validate_non_secret_json(self.settlement_reference, label="provider effect settlement reference")
        return self


class ProviderEffectSnapshot(BaseSchema):
    """Immutable service result for one normalized provider effect row."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: UUID
    job_id: UUID
    owner_attempt_id: UUID
    profile_id: UUID
    profile_revision_id: UUID
    effect_type: str
    effect_key: str
    schema_version: int
    manifest: JsonObject
    manifest_hash: str = Field(..., min_length=64, max_length=64)
    disposition: ProviderEffectDisposition
    registered_at: datetime
    settled_at: datetime | None = None
    settled_by_attempt_id: UUID | None = None
    settlement_reference: JsonObject | None = None

    @classmethod
    def from_record(cls, record: ProviderEffectRecord) -> ProviderEffectSnapshot:
        manifest = validate_json_object(record.manifest, label="persisted provider effect manifest")
        if hash_json(manifest) != record.manifest_hash:
            raise JobExecutionStateInvariantError(
                f"Provider effect {record.id} manifest hash does not match its canonical manifest"
            )
        try:
            disposition = ProviderEffectDisposition(record.disposition)
        except ValueError as exc:
            raise JobExecutionStateInvariantError(f"Provider effect {record.id} has an invalid disposition") from exc
        has_terminal_evidence = (
            record.settled_at is not None
            and record.settled_by_attempt_id is not None
            and record.settlement_reference is not None
        )
        if disposition == ProviderEffectDisposition.ACTIVE:
            if (
                record.settled_at is not None
                or record.settled_by_attempt_id is not None
                or record.settlement_reference is not None
            ):
                raise JobExecutionStateInvariantError(
                    f"Active provider effect {record.id} cannot carry settlement evidence"
                )
        elif not has_terminal_evidence:
            raise JobExecutionStateInvariantError(
                f"Terminal provider effect {record.id} requires complete settlement evidence"
            )
        return cls(
            id=record.id,
            job_id=record.job_id,
            owner_attempt_id=record.owner_attempt_id,
            profile_id=record.profile_id,
            profile_revision_id=record.profile_revision_id,
            effect_type=record.effect_type,
            effect_key=record.effect_key,
            schema_version=record.schema_version,
            manifest=manifest,
            manifest_hash=record.manifest_hash,
            disposition=disposition,
            registered_at=record.registered_at,
            settled_at=record.settled_at,
            settled_by_attempt_id=record.settled_by_attempt_id,
            settlement_reference=(
                validate_json_object(
                    record.settlement_reference,
                    label="persisted provider effect settlement reference",
                )
                if record.settlement_reference is not None
                else None
            ),
        )


class ProviderEffectRecoverySnapshot(BaseSchema):
    """Fenced source Job scope and its exact recovery Effect evidence."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    source_job_id: UUID
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    site_id: UUID | None = None
    effects: tuple[ProviderEffectSnapshot, ...]

    @model_validator(mode="after")
    def validate_source_scope(self) -> ProviderEffectRecoverySnapshot:
        if self.project_id is not None and self.workspace_id is None:
            raise ValueError("Project recovery scope requires a workspace ID")
        if self.site_id is not None and self.project_id is None:
            raise ValueError("Runtime recovery scope requires a project ID")
        if any(effect.job_id != self.source_job_id for effect in self.effects):
            raise ValueError("Recovery Effect evidence must belong to its source Job")
        return self


def validate_json_object(value: object, *, label: str) -> JsonObject:
    try:
        validated = _JSON_OBJECT_ADAPTER.validate_python(value)
        validate_non_secret_json(validated, label=label)
    except (ValidationError, ValueError) as exc:
        raise JobExecutionStateInvariantError(f"{label} is not valid non-secret JSON") from exc
    return validated


def validate_non_secret_json(value: JsonValue, *, label: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
            if any(marker in normalized_key for marker in _SENSITIVE_KEY_MARKERS):
                raise ValueError(f"{label} cannot contain credential or secret fields")
            validate_non_secret_json(cast(JsonValue, item), label=label)
        return
    if isinstance(value, list):
        for item in value:
            validate_non_secret_json(cast(JsonValue, item), label=label)
        return
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{label} cannot contain non-finite numbers")
