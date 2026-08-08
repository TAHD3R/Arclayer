from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import cast
from uuid import UUID

import structlog
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.events import events
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService, DomainEventPublisher
from src.models.jobs.background_job import (
    BackgroundJobRecord,
    JobDispatchOutboxRecord,
    JobInternalStatus,
)
from src.modules.jobs.hashing import hash_json
from src.modules.jobs.registry import (
    JobTargetScope,
    JobTypeDefinition,
    JobTypeNotRegisteredError,
    JobTypeRegistry,
    get_job_type_registry,
    required_target_id_fields,
)
from src.modules.jobs.repository import BackgroundJobRepository
from src.modules.jobs.schema import (
    BackgroundJobCreate,
    BackgroundJobCreateResult,
    build_job_dispatch_envelope,
)

_TERMINAL_INTERNAL_STATUSES = frozenset({
    JobInternalStatus.SUCCEEDED,
    JobInternalStatus.FAILED,
    JobInternalStatus.DEAD_LETTERED,
    JobInternalStatus.CANCELLED,
})
logger = structlog.get_logger("arclayer.jobs.contract")


class BackgroundJobService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        repository: BackgroundJobRepository | None = None,
        registry: JobTypeRegistry | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher, default_event_source="job")
        self.repository = repository or BackgroundJobRepository()
        self.registry = registry or get_job_type_registry(self.settings)

    async def create_job(self, command: BackgroundJobCreate) -> BackgroundJobRecord:
        async with self.tx() as conn:
            result = await self.create_job_in_transaction(command=command, conn=conn)
        await self.publish_created_after_commit(result)
        return result.job

    async def create_job_in_transaction(
        self,
        *,
        command: BackgroundJobCreate,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult:
        """Atomically create a Job and dispatch outbox in a caller-owned transaction."""

        definition = self._require_definition(command)
        validated_command = _validate_create_contract(command=command, definition=definition)
        scope_key = _idempotency_scope(validated_command)
        key_hash = _idempotency_hash(
            scope_key=scope_key,
            job_type=validated_command.job_type,
            idempotency_key=validated_command.idempotency_key,
        )
        request_fingerprint = _request_fingerprint(validated_command)
        existing = await self.repository.get_by_idempotency_hash(
            idempotency_key_hash=key_hash,
            conn=conn,
        )
        if existing is not None:
            _validate_idempotent_replay(job=existing, request_fingerprint=request_fingerprint)
            return BackgroundJobCreateResult(job=existing, created=False)

        try:
            # The savepoint keeps the caller's transaction usable after a uniqueness race.
            async with conn._in_transaction() as savepoint_conn:
                job = await self.repository.create_job(
                    command=validated_command,
                    definition=definition,
                    idempotency_scope_key=scope_key,
                    idempotency_key_hash=key_hash,
                    request_fingerprint=request_fingerprint,
                    conn=savepoint_conn,
                )
                await self._create_dispatch(
                    job=job,
                    dispatch_sequence=1,
                    available_at=validated_command.dispatch_after or _utc_now(),
                    conn=savepoint_conn,
                )
        except IntegrityError:
            raced = await self.repository.get_by_idempotency_hash(
                idempotency_key_hash=key_hash,
                conn=conn,
            )
            if raced is None:
                raise
            _validate_idempotent_replay(job=raced, request_fingerprint=request_fingerprint)
            return BackgroundJobCreateResult(job=raced, created=False)

        return BackgroundJobCreateResult(job=job, created=True)

    async def publish_created_after_commit(self, result: BackgroundJobCreateResult) -> None:
        """Publish ``job.created`` after the transaction that produced ``result`` commits."""

        if not result.created:
            return
        job = result.job
        await self.publish_domain_event(
            name="job.created",
            payload={
                "job_id": str(job.id),
                "job_type": job.job_type,
                "workload_class": str(job.workload_class),
                "workspace_id": str(job.workspace_id) if job.workspace_id is not None else None,
            },
            actor_user_id=job.actor_user_id,
        )

    def _require_definition(self, command: BackgroundJobCreate) -> JobTypeDefinition:
        return self._require_definition_by_identity(
            job_type=command.job_type,
            job_type_version=command.job_type_version,
        )

    def _require_definition_by_identity(
        self,
        *,
        job_type: str,
        job_type_version: int,
    ) -> JobTypeDefinition:
        try:
            return self.registry.require(
                job_type=job_type,
                job_type_version=job_type_version,
            )
        except JobTypeNotRegisteredError as exc:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_TYPE_NOT_REGISTERED"),
                error="BACKGROUND_JOB_TYPE_NOT_REGISTERED",
            ) from exc

    async def request_cancellation(
        self,
        *,
        job_id: UUID,
        requested_by_user_id: UUID | None,
        reason: str | None = None,
        requested_at: datetime | None = None,
    ) -> BackgroundJobRecord:
        cancelled_at = requested_at or _utc_now()
        async with self.tx() as conn:
            job, requested = await self.request_cancellation_in_transaction(
                job_id=job_id,
                requested_by_user_id=requested_by_user_id,
                reason=reason,
                requested_at=cancelled_at,
                conn=conn,
            )
        await self.publish_cancellation_requested_after_commit(job=job, requested=requested)
        return job

    async def request_cancellation_in_transaction(
        self,
        *,
        job_id: UUID,
        requested_by_user_id: UUID | None,
        reason: str | None,
        requested_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, bool]:
        """Persist one cancellation request inside a caller-owned domain transaction."""

        job = await self._get_job_for_update(job_id=job_id, conn=conn)
        if job.cancel_requested_at is not None or job.internal_status in _TERMINAL_INTERNAL_STATUSES:
            return job, False
        await self.repository.update_job_fields(
            job=job,
            fields={
                "cancel_requested_at": requested_at,
                "cancel_requested_by_user_id": requested_by_user_id,
                "cancel_reason": reason,
            },
            conn=conn,
        )
        if job.internal_status == JobInternalStatus.WAITING_FOR_USER:
            await self.repository.update_job_fields(
                job=job,
                fields={
                    "internal_status": JobInternalStatus.CANCELLED,
                    "completed_at": requested_at,
                    "cancellation_acknowledged_at": requested_at,
                    "continuation_reference": None,
                },
                conn=conn,
            )
        return job, True

    async def publish_cancellation_requested_after_commit(
        self,
        *,
        job: BackgroundJobRecord,
        requested: bool,
    ) -> None:
        if not requested:
            return
        await self.publish_domain_event(
            name="job.cancellation_requested",
            payload={"job_id": str(job.id), "job_type": job.job_type},
        )

    async def resume_waiting_job_in_transaction(
        self,
        *,
        job_id: UUID,
        actor_user_id: UUID,
        resumed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> tuple[BackgroundJobRecord, JobDispatchOutboxRecord]:
        """Requeue one user-interrupted Job inside the matching Run-resume transaction."""

        job = await self._get_job_for_update(job_id=job_id, conn=conn)
        if job.actor_user_id != actor_user_id:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                error="BACKGROUND_JOB_NOT_FOUND",
            )
        if job.internal_status != JobInternalStatus.WAITING_FOR_USER:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_NOT_WAITING_FOR_USER"),
                error="BACKGROUND_JOB_NOT_WAITING_FOR_USER",
            )
        if job.cancel_requested_at is not None:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_CANCELLATION_REQUESTED"),
                error="BACKGROUND_JOB_CANCELLATION_REQUESTED",
            )
        definition = self._require_definition_by_identity(
            job_type=job.job_type,
            job_type_version=job.job_type_version,
        )
        dispatch_sequence = job.attempt_count + 1
        existing = await self.repository.get_job_dispatch(
            job_id=job.id,
            dispatch_sequence=dispatch_sequence,
            conn=conn,
        )
        if existing is not None:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_RESUME_DISPATCH_CONFLICT"),
                error="BACKGROUND_JOB_RESUME_DISPATCH_CONFLICT",
            )
        if job.attempt_count >= job.max_attempts:
            raise Conflict(
                message=t("errors", "BACKGROUND_JOB_NOT_CLAIMABLE"),
                error="BACKGROUND_JOB_NOT_CLAIMABLE",
            )
        await self.repository.update_job_fields(
            job=job,
            fields={
                "internal_status": JobInternalStatus.PENDING_DISPATCH,
                "phase": definition.initial_phase,
                "status_key": definition.initial_status_key,
                "progress_completed": 0,
                "progress_total": None,
                "next_attempt_at": None,
                "completed_at": None,
                "continuation_reference": None,
                "error_code": None,
                "error_message": None,
                "error_metadata": None,
            },
            conn=conn,
        )
        dispatch = await self._create_dispatch(
            job=job,
            dispatch_sequence=dispatch_sequence,
            available_at=resumed_at,
            conn=conn,
        )
        return job, dispatch

    async def publish_resumed_after_commit(self, *, job: BackgroundJobRecord) -> None:
        await self.publish_domain_event(
            name="job.resumed",
            payload={"job_id": str(job.id), "job_type": job.job_type},
            actor_user_id=job.actor_user_id,
        )

    async def _create_dispatch(
        self,
        *,
        job: BackgroundJobRecord,
        dispatch_sequence: int,
        available_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> JobDispatchOutboxRecord:
        envelope = build_job_dispatch_envelope(job=job, dispatch_sequence=dispatch_sequence)
        return await self.repository.create_dispatch(
            job=job,
            dispatch_sequence=dispatch_sequence,
            task_name=job.task_name,
            envelope=envelope,
            envelope_hash=hash_json(envelope.model_dump(mode="json", by_alias=True)),
            available_at=available_at,
            conn=conn,
        )

    async def _get_job_for_update(
        self,
        *,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobRecord:
        job = await self.repository.get_job_for_update(job_id=job_id, conn=conn)
        if job is None:
            raise NotFound(
                message=t("errors", "BACKGROUND_JOB_NOT_FOUND"),
                error="BACKGROUND_JOB_NOT_FOUND",
            )
        return job


def _idempotency_scope(command: BackgroundJobCreate) -> str:
    return ":".join((
        str(command.workspace_id or "global"),
        str(command.project_id or "none"),
        str(command.site_id or "none"),
    ))


def _idempotency_hash(*, scope_key: str, job_type: str, idempotency_key: str) -> str:
    return sha256(f"{scope_key}:{job_type}:{idempotency_key}".encode()).hexdigest()


def _request_fingerprint(command: BackgroundJobCreate) -> str:
    return hash_json({
        "jobType": command.job_type,
        "jobTypeVersion": command.job_type_version,
        "target": command.target_descriptor,
        "sourceRevision": command.source_revision,
        "inputReference": command.input_reference,
    })


def _validate_create_contract(
    *,
    command: BackgroundJobCreate,
    definition: JobTypeDefinition,
) -> BackgroundJobCreate:
    if not _create_policy_matches(command=command, definition=definition):
        logger.warning(
            "Background Job create policy does not match its registered definition",
            job_type=command.job_type,
            job_type_version=command.job_type_version,
            actual_policy=_create_policy_values(command),
            expected_policy=_definition_policy_values(definition),
        )
        raise _contract_mismatch()

    try:
        target_schema = definition.target_schema
        input_schema = definition.input_reference_schema
        if target_schema is None or input_schema is None:
            raise ValueError("Job type is missing its create schemas")
        target = target_schema.model_validate(command.target_descriptor)
        input_reference = input_schema.model_validate(command.input_reference)
        if not _target_matches_definition(command, definition, target):
            raise ValueError("Job target does not match its registered scope")
        if definition.cross_field_validator is not None:
            definition.cross_field_validator(target, input_reference)
    except ValueError as exc:
        logger.warning(
            "Background Job create references do not match their registered definition",
            job_type=command.job_type,
            job_type_version=command.job_type_version,
            target_scope=str(definition.target_scope),
            reason=str(exc),
        )
        raise _contract_mismatch() from exc

    return command.model_copy(
        update={
            "target_descriptor": _dump_contract_reference(target),
            "input_reference": _dump_contract_reference(input_reference),
        }
    )


def _create_policy_matches(*, command: BackgroundJobCreate, definition: JobTypeDefinition) -> bool:
    return _create_policy_values(command) == _definition_policy_values(definition)


def _definition_policy_values(definition: JobTypeDefinition) -> tuple[object, ...]:
    return (
        definition.task_name,
        definition.workload_class,
        definition.authority_mode,
        definition.retry_class,
        definition.max_attempts,
        definition.timeout_seconds,
        definition.lease_seconds,
        definition.heartbeat_seconds,
    )


def _create_policy_values(command: BackgroundJobCreate) -> tuple[object, ...]:
    return (
        command.task_name,
        command.workload_class,
        command.authority_mode,
        command.retry_class,
        command.max_attempts,
        command.timeout_seconds,
        command.lease_seconds,
        command.heartbeat_seconds,
    )


def _target_matches_definition(
    command: BackgroundJobCreate,
    definition: JobTypeDefinition,
    target: BaseSchema,
) -> bool:
    ids = (command.workspace_id, command.project_id, command.site_id)
    if definition.target_scope == JobTargetScope.SYSTEM:
        target_matches = ids == (None, None, None)
    elif definition.target_scope == JobTargetScope.WORKSPACE:
        target_matches = command.workspace_id is not None and ids[1:] == (None, None)
    elif definition.target_scope == JobTargetScope.PROJECT:
        target_matches = command.workspace_id is not None and command.project_id is not None and command.site_id is None
    else:
        target_matches = all(value is not None for value in ids)
    if str(definition.authority_mode) == "actor_revalidated" and command.actor_user_id is None:
        return False
    return target_matches and _typed_target_ids_match(command=command, definition=definition, target=target)


def _typed_target_ids_match(
    *,
    command: BackgroundJobCreate,
    definition: JobTypeDefinition,
    target: BaseSchema,
) -> bool:
    expected_ids = {
        "workspace_id": command.workspace_id,
        "project_id": command.project_id,
        "site_id": command.site_id,
    }
    target_fields = type(target).model_fields
    if not required_target_id_fields(definition.target_scope).issubset(target_fields):
        return False
    for field_name in target_fields.keys() & expected_ids.keys():
        if getattr(target, field_name) != expected_ids[field_name]:
            return False
    return True


def _dump_contract_reference(contract: BaseSchema) -> JsonObject:
    return cast(JsonObject, contract.model_dump(mode="json", by_alias=True))


def _contract_mismatch() -> Conflict:
    return Conflict(
        message=t("errors", "BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH"),
        error="BACKGROUND_JOB_TYPE_CONTRACT_MISMATCH",
    )


def _validate_idempotent_replay(*, job: BackgroundJobRecord, request_fingerprint: str) -> None:
    if job.request_fingerprint != request_fingerprint:
        raise Conflict(
            message=t("errors", "BACKGROUND_JOB_IDEMPOTENCY_CONFLICT"),
            error="BACKGROUND_JOB_IDEMPOTENCY_CONFLICT",
        )


def _utc_now() -> datetime:
    return datetime.now(tz=UTC)
