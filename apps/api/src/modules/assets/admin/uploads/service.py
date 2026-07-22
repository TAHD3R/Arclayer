from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_PROJECT,
    ASSET_SCOPE_USER,
    ASSET_SCOPE_WORKSPACE,
)
from src.common.utils.ids import uuid7
from src.common.utils.slug import slugify
from src.config import Settings
from src.core.events import events
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.logging import get_logger
from src.core.services import BaseService, DomainEventPublisher
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.analytics.audit import write_required_activity_event
from src.modules.assets.admin.uploads.completion_service import (
    BackgroundJobCreator,
    RequiredActivityWriter,
    UploadCompletionService,
)
from src.modules.assets.admin.uploads.policy.service import (
    UploadPolicy,
    build_upload_policy,
    normalize_original_filename,
    validate_sha256_hex,
    validate_upload_metadata,
)
from src.modules.assets.admin.uploads.repository import UploadsRepository
from src.modules.assets.admin.uploads.schema import UploadPartPresignOut, UploadPolicyOut
from src.modules.assets.naming.service import (
    build_scoped_asset_object_key,
    build_scoped_upload_part_object_key,
    compute_total_parts,
)
from src.modules.assets.scope import AssetScope
from src.modules.tenancy.schema import TenantContext
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.local import LocalStorageProvider, safe_object_key_to_path
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import (
    get_effective_storage_profile,
    get_storage_profile_by_key,
    is_local_storage_provider,
)
from src.platform.storage.s3 import S3StorageProvider
from src.settings.runtime import get_effective_settings

logger = get_logger(__name__)


UPLOAD_ABORT_ERRORS = (
    AttributeError,
    KeyError,
    OSError,
    RuntimeError,
    TimeoutError,
    TypeError,
    ValueError,
)


def _ts(key: str, default: str) -> str:
    return t("errors", key, default=default)


def _accept_for_policy(policy: UploadPolicy) -> str:
    ext_tokens = [f".{ext}" for ext in sorted(policy.allowed_exts)]
    mime_tokens = sorted(policy.allowed_mime_types)
    return ",".join([*ext_tokens, *mime_tokens])


def _upload_status(session: UploadSessionRecord) -> UploadStatus:
    try:
        return UploadStatus(session.status)
    except ValueError as exc:
        raise RuntimeError(f"UploadSession {session.id} has unknown status {session.status!r}") from exc


def _remove_upload_directory(upload_dir: Path) -> None:
    if not upload_dir.is_dir():
        return
    for child in upload_dir.rglob("*"):
        if child.is_file():
            child.unlink(missing_ok=True)
    for child in sorted(upload_dir.rglob("*"), reverse=True):
        if child.is_dir():
            child.rmdir()
    upload_dir.rmdir()


def normalize_visibility_and_indexable(
    *,
    purpose: str,
    requested_visibility: str | None,
    requested_indexable: bool | None,
) -> tuple[str, bool]:
    """
    Normalize visibility/indexing policy for an upload.

    Rules:
    - avatar/site_logo/favicon are always public and noindex.
    - indexable is only allowed when visibility is public.
    - invalid visibility falls back to private.
    """

    forced_public = purpose in {"avatar", "site_logo", "workspace_icon", "favicon"}
    if forced_public:
        return ("public", False)

    visibility = (requested_visibility or "").strip().lower()
    if visibility not in {"public", "private", "shared"}:
        visibility = "private"

    indexable = bool(requested_indexable) if requested_indexable is not None else False
    if visibility != "public":
        indexable = False
    return (visibility, indexable)


