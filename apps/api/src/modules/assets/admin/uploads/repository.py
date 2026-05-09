from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.common.protocols.tortoise import UploadPartMutableFields
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.assets.asset import AssetRecord
from src.models.assets.asset_folder import AssetFolderRecord
from src.models.assets.upload import UploadPartRecord, UploadSessionRecord, UploadStatus
from src.modules.assets.scope import AssetScope, AssetScopeDatabaseRouter, scope_filter_kwargs
from src.modules.tenancy.schema import TenantContext


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

    async def set_session_status(
        self,
        session: UploadSessionRecord,
        *,
        status: UploadStatus,
        conn: BaseDBAsyncClient | None = None,
    ) -> UploadSessionRecord:
        if session.status != status:
            session.status = status
            await session.save(update_fields=["status", "updated_at"], **self._using_db_kwargs(conn))
        return session

    async def mark_completed(
        self,
        session: UploadSessionRecord,
        *,
        asset_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> UploadSessionRecord:
        session.status = UploadStatus.COMPLETED
        session.asset_id = asset_id
        await session.save(update_fields=["status", "asset_id", "updated_at"], **self._using_db_kwargs(conn))
        return session

    async def try_mark_completing(
        self,
        *,
        upload_id: UUID,
        scope: AssetScope,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        """
        Atomic CAS for multi-worker correctness.

        Returns True if current worker successfully became the single "completing" winner.
        """

        from datetime import UTC, datetime

        now = datetime.now(tz=UTC)
        # If a worker crashes while COMPLETING, allow other workers to take over after a short TTL.
        stale_cutoff = now - timedelta(seconds=60)

        base = UploadSessionRecord.filter(id=upload_id, asset_id=None, **scope_filter_kwargs(scope))
        if conn is not None:
            base = base.using_db(conn)
        base = base.filter(
            Q(status__in=[UploadStatus.INITIATED, UploadStatus.UPLOADING])
            | Q(status=UploadStatus.COMPLETING, updated_at__lt=stale_cutoff)
        )
        updated = await base.update(status=UploadStatus.COMPLETING, updated_at=now)
        return int(updated) == 1

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
