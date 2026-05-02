from __future__ import annotations

from datetime import datetime
from uuid import UUID

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
