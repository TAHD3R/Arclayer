from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from fastapi import BackgroundTasks
from tortoise.exceptions import IntegrityError, OperationalError

from src.common.constants.assets import (
    ASSET_SCOPE_ORGANIZATION,
    ASSET_SCOPE_PROJECT,
    ASSET_SCOPE_USER,
    ASSET_UPLOADED_EVENT,
)
from src.common.services import BaseService
from src.common.utils.ids import uuid7
from src.common.utils.slug import slugify
from src.config import Settings
from src.core.events import Event, events
from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.core.logging import get_logger
from src.models.assets.asset import AssetPurpose, AssetVisibility
from src.models.assets.upload import UploadSessionRecord, UploadStatus
from src.modules.assets.admin.uploads.policy.service import (
    build_upload_policy,
    normalize_original_filename,
    validate_sha256_hex,
    validate_upload_metadata,
)
from src.modules.assets.admin.uploads.repository import UploadsRepository
from src.modules.assets.admin.uploads.schema import UploadPartPresignOut
from src.modules.assets.naming.service import (
    build_scoped_asset_object_key,
    build_scoped_upload_part_object_key,
    compute_total_parts,
)
from src.modules.assets.scope import AssetScope
from src.modules.tenancy.router_helpers import current_tenant_context_or_none, tenant_payload_from_context
from src.modules.tenancy.schema import TenantContext
from src.platform.storage.capabilities import ObjectStorageProviderKind
from src.platform.storage.factory import build_storage_provider
from src.platform.storage.local import LocalStorageProvider, safe_object_key_to_path
from src.platform.storage.merge import merge_parts_to_file
from src.platform.storage.profile_schema import StorageProfileConfig
from src.platform.storage.profiles import (
    get_effective_storage_profile,
    get_storage_profile_by_key,
    is_local_storage_provider,
)
from src.platform.storage.s3 import S3StorageProvider
from src.settings.runtime import get_effective_settings

logger = get_logger(__name__)

