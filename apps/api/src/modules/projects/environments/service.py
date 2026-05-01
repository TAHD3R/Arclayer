from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id, is_public_id
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
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
from src.models.projects.environment import (
    PROJECT_ENVIRONMENT_SPECS,
    ProjectEnvironmentAliasRecord,
    ProjectEnvironmentKey,
    ProjectEnvironmentRecord,
)
from src.modules.projects.environments.schema import (
    ProjectEnvironmentAliasOut,
    ProjectEnvironmentAliasSwitchIn,
    ProjectEnvironmentCloneIn,
    ProjectEnvironmentCopyOut,
    ProjectEnvironmentListOut,
    ProjectEnvironmentOut,
    ProjectEnvironmentPatchIn,
    ProjectEnvironmentPromoteIn,
)
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.router_helpers import current_tenant_context_or_none
from src.modules.tenancy.schema import TenantContext


def _te(key: str) -> str:
    return t("errors", key)


@dataclass(frozen=True, slots=True)
class _EnvironmentCopyCounts:
    content_models: int = 0
    content_items: int = 0
    content_versions: int = 0
    route_bindings: int = 0
    releases: int = 0


class ProjectEnvironmentsService:
    def __init__(
        self,
        tenant_context: TenantContext | None = None,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        self._tenant_context = tenant_context
        self._conn = conn

    def _current_tenant_context(self) -> TenantContext | None:
        return self._tenant_context or current_tenant_context_or_none()

    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    @asynccontextmanager
    async def _operation_connection(self) -> AsyncIterator[BaseDBAsyncClient | None]:
        if self._conn is not None:
            yield self._conn
            return
        context = self._current_tenant_context()
        if context is None:
            yield None
            return
        async with TenantDatabaseRouter(context).connection() as conn:
            yield conn

    @asynccontextmanager
    async def _transaction_connection(self) -> AsyncIterator[BaseDBAsyncClient]:
        if self._conn is not None:
            yield self._conn
            return
        context = self._current_tenant_context()
        if context is not None:
            async with TenantDatabaseRouter(context).connection() as conn:
                yield conn
            return
        async with in_transaction() as conn:
            yield conn

    async def list_environments_out(self, *, project_id: UUID) -> ProjectEnvironmentListOut:
        rows = await self._list_environments(project_id=project_id)
        aliases = await self._list_aliases(project_id=project_id)
        return ProjectEnvironmentListOut(
            items=[self._environment_out(row) for row in rows],
            aliases=[self._alias_out(row) for row in aliases],
        )

    async def patch_environment_out(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        payload: ProjectEnvironmentPatchIn,
    ) -> ProjectEnvironmentOut:
        async with self._operation_connection() as conn:
            row = await self._using_db(
                ProjectEnvironmentRecord.filter(id=environment_id, project_id=project_id),
                conn,
            ).first()
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

        normalized_name = payload.name.strip() if payload.name is not None else None
        if normalized_name == "":
            raise BadRequest(_te("PROJECT_ENVIRONMENT_NAME_REQUIRED"), error="PROJECT_ENVIRONMENT_NAME_REQUIRED")

        async with self._transaction_connection() as conn:
            current = (
                await ProjectEnvironmentRecord.filter(id=environment_id, project_id=project_id).using_db(conn).first()
            )
            if current is None:
                raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

            update_fields: list[str] = []
            if normalized_name is not None:
                current.name = normalized_name
                update_fields.append("name")

            if (
                payload.is_default_preview is not None
                and bool(current.is_default_preview) != payload.is_default_preview
            ):
                if payload.is_default_preview:
                    await (
                        ProjectEnvironmentRecord
                        .filter(project_id=project_id, is_default_preview=True)
                        .using_db(conn)
                        .update(is_default_preview=False)
                    )
                current.is_default_preview = payload.is_default_preview
                update_fields.append("is_default_preview")

            if update_fields:
                await current.save(using_db=conn, update_fields=[*dict.fromkeys([*update_fields, "updated_at"])])

        async with self._operation_connection() as conn:
            refreshed = await self._using_db(ProjectEnvironmentRecord.filter(id=environment_id), conn).first()
        if refreshed is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return self._environment_out(refreshed)

    async def get_environment_by_key(self, *, project_id: UUID, key: ProjectEnvironmentKey) -> ProjectEnvironmentRecord:
        async with self._operation_connection() as conn:
            row = await self._using_db(
                ProjectEnvironmentRecord.filter(project_id=project_id, key=key),
                conn,
            ).first()
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return row

    async def resolve_environment_target(
        self,
        *,
        project_id: UUID,
        target: str | UUID | None,
        default_key: ProjectEnvironmentKey = ProjectEnvironmentKey.PRODUCTION,
    ) -> ProjectEnvironmentRecord:
        normalized = str(target or "").strip()
        if not normalized:
            return await self.get_environment_by_key(project_id=project_id, key=default_key)

        async with self._operation_connection() as conn:
            query = ProjectEnvironmentRecord.filter(project_id=project_id)
            target_id = self._target_uuid(normalized)
            if target_id is not None:
                environment = await self._using_db(query.filter(id=target_id), conn).first()
                if environment is not None:
                    return environment

            try:
                environment_key = ProjectEnvironmentKey(normalized)
            except ValueError:
                environment_key = None
            if environment_key is not None:
                environment = await self._using_db(query.filter(key=environment_key), conn).first()
                if environment is not None:
                    return environment

            alias = await self._using_db(
                ProjectEnvironmentAliasRecord.filter(project_id=project_id, key=normalized).prefetch_related(
                    "target_environment"
                ),
                conn,
            ).first()
            if alias is not None:
                return alias.target_environment

        raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

    @staticmethod
    def _target_uuid(target: str) -> UUID | None:
        if is_public_id(target):
            try:
                return decode_public_id(target)
            except PublicIdDecodeError:
                return None
        try:
            return UUID(target)
        except ValueError:
            return None

    async def switch_alias_out(
        self,
        *,
        project_id: UUID,
        alias_key: str,
        payload: ProjectEnvironmentAliasSwitchIn,
        actor_user_id: UUID | None,
    ) -> ProjectEnvironmentAliasOut:
        normalized_alias = alias_key.strip()
        if not normalized_alias:
            raise BadRequest(_te("PROJECT_ENVIRONMENT_ALIAS_REQUIRED"), error="PROJECT_ENVIRONMENT_ALIAS_REQUIRED")

        if payload.target_environment_id is not None:
            target = await self.resolve_environment_target(project_id=project_id, target=payload.target_environment_id)
        elif payload.target_environment_key is not None:
            target = await self.resolve_environment_target(project_id=project_id, target=payload.target_environment_key)
        else:
            raise BadRequest(
                _te("PROJECT_ENVIRONMENT_ALIAS_TARGET_REQUIRED"),
                error="PROJECT_ENVIRONMENT_ALIAS_TARGET_REQUIRED",
            )

        async with self._transaction_connection() as conn:
            alias = (
                await ProjectEnvironmentAliasRecord
                .filter(project_id=project_id, key=normalized_alias)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if alias is None:
                raise NotFound(_te("PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND"), error="PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND")
            alias.target_environment_id = target.id
            alias.switched_by_user_id = actor_user_id
            alias.switched_at = datetime.now(UTC)
            await alias.save(
                using_db=conn,
                update_fields=["target_environment_id", "switched_by_user_id", "switched_at", "updated_at"],
            )

        aliases = await self._list_aliases(project_id=project_id)
        for item in aliases:
            if str(item.key) == normalized_alias:
                return self._alias_out(item)
        raise NotFound(_te("PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND"), error="PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND")

    async def clone_environment_out(
        self,
        *,
        project_id: UUID,
        payload: ProjectEnvironmentCloneIn,
    ) -> ProjectEnvironmentCopyOut:
        source = await self.resolve_environment_target(project_id=project_id, target=payload.source)
        target = await self.resolve_environment_target(project_id=project_id, target=payload.target)
        counts = await self._copy_environment(
            project_id=project_id,
            source_environment_id=source.id,
            target_environment_id=target.id,
            include_content=payload.include_content,
            require_empty_target=True,
        )
        return ProjectEnvironmentCopyOut.model_validate({
            "source_environment_id": source.id,
            "target_environment_id": target.id,
            "content_models": counts.content_models,
            "content_items": counts.content_items,
            "content_versions": counts.content_versions,
            "route_bindings": counts.route_bindings,
            "releases": counts.releases,
        })

    async def promote_environment_out(
        self,
        *,
        project_id: UUID,
        payload: ProjectEnvironmentPromoteIn,
    ) -> ProjectEnvironmentCopyOut:
        source = await self.resolve_environment_target(project_id=project_id, target=payload.source)
        target = await self.resolve_environment_target(project_id=project_id, target=payload.target)
        counts = await self._copy_environment(
            project_id=project_id,
            source_environment_id=source.id,
            target_environment_id=target.id,
            include_content=payload.include_content,
            require_empty_target=False,
        )
        return ProjectEnvironmentCopyOut.model_validate({
            "source_environment_id": source.id,
            "target_environment_id": target.id,
            "content_models": counts.content_models,
            "content_items": counts.content_items,
            "content_versions": counts.content_versions,
            "route_bindings": counts.route_bindings,
            "releases": counts.releases,
        })

    async def get_default_preview_environment(self, *, project_id: UUID) -> ProjectEnvironmentRecord:
        async with self._operation_connection() as conn:
            row = (
                await self
                ._using_db(
                    ProjectEnvironmentRecord.filter(project_id=project_id, is_default_preview=True),
                    conn,
                )
                .order_by("created_at", "id")
                .first()
            )
        if row is not None:
            return row
        return await self.get_environment_by_key(project_id=project_id, key=ProjectEnvironmentKey.DEVELOPMENT)

    async def _list_environments(self, *, project_id: UUID) -> list[ProjectEnvironmentRecord]:
        async with self._operation_connection() as conn:
            rows = await self._using_db(ProjectEnvironmentRecord.filter(project_id=project_id), conn).all()
        order = {key.value: index for index, (key, *_rest) in enumerate(PROJECT_ENVIRONMENT_SPECS)}
        return sorted(rows, key=lambda row: (order.get(str(row.key), 999), row.created_at, row.id))

    async def _list_aliases(self, *, project_id: UUID) -> list[ProjectEnvironmentAliasRecord]:
        async with self._operation_connection() as conn:
            rows = await self._using_db(
                ProjectEnvironmentAliasRecord
                .filter(project_id=project_id)
                .prefetch_related("target_environment")
                .order_by("key", "id"),
                conn,
            ).all()
        return list(rows)

    @staticmethod
    def _environment_out(record: ProjectEnvironmentRecord) -> ProjectEnvironmentOut:
        return ProjectEnvironmentOut.model_validate({
            "id": record.id,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "project_id": record.project_id,
            "key": str(record.key),
            "name": str(record.name),
            "is_production": bool(record.is_production),
            "is_default_preview": bool(record.is_default_preview),
            "created_by_user_id": record.created_by_user_id,
        })

    @staticmethod
    def _alias_out(record: ProjectEnvironmentAliasRecord) -> ProjectEnvironmentAliasOut:
        target = record.target_environment
        return ProjectEnvironmentAliasOut.model_validate({
            "id": record.id,
            "project_id": record.project_id,
            "key": str(record.key),
            "name": str(record.name),
            "target_environment_id": target.id,
            "target_environment_key": str(target.key),
            "target_environment_name": str(target.name),
            "created_by_user_id": record.created_by_user_id,
            "switched_by_user_id": record.switched_by_user_id,
            "switched_at": record.switched_at,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        })

    async def _copy_environment(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        include_content: bool,
        require_empty_target: bool,
    ) -> _EnvironmentCopyCounts:
        if source_environment_id == target_environment_id:
            raise Conflict(
                "Source and target environments must be different",
                error="PROJECT_ENVIRONMENT_COPY_TARGET_REQUIRED",
            )

        async with self._transaction_connection() as conn:
            target_models = await (
                ContentModelDefinitionRecord.filter(environment_id=target_environment_id).using_db(conn).count()
            )
            target_items = await ContentItemRecord.filter(environment_id=target_environment_id).using_db(conn).count()
            if require_empty_target and (target_models > 0 or target_items > 0):
                raise Conflict(
                    "Target environment already contains content",
                    error="PROJECT_ENVIRONMENT_TARGET_NOT_EMPTY",
                    meta={"contentModels": target_models, "contentItems": target_items},
                )
            await self._clear_environment_content(target_environment_id=target_environment_id, conn=conn)
            try:
                return await self._copy_environment_content(
                    project_id=project_id,
                    source_environment_id=source_environment_id,
                    target_environment_id=target_environment_id,
                    include_content=include_content,
                    conn=conn,
                )
            except IntegrityError as exc:
                raise Conflict(
                    "Environment copy failed because target records conflict",
                    error="PROJECT_ENVIRONMENT_COPY_CONFLICT",
                ) from exc

    async def _clear_environment_content(
        self,
        *,
        target_environment_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        target_model_ids = [
            UUID(str(value))
            for value in await ContentModelDefinitionRecord
            .filter(environment_id=target_environment_id)
            .using_db(conn)
            .values_list("id", flat=True)
        ]
        if target_model_ids:
            target_item_ids = [
                UUID(str(value))
                for value in await ContentItemRecord
                .filter(model_definition_id__in=target_model_ids)
                .using_db(conn)
                .values_list("id", flat=True)
            ]
            if target_item_ids:
                release_ids = [
                    UUID(str(value))
                    for value in await ContentReleaseRecord
                    .filter(graph_nodes__item_id__in=target_item_ids)
                    .using_db(conn)
                    .distinct()
                    .values_list("id", flat=True)
                ]
                if release_ids:
                    await PublishedGraphRecord.filter(release_id__in=release_ids).using_db(conn).delete()
                    await (
                        ProjectDeploymentRecord
                        .filter(
                            environment_id=target_environment_id,
                            source_type=ProjectDeploymentSourceType.CMS_RUNTIME,
                            source_ref__in=[str(value) for value in release_ids],
                        )
                        .using_db(conn)
                        .delete()
                    )
                    await ContentReleaseRecord.filter(id__in=release_ids).using_db(conn).delete()
                await RouteBindingRecord.filter(item_id__in=target_item_ids).using_db(conn).delete()
                await ContentVersionRecord.filter(item_id__in=target_item_ids).using_db(conn).delete()
                await ContentItemRecord.filter(id__in=target_item_ids).using_db(conn).delete()
            await ContentModelFieldRecord.filter(model_definition_id__in=target_model_ids).using_db(conn).delete()
            await ContentModelRelationRecord.filter(model_definition_id__in=target_model_ids).using_db(conn).delete()
            await ContentModelViewRecord.filter(model_definition_id__in=target_model_ids).using_db(conn).delete()
            await ContentModelDefinitionRecord.filter(id__in=target_model_ids).using_db(conn).delete()

    async def _copy_environment_content(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        include_content: bool,
        conn: BaseDBAsyncClient,
    ) -> _EnvironmentCopyCounts:
        source_models = list(
            await ContentModelDefinitionRecord
            .filter(environment_id=source_environment_id)
            .prefetch_related("fields", "relations", "views")
            .using_db(conn)
            .order_by("singular_key", "id")
            .all()
        )
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

        item_count = 0
        version_count = 0
        route_binding_count = 0
        release_count = 0
        if include_content:
            item_id_map, version_id_map, item_count, version_count = await self._copy_environment_items(
                source_environment_id=source_environment_id,
                target_environment_id=target_environment_id,
                model_id_map=model_id_map,
                conn=conn,
            )
            route_binding_count = await self._copy_environment_route_bindings(
                source_environment_id=source_environment_id,
                target_environment_id=target_environment_id,
                item_id_map=item_id_map,
                conn=conn,
            )
            release_count = await self._copy_environment_releases(
                project_id=project_id,
                source_environment_id=source_environment_id,
                target_environment_id=target_environment_id,
                item_id_map=item_id_map,
                version_id_map=version_id_map,
                conn=conn,
            )

        return _EnvironmentCopyCounts(
            content_models=len(source_models),
            content_items=item_count,
            content_versions=version_count,
            route_bindings=route_binding_count,
            releases=release_count,
        )

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
            await ContentItemRecord
            .filter(environment_id=source_environment_id)
            .using_db(conn)
            .order_by("model_definition_id", "locale", "slug", "id")
            .all()
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

        source_versions = list(
            await ContentVersionRecord
            .filter(item_id__in=list(item_id_map))
            .using_db(conn)
            .order_by("item_id", "version", "id")
            .all()
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
        return item_id_map, version_id_map, len(source_items), len(version_id_map)

    async def _copy_environment_route_bindings(
        self,
        *,
        source_environment_id: UUID,
        target_environment_id: UUID,
        item_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> int:
        source_bindings = list(
            await RouteBindingRecord
            .filter(environment_id=source_environment_id, item_id__in=list(item_id_map))
            .using_db(conn)
            .order_by("locale", "path", "item_id", "id")
            .all()
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
        source_release_ids = [
            UUID(str(value))
            for value in await PublishedGraphRecord
            .filter(item__environment_id=source_environment_id, item_id__in=list(item_id_map))
            .using_db(conn)
            .distinct()
            .values_list("release_id", flat=True)
        ]
        if not source_release_ids:
            return 0

        source_releases = list(
            await ContentReleaseRecord
            .filter(id__in=source_release_ids)
            .using_db(conn)
            .order_by("release_number", "id")
            .all()
        )
        release_id_map: dict[UUID, UUID] = {}
        release_number_offset = await self._next_release_number_offset(
            source_releases=source_releases,
            conn=conn,
        )
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

        source_nodes = list(
            await PublishedGraphRecord
            .filter(release_id__in=source_release_ids, item_id__in=list(item_id_map))
            .using_db(conn)
            .order_by("release_id", "locale", "route_path", "item_id", "id")
            .all()
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
        await self._copy_environment_deployments(
            project_id=project_id,
            source_environment_id=source_environment_id,
            target_environment_id=target_environment_id,
            release_id_map=release_id_map,
            conn=conn,
        )
        return len(source_releases)

    async def _next_release_number_offset(
        self,
        *,
        source_releases: list[ContentReleaseRecord],
        conn: BaseDBAsyncClient,
    ) -> int:
        if not source_releases:
            return 0
        site_id = source_releases[0].site_id
        latest = await ContentReleaseRecord.filter(site_id=site_id).using_db(conn).order_by("-release_number").first()
        return int(latest.release_number) if latest is not None else 0

    async def _copy_environment_deployments(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        release_id_map: dict[UUID, UUID],
        conn: BaseDBAsyncClient,
    ) -> None:
        source_refs = self._release_id_refs(source_environment_id=source_environment_id, release_id_map=release_id_map)
        source_deployments = list(
            await ProjectDeploymentRecord
            .filter(
                project_id=project_id,
                environment_id=source_environment_id,
                source_type=ProjectDeploymentSourceType.CMS_RUNTIME,
                source_ref__in=[str(value) for value in source_refs],
            )
            .using_db(conn)
            .order_by("created_at", "id")
            .all()
        )
        if not source_deployments:
            return
        await (
            ProjectDeploymentRecord
            .filter(
                project_id=project_id,
                environment_id=target_environment_id,
                is_active=True,
            )
            .using_db(conn)
            .update(is_active=False)
        )
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
    def _release_id_refs(
        *,
        source_environment_id: UUID,
        release_id_map: dict[UUID, UUID],
    ) -> list[UUID]:
        return list(release_id_map)
