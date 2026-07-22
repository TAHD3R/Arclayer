from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable
from datetime import timedelta
from pathlib import Path
from typing import Protocol, TypeVar, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.i18n import t
from src.core.services import BaseService
from src.models.assets.upload import UploadStatus
from src.modules.assets.admin.uploads.completion_schema import (
    _UploadCompletionClaim,
    _UploadStorageOutcome,
)
from src.modules.assets.admin.uploads.repository import (
    UploadCompletionInvariantError,
    UploadsRepository,
)
from src.modules.assets.scope import AssetScope
from src.platform.storage.errors import StorageObjectNotFoundError
from src.platform.storage.local import safe_object_key_to_path
from src.platform.storage.merge import (
    StagedPartChecksumMismatchError,
    promote_staged_file,
    stage_parts_to_file,
)
from src.platform.storage.profiles import is_local_storage_provider
from src.platform.storage.providers.base import ObjectHead
from src.platform.storage.s3 import S3StorageProvider

_T = TypeVar("_T")
_FILE_HASH_CHUNK_SIZE = 1024 * 1024


class RemoteStorageProviderBuilder(Protocol):
    async def __call__(
        self,
        *,
        profile_key: str,
        scope: AssetScope,
        action: str,
        upload_id: UUID | None = None,
        part_number: int | None = None,
    ) -> S3StorageProvider: ...


class UploadCompletionPreEffectFailure(Exception):
    """A completion failure proven to have happened before canonical storage mutation."""

    def __init__(self, error: Exception) -> None:
        super().__init__(str(error))
        self.error = error


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def _file_sha256_and_size(path: Path) -> tuple[str, int]:
    hasher = hashlib.sha256()
    size_bytes = 0
    with path.open("rb") as source:
        while chunk := source.read(_FILE_HASH_CHUNK_SIZE):
            hasher.update(chunk)
            size_bytes += len(chunk)
    return hasher.hexdigest(), size_bytes