UPLOAD_COMPLETION_ERRORS = (
    BadRequest,
    NotFound,
    IntegrityError,
    OperationalError,
    OSError,
    RuntimeError,
    TimeoutError,
    TypeError,
    ValueError,
)
UPLOAD_STATUS_RESET_ERRORS = (
    OperationalError,
    OSError,
    RuntimeError,
    TimeoutError,
    TypeError,
    ValueError,
)
UPLOAD_EVENT_PUBLISH_ERRORS = (
    AttributeError,
    KeyError,
    OSError,
    RuntimeError,
    TimeoutError,
    TypeError,
    ValueError,
)
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
    def __init__(self, settings: Settings, tenant_context: TenantContext | None = None) -> None:
        super().__init__(settings)
        self.repo = UploadsRepository(tenant_context)

        # Temp storage is always local (even for S3 multipart, we don't store bytes here).
        self._tmp_provider = LocalStorageProvider(
            StorageProfileConfig(
                provider=ObjectStorageProviderKind.LOCAL,
                local_root_dir=self.settings.storage.local_tmp_dir,
                local_tmp_dir=self.settings.storage.local_tmp_dir,
            )
        )

    def _chunk_size_bytes(self) -> int:
        return int(self.settings.storage.upload_chunk_size_mb) * 1024 * 1024

    def _expires_at(self) -> datetime:
        return datetime.now(tz=UTC) + timedelta(seconds=self.settings.storage.upload_session_ttl_seconds)

    @staticmethod
    def _upload_tmp_dir_key(*, scope: AssetScope, upload_id: UUID) -> str:
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

        global_max_bytes = int(effective.storage.upload_max_file_size_mb) * 1024 * 1024
        policy = build_upload_policy(
            purpose=purpose,
            global_max_size_bytes=global_max_bytes,
            max_avatar_size_bytes=int(effective.storage.upload_max_avatar_size_mb) * 1024 * 1024,
            max_site_logo_size_bytes=int(effective.storage.upload_max_site_logo_size_mb) * 1024 * 1024,
            max_favicon_size_bytes=int(effective.storage.upload_max_favicon_size_mb) * 1024 * 1024,
        )
        ext = validate_upload_metadata(
            purpose=purpose, filename=normalized_filename, size_bytes=size_bytes, policy=policy
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
        conn=None,
    ) -> tuple[UploadSessionRecord, list[int]]:
        session = await self.repo.get_session(upload_id=upload_id, scope=scope, conn=conn)
        if session is None:
            raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")

        if session.expires_at < datetime.now(tz=UTC):
            await self.repo.set_session_status(session, status=UploadStatus.EXPIRED, conn=conn)
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
        async with self.repo.connection(scope=scope) as conn:
            session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
            if not is_local_storage_provider(str(session.storage_provider)):
                raise BadRequest(
                    message=_ts("UPLOAD_DIRECT_REQUIRED", "当前存储使用直传方式，请使用 presign 接口上传"),
                    error="UPLOAD_DIRECT_REQUIRED",
                )
            if session.status in {UploadStatus.COMPLETED, UploadStatus.ABORTED, UploadStatus.EXPIRED}:
                raise BadRequest(message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"), error="UPLOAD_NOT_WRITABLE")

            if part_number <= 0 or part_number > int(session.total_parts):
                raise BadRequest(message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"), error="UPLOAD_PART_INVALID")

            max_len = int(session.chunk_size)
            if len(data) > max_len:
                raise BadRequest(
                    message=_ts("UPLOAD_CHUNK_TOO_LARGE", "分片大小超过限制"), error="UPLOAD_CHUNK_TOO_LARGE"
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
                conn=conn,
            )
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)

    async def presign_part(self, *, upload_id: UUID, scope: AssetScope, part_number: int) -> UploadPartPresignOut:
        async with self.repo.connection(scope=scope) as conn:
            session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
        if is_local_storage_provider(str(session.storage_provider)):
            raise BadRequest(
                message=_ts("UPLOAD_PRESIGN_NOT_SUPPORTED", "当前存储不支持直传"),
                error="UPLOAD_PRESIGN_NOT_SUPPORTED",
            )
        if session.status in {UploadStatus.COMPLETED, UploadStatus.ABORTED, UploadStatus.EXPIRED}:
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
        async with self.repo.connection(scope=scope) as conn:
            session, _missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
            if is_local_storage_provider(str(session.storage_provider)):
                raise BadRequest(
                    message=_ts("UPLOAD_COMMIT_NOT_SUPPORTED", "当前存储不支持直传提交"),
                    error="UPLOAD_COMMIT_NOT_SUPPORTED",
                )
            if session.status in {UploadStatus.COMPLETED, UploadStatus.ABORTED, UploadStatus.EXPIRED}:
                raise BadRequest(message=_ts("UPLOAD_NOT_WRITABLE", "上传会话不可写"), error="UPLOAD_NOT_WRITABLE")
            if part_number <= 0 or part_number > int(session.total_parts):
                raise BadRequest(message=_ts("UPLOAD_PART_INVALID", "分片编号不合法"), error="UPLOAD_PART_INVALID")
            if size_bytes < 0:
                raise BadRequest(message=_ts("UPLOAD_SIZE_INVALID", "文件大小不合法"), error="UPLOAD_SIZE_INVALID")

            max_len = int(session.chunk_size)
            if int(size_bytes) > max_len:
                raise BadRequest(
                    message=_ts("UPLOAD_CHUNK_TOO_LARGE", "分片大小超过限制"), error="UPLOAD_CHUNK_TOO_LARGE"
                )
            if part_number < int(session.total_parts) and int(size_bytes) != max_len:
                raise BadRequest(
                    message=_ts("UPLOAD_CHUNK_SIZE_MISMATCH", "分片大小不匹配"),
                    error="UPLOAD_CHUNK_SIZE_MISMATCH",
                )

            clean_etag = (etag or "").strip()
            if not clean_etag:
                raise BadRequest(message=_ts("UPLOAD_ETAG_INVALID", "ETag 不合法"), error="UPLOAD_ETAG_INVALID")

            part_object_key = session.object_key or ""
            await self.repo.upsert_part(
                session_id=session.id,
                part_number=part_number,
                object_key=part_object_key,
                size_bytes=int(size_bytes),
                etag=clean_etag,
                conn=conn,
            )
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)

    async def complete(
        self, *, upload_id: UUID, scope: AssetScope, background_tasks: BackgroundTasks | None = None
    ) -> UUID:
        async with self.repo.connection(scope=scope) as conn:
            session, missing = await self.get_status(upload_id=upload_id, scope=scope, conn=conn)
            if session.status == UploadStatus.COMPLETED and session.asset_id is not None:
                return session.asset_id
            if missing:
                raise BadRequest(
                    message=_ts("UPLOAD_INCOMPLETE", "仍有分片未上传"),
                    error="UPLOAD_INCOMPLETE",
                    meta={"missing_parts": missing},
                )

            winner = await self.repo.try_mark_completing(upload_id=upload_id, scope=scope, conn=conn)
            if not winner:
                for _ in range(10):
                    latest = await self.repo.get_session(upload_id=upload_id, scope=scope, conn=conn)
                    if latest is None:
                        break
                    if latest.status == UploadStatus.COMPLETED and latest.asset_id is not None:
                        return latest.asset_id
                    if latest.status == UploadStatus.COMPLETING:
                        await asyncio.sleep(0.2)
                        continue
                    break
                raise BadRequest(
                    message=_ts("UPLOAD_COMPLETING", "上传正在完成中，请稍后重试"), error="UPLOAD_COMPLETING"
                )

            session = await self.repo.get_session(upload_id=upload_id, scope=scope, conn=conn)
            if session is None:
                raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")

            try:
                if is_local_storage_provider(str(session.storage_provider)):
                    asset_id = await self._complete_local(session=session, scope=scope, conn=conn)
                else:
                    asset_id = await self._complete_s3(session=session, scope=scope, conn=conn)
            except UPLOAD_COMPLETION_ERRORS as exc:
                logger.warning(
                    "Upload completion failed",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(upload_id),
                    storage_provider=str(session.storage_provider),
                    action="complete_upload",
                    error=str(exc),
                )
                try:
                    await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
                except UPLOAD_STATUS_RESET_ERRORS as status_exc:
                    logger.warning(
                        "Upload status reset failed after completion error",
                        scope_type=str(scope.type),
                        scope_id=str(scope.id),
                        upload_id=str(upload_id),
                        action="reset_upload_status_after_complete_error",
                        error=str(status_exc),
                    )
                raise

        # Emit post-upload event for asynchronous processors.
        payload: dict[str, object] = {
            "scope_type": str(scope.type),
            "scope_id": str(scope.id),
            "asset_id": str(asset_id),
            "purpose": str(session.purpose),
            "storage_provider": str(session.storage_provider),
            "visibility": str(session.visibility),
            "indexable": bool(session.indexable),
        }
        if scope.type == ASSET_SCOPE_PROJECT:
            payload["project_id"] = str(scope.id)
            tenant_context = current_tenant_context_or_none()
            if tenant_context is not None:
                payload["tenant"] = tenant_payload_from_context(tenant_context)
        event = Event(
            name=ASSET_UPLOADED_EVENT,
            payload=payload,
            source="core",
            actor_user_id=str(session.actor_user_id),
        )

        async def _publish() -> None:
            try:
                await events.publish(event)
            except UPLOAD_EVENT_PUBLISH_ERRORS as exc:
                logger.warning(
                    "Asset uploaded event publish failed",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(upload_id),
                    asset_id=str(asset_id),
                    action="publish_asset_uploaded_event",
                    error=str(exc),
                )
                return

        if background_tasks is not None:
            background_tasks.add_task(_publish)
        else:
            await _publish()

        return asset_id

    async def _complete_local(self, *, session: UploadSessionRecord, scope: AssetScope, conn=None) -> UUID:
        filename = session.filename
        ext = (session.resolved_ext or "").lstrip(".").lower() or (Path(filename).suffix.lstrip(".") or "bin").lower()
        slug = (session.resolved_slug or "").strip() or slugify(Path(filename).stem or "asset")
        asset_id = session.reserved_asset_id or uuid7()
        object_key = session.object_key or build_scoped_asset_object_key(
            scope=scope.type, scope_id=scope.id, asset_id=asset_id, ext=ext
        )

        try:
            purpose = AssetPurpose(session.purpose)
        except ValueError:
            purpose = AssetPurpose.LIBRARY

        try:
            visibility = AssetVisibility(str(session.visibility))
        except ValueError:
            visibility = AssetVisibility.PRIVATE
        indexable = bool(session.indexable) if visibility == AssetVisibility.PUBLIC else False

        # Merge tmp parts into final file.
        part_rows = await self.repo.query_parts(session_id=session.id, conn=conn).order_by("part_number")
        total_uploaded = sum(int(r.size_bytes) for r in part_rows)
        if total_uploaded != int(session.size_bytes):
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={"declared_size_bytes": int(session.size_bytes), "uploaded_size_bytes": total_uploaded},
            )

        part_keys = [row.object_key for row in part_rows]
        part_paths = [safe_object_key_to_path(self.settings.storage.local_tmp_dir, k) for k in part_keys]

        out_path = safe_object_key_to_path(self.settings.storage.local_root_dir, object_key)
        try:
            digest = merge_parts_to_file(part_paths=part_paths, out_path=out_path)
        except OSError as exc:
            try:
                out_path.unlink(missing_ok=True)
            except OSError as cleanup_exc:
                logger.warning(
                    "Upload output cleanup failed after merge error",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(session.id),
                    asset_id=str(asset_id),
                    output_path=str(out_path),
                    action="complete_local_cleanup_output_on_merge_error",
                    error=str(cleanup_exc),
                )
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
            raise BadRequest(message=_ts("UPLOAD_MERGE_FAILED", "合并分片失败"), error="UPLOAD_MERGE_FAILED") from exc

        if session.expected_sha256 and digest.lower() != str(session.expected_sha256).lower():
            try:
                out_path.unlink(missing_ok=True)
            except OSError as cleanup_exc:
                logger.warning(
                    "Upload output cleanup failed after SHA256 mismatch",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(session.id),
                    asset_id=str(asset_id),
                    output_path=str(out_path),
                    action="complete_local_cleanup_output_on_hash_mismatch",
                    error=str(cleanup_exc),
                )
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
            raise BadRequest(
                message=_ts("UPLOAD_SHA256_MISMATCH", "文件校验失败"),
                error="UPLOAD_SHA256_MISMATCH",
                meta={"expected_sha256": session.expected_sha256, "actual_sha256": digest},
            )

        # Persist immutable metadata (idempotent by reserved asset id).
        existing = await self.repo.get_asset(scope=scope, asset_id=asset_id, conn=conn)
        if existing is not None:
            await self.repo.mark_completed(session, asset_id=existing.id, conn=conn)
            return existing.id

        if session.target_folder_id is not None:
            folder_exists = await self.repo.folder_exists(scope=scope, folder_id=session.target_folder_id, conn=conn)
            if not folder_exists:
                await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        try:
            asset = await self.repo.create_asset(
                scope=scope,
                conn=conn,
                id=asset_id,
                owner_user_id=session.actor_user_id,
                folder_id=session.target_folder_id,
                purpose=purpose,
                visibility=visibility,
                indexable=indexable,
                title=None,
                slug=slug,
                original_filename=filename,
                mime=session.mime,
                ext=ext,
                size_bytes=session.size_bytes,
                checksum_sha256=digest,
                storage_provider=session.storage_provider,
                storage_profile_key=session.storage_profile_key,
                object_key=object_key,
                variants=None,
                meta=None,
                deleted_at=None,
            )
        except IntegrityError:
            existing2 = await self.repo.get_asset(scope=scope, asset_id=asset_id, conn=conn)
            if existing2 is None:
                raise
            asset = existing2

        await self.repo.mark_completed(session, asset_id=asset.id, conn=conn)

        for p in part_paths:
            try:
                p.unlink(missing_ok=True)
            except OSError as cleanup_exc:
                logger.warning(
                    "Upload part cleanup failed after local completion",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(session.id),
                    asset_id=str(asset.id),
                    part_path=str(p),
                    action="complete_local_cleanup_part",
                    error=str(cleanup_exc),
                )
                continue
        return asset.id

    async def _complete_s3(self, *, session: UploadSessionRecord, scope: AssetScope, conn=None) -> UUID:
        provider_impl = await self._build_remote_provider(
            profile_key=str(
                session.storage_profile_key or getattr(self.settings.storage, "default_profile_key", "env-default")
            ),
            scope=scope,
            upload_id=session.id,
            action="complete_s3_build_storage_provider",
        )
        bucket = (session.s3_bucket or "").strip()
        if bucket:
            provider_impl = provider_impl.with_bucket(bucket)
        if not session.reserved_asset_id or not session.object_key or not session.multipart_upload_id:
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
            raise BadRequest(message=_ts("UPLOAD_SESSION_INVALID", "上传会话不完整"), error="UPLOAD_SESSION_INVALID")

        filename = session.filename
        ext = (session.resolved_ext or "").lstrip(".").lower() or (Path(filename).suffix.lstrip(".") or "bin").lower()
        slug = (session.resolved_slug or "").strip() or slugify(Path(filename).stem or "asset")
        asset_id = session.reserved_asset_id
        object_key = str(session.object_key)

        try:
            purpose = AssetPurpose(session.purpose)
        except ValueError:
            purpose = AssetPurpose.LIBRARY

        try:
            visibility = AssetVisibility(str(session.visibility))
        except ValueError:
            visibility = AssetVisibility.PRIVATE
        indexable = bool(session.indexable) if visibility == AssetVisibility.PUBLIC else False

        part_rows = await self.repo.query_parts(session_id=session.id, conn=conn).order_by("part_number")
        total_uploaded = sum(int(r.size_bytes) for r in part_rows)
        if total_uploaded != int(session.size_bytes):
            await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
            raise BadRequest(
                message=_ts("UPLOAD_SIZE_MISMATCH", "上传大小与声明不一致"),
                error="UPLOAD_SIZE_MISMATCH",
                meta={"declared_size_bytes": int(session.size_bytes), "uploaded_size_bytes": total_uploaded},
            )

        parts: list[dict] = []
        for row in part_rows:
            tag = (row.etag or "").strip()
            if not tag:
                await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
                raise BadRequest(
                    message=_ts("UPLOAD_ETAG_MISSING", "存在未提交 ETag 的分片"),
                    error="UPLOAD_ETAG_MISSING",
                    meta={"part_number": int(row.part_number)},
                )
            if not tag.startswith('"'):
                tag = f'"{tag}"'
            parts.append({"ETag": tag, "PartNumber": int(row.part_number)})

        await provider_impl.complete_multipart_upload(
            object_key=object_key,
            upload_id=str(session.multipart_upload_id),
            parts=parts,
        )

        existing = await self.repo.get_asset(scope=scope, asset_id=asset_id, conn=conn)
        if existing is not None:
            await self.repo.mark_completed(session, asset_id=existing.id, conn=conn)
            return existing.id

        if session.target_folder_id is not None:
            folder_exists = await self.repo.folder_exists(scope=scope, folder_id=session.target_folder_id, conn=conn)
            if not folder_exists:
                await self.repo.set_session_status(session, status=UploadStatus.UPLOADING, conn=conn)
                raise NotFound(message=_ts("ASSET_FOLDER_NOT_FOUND", "文件夹不存在"), error="ASSET_FOLDER_NOT_FOUND")

        try:
            asset = await self.repo.create_asset(
                scope=scope,
                conn=conn,
                id=asset_id,
                owner_user_id=session.actor_user_id,
                folder_id=session.target_folder_id,
                purpose=purpose,
                visibility=visibility,
                indexable=indexable,
                title=None,
                slug=slug,
                original_filename=filename,
                mime=session.mime,
                ext=ext,
                size_bytes=session.size_bytes,
                checksum_sha256=None,
                storage_provider=session.storage_provider,
                storage_profile_key=session.storage_profile_key,
                storage_bucket=bucket or None,
                object_key=object_key,
                variants=None,
                meta=None,
                deleted_at=None,
            )
        except IntegrityError:
            existing2 = await self.repo.get_asset(scope=scope, asset_id=asset_id, conn=conn)
            if existing2 is None:
                raise
            asset = existing2
        await self.repo.mark_completed(session, asset_id=asset.id, conn=conn)
        return asset.id

    async def abort(self, *, upload_id: UUID, scope: AssetScope) -> UploadSessionRecord:
        async with self.repo.connection(scope=scope) as conn:
            session = await self.repo.get_session(upload_id=upload_id, scope=scope, conn=conn)
            if session is None:
                raise NotFound(message=_ts("UPLOAD_NOT_FOUND", "上传会话不存在"), error="UPLOAD_NOT_FOUND")
        # Best-effort: abort multipart upload if needed.
        if (
            not is_local_storage_provider(str(session.storage_provider))
            and session.object_key
            and session.multipart_upload_id
        ):
            try:
                provider_impl = await self._build_remote_provider(
                    profile_key=str(
                        session.storage_profile_key
                        or getattr(self.settings.storage, "default_profile_key", "env-default")
                    ),
                    scope=scope,
                    upload_id=upload_id,
                    action="abort_multipart_upload_build_storage_provider",
                )
                bucket = (session.s3_bucket or "").strip()
                if bucket:
                    provider_impl = provider_impl.with_bucket(bucket)
                await provider_impl.abort_multipart_upload(
                    object_key=str(session.object_key),
                    upload_id=str(session.multipart_upload_id),
                )
            except BadRequest:
                # Best-effort cleanup path: keep abort endpoint idempotent even when provider config is invalid.
                pass
            except UPLOAD_ABORT_ERRORS as exc:
                logger.warning(
                    "Abort multipart upload failed",
                    scope_type=str(scope.type),
                    scope_id=str(scope.id),
                    upload_id=str(upload_id),
                    storage_provider=str(session.storage_provider),
                    action="abort_multipart_upload",
                    error=str(exc),
                )

        async with self.repo.connection(scope=scope) as conn:
            await self.repo.set_session_status(session, status=UploadStatus.ABORTED, conn=conn)

        # Best-effort cleanup: remove directory under tmp if present.
        # This is safe because we scope by scope and upload_id in object_key.
        upload_dir = safe_object_key_to_path(
            self.settings.storage.local_tmp_dir,
            self._upload_tmp_dir_key(scope=scope, upload_id=upload_id),
        )
        try:
            if upload_dir.is_dir():
                for child in upload_dir.rglob("*"):
                    if child.is_file():
                        child.unlink(missing_ok=True)
                for child in sorted(upload_dir.rglob("*"), reverse=True):
                    if child.is_dir():
                        child.rmdir()
                upload_dir.rmdir()
        except OSError as exc:
            logger.warning(
                "Upload temp directory cleanup failed on abort",
                scope_type=str(scope.type),
                scope_id=str(scope.id),
                upload_id=str(upload_id),
                upload_dir=str(upload_dir),
                action="abort_cleanup_upload_temp_dir",
                error=str(exc),
            )
        return session
