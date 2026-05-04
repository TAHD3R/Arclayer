from __future__ import annotations

from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas.base import BaseSchema
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.release import ContentReleaseRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.projects.deployment import (
    ProjectDeploymentRecord,
    ProjectDeploymentRuntimeKind,
    ProjectDeploymentSourceType,
    ProjectDeploymentStatus,
)
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class EnvironmentCopyCounts(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    content_models: int = 0
    content_items: int = 0
    content_versions: int = 0
    route_bindings: int = 0
    releases: int = 0


class ProjectEnvironmentsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def count_target_content(
        self,
        *,
        target_environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, int]:
        async with self.connection(conn) as tenant_conn:
            models = await self.using_db(
                ContentModelDefinitionRecord.filter(environment_id=target_environment_id),
                tenant_conn,
            ).count()
            items = await self.using_db(
                ContentItemRecord.filter(environment_id=target_environment_id),
                tenant_conn,
            ).count()
        return models, items

    async def clear_environment_content(
        self,
        *,
        target_environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            target_model_ids = await self._list_model_ids(
                environment_id=target_environment_id,
                conn=tenant_conn,
            )
            if not target_model_ids:
                return

            target_item_ids = await self._list_item_ids_for_models(
                model_ids=target_model_ids,
                conn=tenant_conn,
            )
            await self._delete_environment_items(
                target_environment_id=target_environment_id,
                item_ids=target_item_ids,
                conn=tenant_conn,
            )
            await self._delete_environment_models(model_ids=target_model_ids, conn=tenant_conn)

    async def copy_environment_content(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        include_content: bool,
        conn: BaseDBAsyncClient,
    ) -> EnvironmentCopyCounts:
        async with self.connection(conn) as tenant_conn:
            source_models = await self._list_source_models(
                source_environment_id=source_environment_id,
                conn=tenant_conn,
            )
            model_id_map = await self._copy_environment_models(
                source_models=source_models,
                target_environment_id=target_environment_id,
                conn=tenant_conn,
            )

            item_count = 0
            version_count = 0
            route_binding_count = 0
            release_count = 0
            if include_content:
                item_id_map, version_id_map, item_count, version_count = await self._copy_environment_items(
                    source_environment_id=source_environment_id,
                    target_environment_id=target_environment_id,
                    model_id_map=model_id_map,
                    conn=tenant_conn,
                )
                route_binding_count = await self._copy_environment_route_bindings(
                    source_environment_id=source_environment_id,
                    target_environment_id=target_environment_id,
                    item_id_map=item_id_map,
                    conn=tenant_conn,
                )
                release_count = await self._copy_environment_releases(
                    project_id=project_id,
                    source_environment_id=source_environment_id,
                    target_environment_id=target_environment_id,
                    item_id_map=item_id_map,
                    version_id_map=version_id_map,
                    conn=tenant_conn,
                )

        return EnvironmentCopyCounts(
            content_models=len(source_models),
            content_items=item_count,
            content_versions=version_count,
            route_bindings=route_binding_count,
            releases=release_count,
        )

    async def _list_model_ids(
        self,
        *,
        environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[UUID]:
        values = await self.using_db(
            ContentModelDefinitionRecord.filter(environment_id=environment_id),
            conn,
        ).values_list("id", flat=True)
        return [UUID(str(value)) for value in values]

    async def _list_item_ids_for_models(
        self,
        *,
        model_ids: list[UUID],
        conn: BaseDBAsyncClient,
    ) -> list[UUID]:
        values = await self.using_db(
            ContentItemRecord.filter(model_definition_id__in=model_ids),
            conn,
        ).values_list("id", flat=True)
        return [UUID(str(value)) for value in values]

    async def _delete_environment_items(
        self,
        *,
        target_environment_id: UUID,
        item_ids: list[UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        if not item_ids:
            return
        release_ids = await self._list_release_ids_for_items(item_ids=item_ids, conn=conn)
        if release_ids:
            await self.using_db(PublishedGraphRecord.filter(release_id__in=release_ids), conn).delete()
            await self.using_db(
                ProjectDeploymentRecord.filter(
                    environment_id=target_environment_id,
                    source_type=ProjectDeploymentSourceType.CMS_RUNTIME,
                    source_ref__in=[str(value) for value in release_ids],
                ),
                conn,
            ).delete()
            await self.using_db(ContentReleaseRecord.filter(id__in=release_ids), conn).delete()
        await self.using_db(RouteBindingRecord.filter(item_id__in=item_ids), conn).delete()
        await self.using_db(ContentVersionRecord.filter(item_id__in=item_ids), conn).delete()
        await self.using_db(ContentItemRecord.filter(id__in=item_ids), conn).delete()

    async def _list_release_ids_for_items(
        self,
        *,
        item_ids: list[UUID],
        conn: BaseDBAsyncClient,
    ) -> list[UUID]:
        values = await self.using_db(
            ContentReleaseRecord.filter(graph_nodes__item_id__in=item_ids).distinct(),
            conn,
        ).values_list("id", flat=True)
        return [UUID(str(value)) for value in values]

    async def _delete_environment_models(
        self,
        *,
        model_ids: list[UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        await self.using_db(ContentModelFieldRecord.filter(model_definition_id__in=model_ids), conn).delete()
        await self.using_db(ContentModelRelationRecord.filter(model_definition_id__in=model_ids), conn).delete()
        await self.using_db(ContentModelViewRecord.filter(model_definition_id__in=model_ids), conn).delete()
        await self.using_db(ContentModelDefinitionRecord.filter(id__in=model_ids), conn).delete()

    async def _list_source_models(
        self,
        *,
        source_environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> list[ContentModelDefinitionRecord]:
        return list(
            await self.using_db(
                ContentModelDefinitionRecord
                .filter(environment_id=source_environment_id)
                .prefetch_related("fields", "relations", "views")
                .order_by("singular_key", "id"),
                conn,
            ).all()
        )

    async def _copy_environment_models(
        self,
        *,
        source_models: list[ContentModelDefinitionRecord],
        target_environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, UUID]:
        model_id_map: dict[UUID, UUID] = {}
        for source_model in source_models:
            target_model = await ContentModelDefinitionRecord.create(
                using_db=conn,
                workspace_id=source_model.workspace_id,
                site_id=source_model.site_id,
                environment_id=target_environment_id,
                singular_key=source_model.singular_key,
                plural_key=source_model.plural_key,
                name=source_model.name,
                description=source_model.description,
                category=source_model.category,
                model_kind=source_model.model_kind,
                default_editor=source_model.default_editor,
                default_role=source_model.default_role,
                default_posture=source_model.default_posture,
                default_surface=source_model.default_surface,
                starter_pack_policy=source_model.starter_pack_policy,
                surface_policy=source_model.surface_policy,
                protocol_key=source_model.protocol_key,
                protocol_version=source_model.protocol_version,
                is_system_managed=source_model.is_system_managed,
                system_field_keys=source_model.system_field_keys,
                draft_contract_revision=source_model.draft_contract_revision,
                published_contract_revision=source_model.published_contract_revision,
                published_contract_snapshot=source_model.published_contract_snapshot,
                updated_by_user_id=source_model.updated_by_user_id,
                capabilities=source_model.capabilities,
                routing_policy=source_model.routing_policy,
                presentation_policy=source_model.presentation_policy,
                seo_policy=source_model.seo_policy,
                workflow_policy=source_model.workflow_policy,
            )
            model_id_map[source_model.id] = target_model.id
            await self._copy_model_children(
                source_model=source_model,
                target_model_id=target_model.id,
                model_id_map=model_id_map,
                conn=conn,
            )
        return model_id_map

    async def _copy_model_children(
        self,
        *,
        source_model: ContentModelDefinitionRecord,
        target_model_id: UUID,
        model_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        await ContentModelFieldRecord.bulk_create(
            [
                ContentModelFieldRecord(
                    model_definition_id=target_model_id,
                    key=field.key,
                    label=field.label,
                    field_type=field.field_type,
                    is_required=field.is_required,
                    default_value=field.default_value,
                    config=field.config,
                    sort_order=field.sort_order,
                )
                for field in source_model.fields
            ],
            using_db=conn,
        )
        await ContentModelRelationRecord.bulk_create(
            [
                ContentModelRelationRecord(
                    model_definition_id=target_model_id,
                    target_model_definition_id=(
                        model_id_map.get(relation.target_model_definition_id)
                        if relation.target_model_definition_id is not None
                        else None
                    ),
                    target_model_key=relation.target_model_key,
                    key=relation.key,
                    relation_type=relation.relation_type,
                    is_required=relation.is_required,
                    config=relation.config,
                    sort_order=relation.sort_order,
                )
                for relation in source_model.relations
            ],
            using_db=conn,
        )
        await ContentModelViewRecord.bulk_create(
            [
                ContentModelViewRecord(
                    model_definition_id=target_model_id,
                    key=view.key,
                    label=view.label,
                    view_type=view.view_type,
                    dsl=view.dsl,
                    is_enabled=view.is_enabled,
                    sort_order=view.sort_order,
                )
                for view in source_model.views
            ],
            using_db=conn,
        )

    async def _copy_environment_items(
        self,
        *,
        source_environment_id: UUID,
        target_environment_id: UUID,
        model_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> tuple[dict[UUID, UUID], dict[UUID, UUID], int, int]:
        source_items = list(
            await self.using_db(
                ContentItemRecord.filter(environment_id=source_environment_id).order_by(
                    "model_definition_id", "locale", "slug", "id"
                ),
                conn,
            ).all()
        )
        item_id_map: dict[UUID, UUID] = {}
        for source_item in source_items:
            source_model_id = source_item.model_definition_id
            if source_model_id is None:
                continue
            target_model_id = model_id_map.get(UUID(str(source_model_id)))
            if target_model_id is None:
                continue
            target_item = await ContentItemRecord.create(
                using_db=conn,
                workspace_id=source_item.workspace_id,
                site_id=source_item.site_id,
                environment_id=target_environment_id,
                model_definition_id=target_model_id,
                slug=source_item.slug,
                title=source_item.title,
                status=source_item.status,
                visibility=source_item.visibility,
                locale=source_item.locale,
                bootstrap_preset_key=source_item.bootstrap_preset_key,
                bootstrap_preset_state=source_item.bootstrap_preset_state,
                capability_pack_ids=source_item.capability_pack_ids,
                resolved_role=source_item.resolved_role,
                resolved_posture=source_item.resolved_posture,
                resolved_surface=source_item.resolved_surface,
                shape_state=source_item.shape_state,
                shape_reason_code=source_item.shape_reason_code,
                shape_reason_meta=source_item.shape_reason_meta,
                workflow_stage=source_item.workflow_stage,
                workflow_assignee_user_id=source_item.workflow_assignee_user_id,
                workflow_summary=source_item.workflow_summary,
                workflow_notes=source_item.workflow_notes,
                draft_version=source_item.draft_version,
                published_version=source_item.published_version,
                created_by_user_id=source_item.created_by_user_id,
                updated_by_user_id=source_item.updated_by_user_id,
            )
            item_id_map[source_item.id] = target_item.id

        version_id_map = await self._copy_item_versions(item_id_map=item_id_map, conn=conn)
        return item_id_map, version_id_map, len(source_items), len(version_id_map)

    async def _copy_item_versions(
        self,
        *,
        item_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, UUID]:
        source_versions = list(
            await self.using_db(
                ContentVersionRecord.filter(item_id__in=list(item_id_map)).order_by("item_id", "version", "id"),
                conn,
            ).all()
        )
        version_id_map: dict[UUID, UUID] = {}
        for version in source_versions:
            target_item_id = item_id_map.get(UUID(str(version.item_id)))
            if target_item_id is None:
                continue
            target_version = await ContentVersionRecord.create(
                using_db=conn,
                item_id=target_item_id,
                version=version.version,
                state=version.state,
                fields_snapshot=version.fields_snapshot,
                change_summary=version.change_summary,
                created_by_user_id=version.created_by_user_id,
                last_transition_by_user_id=version.last_transition_by_user_id,
            )
            version_id_map[version.id] = target_version.id
        return version_id_map

    async def _copy_environment_route_bindings(
        self,
        *,
        source_environment_id: UUID,
        target_environment_id: UUID,
        item_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> int:
        source_bindings = list(
            await self.using_db(
                RouteBindingRecord.filter(environment_id=source_environment_id, item_id__in=list(item_id_map)).order_by(
                    "locale", "path", "item_id", "id"
                ),
                conn,
            ).all()
        )
        await RouteBindingRecord.bulk_create(
            [
                RouteBindingRecord(
                    workspace_id=binding.workspace_id,
                    site_id=binding.site_id,
                    environment_id=target_environment_id,
                    item_id=item_id_map[binding.item_id],
                    locale=binding.locale,
                    path=binding.path,
                    route_contract=binding.route_contract,
                    is_active=binding.is_active,
                )
                for binding in source_bindings
                if binding.item_id in item_id_map
            ],
            using_db=conn,
        )
        return len(source_bindings)

    async def _copy_environment_releases(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        item_id_map: dict[UUID, UUID],
        version_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> int:
        source_release_ids = await self._list_source_release_ids(
            source_environment_id=source_environment_id,
            item_id_map=item_id_map,
            conn=conn,
        )
        if not source_release_ids:
            return 0

        source_releases = list(
            await self.using_db(
                ContentReleaseRecord.filter(id__in=source_release_ids).order_by("release_number", "id"),
                conn,
            ).all()
        )
        release_id_map = await self._copy_releases(source_releases=source_releases, conn=conn)
        await self._copy_published_graph_nodes(
            source_release_ids=source_release_ids,
            item_id_map=item_id_map,
            version_id_map=version_id_map,
            release_id_map=release_id_map,
            conn=conn,
        )
        await self._copy_environment_deployments(
            project_id=project_id,
            source_environment_id=source_environment_id,
            target_environment_id=target_environment_id,
            release_id_map=release_id_map,
            conn=conn,
        )
        return len(source_releases)

    async def _list_source_release_ids(
        self,
        *,
        source_environment_id: UUID,
        item_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> list[UUID]:
        values = await self.using_db(
            PublishedGraphRecord.filter(
                item__environment_id=source_environment_id, item_id__in=list(item_id_map)
            ).distinct(),
            conn,
        ).values_list("release_id", flat=True)
        return [UUID(str(value)) for value in values]

    async def _copy_releases(
        self,
        *,
        source_releases: list[ContentReleaseRecord],
        conn: BaseDBAsyncClient,
    ) -> dict[UUID, UUID]:
        release_id_map: dict[UUID, UUID] = {}
        release_number_offset = await self._next_release_number_offset(source_releases=source_releases, conn=conn)
        for index, source_release in enumerate(source_releases, start=1):
            target_release = await ContentReleaseRecord.create(
                using_db=conn,
                workspace_id=source_release.workspace_id,
                site_id=source_release.site_id,
                release_number=release_number_offset + index,
                is_active=source_release.is_active,
                created_by_user_id=source_release.created_by_user_id,
                activated_at=source_release.activated_at,
                lineage_parent_release_id=source_release.lineage_parent_release_id,
                selection_count=source_release.selection_count,
            )
            release_id_map[source_release.id] = target_release.id
        return release_id_map

    async def _next_release_number_offset(
        self,
        *,
        source_releases: list[ContentReleaseRecord],
        conn: BaseDBAsyncClient,
    ) -> int:
        if not source_releases:
            return 0
        site_id = source_releases[0].site_id
        latest = await self.using_db(
            ContentReleaseRecord.filter(site_id=site_id).order_by("-release_number"),
            conn,
        ).first()
        return int(latest.release_number) if latest is not None else 0

    async def _copy_published_graph_nodes(
        self,
        *,
        source_release_ids: list[UUID],
        item_id_map: dict[UUID, UUID],
        version_id_map: dict[UUID, UUID],
        release_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        source_nodes = list(
            await self.using_db(
                PublishedGraphRecord.filter(release_id__in=source_release_ids, item_id__in=list(item_id_map)).order_by(
                    "release_id", "locale", "route_path", "item_id", "id"
                ),
                conn,
            ).all()
        )
        await PublishedGraphRecord.bulk_create(
            [
                PublishedGraphRecord(
                    release_id=release_id_map[node.release_id],
                    workspace_id=node.workspace_id,
                    site_id=node.site_id,
                    item_id=item_id_map[node.item_id],
                    version_id=version_id_map[node.version_id],
                    locale=node.locale,
                    route_path=node.route_path,
                    route_contract=node.route_contract,
                    hierarchy_parent_item_id=(
                        item_id_map.get(node.hierarchy_parent_item_id)
                        if node.hierarchy_parent_item_id is not None
                        else None
                    ),
                    hierarchy_sort_order=node.hierarchy_sort_order,
                )
                for node in source_nodes
                if node.release_id in release_id_map
                and node.item_id in item_id_map
                and node.version_id in version_id_map
            ],
            using_db=conn,
        )

    async def _copy_environment_deployments(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        release_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        source_refs = self._release_id_refs(release_id_map=release_id_map)
        source_deployments = list(
            await self.using_db(
                ProjectDeploymentRecord.filter(
                    project_id=project_id,
                    environment_id=source_environment_id,
                    source_type=ProjectDeploymentSourceType.CMS_RUNTIME,
                    source_ref__in=[str(value) for value in source_refs],
                ).order_by("created_at", "id"),
                conn,
            ).all()
        )
        if not source_deployments:
            return
        await self.using_db(
            ProjectDeploymentRecord.filter(
                project_id=project_id,
                environment_id=target_environment_id,
                is_active=True,
            ),
            conn,
        ).update(is_active=False)
        await ProjectDeploymentRecord.bulk_create(
            [
                ProjectDeploymentRecord(
                    project_id=deployment.project_id,
                    runtime_id=deployment.runtime_id,
                    environment_id=target_environment_id,
                    source_type=deployment.source_type,
                    source_ref=str(release_id_map[UUID(str(deployment.source_ref))]),
                    status=(
                        deployment.status
                        if deployment.status != ProjectDeploymentStatus.PROMOTED
                        else ProjectDeploymentStatus.READY
                    ),
                    runtime_kind=deployment.runtime_kind or ProjectDeploymentRuntimeKind.STATIC,
                    artifact_storage_profile_id=deployment.artifact_storage_profile_id,
                    artifact_key=f"release:{release_id_map[UUID(str(deployment.source_ref))]}",
                    build_log_key=deployment.build_log_key,
                    is_active=deployment.is_active,
                    promoted_from_deployment_id=None,
                    created_by_user_id=deployment.created_by_user_id,
                )
                for deployment in source_deployments
                if UUID(str(deployment.source_ref)) in release_id_map
            ],
            using_db=conn,
        )

    @staticmethod
    def _release_id_refs(*, release_id_map: dict[UUID, UUID]) -> list[UUID]:
        return list(release_id_map)
