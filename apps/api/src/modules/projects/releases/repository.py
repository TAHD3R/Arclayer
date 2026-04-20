from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.transactions import in_transaction

from src.models.content.release import ContentReleaseRecord


class ProjectReleasesRepository:
    async def list_releases(self, *, workspace_id: UUID, site_id: UUID) -> list[ContentReleaseRecord]:
        return (
            await ContentReleaseRecord
            .filter(workspace_id=workspace_id, site_id=site_id)
            .order_by("-release_number")
            .all()
        )

    async def get_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release_id: UUID,
    ) -> ContentReleaseRecord | None:
        return await ContentReleaseRecord.filter(
            id=release_id,
            workspace_id=workspace_id,
            site_id=site_id,
        ).first()

    async def activate_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release: ContentReleaseRecord,
        activated_at: datetime,
    ) -> tuple[ContentReleaseRecord, UUID | None]:
        async with in_transaction() as conn:
            target = (
                await ContentReleaseRecord
                .filter(
                    id=release.id,
                    workspace_id=workspace_id,
                    site_id=site_id,
                )
                .using_db(conn)
                .first()
            )
            if target is None:
                raise RuntimeError("Release disappeared during activation.")

            current = (
                await ContentReleaseRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    is_active=True,
                )
                .using_db(conn)
                .order_by("-release_number")
                .first()
            )
            previous_active_release_id = current.id if current is not None and current.id != target.id else None
            await (
                ContentReleaseRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    is_active=True,
                )
                .exclude(id=target.id)
                .using_db(conn)
                .update(is_active=False)
            )
            if not target.is_active or previous_active_release_id is not None:
                target.is_active = True
                target.activated_at = activated_at
                await target.save(update_fields=["is_active", "activated_at"], using_db=conn)
            return target, previous_active_release_id
