from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.models import Model

from src.models.assets.asset import AssetRecord
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.publish_artifact import PublishArtifactRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.sites.site import SiteRecord
from src.models.workspaces.workspace import Workspace
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class ProjectContentTransferRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def load_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient | None = None) -> Workspace | None:
        async with self.connection(conn) as tenant_conn:
            return await self.using_db(Workspace.filter(id=workspace_id), tenant_conn).first()

    async def load_project(self, *, project_id: UUID, conn: BaseDBAsyncClient | None = None) -> ProjectRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await self.using_db(ProjectRecord.filter(id=project_id), tenant_conn).first()

    async def load_runtime(
        self, *, project_id: UUID, runtime_id: UUID | None, conn: BaseDBAsyncClient | None = None
    ) -> ProjectRuntimeRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = ProjectRuntimeRecord.filter(project_id=project_id)
            if runtime_id is not None:
                query = query.filter(id=runtime_id)
            return await self.using_db(query.order_by("kind", "id"), tenant_conn).first()

    async def load_site(self, *, site_id: UUID, conn: BaseDBAsyncClient | None = None) -> SiteRecord | None:
        async with self.connection(conn) as tenant_conn:
            return await self.using_db(SiteRecord.filter(id=site_id), tenant_conn).first()

    async def load_content_models(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[ContentModelDefinitionRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentModelDefinitionRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("singular_key", "id")
                .all()
            )
            return list(rows)

    async def load_model_fields(
        self, *, model_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[ContentModelFieldRecord]:
        if not model_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentModelFieldRecord
                .filter(model_definition_id__in=model_ids)
                .using_db(tenant_conn)
                .order_by("model_definition_id", "sort_order", "key", "id")
                .all()
            )
            return list(rows)

    async def load_model_relations(
        self, *, model_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[ContentModelRelationRecord]:
        if not model_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentModelRelationRecord
                .filter(model_definition_id__in=model_ids)
                .using_db(tenant_conn)
                .order_by("model_definition_id", "sort_order", "key", "id")
                .all()
            )
            return list(rows)

    async def load_model_views(
        self, *, model_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[ContentModelViewRecord]:
        if not model_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentModelViewRecord
                .filter(model_definition_id__in=model_ids)
                .using_db(tenant_conn)
                .order_by("model_definition_id", "sort_order", "key", "id")
                .all()
            )
            return list(rows)

    async def load_content_items(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[ContentItemRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentItemRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("model_definition_id", "locale", "slug", "id")
                .all()
            )
            return list(rows)

    async def load_versions(
        self, *, item_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[ContentVersionRecord]:
        if not item_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentVersionRecord
                .filter(item_id__in=item_ids)
                .using_db(tenant_conn)
                .order_by("item_id", "version", "id")
                .all()
            )
            return list(rows)

    async def load_presentation_documents(
        self, *, version_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[PresentationDocumentRecord]:
        if not version_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await PresentationDocumentRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "kind", "id")
                .all()
            )
            return list(rows)

    async def load_seo_profiles(
        self, *, version_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[SEOProfileRecord]:
        if not version_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await SEOProfileRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "id")
                .all()
            )
            return list(rows)

    async def load_component_bindings(
        self, *, version_ids: list[UUID], conn: BaseDBAsyncClient | None = None
    ) -> list[ComponentBindingRecord]:
        if not version_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ComponentBindingRecord
                .filter(version_id__in=version_ids)
                .using_db(tenant_conn)
                .order_by("version_id", "sort_order", "component_key", "binding_key", "id")
                .all()
            )
            return list(rows)

    async def load_route_bindings(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[RouteBindingRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await RouteBindingRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("locale", "path", "item_id", "id")
                .all()
            )
            return list(rows)

    async def load_hierarchy_nodes(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[HierarchyNodeRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await HierarchyNodeRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("sort_order", "item_id", "id")
                .all()
            )
            return list(rows)

    async def load_releases(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[ContentReleaseRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await ContentReleaseRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("release_number", "id")
                .all()
            )
            return list(rows)

    async def load_published_graph(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[PublishedGraphRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await PublishedGraphRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("release_id", "locale", "route_path", "item_id", "id")
                .all()
            )
            return list(rows)

    async def load_publish_artifacts(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[PublishArtifactRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await PublishArtifactRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .order_by("release_id", "item_id", "version_id", "artifact_kind", "locale", "id")
                .all()
            )
            return list(rows)

    async def load_assets(
        self, *, workspace_id: UUID, project_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> list[AssetRecord]:
        async with self.connection(conn) as tenant_conn:
            rows = (
                await AssetRecord
                .filter(Q(workspace_id=workspace_id) | Q(project_id=project_id))
                .using_db(tenant_conn)
                .order_by("project_id", "workspace_id", "slug", "id")
                .all()
            )
            return list(rows)

    async def target_has_content(
        self, *, workspace_id: UUID, site_id: UUID, conn: BaseDBAsyncClient | None = None
    ) -> bool:
        async with self.connection(conn) as tenant_conn:
            has_models = (
                await ContentModelDefinitionRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                )
                .using_db(tenant_conn)
                .exists()
            )
            if has_models:
                return True
            return (
                await ContentItemRecord
                .filter(workspace_id=workspace_id, site_id=site_id)
                .using_db(tenant_conn)
                .exists()
            )

    async def create_many(
        self,
        model: type[Model],
        rows: list[dict[str, Any]],
        *,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not rows:
            return
        await model.bulk_create([model(**row) for row in rows], using_db=conn)
