from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import Path
from typing import Protocol, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_PROJECT,
    ASSET_SCOPE_WORKSPACE,
    ASSET_UPLOADED_EVENT,
)
from src.common.types.json_types import JsonObject
from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, NotFound, ServiceUnavailable
from src.core.i18n import t
from src.core.logging import get_logger
from src.core.services import BaseService
from src.models.analytics.audit_event import AuditEvent
from src.models.assets.asset import AssetPurpose, AssetRecord, AssetVisibility
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.assets.admin.uploads.completion_schema import (
    _UploadCompletionClaim,
    _UploadCompletionClaimDisposition,
    _UploadCompletionClaimResult,
    _UploadCompletionCommit,
    _UploadPartSnapshot,
    _UploadSessionSnapshot,
    _UploadStorageOutcome,
)
from src.modules.assets.admin.uploads.completion_storage import (
    RemoteStorageProviderBuilder,
    UploadCompletionPreEffectFailure,
    UploadCompletionStorageFinalizer,
)
from src.modules.assets.admin.uploads.repository import (
    UploadCompletionInvariantError,
    UploadCompletionLease,
    UploadsRepository,
)
from src.modules.assets.jobs import (
    ASSET_THUMBNAIL_JOB_TYPE,
    ASSET_THUMBNAIL_JOB_TYPE_VERSION,
    ASSET_THUMBNAIL_PROFILE_VERSION,
    AssetThumbnailJobInput,
    AssetThumbnailJobTarget,
    build_asset_thumbnail_source_revision,
    is_asset_thumbnail_previewable,
    validate_asset_thumbnail_target_input,
)
from src.modules.assets.scope import AssetScope
from src.modules.jobs.registry import JobTypeDefinition, JobTypeNotRegisteredError, JobTypeRegistry
from src.modules.jobs.schema import BackgroundJobCreate, BackgroundJobCreateResult
from src.modules.tenancy.schema import TenantContext
from src.platform.storage.profiles import is_local_storage_provider

logger = get_logger(__name__)


