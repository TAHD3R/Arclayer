from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.queryset import QuerySet

from apps.api.common.repositories import BaseRepository
from apps.api.models.upload import UploadPartRecord, UploadSessionRecord, UploadStatus


class UploadsRepository(BaseRepository):
    async def create_session(
        self,
        *,
        org_id: UUID,
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
    ) -> UploadSessionRecord:
        return await UploadSessionRecord.create(
            org_id=org_id,
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
        )

    async def get_session(self, *, upload_id: UUID, org_id: UUID) -> UploadSessionRecord | None:
        return await UploadSessionRecord.get_or_none(id=upload_id, org_id=org_id)

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
    ) -> UploadPartRecord:
        part = await UploadPartRecord.get_or_none(session_id=session_id, part_number=part_number)
        if part is None:
            return await UploadPartRecord.create(
                session_id=session_id,
                part_number=part_number,
                object_key=object_key,
                size_bytes=size_bytes,
                checksum_sha256=checksum_sha256,
                stored=True,
            )
        part.object_key = object_key
        part.size_bytes = size_bytes
        part.checksum_sha256 = checksum_sha256
        part.stored = True
        await part.save(update_fields=["object_key", "size_bytes", "checksum_sha256", "stored", "updated_at"])
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
