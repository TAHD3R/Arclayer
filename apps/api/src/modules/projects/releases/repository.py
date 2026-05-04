from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.content._enums import ContentReleaseStatus
from src.models.content.release import ContentReleaseRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class ProjectReleasesRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_releases(self, *, workspace_id: UUID, site_id: UUID) -> list[ContentReleaseRecord]:
        async with self.connection() as conn:
            return (
                await ContentReleaseRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(conn)
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
        async with self.connection() as conn:
            return (
                await ContentReleaseRecord
                .filter(
                    id=release_id,
                    workspace_id=workspace_id,
                    site_id=site_id,
                )
                .using_db(conn)
                .first()
            )

    async def get_release_in_connection(
        self,
        *,
        release_id: UUID,
        workspace_id: UUID | None = None,
        site_id: UUID | None = None,
        status: ContentReleaseStatus | None = None,
        conn: BaseDBAsyncClient,
    ) -> ContentReleaseRecord | None:
        qs = ContentReleaseRecord.filter(id=release_id)
        if workspace_id is not None:
            qs = qs.filter(workspace_id=workspace_id)
        if site_id is not None:
            qs = qs.filter(site_id=site_id)
        if status is not None:
            qs = qs.filter(status=status)
        return await qs.using_db(conn).first()

    async def get_current_active_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentReleaseRecord | None:
        return (
            await ContentReleaseRecord
            .filter(workspace_id=workspace_id, site_id=site_id, is_active=True)
            .using_db(conn)
            .order_by("-release_number")
            .first()
        )

    async def next_release_number(self, *, site_id: UUID, conn: BaseDBAsyncClient) -> int:
        latest = await ContentReleaseRecord.filter(site_id=site_id).using_db(conn).order_by("-release_number").first()
        return (int(latest.release_number) if latest is not None else 0) + 1

    async def create_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release_number: int,
        is_active: bool,
        status: ContentReleaseStatus,
        created_by_user_id: UUID | None,
        activated_at: datetime | None,
        scheduled_at: datetime | None,
        lineage_parent_release_id: UUID | None,
        selection_count: int,
        conn: BaseDBAsyncClient,
    ) -> ContentReleaseRecord:
        return await ContentReleaseRecord.create(
            using_db=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            release_number=release_number,
            is_active=is_active,
            status=status,
            created_by_user_id=created_by_user_id,
            activated_at=activated_at,
            scheduled_at=scheduled_at,
            lineage_parent_release_id=lineage_parent_release_id,
            selection_count=selection_count,
        )

    async def deactivate_other_active_releases(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        active_release_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> int:
        return await (
            ContentReleaseRecord
            .filter(workspace_id=workspace_id, site_id=site_id, is_active=True)
            .exclude(id=active_release_id)
            .using_db(conn)
            .update(is_active=False, status=ContentReleaseStatus.PUBLISHED)
        )

    async def mark_release_active(
        self,
        *,
        release: ContentReleaseRecord,
        activated_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> ContentReleaseRecord:
        release.is_active = True
        release.status = ContentReleaseStatus.ACTIVE
        release.activated_at = activated_at
        await release.save(update_fields=["is_active", "status", "activated_at"], using_db=conn)
        return release

    async def activate_release(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        release: ContentReleaseRecord,
        activated_at: datetime,
    ) -> tuple[ContentReleaseRecord, UUID | None]:
        async with self.connection() as conn:
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
                .update(is_active=False, status=ContentReleaseStatus.PUBLISHED)
            )
            if not target.is_active or previous_active_release_id is not None:
                target.is_active = True
                target.status = ContentReleaseStatus.ACTIVE
                target.activated_at = activated_at
                await target.save(update_fields=["is_active", "status", "activated_at"], using_db=conn)
            return target, previous_active_release_id