class BackgroundJobCreator(Protocol):
    registry: JobTypeRegistry

    async def create_job_in_transaction(
        self,
        *,
        command: BackgroundJobCreate,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult: ...

    async def publish_created_after_commit(self, result: BackgroundJobCreateResult) -> None: ...


class RequiredActivityWriter(Protocol):
    async def __call__(
        self,
        *,
        settings: Settings,
        payload: ActivityAuditPayload,
        conn: BaseDBAsyncClient | None = None,
    ) -> AuditEvent: ...


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def _status(session: UploadSessionRecord) -> UploadStatus:
    try:
        return UploadStatus(session.status)
    except ValueError as exc:
        raise UploadCompletionInvariantError(
            f"upload {session.id} has unknown persisted status {session.status!r}"
        ) from exc


class UploadCompletionService(BaseService):
    """Coordinates one fenced upload completion from claim through durable commit."""

    def __init__(
        self,
        settings: Settings,
        *,
        repository: UploadsRepository,
        remote_provider_builder: RemoteStorageProviderBuilder,
        activity_writer: RequiredActivityWriter,
        tenant_context: TenantContext | None = None,
        background_jobs: BackgroundJobCreator | None = None,
    ) -> None:
        super().__init__(settings, event_publisher=None)
        self._repo = repository
        self._tenant_context = tenant_context
        self._background_jobs = background_jobs
        self._activity_writer = activity_writer
        self._lease_duration = timedelta(seconds=settings.storage.upload_completion_lease_seconds)
        self._storage = UploadCompletionStorageFinalizer(
            settings,
            repository=repository,
            remote_provider_builder=remote_provider_builder,
        )

    async def complete(self, *, upload_id: UUID, scope: AssetScope) -> UUID:
        claim_result = await self._claim(upload_id=upload_id, scope=scope)
        if claim_result.disposition == _UploadCompletionClaimDisposition.COMPLETED:
            return cast(UUID, claim_result.asset_id)
        if claim_result.disposition == _UploadCompletionClaimDisposition.BUSY:
            raise BadRequest(
                message=_ts("UPLOAD_COMPLETING", "上传正在完成中，请稍后重试"),
                error="UPLOAD_COMPLETING",
            )
        claim = cast(_UploadCompletionClaim, claim_result.claim)

        try:
            outcome = await self._storage.finalize(claim=claim)
        except UploadCompletionPreEffectFailure as failure:
            await self._release_pre_effect_claim(claim=claim, error=failure.error)
            raise failure.error
        except BaseException as exc:
            self._log_completion_failure(claim=claim, phase="storage", error=exc)
            raise

        try:
            commit = await self._persist(claim=claim, outcome=outcome)
        except asyncio.CancelledError as exc:
            self._log_completion_failure(claim=claim, phase="database", error=exc)
            raise
        except Exception as exc:
            await self._relinquish_finalized_claim(claim=claim, error=exc)
            self._log_completion_failure(claim=claim, phase="database", error=exc)
            raise

        try:
            await self._publish_thumbnail_dispatch(commit)
        finally:
            await self._cleanup_committed_local_parts(claim=claim, outcome=outcome)
        return commit.asset_id

    async def _claim(self, *, upload_id: UUID, scope: AssetScope) -> _UploadCompletionClaimResult:
        async with self.tx() as tx:
            async with self._repo.connection(scope=scope, conn=tx) as conn:
                db_conn = self._require_connection(conn)
                session = await self._repo.get_session_for_update(
                    upload_id=upload_id,
                    scope=scope,
                    conn=db_conn,
                )
                if session is None:
                    raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")
                status = _status(session)
                if status == UploadStatus.COMPLETED:
                    if session.asset_id is None:
                        raise UploadCompletionInvariantError("completed upload is missing its committed Asset identity")
                    return _UploadCompletionClaimResult(
                        disposition=_UploadCompletionClaimDisposition.COMPLETED,
                        asset_id=session.asset_id,
                    )
                if status == UploadStatus.EXPIRED:
                    raise BadRequest(message=_ts("UPLOAD_EXPIRED", "上传会话已过期"), error="UPLOAD_EXPIRED")
                if status == UploadStatus.ABORTED:
                    raise BadRequest(
                        message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"),
                        error="UPLOAD_NOT_WRITABLE",
                    )

                if status in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
                    database_time = await self._repo.get_database_time(conn=db_conn)
                    if database_time > session.expires_at:
                        await self._repo.mark_expired(upload_id=upload_id, scope=scope, conn=db_conn)
                        raise BadRequest(
                            message=_ts("UPLOAD_EXPIRED", "上传会话已过期"),
                            error="UPLOAD_EXPIRED",
                        )

                thumbnail_definition = self._thumbnail_definition(scope=scope, session=session)
                require_complete_parts = status != UploadStatus.STORAGE_FINALIZED
                parts = await self._snapshot_parts(
                    session=session,
                    conn=db_conn,
                    require_complete=require_complete_parts,
                )
                lease = await self._acquire_lease(
                    session=session,
                    status=status,
                    scope=scope,
                    conn=db_conn,
                )
                if lease is None:
                    return _UploadCompletionClaimResult(disposition=_UploadCompletionClaimDisposition.BUSY)
                claimed_session = await self._repo.get_session_for_update(
                    upload_id=upload_id,
                    scope=scope,
                    conn=db_conn,
                )
                if claimed_session is None:
                    raise UploadCompletionInvariantError("claimed upload disappeared inside its claim transaction")
                return _UploadCompletionClaimResult(
                    disposition=_UploadCompletionClaimDisposition.CLAIMED,
                    claim=self._build_claim(
                        scope=scope,
                        session=claimed_session,
                        parts=parts,
                        thumbnail_definition=thumbnail_definition,
                        lease=lease,
                    ),
                )

    async def _acquire_lease(
        self,
        *,
        session: UploadSessionRecord,
        status: UploadStatus,
        scope: AssetScope,
        conn: BaseDBAsyncClient,
    ) -> UploadCompletionLease | None:
        new_token = uuid7()
        generation = int(session.completion_generation)
        if status in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
            return await self._repo.try_claim_completion(
                upload_id=session.id,
                scope=scope,
                expected_generation=generation,
                new_claim_token=new_token,
                lease_duration=self._lease_duration,
                conn=conn,
            )
        if status not in {UploadStatus.COMPLETING, UploadStatus.STORAGE_FINALIZED}:
            raise UploadCompletionInvariantError(f"cannot acquire completion lease from status {status.value}")
        if not isinstance(session.completion_claim_token, UUID):
            raise UploadCompletionInvariantError("active upload completion is missing its UUID claim token")
        return await self._repo.try_reclaim_completion(
            upload_id=session.id,
            scope=scope,
            expected_claim_token=session.completion_claim_token,
            expected_generation=generation,
            new_claim_token=new_token,
            lease_duration=self._lease_duration,
            conn=conn,
        )

    async def _snapshot_parts(
        self,
        *,
        session: UploadSessionRecord,
        conn: BaseDBAsyncClient,
        require_complete: bool,
    ) -> tuple[_UploadPartSnapshot, ...]:
        rows = await self._repo.query_parts(session_id=session.id, conn=conn).order_by("part_number")
        parts = tuple(
            _UploadPartSnapshot(
                part_number=int(row.part_number),
                object_key=str(row.object_key),
                size_bytes=int(row.size_bytes),
                checksum_sha256=(str(row.checksum_sha256) if row.checksum_sha256 is not None else None),
                etag=str(row.etag) if row.etag is not None else None,
            )
            for row in rows
        )
        if not require_complete:
            return parts
        actual_numbers = tuple(part.part_number for part in parts)
        expected_numbers = tuple(range(1, int(session.total_parts) + 1))
        if actual_numbers != expected_numbers:
            missing = sorted(set(expected_numbers) - set(actual_numbers))
            raise BadRequest(
                message=_ts("UPLOAD_INCOMPLETE", "仍有分片未上传"),
                error="UPLOAD_INCOMPLETE",
                meta={"missing_parts": missing},
            )
        uploaded_size = sum(part.size_bytes for part in parts)
        if uploaded_size != int(session.size_bytes):
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={
                    "declared_size_bytes": int(session.size_bytes),
                    "uploaded_size_bytes": uploaded_size,
                },
            )
        if not is_local_storage_provider(str(session.storage_provider)):
            missing_etag = next((part.part_number for part in parts if not (part.etag or "").strip()), None)
            if missing_etag is not None:
                raise BadRequest(
                    message=_ts("UPLOAD_ETAG_MISSING", "存在未提交 ETag 的分片"),
                    error="UPLOAD_ETAG_MISSING",
                    meta={"part_number": missing_etag},
                )
        return parts

    @staticmethod
    def _build_claim(
        *,
        scope: AssetScope,
        session: UploadSessionRecord,
        parts: tuple[_UploadPartSnapshot, ...],
        thumbnail_definition: JobTypeDefinition | None,
        lease: UploadCompletionLease,
    ) -> _UploadCompletionClaim:
        return _UploadCompletionClaim(
            scope=scope,
            session=_UploadSessionSnapshot.from_record(session),
            parts=parts,
            thumbnail_definition=thumbnail_definition,
            claim_token=lease.claim_token,
            generation=lease.generation,
            status=lease.status,
            heartbeat_at=lease.heartbeat_at,
            lease_until=lease.lease_until,
            storage_finalized_at=session.storage_finalized_at,
            storage_checksum_sha256=session.storage_checksum_sha256,
            finalized_storage_bucket=session.finalized_storage_bucket,
        )

    async def _release_pre_effect_claim(
        self,
        *,
        claim: _UploadCompletionClaim,
        error: Exception,
    ) -> None:
        try:
            async with self.tx() as tx:
                async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                    await self._repo.release_uncommitted_completion(
                        upload_id=claim.session.id,
                        scope=claim.scope,
                        claim_token=claim.claim_token,
                        generation=claim.generation,
                        conn=self._require_connection(conn),
                    )
        except Exception as recovery_error:
            error.add_note(f"Pre-effect upload claim release also failed: {recovery_error}")

    async def _relinquish_finalized_claim(
        self,
        *,
        claim: _UploadCompletionClaim,
        error: Exception,
    ) -> None:
        try:
            async with self.tx() as tx:
                async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                    await self._repo.relinquish_storage_finalized_completion(
                        upload_id=claim.session.id,
                        scope=claim.scope,
                        claim_token=claim.claim_token,
                        generation=claim.generation,
                        conn=self._require_connection(conn),
                    )
        except Exception as recovery_error:
            error.add_note(f"Storage-finalized claim relinquish also failed: {recovery_error}")

    async def _persist(
        self,
        *,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
    ) -> _UploadCompletionCommit:
        self._validate_outcome_identity(claim, outcome)
        async with self.tx() as tx:
            async with self._repo.connection(scope=claim.scope, conn=tx) as conn:
                db_conn = self._require_connection(conn)
                session = await self._repo.get_session_for_update(
                    upload_id=claim.session.id,
                    scope=claim.scope,
                    conn=db_conn,
                )
                if session is None:
                    raise UploadCompletionInvariantError("upload disappeared before its final database commit")
                status = _status(session)
                if status == UploadStatus.COMPLETED:
                    if session.asset_id != outcome.asset_id:
                        raise UploadCompletionInvariantError("completed upload replay has a different Asset identity")
                    return _UploadCompletionCommit(asset_id=outcome.asset_id)
                await self._repo.heartbeat_completion(
                    upload_id=claim.session.id,
                    scope=claim.scope,
                    claim_token=claim.claim_token,
                    generation=claim.generation,
                    lease_duration=self._lease_duration,
                    conn=db_conn,
                )
                self._validate_persisted_storage_evidence(session, claim=claim, outcome=outcome)
                asset = await self._create_asset(claim=claim, outcome=outcome, conn=db_conn)
                await self._write_activity(claim=claim, asset_id=asset.id, conn=db_conn)
                thumbnail_job = None
                if claim.thumbnail_definition is not None:
                    thumbnail_job = await self._create_thumbnail_job(
                        definition=claim.thumbnail_definition,
                        claim=claim,
                        asset_id=asset.id,
                        conn=db_conn,
                    )
                await self._repo.mark_completed(
                    upload_id=claim.session.id,
                    scope=claim.scope,
                    claim_token=claim.claim_token,
                    generation=claim.generation,
                    asset_id=asset.id,
                    conn=db_conn,
                )
                return _UploadCompletionCommit(asset_id=asset.id, thumbnail_job_result=thumbnail_job)

    def _thumbnail_definition(
        self,
        *,
        scope: AssetScope,
        session: UploadSessionRecord,
    ) -> JobTypeDefinition | None:
        if scope.type != ASSET_SCOPE_PROJECT or not is_asset_thumbnail_previewable(
            mime=session.mime,
            ext=session.resolved_ext,
        ):
            return None
        if not self.settings.database.enabled or not self.settings.taskiq.enabled or self._background_jobs is None:
            raise ServiceUnavailable(
                message=_ts("BACKGROUND_JOBS_UNAVAILABLE", "后台任务服务暂不可用"),
                error="BACKGROUND_JOBS_UNAVAILABLE",
            )
        try:
            return self._background_jobs.registry.require(
                job_type=ASSET_THUMBNAIL_JOB_TYPE,
                job_type_version=ASSET_THUMBNAIL_JOB_TYPE_VERSION,
            )
        except JobTypeNotRegisteredError as exc:
            raise ServiceUnavailable(
                message=_ts("BACKGROUND_JOBS_UNAVAILABLE", "后台任务服务暂不可用"),
                error="BACKGROUND_JOBS_UNAVAILABLE",
            ) from exc

    async def _create_asset(
        self,
        *,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
        conn: BaseDBAsyncClient,
    ) -> AssetRecord:
        if await self._repo.get_asset(scope=claim.scope, asset_id=outcome.asset_id, conn=conn) is not None:
            raise UploadCompletionInvariantError("reserved Asset exists before UploadSession completion")
        session = claim.session
        if session.target_folder_id is not None and not await self._repo.folder_exists(
            scope=claim.scope,
            folder_id=session.target_folder_id,
            conn=conn,
        ):
            raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")
        try:
            purpose = AssetPurpose(session.purpose)
            visibility = AssetVisibility(session.visibility)
        except ValueError as exc:
            raise BadRequest(
                message=_ts("UPLOAD_SESSION_INVALID", "上传会话不完整"),
                error="UPLOAD_SESSION_INVALID",
            ) from exc
        ext = (session.resolved_ext or "").lstrip(".").lower() or (
            Path(session.filename).suffix.lstrip(".") or "bin"
        ).lower()
        slug = (session.resolved_slug or "").strip()
        if not slug:
            raise UploadCompletionInvariantError("claimed upload is missing its pre-resolved Asset slug")
        return await self._repo.create_asset(
            scope=claim.scope,
            conn=conn,
            id=outcome.asset_id,
            owner_user_id=session.actor_user_id,
            folder_id=session.target_folder_id,
            purpose=purpose,
            visibility=visibility,
            indexable=session.indexable if visibility == AssetVisibility.PUBLIC else False,
            title=None,
            slug=slug,
            original_filename=session.filename,
            mime=session.mime,
            ext=ext,
            size_bytes=session.size_bytes,
            checksum_sha256=outcome.checksum_sha256,
            storage_provider=session.storage_provider,
            storage_profile_key=session.storage_profile_key,
            storage_bucket=outcome.storage_bucket,
            object_key=outcome.object_key,
            variants=None,
            meta=None,
            deleted_at=None,
        )

    async def _write_activity(
        self,
        *,
        claim: _UploadCompletionClaim,
        asset_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        scope = claim.scope
        session = claim.session
        properties: JsonObject = {
            "scope_type": scope.type,
            "scope_id": str(scope.id),
            "asset_id": str(asset_id),
            "purpose": session.purpose,
            "storage_provider": session.storage_provider,
            "visibility": session.visibility,
            "indexable": session.indexable,
        }
        organization_id: UUID | None = None
        workspace_id: UUID | None = None
        project_id: UUID | None = None
        if scope.type == ASSET_SCOPE_WORKSPACE:
            properties["workspace_id"] = str(scope.id)
            workspace_id = scope.id
        elif scope.type == ASSET_SCOPE_PROJECT:
            tenant = self._tenant_context
            if tenant is None:
                raise UploadCompletionInvariantError("project upload completion requires TenantContext")
            properties["project_id"] = str(scope.id)
            organization_id = tenant.organization_id
            workspace_id = tenant.workspace_id
            project_id = scope.id
        elif scope.type == ASSET_SCOPE_ORGANIZATION:
            organization_id = scope.id
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=ASSET_UPLOADED_EVENT,
                actor_user_id=session.actor_user_id,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                source="core",
                entity_type="asset",
                entity_id=asset_id,
                properties=properties,
            ),
            conn=conn,
        )

    async def _create_thumbnail_job(
        self,
        *,
        definition: JobTypeDefinition,
        claim: _UploadCompletionClaim,
        asset_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> BackgroundJobCreateResult:
        background_jobs = self._background_jobs
        tenant = self._tenant_context
        if background_jobs is None or tenant is None or claim.scope.type != ASSET_SCOPE_PROJECT:
            raise UploadCompletionInvariantError("thumbnail Job creation requires project Job dependencies")
        if tenant.project_id != claim.scope.id:
            raise UploadCompletionInvariantError("thumbnail Job project does not match TenantContext")
        asset = await self._repo.get_asset(scope=claim.scope, asset_id=asset_id, conn=conn)
        if asset is None:
            raise NotFound(
                message=_ts("ASSET_THUMBNAIL_TARGET_NOT_FOUND", "缩略图目标资源不存在"),
                error="ASSET_THUMBNAIL_TARGET_NOT_FOUND",
            )
        target = AssetThumbnailJobTarget(
            workspace_id=tenant.workspace_id,
            project_id=claim.scope.id,
            entity_id=asset_id,
        )
        input_reference = AssetThumbnailJobInput(
            asset_id=asset_id,
            thumbnail_profile_version=ASSET_THUMBNAIL_PROFILE_VERSION,
        )
        validate_asset_thumbnail_target_input(target=target, input_reference=input_reference)
        source_revision = build_asset_thumbnail_source_revision(
            asset_id=asset_id,
            checksum_sha256=asset.checksum_sha256,
        )
        actor_context = self.resolve_actor_context(
            actor_user_id=claim.session.actor_user_id,
            organization_id=tenant.organization_id,
            workspace_id=tenant.workspace_id,
            project_id=claim.scope.id,
            source="asset-upload",
        )
        command = BackgroundJobCreate(
            job_type=definition.job_type,
            job_type_version=definition.job_type_version,
            task_name=definition.task_name,
            workload_class=definition.workload_class,
            authority_mode=definition.authority_mode,
            workspace_id=tenant.workspace_id,
            project_id=claim.scope.id,
            actor_user_id=claim.session.actor_user_id,
            target_descriptor=target.model_dump(mode="json", by_alias=True),
            input_reference=input_reference.model_dump(mode="json", by_alias=True),
            idempotency_key=f"asset:{asset_id}:thumbnail-profile:v{ASSET_THUMBNAIL_PROFILE_VERSION}",
            source_revision=source_revision,
            correlation_id=actor_context.trace_id or f"asset-upload:{claim.session.id}",
            trace_id=actor_context.trace_id,
            retry_class=definition.retry_class,
            max_attempts=definition.max_attempts,
            timeout_seconds=definition.timeout_seconds,
            lease_seconds=definition.lease_seconds,
            heartbeat_seconds=definition.heartbeat_seconds,
            status_key=definition.initial_status_key,
        )
        return await background_jobs.create_job_in_transaction(command=command, conn=conn)

    async def _publish_thumbnail_dispatch(self, commit: _UploadCompletionCommit) -> None:
        if commit.thumbnail_job_result is None:
            return
        background_jobs = self._background_jobs
        if background_jobs is None:
            raise UploadCompletionInvariantError("thumbnail Job creator disappeared after commit")
        await background_jobs.publish_created_after_commit(commit.thumbnail_job_result)

    async def _cleanup_committed_local_parts(
        self,
        *,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
    ) -> None:
        for part_path in outcome.cleanup_part_paths:
            try:
                await asyncio.to_thread(part_path.unlink, missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "Upload part cleanup failed after committed completion",
                    scope_type=claim.scope.type,
                    scope_id=str(claim.scope.id),
                    upload_id=str(claim.session.id),
                    asset_id=str(outcome.asset_id),
                    part_path=str(part_path),
                    action="cleanup_committed_upload_part",
                    error=str(exc),
                )

    @staticmethod
    def _validate_outcome_identity(
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
    ) -> None:
        if outcome.asset_id != claim.session.reserved_asset_id or outcome.object_key != claim.session.object_key:
            raise UploadCompletionInvariantError("storage outcome does not match the claimed upload identity")

    @staticmethod
    def _validate_persisted_storage_evidence(
        session: UploadSessionRecord,
        *,
        claim: _UploadCompletionClaim,
        outcome: _UploadStorageOutcome,
    ) -> None:
        if _status(session) != UploadStatus.STORAGE_FINALIZED:
            raise UploadCompletionInvariantError("final database commit requires STORAGE_FINALIZED")
        if (
            session.completion_claim_token != claim.claim_token
            or int(session.completion_generation) != claim.generation
        ):
            raise UploadCompletionInvariantError("final database commit lost its completion fence")
        if session.reserved_asset_id != outcome.asset_id or session.object_key != outcome.object_key:
            raise UploadCompletionInvariantError("persisted storage identity does not match the completion outcome")
        if session.storage_checksum_sha256 != outcome.checksum_sha256:
            raise UploadCompletionInvariantError("persisted storage checksum does not match the completion outcome")
        if session.finalized_storage_bucket != outcome.storage_bucket:
            raise UploadCompletionInvariantError("persisted storage bucket does not match the completion outcome")

    @staticmethod
    def _require_connection(conn: BaseDBAsyncClient | None) -> BaseDBAsyncClient:
        if conn is None:
            raise RuntimeError("upload completion requires a database transaction")
        return conn

    @staticmethod
    def _log_completion_failure(
        *,
        claim: _UploadCompletionClaim,
        phase: str,
        error: BaseException,
    ) -> None:
        logger.warning(
            "Upload completion failed without releasing canonical evidence",
            scope_type=claim.scope.type,
            scope_id=str(claim.scope.id),
            upload_id=str(claim.session.id),
            storage_provider=claim.session.storage_provider,
            phase=phase,
            action="complete_upload",
            error=str(error),
        )