class UploadCompletionStorageFinalizer(BaseService):
    """Finalizes canonical storage under an upload claim's database fence."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: UploadsRepository,
        remote_provider_builder: RemoteStorageProviderBuilder,
    ) -> None:
        super().__init__(settings, event_publisher=None)
        self._repo = repository
        self._remote_provider_builder = remote_provider_builder
        self._lease_duration = timedelta(seconds=settings.storage.upload_completion_lease_seconds)
        self._heartbeat_interval = float(settings.storage.upload_completion_heartbeat_seconds)

    async def finalize(self, *, claim: _UploadCompletionClaim) -> _UploadStorageOutcome:
        if claim.status == UploadStatus.STORAGE_FINALIZED:
            return self._persisted_storage_outcome(claim)
        if is_local_storage_provider(claim.session.storage_provider):
            return await self._finalize_local(claim)
        return await self._finalize_remote(claim)

    def _persisted_storage_outcome(self, claim: _UploadCompletionClaim) -> _UploadStorageOutcome:
        part_paths: tuple[Path, ...] = ()
        if is_local_storage_provider(claim.session.storage_provider):
            part_paths = self._local_part_paths(claim)
        return _UploadStorageOutcome(
            asset_id=claim.session.reserved_asset_id,
            object_key=claim.session.object_key,
            checksum_sha256=claim.storage_checksum_sha256,
            storage_bucket=claim.finalized_storage_bucket,
            cleanup_part_paths=part_paths,
        )

    async def _finalize_local(self, claim: _UploadCompletionClaim) -> _UploadStorageOutcome:
        outcome = _UploadStorageOutcome(
            asset_id=claim.session.reserved_asset_id,
            object_key=claim.session.object_key,
            checksum_sha256=None,
            storage_bucket=None,
            cleanup_part_paths=self._local_part_paths(claim),
        )
        canonical_path = safe_object_key_to_path(
            self.settings.storage.local_root_dir,
            claim.session.object_key,
        )
        if await asyncio.to_thread(canonical_path.exists):
            if not await asyncio.to_thread(canonical_path.is_file):
                raise UploadCompletionInvariantError("canonical upload path exists but is not a regular file")
            digest, size_bytes = await self._run_with_heartbeats(
                claim,
                asyncio.to_thread(_file_sha256_and_size, canonical_path),
            )
            self._validate_storage_bytes(claim, digest=digest, size_bytes=size_bytes)
            finalized = outcome.model_copy(update={"checksum_sha256": digest})
            await self._record_storage_finalized(claim, finalized)
            return finalized

        staging_path = canonical_path.with_name(
            f".{canonical_path.name}.upload-{claim.session.id}.g{claim.generation}.{claim.claim_token}.stage"
        )
        try:
            staged = await self._run_with_heartbeats(
                claim,
                asyncio.to_thread(
                    stage_parts_to_file,
                    part_paths=outcome.cleanup_part_paths,
                    staging_path=staging_path,
                    expected_part_checksums=self._local_part_checksums(claim),
                ),
            )
        except FileExistsError as exc:
            raise UploadCompletionInvariantError("claim-scoped upload staging path already exists") from exc
        except StagedPartChecksumMismatchError as exc:
            failure = BadRequest(
                message=_ts("UPLOAD_SHA256_MISMATCH", "文件校验失败"),
                error="UPLOAD_SHA256_MISMATCH",
                meta={"expected_sha256": exc.expected, "actual_sha256": exc.actual},
            )
            raise UploadCompletionPreEffectFailure(failure) from exc
        except OSError as exc:
            failure = BadRequest(
                message=_ts("UPLOAD_MERGE_FAILED", "合并分片失败"),
                error="UPLOAD_MERGE_FAILED",
            )
            failure.add_note(f"Local staging failed: {exc}")
            raise UploadCompletionPreEffectFailure(failure) from exc

        try:
            self._validate_storage_bytes(
                claim,
                digest=staged.checksum_sha256,
                size_bytes=staged.size_bytes,
            )
        except BadRequest as exc:
            try:
                await asyncio.to_thread(staging_path.unlink, missing_ok=True)
            except OSError as cleanup_error:
                exc.add_note(f"Invalid claim staging cleanup also failed: {cleanup_error}")
            raise UploadCompletionPreEffectFailure(exc) from exc

        finalized = outcome.model_copy(update={"checksum_sha256": staged.checksum_sha256})
        await self._promote_and_record_local(
            claim=claim,
            outcome=finalized,
            staging_path=staging_path,
            canonical_path=canonical_path,
        )
        return finalized

    async def _promote_and_record_local(
        self,
        *,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
        staging_path: Path,
        canonical_path: Path,
    ) -> None:
        async with self.tx() as tx:
            async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                db_conn = self._require_connection(conn)
                await self._heartbeat_in_transaction(claim, conn=db_conn)
                try:
                    promote_staged_file(staging_path=staging_path, out_path=canonical_path)
                except OSError as exc:
                    if canonical_path.is_file():
                        raise UploadCompletionInvariantError("local upload promotion outcome is ambiguous") from exc
                    failure = BadRequest(
                        message=_ts("UPLOAD_MERGE_FAILED", "合并分片失败"),
                        error="UPLOAD_MERGE_FAILED",
                    )
                    failure.add_note(f"Canonical promotion failed before the object appeared: {exc}")
                    raise UploadCompletionPreEffectFailure(failure) from exc
                await self._repo.mark_storage_finalized(
                    upload_id=claim.session.id,
                    scope=claim.scope,
                    claim_token=claim.claim_token,
                    generation=claim.generation,
                    asset_id=outcome.asset_id,
                    object_key=outcome.object_key,
                    storage_checksum_sha256=outcome.checksum_sha256,
                    storage_bucket=None,
                    lease_duration=self._lease_duration,
                    conn=db_conn,
                )

    async def _finalize_remote(self, claim: _UploadCompletionClaim) -> _UploadStorageOutcome:
        try:
            provider = await self._remote_provider_builder(
                profile_key=claim.session.storage_profile_key or "env-default",
                scope=claim.scope,
                upload_id=claim.session.id,
                action="complete_upload_build_storage_provider",
            )
        except Exception as exc:
            raise UploadCompletionPreEffectFailure(exc) from exc
        bucket = (claim.session.s3_bucket or "").strip()
        if not bucket or not claim.session.multipart_upload_id:
            failure = BadRequest(
                message=_ts("UPLOAD_SESSION_INVALID", "上传会话不完整"),
                error="UPLOAD_SESSION_INVALID",
            )
            raise UploadCompletionPreEffectFailure(failure)
        provider = provider.with_bucket(bucket)

        try:
            head = await self._run_with_heartbeats(
                claim,
                provider.head_object(object_key=claim.session.object_key),
            )
        except StorageObjectNotFoundError:
            head = await self._complete_and_reconcile_remote(claim, provider)
        except UploadCompletionInvariantError:
            raise
        except Exception as exc:
            raise UploadCompletionPreEffectFailure(exc) from exc

        self._validate_remote_head(claim, head)
        outcome = _UploadStorageOutcome(
            asset_id=claim.session.reserved_asset_id,
            object_key=claim.session.object_key,
            checksum_sha256=None,
            storage_bucket=bucket,
        )
        await self._record_storage_finalized(claim, outcome)
        return outcome

    async def _complete_and_reconcile_remote(
        self,
        claim: _UploadCompletionClaim,
        provider: S3StorageProvider,
    ) -> ObjectHead:
        parts = [
            {
                "ETag": part.etag if str(part.etag).startswith('"') else f'"{part.etag}"',
                "PartNumber": part.part_number,
            }
            for part in claim.parts
        ]
        completion_error: Exception | None = None
        try:
            await self._run_with_heartbeats(
                claim,
                provider.complete_multipart_upload(
                    object_key=claim.session.object_key,
                    upload_id=claim.session.multipart_upload_id or "",
                    parts=parts,
                ),
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            completion_error = exc

        try:
            return await self._run_with_heartbeats(
                claim,
                provider.head_object(object_key=claim.session.object_key),
            )
        except Exception as reconcile_error:
            if completion_error is not None:
                completion_error.add_note(f"Final object reconciliation also failed: {reconcile_error}")
                raise completion_error
            raise UploadCompletionInvariantError(
                "multipart completion returned without durable final-object evidence"
            ) from reconcile_error

    async def _record_storage_finalized(
        self,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
    ) -> None:
        async with self.tx() as tx:
            async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                db_conn = self._require_connection(conn)
                await self._heartbeat_in_transaction(claim, conn=db_conn)
                await self._repo.mark_storage_finalized(
                    upload_id=claim.session.id,
                    scope=claim.scope,
                    claim_token=claim.claim_token,
                    generation=claim.generation,
                    asset_id=outcome.asset_id,
                    object_key=outcome.object_key,
                    storage_checksum_sha256=outcome.checksum_sha256,
                    storage_bucket=outcome.storage_bucket,
                    lease_duration=self._lease_duration,
                    conn=db_conn,
                )

    async def _run_with_heartbeats(
        self,
        claim: _UploadCompletionClaim,
        operation: Awaitable[_T],
    ) -> _T:
        task = asyncio.ensure_future(operation)
        try:
            while True:
                done, _pending = await asyncio.wait({task}, timeout=self._heartbeat_interval)
                if task in done:
                    return await task
                try:
                    await self._heartbeat(claim)
                except Exception as exc:
                    raise UploadCompletionInvariantError("upload completion heartbeat failed") from exc
        except asyncio.CancelledError as cancellation:
            await self._settle_operation(
                claim=claim,
                task=task,
                primary=cancellation,
                keep_heartbeat=True,
            )
            raise
        except BaseException as error:
            await self._settle_operation(
                claim=claim,
                task=task,
                primary=error,
                keep_heartbeat=False,
            )
            raise

    async def _settle_operation(
        self,
        *,
        claim: _UploadCompletionClaim,
        task: asyncio.Task[_T],
        primary: BaseException,
        keep_heartbeat: bool,
    ) -> None:
        heartbeat_enabled = keep_heartbeat
        while not task.done():
            try:
                done, _pending = await asyncio.wait({task}, timeout=self._heartbeat_interval)
            except asyncio.CancelledError:
                primary.add_note("Upload completion received another cancellation while storage was settling")
                continue
            if task in done:
                break
            if not heartbeat_enabled:
                continue
            try:
                await self._heartbeat(claim)
            except asyncio.CancelledError:
                primary.add_note("Upload completion heartbeat was cancelled while storage was settling")
            except Exception as heartbeat_error:
                primary.add_note(
                    "Upload completion heartbeat also failed while storage was settling: "
                    f"{type(heartbeat_error).__name__}"
                )
                heartbeat_enabled = False

        try:
            operation_outcome: _T | BaseException = task.result()
        except BaseException as error:
            operation_outcome = error
        if isinstance(operation_outcome, BaseException) and operation_outcome is not primary:
            primary.add_note(
                f"Upload completion storage operation also failed while settling: {type(operation_outcome).__name__}"
            )

    async def _heartbeat(self, claim: _UploadCompletionClaim) -> None:
        async with self.tx() as tx:
            async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                await self._heartbeat_in_transaction(claim, conn=self._require_connection(conn))

    async def _heartbeat_in_transaction(
        self,
        claim: _UploadCompletionClaim,
        *,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repo.heartbeat_completion(
            upload_id=claim.session.id,
            scope=claim.scope,
            claim_token=claim.claim_token,
            generation=claim.generation,
            lease_duration=self._lease_duration,
            conn=conn,
        )

    def _local_part_paths(self, claim: _UploadCompletionClaim) -> tuple[Path, ...]:
        return tuple(
            safe_object_key_to_path(self.settings.storage.local_tmp_dir, part.object_key) for part in claim.parts
        )

    @staticmethod
    def _local_part_checksums(claim: _UploadCompletionClaim) -> tuple[str, ...]:
        checksums = tuple(part.checksum_sha256 for part in claim.parts)
        if any(checksum is None for checksum in checksums):
            raise UploadCompletionInvariantError("local upload claim is missing a part checksum")
        return cast(tuple[str, ...], checksums)

    @staticmethod
    def _validate_storage_bytes(
        claim: _UploadCompletionClaim,
        *,
        digest: str,
        size_bytes: int,
    ) -> None:
        if size_bytes != claim.session.size_bytes:
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={
                    "declared_size_bytes": claim.session.size_bytes,
                    "uploaded_size_bytes": size_bytes,
                },
            )
        expected = claim.session.expected_sha256
        if expected is not None and digest != expected:
            raise BadRequest(
                message=_ts("UPLOAD_SHA256_MISMATCH", "文件校验失败"),
                error="UPLOAD_SHA256_MISMATCH",
                meta={"expected_sha256": expected, "actual_sha256": digest},
            )

    @staticmethod
    def _validate_remote_head(claim: _UploadCompletionClaim, head: ObjectHead) -> None:
        if head.size_bytes != claim.session.size_bytes:
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={
                    "declared_size_bytes": claim.session.size_bytes,
                    "uploaded_size_bytes": head.size_bytes,
                },
            )

    @staticmethod
    def _require_connection(conn: BaseDBAsyncClient | None) -> BaseDBAsyncClient:
        if conn is None:
            raise RuntimeError("upload completion requires a database transaction")
        return conn
