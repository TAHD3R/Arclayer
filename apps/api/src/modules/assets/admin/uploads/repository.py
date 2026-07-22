from __future__ import annotations

import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Self, cast
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.queryset import QuerySet

from src.common.protocols.tortoise import UploadPartMutableFields
from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.assets.asset import AssetRecord
from src.models.assets.asset_folder import AssetFolderRecord
from src.models.assets.upload import UploadPartRecord, UploadSessionRecord, UploadStatus
from src.modules.assets.scope import AssetScope, AssetScopeDatabaseRouter, scope_filter_kwargs
from src.modules.tenancy.schema import TenantContext

_FRESH_COMPLETION_STATUSES = (UploadStatus.INITIATED, UploadStatus.UPLOADING)
_ACTIVE_COMPLETION_STATUSES = (UploadStatus.COMPLETING, UploadStatus.STORAGE_FINALIZED)
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_FINALIZED_STORAGE_BUCKET_MAX_LENGTH = 255


class UploadCompletionInvariantError(RuntimeError):
    """The persisted upload state does not satisfy a fenced transition."""


class UploadCompletionLease(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(
        extra="forbid",
        frozen=True,
        use_enum_values=False,
    )

    claim_token: UUID
    generation: int = Field(..., ge=1)
    status: UploadStatus
    heartbeat_at: datetime
    lease_until: datetime

    @model_validator(mode="after")
    def validate_lease_window(self) -> Self:
        if self.heartbeat_at.utcoffset() is None or self.lease_until.utcoffset() is None:
            raise ValueError("completion lease timestamps must be timezone-aware")
        if self.lease_until <= self.heartbeat_at:
            raise ValueError("completion lease must end after its heartbeat")
        return self


def _upload_status(session: UploadSessionRecord) -> UploadStatus:
    try:
        return UploadStatus(session.status)
    except ValueError as exc:
        raise UploadCompletionInvariantError(f"upload {session.id} has unknown status {session.status!r}") from exc


def _require_status(
    session: UploadSessionRecord,
    *,
    operation: str,
    allowed_statuses: tuple[UploadStatus, ...],
) -> UploadStatus:
    status = _upload_status(session)
    if status not in allowed_statuses:
        allowed = ",".join(item.name for item in allowed_statuses)
        raise UploadCompletionInvariantError(f"{operation} requires status in [{allowed}]; current={status.name}")
    return status


def _require_unclaimed_unfinalized(
    session: UploadSessionRecord,
    *,
    operation: str,
) -> None:
    if session.asset_id is not None:
        raise UploadCompletionInvariantError(f"{operation} requires an upload without a committed asset")
    if int(session.completion_generation) < 0:
        raise UploadCompletionInvariantError(f"{operation} found a negative completion generation")
    active_claim = (
        session.completion_claim_token,
        session.completion_heartbeat_at,
        session.completion_lease_until,
    )
    if any(value is not None for value in active_claim):
        raise UploadCompletionInvariantError(f"{operation} requires all active completion claim fields to be null")
    finalized_evidence = (
        session.storage_finalized_at,
        session.storage_checksum_sha256,
        session.finalized_storage_bucket,
    )
    if any(value is not None for value in finalized_evidence):
        raise UploadCompletionInvariantError(f"{operation} must not consume persisted storage-finalized evidence")


def _require_active_completion_structure(
    session: UploadSessionRecord,
    *,
    operation: str,
) -> None:
    status = _upload_status(session)
    if status not in _ACTIVE_COMPLETION_STATUSES:
        raise UploadCompletionInvariantError(f"{operation} requires an active completion status; current={status.name}")
    if session.asset_id is not None:
        raise UploadCompletionInvariantError(f"{operation} found an active completion with a committed asset")
    if not isinstance(session.completion_claim_token, UUID):
        raise UploadCompletionInvariantError(f"{operation} requires an active UUID completion claim token")
    _require_positive_generation(int(session.completion_generation), operation=operation)
    _require_aware_datetime(
        session.completion_heartbeat_at,
        label="completion heartbeat",
        operation=operation,
    )
    _require_aware_datetime(
        session.completion_lease_until,
        label="completion lease",
        operation=operation,
    )
    if status == UploadStatus.COMPLETING:
        evidence = (
            session.storage_finalized_at,
            session.storage_checksum_sha256,
            session.finalized_storage_bucket,
        )
        if any(value is not None for value in evidence):
            raise UploadCompletionInvariantError(f"{operation} found storage evidence before STORAGE_FINALIZED")
        return
    _require_finalized_evidence(session, operation=operation)


def _require_owned_active_claim(
    session: UploadSessionRecord,
    *,
    operation: str,
    allowed_statuses: tuple[UploadStatus, ...],
    claim_token: UUID,
    generation: int,
    database_time: datetime,
) -> UploadStatus:
    status = _require_status(
        session,
        operation=operation,
        allowed_statuses=allowed_statuses,
    )
    if session.completion_claim_token != claim_token or int(session.completion_generation) != generation:
        raise UploadCompletionInvariantError(f"{operation} claim fence mismatch for upload {session.id}")
    _require_active_completion_structure(session, operation=operation)
    lease_until = cast(datetime, session.completion_lease_until)
    if lease_until <= database_time:
        raise UploadCompletionInvariantError(f"{operation} completion claim lease expired at database time")
    return status


def _completion_lease(
    session: UploadSessionRecord,
    *,
    operation: str,
) -> UploadCompletionLease:
    _require_active_completion_structure(session, operation=operation)
    return UploadCompletionLease(
        claim_token=cast(UUID, session.completion_claim_token),
        generation=int(session.completion_generation),
        status=_upload_status(session),
        heartbeat_at=cast(datetime, session.completion_heartbeat_at),
        lease_until=cast(datetime, session.completion_lease_until),
    )


def _require_storage_identity(
    session: UploadSessionRecord,
    *,
    asset_id: UUID,
    object_key: str,
) -> None:
    if session.reserved_asset_id != asset_id:
        raise UploadCompletionInvariantError("storage-finalized asset does not match the reserved upload asset")
    if not object_key or session.object_key != object_key:
        raise UploadCompletionInvariantError("storage-finalized object key does not match the upload session")


def _require_storage_evidence_for_provider(
    session: UploadSessionRecord,
    *,
    checksum: str | None,
    bucket: str | None,
) -> None:
    if str(session.storage_provider) == "local":
        if checksum is None:
            raise UploadCompletionInvariantError("local storage finalization requires a canonical SHA-256 checksum")
        return
    if bucket is None:
        raise UploadCompletionInvariantError("remote storage finalization requires the finalized storage bucket")


def _require_finalized_evidence(
    session: UploadSessionRecord,
    *,
    operation: str,
) -> None:
    if session.reserved_asset_id is None or not str(session.object_key or ""):
        raise UploadCompletionInvariantError(f"{operation} requires reserved asset and object-key evidence")
    _require_aware_datetime(
        session.storage_finalized_at,
        label="storage finalized timestamp",
        operation=operation,
    )
    checksum = _validate_storage_checksum(session.storage_checksum_sha256)
    bucket = _validate_storage_bucket(session.finalized_storage_bucket)
    _require_storage_evidence_for_provider(session, checksum=checksum, bucket=bucket)


def _validate_storage_checksum(value: str | None) -> str | None:
    if value is None:
        return None
    if _SHA256_PATTERN.fullmatch(value) is None:
        raise UploadCompletionInvariantError("storage checksum must be canonical lowercase 64-character SHA-256 hex")
    return value


def _validate_storage_bucket(value: str | None) -> str | None:
    if value is None:
        return None
    if not value or value != value.strip() or len(value) > _FINALIZED_STORAGE_BUCKET_MAX_LENGTH:
        raise UploadCompletionInvariantError(
            "finalized storage bucket must be non-empty, trimmed, and at most 255 characters"
        )
    return value


def _require_nonnegative_generation(value: int, *, operation: str) -> None:
    if value < 0:
        raise UploadCompletionInvariantError(f"{operation} expected generation must be non-negative")


def _require_positive_generation(value: int, *, operation: str) -> None:
    if value <= 0:
        raise UploadCompletionInvariantError(f"{operation} completion generation must be positive")


def _require_positive_lease_duration(value: timedelta) -> None:
    if value.total_seconds() <= 0:
        raise UploadCompletionInvariantError("completion lease duration must be positive")


def _require_aware_datetime(
    value: datetime | None,
    *,
    label: str,
    operation: str,
) -> None:
    if not isinstance(value, datetime) or value.utcoffset() is None:
        raise UploadCompletionInvariantError(f"{operation} requires a timezone-aware {label}")


class UploadsRepository(TortoiseORMRepository):
    def __init__(self, tenant_context: TenantContext | None = None) -> None:
        super().__init__()
        self.scope_db = AssetScopeDatabaseRouter(tenant_context)

    @asynccontextmanager
    async def connection(
        self,
        *,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> AsyncIterator[BaseDBAsyncClient | None]:
        async with self.scope_db.connection(scope=scope, conn=conn) as scoped_conn:
            yield scoped_conn

    async def create_session(
        self,
        *,
        scope: AssetScope,
        actor_user_id: UUID,
        purpose: str,
        filename: str,
        mime: str | None,
        size_bytes: int,
        expected_sha256: str | None,
        chunk_size: int,
        total_parts: int,
        expires_at: datetime,
        target_folder_id: UUID | None,
        storage_provider: str,
        storage_profile_key: str | None,
        visibility: str,
        indexable: bool,
        reserved_asset_id: UUID | None,
        resolved_slug: str | None,
        resolved_ext: str | None,
        object_key: str | None,
        multipart_upload_id: str | None,
        s3_bucket: str | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> UploadSessionRecord:
        return await UploadSessionRecord.create(
            actor_user_id=actor_user_id,
            purpose=purpose,
            filename=filename,
            mime=mime,
            size_bytes=size_bytes,
            expected_sha256=expected_sha256,
            chunk_size=chunk_size,
            total_parts=total_parts,
            status=UploadStatus.INITIATED,
            expires_at=expires_at,
            target_folder_id=target_folder_id,
            storage_provider=storage_provider,
            storage_profile_key=storage_profile_key,
            visibility=visibility,
            indexable=indexable,
            reserved_asset_id=reserved_asset_id,
            resolved_slug=resolved_slug,
            resolved_ext=resolved_ext,
            object_key=object_key,
            multipart_upload_id=multipart_upload_id,
            s3_bucket=s3_bucket,
            **scope_filter_kwargs(scope),
            **self._using_db_kwargs(conn),
        )

    async def get_session(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> UploadSessionRecord | None:
        return await UploadSessionRecord.get_or_none(
            id=upload_id, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn)
        )

    async def get_session_for_update(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord | None:
        return await (
            UploadSessionRecord
            .filter(id=upload_id, **scope_filter_kwargs(scope))
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_database_time(self, *, conn: BaseDBAsyncClient) -> datetime:
        rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
        if len(rows) != 1:
            raise UploadCompletionInvariantError(f"expected one PostgreSQL clock row, received {len(rows)}")
        database_time = rows[0].get("database_time")
        if not isinstance(database_time, datetime) or database_time.utcoffset() is None:
            raise UploadCompletionInvariantError("PostgreSQL clock_timestamp() must return a timezone-aware datetime")
        return database_time

    def query_parts(self, *, session_id: UUID, conn: BaseDBAsyncClient | None = None) -> QuerySet[UploadPartRecord]:
        return self.using_db(UploadPartRecord.filter(session_id=session_id), conn)

    async def upsert_part(
        self,
        *,
        session_id: UUID,
        part_number: int,
        object_key: str,
        size_bytes: int,
        checksum_sha256: str | None = None,
        etag: str | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> UploadPartRecord:
        part = await UploadPartRecord.get_or_none(
            session_id=session_id,
            part_number=part_number,
            **self._using_db_kwargs(conn),
        )
        if part is None:
            return await UploadPartRecord.create(
                session_id=session_id,
                part_number=part_number,
                object_key=object_key,
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                etag=etag,
                stored=True,
                **self._using_db_kwargs(conn),
            )
        part_like = cast(UploadPartMutableFields, part)
        part.object_key = object_key
        part.size_bytes = size_bytes
        part_like.checksum_sha256 = checksum_sha256
        part_like.etag = etag
        part.stored = True
        await part.save(
            update_fields=["object_key", "size_bytes", "checksum_sha256", "etag", "stored", "updated_at"],
            **self._using_db_kwargs(conn),
        )
        return part

    async def mark_uploading(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        return await self._transition_unclaimed_status(
            upload_id=upload_id,
            scope=scope,
            operation="mark uploading",
            allowed_statuses=_FRESH_COMPLETION_STATUSES,
            target_status=UploadStatus.UPLOADING,
            require_expired=False,
            conn=conn,
        )

    async def mark_expired(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        return await self._transition_unclaimed_status(
            upload_id=upload_id,
            scope=scope,
            operation="mark expired",
            allowed_statuses=_FRESH_COMPLETION_STATUSES,
            target_status=UploadStatus.EXPIRED,
            require_expired=True,
            conn=conn,
        )

    async def mark_aborted(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        return await self._transition_unclaimed_status(
            upload_id=upload_id,
            scope=scope,
            operation="mark aborted",
            allowed_statuses=_FRESH_COMPLETION_STATUSES,
            target_status=UploadStatus.ABORTED,
            require_expired=False,
            conn=conn,
        )

    async def try_claim_completion(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        expected_generation: int,
        new_claim_token: UUID,
        lease_duration: timedelta,
        conn: BaseDBAsyncClient,
    ) -> UploadCompletionLease | None:
        _require_nonnegative_generation(expected_generation, operation="fresh claim")
        _require_positive_lease_duration(lease_duration)
        session = await self.get_session_for_update(upload_id=upload_id, scope=scope, conn=conn)
        if session is None:
            return None
        status = _upload_status(session)
        if status not in _FRESH_COMPLETION_STATUSES or int(session.completion_generation) != expected_generation:
            return None
        _require_unclaimed_unfinalized(session, operation="fresh claim")
        database_time = await self.get_database_time(conn=conn)
        if database_time > session.expires_at:
            raise UploadCompletionInvariantError(
                f"fresh claim rejected because upload {session.id} expired at database time"
            )
        claimed = await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="fresh claim",
            expected_status=status,
            expected_claim_token=None,
            expected_generation=expected_generation,
            update_fields={
                "status": UploadStatus.COMPLETING,
                "completion_claim_token": new_claim_token,
                "completion_generation": expected_generation + 1,
                "completion_heartbeat_at": database_time,
                "completion_lease_until": database_time + lease_duration,
            },
            database_time=database_time,
            conn=conn,
        )
        return _completion_lease(claimed, operation="fresh claim")

    async def try_reclaim_completion(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        expected_claim_token: UUID,
        expected_generation: int,
        new_claim_token: UUID,
        lease_duration: timedelta,
        conn: BaseDBAsyncClient,
    ) -> UploadCompletionLease | None:
        _require_positive_generation(expected_generation, operation="reclaim")
        _require_positive_lease_duration(lease_duration)
        if new_claim_token == expected_claim_token:
            raise UploadCompletionInvariantError("reclaim must rotate the completion claim token")
        session = await self.get_session_for_update(upload_id=upload_id, scope=scope, conn=conn)
        if session is None:
            return None
        status = _upload_status(session)
        if (
            status not in _ACTIVE_COMPLETION_STATUSES
            or session.completion_claim_token != expected_claim_token
            or int(session.completion_generation) != expected_generation
        ):
            return None
        _require_active_completion_structure(session, operation="reclaim")
        database_time = await self.get_database_time(conn=conn)
        if cast(datetime, session.completion_lease_until) > database_time:
            return None
        reclaimed = await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="reclaim",
            expected_status=status,
            expected_claim_token=expected_claim_token,
            expected_generation=expected_generation,
            update_fields={
                "completion_claim_token": new_claim_token,
                "completion_generation": expected_generation + 1,
                "completion_heartbeat_at": database_time,
                "completion_lease_until": database_time + lease_duration,
            },
            database_time=database_time,
            conn=conn,
        )
        return _completion_lease(reclaimed, operation="reclaim")

    async def heartbeat_completion(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        claim_token: UUID,
        generation: int,
        lease_duration: timedelta,
        conn: BaseDBAsyncClient,
    ) -> UploadCompletionLease:
        _require_positive_generation(generation, operation="heartbeat")
        _require_positive_lease_duration(lease_duration)
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation="heartbeat",
            conn=conn,
        )
        database_time = await self.get_database_time(conn=conn)
        status = _require_owned_active_claim(
            session,
            operation="heartbeat",
            allowed_statuses=_ACTIVE_COMPLETION_STATUSES,
            claim_token=claim_token,
            generation=generation,
            database_time=database_time,
        )
        heartbeat = await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="heartbeat",
            expected_status=status,
            expected_claim_token=claim_token,
            expected_generation=generation,
            update_fields={
                "completion_heartbeat_at": database_time,
                "completion_lease_until": database_time + lease_duration,
            },
            database_time=database_time,
            conn=conn,
        )
        return _completion_lease(heartbeat, operation="heartbeat")

    async def mark_storage_finalized(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        claim_token: UUID,
        generation: int,
        asset_id: UUID,
        object_key: str,
        storage_checksum_sha256: str | None,
        storage_bucket: str | None,
        lease_duration: timedelta,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        _require_positive_generation(generation, operation="mark storage finalized")
        _require_positive_lease_duration(lease_duration)
        checksum = _validate_storage_checksum(storage_checksum_sha256)
        bucket = _validate_storage_bucket(storage_bucket)
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation="mark storage finalized",
            conn=conn,
        )
        database_time = await self.get_database_time(conn=conn)
        status = _require_owned_active_claim(
            session,
            operation="mark storage finalized",
            allowed_statuses=(UploadStatus.COMPLETING,),
            claim_token=claim_token,
            generation=generation,
            database_time=database_time,
        )
        _require_storage_identity(session, asset_id=asset_id, object_key=object_key)
        _require_storage_evidence_for_provider(session, checksum=checksum, bucket=bucket)
        finalized = await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="mark storage finalized",
            expected_status=status,
            expected_claim_token=claim_token,
            expected_generation=generation,
            update_fields={
                "status": UploadStatus.STORAGE_FINALIZED,
                "storage_finalized_at": database_time,
                "storage_checksum_sha256": checksum,
                "finalized_storage_bucket": bucket,
                "completion_heartbeat_at": database_time,
                "completion_lease_until": database_time + lease_duration,
            },
            database_time=database_time,
            conn=conn,
        )
        _require_finalized_evidence(finalized, operation="mark storage finalized")
        return finalized

    async def relinquish_storage_finalized_completion(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        claim_token: UUID,
        generation: int,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        operation = "relinquish storage-finalized completion"
        _require_positive_generation(generation, operation=operation)
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation=operation,
            conn=conn,
        )
        database_time = await self.get_database_time(conn=conn)
        status = _require_owned_active_claim(
            session,
            operation=operation,
            allowed_statuses=(UploadStatus.STORAGE_FINALIZED,),
            claim_token=claim_token,
            generation=generation,
            database_time=database_time,
        )
        return await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation=operation,
            expected_status=status,
            expected_claim_token=claim_token,
            expected_generation=generation,
            update_fields={"completion_lease_until": database_time},
            database_time=database_time,
            conn=conn,
        )

    async def release_uncommitted_completion(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        claim_token: UUID,
        generation: int,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        _require_positive_generation(generation, operation="release")
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation="release",
            conn=conn,
        )
        database_time = await self.get_database_time(conn=conn)
        status = _require_owned_active_claim(
            session,
            operation="release",
            allowed_statuses=(UploadStatus.COMPLETING,),
            claim_token=claim_token,
            generation=generation,
            database_time=database_time,
        )
        return await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="release",
            expected_status=status,
            expected_claim_token=claim_token,
            expected_generation=generation,
            update_fields={
                "status": UploadStatus.UPLOADING,
                "completion_claim_token": None,
                "completion_heartbeat_at": None,
                "completion_lease_until": None,
            },
            database_time=database_time,
            conn=conn,
        )

    async def mark_completed(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        claim_token: UUID,
        generation: int,
        asset_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        _require_positive_generation(generation, operation="mark completed")
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation="mark completed",
            conn=conn,
        )
        database_time = await self.get_database_time(conn=conn)
        status = _require_owned_active_claim(
            session,
            operation="mark completed",
            allowed_statuses=(UploadStatus.STORAGE_FINALIZED,),
            claim_token=claim_token,
            generation=generation,
            database_time=database_time,
        )
        _require_finalized_evidence(session, operation="mark completed")
        if session.reserved_asset_id != asset_id:
            raise UploadCompletionInvariantError("mark completed asset does not match the reserved upload asset")
        return await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation="mark completed",
            expected_status=status,
            expected_claim_token=claim_token,
            expected_generation=generation,
            update_fields={
                "status": UploadStatus.COMPLETED,
                "asset_id": asset_id,
                "completion_claim_token": None,
                "completion_heartbeat_at": None,
                "completion_lease_until": None,
            },
            database_time=database_time,
            conn=conn,
        )

    async def _transition_unclaimed_status(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        operation: str,
        allowed_statuses: tuple[UploadStatus, ...],
        target_status: UploadStatus,
        require_expired: bool,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        session = await self._require_session_for_update(
            upload_id=upload_id,
            scope=scope,
            operation=operation,
            conn=conn,
        )
        status = _require_status(session, operation=operation, allowed_statuses=allowed_statuses)
        _require_unclaimed_unfinalized(session, operation=operation)
        database_time = await self.get_database_time(conn=conn)
        if require_expired and database_time <= session.expires_at:
            raise UploadCompletionInvariantError(
                f"{operation} rejected because upload {session.id} has not expired at database time"
            )
        return await self._apply_fenced_transition(
            session=session,
            scope=scope,
            operation=operation,
            expected_status=status,
            expected_claim_token=None,
            expected_generation=int(session.completion_generation),
            update_fields={"status": target_status},
            database_time=database_time,
            conn=conn,
        )

    async def _require_session_for_update(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        operation: str,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        session = await self.get_session_for_update(upload_id=upload_id, scope=scope, conn=conn)
        if session is None:
            raise UploadCompletionInvariantError(f"{operation} requires an existing upload session {upload_id}")
        return session

    async def _apply_fenced_transition(
        self,
        *,
        session: UploadSessionRecord,
        scope: AssetScope,
        operation: str,
        expected_status: UploadStatus,
        expected_claim_token: UUID | None,
        expected_generation: int,
        update_fields: dict[str, object],
        database_time: datetime,
        conn: BaseDBAsyncClient,
    ) -> UploadSessionRecord:
        updated = await (
            UploadSessionRecord
            .filter(
                id=session.id,
                asset_id=None,
                status=expected_status,
                completion_claim_token=expected_claim_token,
                completion_generation=expected_generation,
                **scope_filter_kwargs(scope),
            )
            .using_db(conn)
            .update(**update_fields, updated_at=database_time)
        )
        if int(updated) != 1:
            raise UploadCompletionInvariantError(
                f"{operation} fenced transition updated {updated} upload sessions; expected exactly one"
            )
        refreshed = await self.get_session_for_update(upload_id=session.id, scope=scope, conn=conn)
        if refreshed is None:
            raise UploadCompletionInvariantError(
                f"{operation} lost upload session {session.id} after a successful transition"
            )
        return refreshed

    async def folder_exists(
        self,
        *,
        scope: AssetScope,
        folder_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        return await self.using_db(AssetFolderRecord.filter(id=folder_id, **scope_filter_kwargs(scope)), conn).exists()

    async def get_asset(
        self,
        *,
        scope: AssetScope,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetRecord | None:
        return await AssetRecord.get_or_none(id=asset_id, **scope_filter_kwargs(scope), **self._using_db_kwargs(conn))

    async def create_asset(
        self,
        *,
        scope: AssetScope,
        id: UUID,
        owner_user_id: UUID | None,
        folder_id: UUID | None,
        purpose: object,
        visibility: object,
        indexable: bool,
        title: str | None,
        slug: str | None,
        original_filename: str | None,
        mime: str | None,
        ext: str | None,
        size_bytes: int,
        checksum_sha256: str | None,
        storage_provider: str,
        storage_profile_key: str | None,
        object_key: str,
        variants: object | None = None,
        meta: object | None = None,
        deleted_at: datetime | None = None,
        storage_bucket: str | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> AssetRecord:
        scope_kwargs = scope_filter_kwargs(scope)
        workspace_id = scope_kwargs.get("workspace_id")
        project_id = scope_kwargs.get("project_id")
        organization_id = scope_kwargs.get("organization_id")
        user_id = scope_kwargs.get("user_id")
        if conn is None:
            return await AssetRecord.create(
                id=id,
                owner_user_id=owner_user_id,
                folder_id=folder_id,
                purpose=purpose,
                visibility=visibility,
                indexable=indexable,
                title=title,
                slug=slug,
                original_filename=original_filename,
                mime=mime,
                ext=ext,
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                storage_provider=storage_provider,
                storage_profile_key=storage_profile_key,
                storage_bucket=storage_bucket,
                object_key=object_key,
                variants=variants,
                meta=meta,
                deleted_at=deleted_at,
                workspace_id=workspace_id,
                project_id=project_id,
                organization_id=organization_id,
                user_id=user_id,
            )
        return await AssetRecord.create(
            using_db=conn,
            id=id,
            owner_user_id=owner_user_id,
            folder_id=folder_id,
            purpose=purpose,
            visibility=visibility,
            indexable=indexable,
            title=title,
            slug=slug,
            original_filename=original_filename,
            mime=mime,
            ext=ext,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            storage_provider=storage_provider,
            storage_profile_key=storage_profile_key,
            storage_bucket=storage_bucket,
            object_key=object_key,
            variants=variants,
            meta=meta,
            deleted_at=deleted_at,
            workspace_id=workspace_id,
            project_id=project_id,
            organization_id=organization_id,
            user_id=user_id,
        )
