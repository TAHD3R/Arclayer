from __future__ import annotations

from datetime import datetime, timedelta
from typing import cast
from uuid import UUID

from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.common.utils.tortoise_protocols import UploadPartMutableFields
from apps.api.models.upload import UploadPartRecord, UploadSessionRecord, UploadStatus


class UploadsRepository(BaseRepository):
    async def create_session(
        self,
        *,
        workspace_id: UUID,
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
        visibility: str,
        indexable: bool,
        reserved_asset_id: UUID | None,
        resolved_slug: str | None,
        resolved_ext: str | None,
        object_key: str | None,
        multipart_upload_id: str | None,
    ) -> UploadSessionRecord:
        return await UploadSessionRecord.create(
            workspace_id=workspace_id,
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
            visibility=visibility,
            indexable=indexable,
            reserved_asset_id=reserved_asset_id,
            resolved_slug=resolved_slug,
            resolved_ext=resolved_ext,
            object_key=object_key,
            multipart_upload_id=multipart_upload_id,
        )

    async def get_session(self, *, upload_id: UUID, workspace_id: UUID) -> UploadSessionRecord | None:
        return await UploadSessionRecord.get_or_none(id=upload_id, workspace_id=workspace_id)

    def query_parts(self, *, session_id: UUID) -> QuerySet[UploadPartRecord]:
        return UploadPartRecord.filter(session_id=session_id)

    async def upsert_part(
        self,
        *,
        session_id: UUID,
        part_number: int,
        object_key: str,
        size_bytes: int,
        checksum_sha256: str | None = None,
        etag: str | None = None,
    ) -> UploadPartRecord:
        part = await UploadPartRecord.get_or_none(session_id=session_id, part_number=part_number)
        if part is None:
            return await UploadPartRecord.create(
                session_id=session_id,
                part_number=part_number,
                object_key=object_key,
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                etag=etag,
                stored=True,
            )
        part_like = cast(UploadPartMutableFields, part)
        part.object_key = object_key
        part.size_bytes = size_bytes
        part_like.checksum_sha256 = checksum_sha256
        part_like.etag = etag
        part.stored = True
        await part.save(update_fields=["object_key", "size_bytes", "checksum_sha256", "etag", "stored", "updated_at"])
        return part

    async def set_session_status(self, session: UploadSessionRecord, *, status: UploadStatus) -> UploadSessionRecord:
        if session.status != status:
            session.status = status
            await session.save(update_fields=["status", "updated_at"])
        return session

    async def mark_completed(self, session: UploadSessionRecord, *, asset_id: UUID) -> UploadSessionRecord:
        session.status = UploadStatus.COMPLETED
        session.asset_id = asset_id
        await session.save(update_fields=["status", "asset_id", "updated_at"])
        return session

    async def try_mark_completing(self, *, upload_id: UUID, workspace_id: UUID) -> bool:
        """
        Atomic CAS for multi-worker correctness.

        Returns True if current worker successfully became the single "completing" winner.
        """

        from datetime import UTC, datetime

        now = datetime.now(tz=UTC)
        # If a worker crashes while COMPLETING, allow other workers to take over after a short TTL.
        stale_cutoff = now - timedelta(seconds=60)

        base = UploadSessionRecord.filter(id=upload_id, workspace_id=workspace_id, asset_id=None)
        base = base.filter(
            Q(status__in=[UploadStatus.INITIATED, UploadStatus.UPLOADING])
            | Q(status=UploadStatus.COMPLETING, updated_at__lt=stale_cutoff)
        )
        updated = await base.update(status=UploadStatus.COMPLETING, updated_at=now)
        return int(updated) == 1
