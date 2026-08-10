from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.catalog import AgentVersionRecord
from src.models.agents.runtime_v1 import AgentRunV1Record
from src.models.builder._enums import BuilderChangeSetCommandKind
from src.models.builder.change_set import (
    BuilderChangeSetApprovalRecord,
    BuilderChangeSetCommandRecord,
    BuilderChangeSetRecord,
)
from src.models.builder.content_structure import ContentStructureRevisionRecord
from src.models.builder.draft_checkpoint import BuilderDraftCheckpointRecord
from src.models.builder.restore_lineage import BuilderRestoreLineageRecord
from src.models.builder.site_revision import (
    BuilderInitializationCommandRecord,
    SiteRevisionManifestRecord,
    SiteRevisionStatusRecord,
)
from src.models.content._enums import ContentContinuationRole
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.models.projects.environment import ProjectEnvironmentRecord
from src.models.projects.project import ProjectRecord
from src.models.sites.site import SiteRecord
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class SiteBuilderRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def lock_project(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ProjectRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                ProjectRecord
                .filter(id=project_id, workspace_id=workspace_id, is_active=True)
                .using_db(tenant_conn)
                .select_for_update()
                .first()
            )

    async def get_project(self, *, project_id: UUID, workspace_id: UUID) -> ProjectRecord | None:
        async with self.connection() as tenant_conn:
            return await (
                ProjectRecord
                .filter(id=project_id, workspace_id=workspace_id, is_active=True)
                .using_db(tenant_conn)
                .first()
            )

    async def get_site(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> SiteRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = SiteRecord.filter(
                project_id=project_id,
                runtime_id=runtime_id,
                is_active=True,
            ).using_db(tenant_conn)
            if site_id is not None:
                query = query.filter(id=site_id)
            return await query.first()

    async def get_environment(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectEnvironmentRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                ProjectEnvironmentRecord.filter(id=environment_id, project_id=project_id).using_db(tenant_conn).first()
            )

    async def get_default_preview_environment(
        self,
        *,
        project_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ProjectEnvironmentRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                ProjectEnvironmentRecord
                .filter(project_id=project_id, is_default_preview=True)
                .using_db(tenant_conn)
                .first()
            )

    async def get_agent_run_for_builder(
        self,
        *,
        run_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient | None,
    ) -> AgentRunV1Record | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                AgentRunV1Record
                .filter(
                    id=run_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    owner_user_id=actor_user_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_agent_version_for_builder(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None,
    ) -> AgentVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await AgentVersionRecord.filter(id=version_id).using_db(tenant_conn).first()

    async def get_initialization_command(
        self,
        *,
        project_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> BuilderInitializationCommandRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                BuilderInitializationCommandRecord
                .filter(project_id=project_id, request_idempotency_key=idempotency_key)
                .using_db(tenant_conn)
                .first()
            )

    async def get_latest_site_revision(
        self,
        *,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> SiteRevisionManifestRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = (
                SiteRevisionManifestRecord
                .filter(
                    project_id=project_id,
                    site_id=site_id,
                    environment_id=environment_id,
                )
                .using_db(tenant_conn)
                .order_by("-revision_number")
            )
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_site_revision(
        self,
        *,
        project_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> SiteRevisionManifestRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = SiteRevisionManifestRecord.filter(project_id=project_id, id=revision_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def list_site_revisions(
        self,
        *,
        project_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        limit: int,
        cursor: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> tuple[list[SiteRevisionManifestRecord], UUID | None]:
        async with self.connection(conn) as tenant_conn:
            query = SiteRevisionManifestRecord.filter(
                project_id=project_id,
                site_id=site_id,
                environment_id=environment_id,
            ).using_db(tenant_conn)
            if cursor is not None:
                cursor_record = await (
                    SiteRevisionManifestRecord
                    .filter(
                        project_id=project_id,
                        site_id=site_id,
                        environment_id=environment_id,
                        id=cursor,
                    )
                    .using_db(tenant_conn)
                    .first()
                )
                if cursor_record is None:
                    return [], None
                query = query.filter(revision_number__lt=int(cursor_record.revision_number))
            records = list(await query.order_by("-revision_number").limit(limit + 1))
            next_cursor = UUID(str(records[limit - 1].id)) if len(records) > limit else None
            return records[:limit], next_cursor

    async def get_structure_revision(
        self,
        *,
        project_id: UUID,
        revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentStructureRevisionRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                ContentStructureRevisionRecord
                .filter(project_id=project_id, id=revision_id)
                .using_db(tenant_conn)
                .first()
            )

    async def get_change_set_command(
        self,
        *,
        project_id: UUID,
        command_kind: BuilderChangeSetCommandKind,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetCommandRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await (
                BuilderChangeSetCommandRecord
                .filter(
                    project_id=project_id,
                    command_kind=command_kind,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def get_change_set(
        self,
        *,
        project_id: UUID,
        change_set_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BuilderChangeSetRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderChangeSetRecord.filter(project_id=project_id, id=change_set_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_change_set_approval(
        self,
        *,
        project_id: UUID,
        change_set_id: UUID,
        approval_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BuilderChangeSetApprovalRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderChangeSetApprovalRecord.filter(
                project_id=project_id,
                change_set_id=change_set_id,
            ).using_db(tenant_conn)
            if approval_id is not None:
                query = query.filter(id=approval_id)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_draft_checkpoint(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        client_session_id: str,
        site_id: UUID | None = None,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> BuilderDraftCheckpointRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderDraftCheckpointRecord.filter(
                project_id=project_id,
                actor_user_id=actor_user_id,
                client_session_id=client_session_id,
            ).using_db(tenant_conn)
            if site_id is not None:
                query = query.filter(site_id=site_id)
            if environment_id is not None:
                query = query.filter(environment_id=environment_id)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def get_draft_checkpoint_by_change_set(
        self,
        *,
        project_id: UUID,
        change_set_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> BuilderDraftCheckpointRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = BuilderDraftCheckpointRecord.filter(
                project_id=project_id,
                applied_change_set_id=change_set_id,
            ).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def list_draft_checkpoints_for_apply(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        base_revision_id: UUID,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> list[BuilderDraftCheckpointRecord]:
        async with self.connection(conn) as tenant_conn:
            query = (
                BuilderDraftCheckpointRecord
                .filter(
                    project_id=project_id,
                    actor_user_id=actor_user_id,
                    base_revision_id=base_revision_id,
                    status="draft",
                )
                .using_db(tenant_conn)
                .order_by("-updated_at")
            )
            if for_update:
                query = query.select_for_update()
            return list(await query)

    async def get_restore_lineage(
        self,
        *,
        project_id: UUID,
        restore_revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> BuilderRestoreLineageRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await BuilderRestoreLineageRecord
                .filter(
                    project_id=project_id,
                    restore_revision_id=restore_revision_id,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_restore_lineage(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderRestoreLineageRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderRestoreLineageRecord.create(using_db=tenant_conn, **values)

    async def create_draft_checkpoint(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderDraftCheckpointRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderDraftCheckpointRecord.create(using_db=tenant_conn, **values)

    async def update_draft_checkpoint(
        self,
        *,
        record: BuilderDraftCheckpointRecord,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderDraftCheckpointRecord:
        async with self.connection(conn) as tenant_conn:
            for field, value in values.items():
                setattr(record, field, value)
            await record.save(using_db=tenant_conn, update_fields=[*values, "updated_at"])
            return record

    async def get_status(
        self,
        *,
        site_revision_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> SiteRevisionStatusRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = SiteRevisionStatusRecord.filter(site_revision_id=site_revision_id).using_db(tenant_conn)
            if for_update:
                query = query.select_for_update()
            return await query.first()

    async def list_structure_records(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[list[RouteBindingRecord], list[HierarchyNodeRecord], list[ContentItemRecord]]:
        async with self.connection(conn) as tenant_conn:
            routes = await (
                RouteBindingRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                )
                .using_db(tenant_conn)
                .order_by("locale", "path", "item_id")
            )
            hierarchy = await (
                HierarchyNodeRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("sort_order", "item_id")
            )
            candidate_ids = {
                *(UUID(str(route.item_id)) for route in routes),
                *(UUID(str(node.item_id)) for node in hierarchy),
            }
            if not candidate_ids:
                return list(routes), [], []
            items = await (
                ContentItemRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    id__in=list(candidate_ids),
                )
                .using_db(tenant_conn)
                .order_by("id")
            )
            item_ids = {UUID(str(item.id)) for item in items}
            return (
                [route for route in routes if UUID(str(route.item_id)) in item_ids],
                [node for node in hierarchy if UUID(str(node.item_id)) in item_ids],
                list(items),
            )

    async def list_content_versions(
        self,
        *,
        item_ids: Sequence[UUID],
        conn: BaseDBAsyncClient,
    ) -> list[ContentVersionRecord]:
        if not item_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            return list(
                await ContentVersionRecord
                .filter(item_id__in=item_ids)
                .using_db(tenant_conn)
                .order_by("item_id", "version")
            )

    async def list_global_section_records(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ContentItemRecord]:
        async with self.connection(conn) as tenant_conn:
            return list(
                await ContentItemRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    resolved_role=ContentContinuationRole.REUSABLE_SECTION,
                )
                .using_db(tenant_conn)
                .order_by("locale", "slug", "id")
            )

    async def list_presentations_and_bindings(
        self,
        *,
        version_ids: Sequence[UUID],
        conn: BaseDBAsyncClient,
    ) -> tuple[list[PresentationDocumentRecord], list[ComponentBindingRecord]]:
        if not version_ids:
            return [], []
        async with self.connection(conn) as tenant_conn:
            presentations = await (
                PresentationDocumentRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "kind")
            )
            bindings = await (
                ComponentBindingRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "sort_order", "component_key", "binding_key")
            )
            return list(presentations), list(bindings)

    async def list_seo_profiles(
        self,
        *,
        version_ids: Sequence[UUID],
        conn: BaseDBAsyncClient,
    ) -> list[SEOProfileRecord]:
        if not version_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            return list(
                await SEOProfileRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "id")
            )

    async def create_structure_revision(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> ContentStructureRevisionRecord:
        async with self.connection(conn) as tenant_conn:
            return await ContentStructureRevisionRecord.create(using_db=tenant_conn, **values)

    async def create_site_revision(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionManifestRecord:
        async with self.connection(conn) as tenant_conn:
            return await SiteRevisionManifestRecord.create(using_db=tenant_conn, **values)

    async def create_status(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionStatusRecord:
        async with self.connection(conn) as tenant_conn:
            return await SiteRevisionStatusRecord.create(using_db=tenant_conn, **values)

    async def create_initialization_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderInitializationCommandRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderInitializationCommandRecord.create(using_db=tenant_conn, **values)

    async def create_change_set(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderChangeSetRecord.create(using_db=tenant_conn, **values)

    async def create_change_set_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetCommandRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderChangeSetCommandRecord.create(using_db=tenant_conn, **values)

    async def create_change_set_approval(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetApprovalRecord:
        async with self.connection(conn) as tenant_conn:
            return await BuilderChangeSetApprovalRecord.create(using_db=tenant_conn, **values)

    async def update_change_set(
        self,
        *,
        record: BuilderChangeSetRecord,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetRecord:
        async with self.connection(conn) as tenant_conn:
            for field, value in values.items():
                setattr(record, field, value)
            await record.save(update_fields=[*values, "updated_at"], using_db=tenant_conn)
            return record

    async def update_change_set_approval(
        self,
        *,
        record: BuilderChangeSetApprovalRecord,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> BuilderChangeSetApprovalRecord:
        async with self.connection(conn) as tenant_conn:
            for field, value in values.items():
                setattr(record, field, value)
            await record.save(update_fields=[*values, "updated_at"], using_db=tenant_conn)
            return record

    async def update_status(
        self,
        *,
        record: SiteRevisionStatusRecord,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SiteRevisionStatusRecord:
        async with self.connection(conn) as tenant_conn:
            for field, value in values.items():
                setattr(record, field, value)
            await record.save(update_fields=[*values, "updated_at"], using_db=tenant_conn)
            return record