class UploadsService(BaseService):
    def __init__(
        self,
        settings: Settings,
        tenant_context: TenantContext | None = None,
        *,
        background_jobs: BackgroundJobCreator | None = None,
        activity_writer: RequiredActivityWriter | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher)
        self.repo = UploadsRepository(tenant_context)

        # Temp storage is always local (even for S3 multipart, we don't store bytes here).
        self._tmp_provider = LocalStorageProvider(
            StorageProfileConfig(
                provider=ObjectStorageProviderKind.LOCAL,
                local_root_dir=self.settings.storage.local_tmp_dir,
                local_tmp_dir=self.settings.storage.local_tmp_dir,
            )
        )
        self._completion = UploadCompletionService(
            settings,
            repository=self.repo,
            remote_provider_builder=self._build_remote_provider,
            activity_writer=activity_writer or write_required_activity_event,
            tenant_context=tenant_context,
            background_jobs=background_jobs,
        )

    def _chunk_size_bytes(self) -> int:
        return int(self.settings.storage.upload_chunk_size_mb) * 1024 * 1024

    def _expires_at(self) -> datetime:
        return datetime.now(tz=UTC) + timedelta(seconds=self.settings.storage.upload_session_ttl_seconds)

    async def get_upload_policy(self, *, purpose: str) -> UploadPolicyOut:
        effective = await get_effective_settings(self.settings)
        normalized_purpose = (purpose or "").strip().lower() or "library"
        policy = self._build_policy(effective=effective, purpose=normalized_purpose)
        max_size_bytes = int(policy.max_size_bytes)
        return UploadPolicyOut(
            purpose=normalized_purpose,
            max_size_mb=max(1, max_size_bytes // (1024 * 1024)),
            max_size_bytes=max_size_bytes,
            allowed_extensions=sorted(policy.allowed_exts),
            allowed_mime_types=sorted(policy.allowed_mime_types),
            accept=_accept_for_policy(policy),
        )

    @staticmethod
    def _build_policy(*, effective: Settings, purpose: str) -> UploadPolicy:
        global_max_bytes = int(effective.storage.upload_policy.defaults.max_size_mb) * 1024 * 1024
        return build_upload_policy(
            purpose=purpose,
            global_max_size_bytes=global_max_bytes,
            max_avatar_size_bytes=int(effective.storage.upload_max_avatar_size_mb) * 1024 * 1024,
            max_site_logo_size_bytes=int(effective.storage.upload_max_site_logo_size_mb) * 1024 * 1024,
            max_favicon_size_bytes=int(effective.storage.upload_max_favicon_size_mb) * 1024 * 1024,
            upload_policy_settings=effective.storage.upload_policy,
        )

    @staticmethod
    def _upload_tmp_dir_key(*, scope: AssetScope, upload_id: UUID) -> str:
        if scope.type == ASSET_SCOPE_WORKSPACE:
            return f"workspaces/{scope.id}/uploads/{upload_id}"
        if scope.type == ASSET_SCOPE_PROJECT:
            return f"projects/{scope.id}/uploads/{upload_id}"
        if scope.type == ASSET_SCOPE_ORGANIZATION:
            return f"organizations/{scope.id}/uploads/{upload_id}"
        if scope.type == ASSET_SCOPE_USER:
            return f"users/{scope.id}/uploads/{upload_id}"
        raise ValueError("invalid scope")

    async def _build_remote_provider(
        self,
        *,
        profile_key: str,
        scope: AssetScope,
        action: str,
        upload_id: UUID | None = None,
        part_number: int | None = None,
    ) -> S3StorageProvider:
        try:
            profile = await get_storage_profile_by_key(settings=self.settings, profile_key=profile_key)
            provider_impl = build_storage_provider(profile)
        except (TypeError, ValueError) as exc:
            logger.warning(
                "Storage provider build failed",
                scope_type=str(scope.type),
                scope_id=str(scope.id),
                upload_id=str(upload_id) if upload_id is not None else None,
                part_number=part_number,
                action=action,
                error=str(exc),
            )
            raise BadRequest(
                message=_ts("STORAGE_PROVIDER_INVALID", "存储配置不正确"),
                error="STORAGE_PROVIDER_INVALID",
            ) from exc
        if not isinstance(provider_impl, S3StorageProvider) or is_local_storage_provider(provider_impl.provider):
            raise BadRequest(
                message=_ts("STORAGE_PROVIDER_INVALID", "存储配置不正确"),
                error="STORAGE_PROVIDER_INVALID",
            )
        return provider_impl

    async def init_upload(
        self,
        *,
        scope: AssetScope,
        actor_user_id: UUID,
        purpose: str,
        filename: str,
        mime: str | None,
        size_bytes: int,
        expected_sha256: str | None,
        requested_visibility: str | None,
        requested_indexable: bool | None,
        target_folder_id: UUID | None,
    ) -> UploadSessionRecord:
        normalized_filename = normalize_original_filename(filename)
        expected_sha256 = validate_sha256_hex(expected_sha256)

        effective = await get_effective_settings(self.settings)
        profile_key, active_profile = await get_effective_storage_profile(self.settings)

        policy = self._build_policy(effective=effective, purpose=purpose)
        ext = validate_upload_metadata(
            purpose=purpose, filename=normalized_filename, mime=mime, size_bytes=size_bytes, policy=policy
        )
        stem = Path(normalized_filename).stem or "asset"
        slug = slugify(stem)

        async with self.repo.connection(scope=scope) as conn:
            if target_folder_id is not None:
                folder_exists = await self.repo.folder_exists(scope=scope, folder_id=target_folder_id, conn=conn)
                if not folder_exists:
                    raise NotFound(
                        message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND"
                    )

        chunk_size = int(effective.storage.upload_chunk_size_mb) * 1024 * 1024

        provider = str(active_profile.provider)
        if active_profile.capabilities.supports_multipart_upload:
            # S3 multipart upload requires a minimum part size (except the last part).
            # We enforce it at init time so the client can follow the returned chunkSize.
            min_part_size = 5 * 1024 * 1024  # 5MiB
            chunk_size = max(chunk_size, min_part_size)
            if expected_sha256 is not None:
                # We currently can't validate SHA-256 without downloading the full object.
                raise BadRequest(
                    message=_ts("UPLOAD_SHA256_NOT_SUPPORTED", "当前存储暂不支持 SHA-256 校验"),
                    error="UPLOAD_SHA256_NOT_SUPPORTED",
                )

        total_parts = compute_total_parts(size_bytes=size_bytes, chunk_size_bytes=chunk_size)

        if policy.forced_visibility is not None:
            visibility = policy.forced_visibility
            indexable = bool(policy.forced_indexable) if policy.forced_indexable is not None else False
        else:
            visibility, indexable = normalize_visibility_and_indexable(
                purpose=purpose,
                requested_visibility=requested_visibility,
                requested_indexable=requested_indexable,
            )

        # Reserve asset id and object key early (required for S3 direct upload, and improves idempotency).
        reserved_asset_id = uuid7()
        multipart_upload_id: str | None = None
        object_key: str | None = None
        s3_bucket: str | None = None
        if is_local_storage_provider(provider):
            object_key = build_scoped_asset_object_key(
                scope=scope.type,
                scope_id=scope.id,
                asset_id=reserved_asset_id,
                ext=ext,
            )
        else:
            # Scheme C: CDN canonical path is `/assets/{asset_id}/{slug}.{ext}`.
            # For S3, we store the object at the same path (relative, without leading slash).
            object_key = f"assets/{reserved_asset_id}/{slug}.{ext}"

            provider_impl = await self._build_remote_provider(
                profile_key=profile_key,
                scope=scope,
                action="init_upload_build_storage_provider",
            )
            if visibility == "public" and active_profile.capabilities.supports_public_bucket:
                s3_bucket = (active_profile.public_bucket or "").strip() or None
            if not s3_bucket:
                s3_bucket = (active_profile.bucket or "").strip() or None
            if not s3_bucket:
                raise BadRequest(
                    message=_ts("STORAGE_PROVIDER_INVALID", "存储配置不正确"),
                    error="STORAGE_PROVIDER_INVALID",
                )

            provider_impl = provider_impl.with_bucket(s3_bucket)
            if active_profile.capabilities.supports_bucket_create:
                await provider_impl.ensure_bucket()
            multipart_upload_id = await provider_impl.create_multipart_upload(
                object_key=object_key,
                content_type=mime,
            )

        async with self.repo.connection(scope=scope) as conn:
            return await self.repo.create_session(
                scope=scope,
                actor_user_id=actor_user_id,
                purpose=purpose,
                filename=normalized_filename,
                mime=mime,
                size_bytes=size_bytes,
                expected_sha256=expected_sha256,
                chunk_size=chunk_size,
                total_parts=total_parts,
                expires_at=self._expires_at(),
                target_folder_id=target_folder_id,
                storage_provider=provider,
                storage_profile_key=profile_key,
                visibility=visibility,
                indexable=indexable,
                reserved_asset_id=reserved_asset_id,
                resolved_slug=slug,
                resolved_ext=ext,
                object_key=object_key,
                multipart_upload_id=multipart_upload_id,
                s3_bucket=s3_bucket,
                conn=conn,
            )

    async def get_status(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[UploadSessionRecord, list[int]]:
        if conn is None:
            async with self.tx() as tx:
                async with self.repo.connection(scope=scope, conn=tx) as scoped_conn:
                    return await self.get_status(
                        upload_id=upload_id,
                        scope=scope,
                        conn=cast(BaseDBAsyncClient, scoped_conn),
                    )

        session = await self.repo.get_session_for_update(upload_id=upload_id, scope=scope, conn=conn)
        if session is None:
            raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")

        status = _upload_status(session)
        if status == UploadStatus.EXPIRED:
            raise BadRequest(message=_ts("UPLOAD_EXPIRED", "上传会话已过期"), error="UPLOAD_EXPIRED")
        if status in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
            database_time = await self.repo.get_database_time(conn=conn)
            if database_time > session.expires_at:
                await self.repo.mark_expired(upload_id=upload_id, scope=scope, conn=conn)
                raise BadRequest(message=_ts("UPLOAD_EXPIRED", "上传会话已过期"), error="UPLOAD_EXPIRED")

        raw_rows = await self.repo.query_parts(session_id=session.id, conn=conn).values_list("part_number", flat=True)
        uploaded = {int(r[0] if isinstance(r, tuple) else r) for r in raw_rows}
        missing = [i for i in range(1, int(session.total_parts) + 1) if i not in uploaded]
        return session, missing

    async def put_part(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        part_number: int,
        data: bytes,
    ) -> None:
        checksum_sha256 = hashlib.sha256(data).hexdigest()
        async with self.tx() as tx:
            async with self.repo.connection(scope=scope, conn=tx) as scoped_conn:
                conn = cast(BaseDBAsyncClient, scoped_conn)
                session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
                if not is_local_storage_provider(str(session.storage_provider)):
                    raise BadRequest(
                        message=_ts("UPLOAD_DIRECT_REQUIRED", "当前存储使用直传方式，请使用 presign 接口上传"),
                        error="UPLOAD_DIRECT_REQUIRED",
                    )
                if _upload_status(session) not in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
                    raise BadRequest(
                        message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"),
                        error="UPLOAD_NOT_WRITABLE",
                    )
                if part_number <= 0 or part_number > int(session.total_parts):
                    raise BadRequest(
                        message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"),
                        error="UPLOAD_PART_INVALID",
                    )

                max_len = int(session.chunk_size)
                if len(data) > max_len:
                    raise BadRequest(
                        message=_ts("UPLOAD_CHUNK_TOO_LARGE", "分片大小超过限制"),
                        error="UPLOAD_CHUNK_TOO_LARGE",
                    )
                if part_number < int(session.total_parts) and len(data) != max_len:
                    raise BadRequest(
                        message=_ts("UPLOAD_CHUNK_SIZE_MISMATCH", "分片大小不匹配"),
                        error="UPLOAD_CHUNK_SIZE_MISMATCH",
                    )

                object_key = build_scoped_upload_part_object_key(
                    scope=scope.type,
                    scope_id=scope.id,
                    upload_id=upload_id,
                    part_number=part_number,
                )
                self._tmp_provider.put_bytes(object_key=object_key, data=data)
                await self.repo.upsert_part(
                    session_id=session.id,
                    part_number=part_number,
                    object_key=object_key,
                    size_bytes=len(data),
                    checksum_sha256=checksum_sha256,
                    conn=conn,
                )
                await self.repo.mark_uploading(upload_id=upload_id, scope=scope, conn=conn)

    async def presign_part(self, *, upload_id: UUID, scope: AssetScope, part_number: int) -> UploadPartPresignOut:
        async with self.repo.connection(scope=scope) as conn:
            session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
        if is_local_storage_provider(str(session.storage_provider)):
            raise BadRequest(
                message=_ts("UPLOAD_PRESIGN_NOT_SUPPORTED", "当前存储不支持直传"),
                error="UPLOAD_PRESIGN_NOT_SUPPORTED",
            )
        if _upload_status(session) not in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
            raise BadRequest(message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"), error="UPLOAD_NOT_WRITABLE")
        if part_number <= 0 or part_number > int(session.total_parts):
            raise BadRequest(message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"), error="UPLOAD_PART_INVALID")
        if not session.object_key or not session.multipart_upload_id:
            raise BadRequest(message=_ts("UPLOAD_SESSION_INVALID", "上传会话不完整"), error="UPLOAD_SESSION_INVALID")

        profile = await get_storage_profile_by_key(
            settings=self.settings,
            profile_key=str(
                session.storage_profile_key or getattr(self.settings.storage, "default_profile_key", "env-default")
            ),
        )
        provider_impl = await self._build_remote_provider(
            profile_key=str(
                session.storage_profile_key or getattr(self.settings.storage, "default_profile_key", "env-default")
            ),
            scope=scope,
            upload_id=upload_id,
            part_number=part_number,
            action="presign_part_build_storage_provider",
        )
        bucket = (session.s3_bucket or "").strip()
        if bucket:
            provider_impl = provider_impl.with_bucket(bucket)

        presign = await provider_impl.presign_upload_part(
            object_key=str(session.object_key),
            upload_id=str(session.multipart_upload_id),
            part_number=part_number,
            expires_in=int(profile.presign_expires_seconds),
        )
        expires_at = datetime.now(tz=UTC) + timedelta(seconds=int(profile.presign_expires_seconds))
        return UploadPartPresignOut(
            url=presign.url,
            method=presign.method,
            headers=presign.headers or {},
            expires_at=expires_at,
        )

    async def commit_part(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        part_number: int,
        etag: str,
        size_bytes: int,
    ) -> None:
        async with self.tx() as tx:
            async with self.repo.connection(scope=scope, conn=tx) as scoped_conn:
                conn = cast(BaseDBAsyncClient, scoped_conn)
                session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
                if is_local_storage_provider(str(session.storage_provider)):
                    raise BadRequest(
                        message=_ts("UPLOAD_COMMIT_NOT_SUPPORTED", "当前存储不支持直传提交"),
                        error="UPLOAD_COMMIT_NOT_SUPPORTED",
                    )
                if _upload_status(session) not in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
                    raise BadRequest(
                        message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"),
                        error="UPLOAD_NOT_WRITABLE",
                    )
                if part_number <= 0 or part_number > int(session.total_parts):
                    raise BadRequest(
                        message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"),
                        error="UPLOAD_PART_INVALID",
                    )
                if size_bytes < 0:
                    raise BadRequest(
                        message=_ts("UPLOAD_SIZE_INVALID", "文件大小不合法"),
                        error="UPLOAD_SIZE_INVALID",
                    )

                max_len = int(session.chunk_size)
                if size_bytes > max_len:
                    raise BadRequest(
                        message=_ts("UPLOAD_CHUNK_TOO_LARGE", "分片大小超过限制"),
                        error="UPLOAD_CHUNK_TOO_LARGE",
                    )
                if part_number < int(session.total_parts) and size_bytes != max_len:
                    raise BadRequest(
                        message=_ts("UPLOAD_CHUNK_SIZE_MISMATCH", "分片大小不匹配"),
                        error="UPLOAD_CHUNK_SIZE_MISMATCH",
                    )
                clean_etag = (etag or "").strip()
                if not clean_etag:
                    raise BadRequest(
                        message=_ts("UPLOAD_ETAG_INVALID", "ETag 不合法"),
                        error="UPLOAD_ETAG_INVALID",
                    )

                await self.repo.upsert_part(
                    session_id=session.id,
                    part_number=part_number,
                    object_key=session.object_key or "",
                    size_bytes=size_bytes,
                    etag=clean_etag,
                    conn=conn,
                )
                await self.repo.mark_uploading(upload_id=upload_id, scope=scope, conn=conn)

    async def complete(self, *, upload_id: UUID, scope: AssetScope) -> UUID:
        return await self._completion.complete(upload_id=upload_id, scope=scope)

    async def abort(self, *, upload_id: UUID, scope: AssetScope) -> UploadSessionRecord:
        async with self.tx() as tx:
            async with self.repo.connection(scope=scope, conn=tx) as scoped_conn:
                conn = cast(BaseDBAsyncClient, scoped_conn)
                session = await self.repo.get_session_for_update(
                    upload_id=upload_id,
                    scope=scope,
                    conn=conn,
                )
                if session is None:
                    raise NotFound(
                        message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"),
                        error="UPLOAD_NOT_FOUND",
                    )
                status = _upload_status(session)
                if status == UploadStatus.ABORTED:
                    aborted = session
                elif status in {UploadStatus.INITIATED, UploadStatus.UPLOADING}:
                    aborted = await self.repo.mark_aborted(
                        upload_id=upload_id,
                        scope=scope,
                        conn=conn,
                    )
                else:
                    raise BadRequest(
                        message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"),
                        error="UPLOAD_NOT_WRITABLE",
                    )

        if (
            not is_local_storage_provider(str(aborted.storage_provider))
            and aborted.object_key
            and aborted.multipart_upload_id
        ):
            try:
                provider = await self._build_remote_provider(
                    profile_key=str(
                        aborted.storage_profile_key
                        or getattr(self.settings.storage, "default_profile_key", "env-default")
                    ),
                    scope=scope,
                    upload_id=upload_id,
                    action="abort_multipart_upload_build_storage_provider",
                )
                bucket = (aborted.s3_bucket or "").strip()
                if bucket:
                    provider = provider.with_bucket(bucket)
                await provider.abort_multipart_upload(
                    object_key=str(aborted.object_key),
                    upload_id=str(aborted.multipart_upload_id),
                )
            except (BadRequest, *UPLOAD_ABORT_ERRORS) as exc:
                logger.warning(
                    "Abort multipart upload cleanup failed",
                    scope_type=scope.type,
                    scope_id=str(scope.id),
                    upload_id=str(upload_id),
                    storage_provider=str(aborted.storage_provider),
                    action="abort_multipart_upload",
                    error=str(exc),
                )

        upload_dir = safe_object_key_to_path(
            self.settings.storage.local_tmp_dir,
            self._upload_tmp_dir_key(scope=scope, upload_id=upload_id),
        )
        try:
            await asyncio.to_thread(_remove_upload_directory, upload_dir)
        except OSError as exc:
            logger.warning(
                "Upload temp directory cleanup failed on abort",
                scope_type=scope.type,
                scope_id=str(scope.id),
                upload_id=str(upload_id),
                upload_dir=str(upload_dir),
                action="abort_cleanup_upload_temp_dir",
                error=str(exc),
            )
        return aborted
