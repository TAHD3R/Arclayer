from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol, runtime_checkable
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict, NotFound
from src.models.operations_signals import (
    OperationalSignalProjection,
    OperationalSignalProjectionLifecycle,
    OperationalSignalProjectionSeverity,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode


class OperationalSignalProjectionInput(BaseModel):
    """Validated source-owned content for one active Operational Signal."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_domain: str = Field(min_length=1, max_length=64)
    signal_type: str = Field(min_length=1, max_length=128)
    source_reference_type: str = Field(min_length=1, max_length=96)
    source_reference_id: UUID
    signal_id: UUID
    severity: OperationalSignalProjectionSeverity
    detected_at: datetime
    source_observed_at: datetime
    priority_rank: int = Field(ge=0)
    priority_reason_keys: tuple[str, ...] = Field(min_length=1)
    title_key: str = Field(min_length=1, max_length=192)
    explanation_key: str = Field(min_length=1, max_length=192)
    impact_key: str = Field(min_length=1, max_length=192)
    sanitized_evidence: JsonObject
    required_permission: PlatformPermissionCode
    destination_target: str = Field(min_length=1, max_length=192)
    affected_scope: JsonObject
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    site_id: UUID | None = None
    resolution_condition_key: str = Field(min_length=1, max_length=192)
    policy_id: str = Field(min_length=1, max_length=128)
    policy_revision: int = Field(ge=1)

    @field_validator("detected_at", "source_observed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Operational Signal timestamps must include a timezone")
        return value.astimezone(UTC)


class OperationalSignalProjectionResolution(BaseModel):
    """Source-confirmed resolution for an existing Operational Signal."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_domain: str = Field(min_length=1, max_length=64)
    signal_type: str = Field(min_length=1, max_length=128)
    source_reference_type: str = Field(min_length=1, max_length=96)
    source_reference_id: UUID
    resolved_at: datetime
    source_observed_at: datetime

    @field_validator("resolved_at", "source_observed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Operational Signal timestamps must include a timezone")
        return value.astimezone(UTC)


@runtime_checkable
class OperationalSignalProjectionWriter(Protocol):
    """Source domains use this injected boundary; Needs attention does not own source lifecycle."""

    async def upsert(self, *, signal: OperationalSignalProjectionInput) -> UUID: ...

    async def resolve(self, *, signal: OperationalSignalProjectionResolution) -> UUID: ...


class TortoiseOperationalSignalProjectionWriter:
    """Tortoise implementation of the source-domain Operational Signal writer."""

    async def upsert(self, *, signal: OperationalSignalProjectionInput) -> UUID:
        try:
            async with in_transaction() as conn:
                record = await self._lock_by_identity(signal=signal, conn=conn)
                if record is None:
                    return await self._create(signal=signal, conn=conn)
                return await self._upsert_locked(record=record, signal=signal, conn=conn)
        except IntegrityError as error:
            return await self._resolve_create_race(signal=signal, error=error)

    async def resolve(self, *, signal: OperationalSignalProjectionResolution) -> UUID:
        async with in_transaction() as conn:
            record = await self._lock_by_identity(signal=signal, conn=conn)
            if record is None:
                raise NotFound(error="OPERATIONAL_SIGNAL_PROJECTION_NOT_FOUND")
            if record.source_observed_at > signal.source_observed_at:
                return record.id
            if record.source_observed_at == signal.source_observed_at:
                if (
                    record.source_lifecycle == OperationalSignalProjectionLifecycle.RESOLVED
                    and record.resolved_at == signal.resolved_at
                ):
                    return record.id
                raise Conflict(error="OPERATIONAL_SIGNAL_PROJECTION_EVENT_CONFLICT")
            record.source_lifecycle = OperationalSignalProjectionLifecycle.RESOLVED
            record.resolved_at = signal.resolved_at
            record.source_observed_at = signal.source_observed_at
            await record.save(
                update_fields=["source_lifecycle", "resolved_at", "source_observed_at"],
                using_db=conn,
            )
            return record.id

    @staticmethod
    async def _lock_by_identity(
        *,
        signal: OperationalSignalProjectionInput | OperationalSignalProjectionResolution,
        conn: BaseDBAsyncClient,
    ) -> OperationalSignalProjection | None:
        return (
            await OperationalSignalProjection
            .filter(
                source_domain=signal.source_domain,
                signal_type=signal.signal_type,
                source_reference_type=signal.source_reference_type,
                source_reference_id=signal.source_reference_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def _create(
        *,
        signal: OperationalSignalProjectionInput,
        conn: BaseDBAsyncClient,
    ) -> UUID:
        record = await OperationalSignalProjection.create(
            using_db=conn,
            id=signal.signal_id,
            source_domain=signal.source_domain,
            signal_type=signal.signal_type,
            source_reference_type=signal.source_reference_type,
            source_reference_id=signal.source_reference_id,
            severity=signal.severity,
            detected_at=signal.detected_at,
            source_observed_at=signal.source_observed_at,
            priority_rank=signal.priority_rank,
            priority_reason_keys=list(signal.priority_reason_keys),
            title_key=signal.title_key,
            explanation_key=signal.explanation_key,
            impact_key=signal.impact_key,
            sanitized_evidence=signal.sanitized_evidence,
            required_permission=signal.required_permission,
            destination_target=signal.destination_target,
            affected_scope=signal.affected_scope,
            workspace_id=signal.workspace_id,
            project_id=signal.project_id,
            site_id=signal.site_id,
            source_lifecycle=OperationalSignalProjectionLifecycle.UNRESOLVED,
            resolution_condition_key=signal.resolution_condition_key,
            policy_id=signal.policy_id,
            policy_revision=signal.policy_revision,
        )
        return record.id

    @staticmethod
    async def _upsert_locked(
        *,
        record: OperationalSignalProjection,
        signal: OperationalSignalProjectionInput,
        conn: BaseDBAsyncClient,
    ) -> UUID:
        if record.id != signal.signal_id:
            raise Conflict(error="OPERATIONAL_SIGNAL_PROJECTION_IDENTITY_CONFLICT")
        if record.source_observed_at > signal.source_observed_at:
            return record.id
        values = {
            "severity": signal.severity,
            "detected_at": signal.detected_at,
            "source_observed_at": signal.source_observed_at,
            "priority_rank": signal.priority_rank,
            "priority_reason_keys": list(signal.priority_reason_keys),
            "title_key": signal.title_key,
            "explanation_key": signal.explanation_key,
            "impact_key": signal.impact_key,
            "sanitized_evidence": signal.sanitized_evidence,
            "required_permission": signal.required_permission,
            "destination_target": signal.destination_target,
            "affected_scope": signal.affected_scope,
            "workspace_id": signal.workspace_id,
            "project_id": signal.project_id,
            "site_id": signal.site_id,
            "source_lifecycle": OperationalSignalProjectionLifecycle.UNRESOLVED,
            "resolution_condition_key": signal.resolution_condition_key,
            "resolved_at": None,
            "policy_id": signal.policy_id,
            "policy_revision": signal.policy_revision,
        }
        changed_values = {field: value for field, value in values.items() if getattr(record, field) != value}
        if not changed_values:
            return record.id
        if record.source_observed_at == signal.source_observed_at:
            raise Conflict(error="OPERATIONAL_SIGNAL_PROJECTION_EVENT_CONFLICT")
        for field, value in changed_values.items():
            setattr(record, field, value)
        await record.save(update_fields=list(changed_values), using_db=conn)
        return record.id

    async def _resolve_create_race(
        self,
        *,
        signal: OperationalSignalProjectionInput,
        error: IntegrityError,
    ) -> UUID:
        async with in_transaction() as conn:
            record = await self._lock_by_identity(signal=signal, conn=conn)
            if record is not None:
                return await self._upsert_locked(record=record, signal=signal, conn=conn)
            if await OperationalSignalProjection.filter(id=signal.signal_id).using_db(conn).exists():
                raise Conflict(error="OPERATIONAL_SIGNAL_PROJECTION_IDENTITY_CONFLICT") from error
        raise error
