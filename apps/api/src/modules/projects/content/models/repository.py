from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q

from src.models.content._enums import (
    ContentModelFieldType,
    ContentModelRelationType,
    ContentModelViewType,
)
from src.models.content.content_item import ContentItemRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.modules.projects.content.contracts.schema import (
    ContentModelFieldContract,
    ContentModelRelationContract,
    ContentModelViewContract,
)
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class ProjectContentModelsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_model_definitions(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        q: str | None = None,
        environment_id: UUID | None = None,
        category: str | None = None,
        model_kind: str | None = None,
        system_managed: bool | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentModelDefinitionRecord]:
        async with self.connection(conn) as tenant_conn:
            qs = (
                ContentModelDefinitionRecord
                .filter(workspace_id=workspace_id, site_id=site_id, environment_id=environment_id)
                .prefetch_related("fields", "relations", "views")
                .order_by("name", "singular_key")
            )
            search = (q or "").strip()
            if search:
                qs = qs.filter(
                    Q(name__icontains=search)
                    | Q(description__icontains=search)
                    | Q(singular_key__icontains=search)
                    | Q(plural_key__icontains=search)
                )
            if category:
                qs = qs.filter(category=category)
            if model_kind:
                qs = qs.filter(model_kind=model_kind)
            if system_managed is not None:
                qs = qs.filter(is_system_managed=system_managed)
            return list(await self.using_db(qs, tenant_conn))

    async def get_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentModelDefinitionRecord | None:
        async with self.connection(conn) as tenant_conn:
            qs = (
                ContentModelDefinitionRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    id=model_id,
                )
                .prefetch_related("fields", "relations", "views")
                .first()
            )
            return await self.using_db(qs, tenant_conn)

    async def create_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        singular_key: str,
        plural_key: str,
        name: str,
        description: str | None,
        category: str,
        model_kind: str,
        default_editor: str,
        default_role: str,
        default_posture: str,
        default_surface: str,
        protocol_key: str | None,
        protocol_version: int,
        is_system_managed: bool,
        system_field_keys: list[str],
        draft_contract_revision: int,
        published_contract_revision: int | None,
        published_contract_snapshot: dict[str, Any] | None,
        updated_by_user_id: UUID | None,
        capabilities: list[str],
        routing_policy: dict[str, Any] | None,
        presentation_policy: dict[str, Any] | None,
        seo_policy: dict[str, Any] | None,
        starter_pack_policy: dict[str, Any] | None,
        surface_policy: dict[str, Any] | None,
        workflow_policy: dict[str, Any] | None,
        fields: list[ContentModelFieldContract],
        relations: list[ContentModelRelationContract],
        views: list[ContentModelViewContract],
        environment_id: UUID | None = None,
    ) -> ContentModelDefinitionRecord:
        async with self.connection() as conn:
            record = await ContentModelDefinitionRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                singular_key=singular_key,
                plural_key=plural_key,
                name=name,
                description=description,
                category=category,
                model_kind=model_kind,
                default_editor=default_editor,
                default_role=default_role,
                default_posture=default_posture,
                default_surface=default_surface,
                protocol_key=protocol_key,
                protocol_version=protocol_version,
                is_system_managed=is_system_managed,
                system_field_keys=system_field_keys,
                draft_contract_revision=draft_contract_revision,
                published_contract_revision=published_contract_revision,
                published_contract_snapshot=published_contract_snapshot,
                updated_by_user_id=updated_by_user_id,
                starter_pack_policy=starter_pack_policy,
                surface_policy=surface_policy,
                capabilities=capabilities,
                routing_policy=routing_policy,
                presentation_policy=presentation_policy,
                seo_policy=seo_policy,
                workflow_policy=workflow_policy,
                using_db=conn,
            )
            await self._replace_fields(conn=conn, model_id=record.id, fields=fields)
            await self._replace_relations(
                conn=conn,
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_id=record.id,
                relations=relations,
            )
            await self._replace_views(conn=conn, model_id=record.id, views=views)
            hydrated = await self.get_model_definition(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_id=record.id,
                conn=conn,
            )
            if hydrated is None:
                raise RuntimeError("Created content model could not be reloaded")
            return hydrated

    async def identifier_exists(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        value: str,
        exclude_model_id: UUID | None = None,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> bool:
        async with self.connection(conn) as tenant_conn:
            qs = ContentModelDefinitionRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
            ).filter(Q(singular_key=value) | Q(plural_key=value))
            if exclude_model_id is not None:
                qs = qs.exclude(id=exclude_model_id)
            return await self.using_db(qs, tenant_conn).exists()

    async def update_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        fields_to_update: dict[str, Any],
        fields: list[ContentModelFieldContract] | None,
        relations: list[ContentModelRelationContract] | None,
        views: list[ContentModelViewContract] | None,
        environment_id: UUID | None = None,
    ) -> ContentModelDefinitionRecord | None:
        async with self.connection() as conn:
            record = await (
                ContentModelDefinitionRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    id=model_id,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                return None

            if fields_to_update:
                for key, value in fields_to_update.items():
                    setattr(record, key, value)
                await record.save(update_fields=list(fields_to_update.keys()), using_db=conn)

            if fields is not None:
                await self._replace_fields(conn=conn, model_id=model_id, fields=fields)
            if relations is not None:
                await self._replace_relations(
                    conn=conn,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    model_id=model_id,
                    relations=relations,
                )
            if views is not None:
                await self._replace_views(conn=conn, model_id=model_id, views=views)

            return await self.get_model_definition(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_id=model_id,
                conn=conn,
            )

    async def list_items_for_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        environment_id: UUID | None = None,
    ) -> list[ContentItemRecord]:
        async with self.connection(conn) as tenant_conn:
            qs = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=model_id,
            ).order_by("id")
            return list(await self.using_db(qs, tenant_conn))

    async def delete_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        environment_id: UUID | None = None,
    ) -> bool:
        async with self.connection() as conn:
            record = await (
                ContentModelDefinitionRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    id=model_id,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if record is None:
                return False

            await ContentModelFieldRecord.filter(model_definition_id=model_id).using_db(conn).delete()
            await ContentModelRelationRecord.filter(model_definition_id=model_id).using_db(conn).delete()
            await ContentModelViewRecord.filter(model_definition_id=model_id).using_db(conn).delete()
            await ContentModelDefinitionRecord.filter(id=model_id).using_db(conn).delete()
            return True

    async def _replace_fields(
        self,
        *,
        conn: BaseDBAsyncClient,
        model_id: UUID,
        fields: list[ContentModelFieldContract],
    ) -> None:
        await ContentModelFieldRecord.filter(model_definition_id=model_id).using_db(conn).delete()
        if not fields:
            return

        rows = [
            ContentModelFieldRecord(
                model_definition_id=model_id,
                key=item.key,
                label=item.label,
                field_type=ContentModelFieldType(item.scalar),
                is_required=item.required,
                default_value=None,
                config=item.config,
                sort_order=index,
            )
            for index, item in enumerate(fields)
        ]
        await ContentModelFieldRecord.bulk_create(rows, using_db=conn)

    async def _replace_relations(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        model_id: UUID,
        relations: list[ContentModelRelationContract],
    ) -> None:
        await ContentModelRelationRecord.filter(model_definition_id=model_id).using_db(conn).delete()
        if not relations:
            return

        target_key_to_id = await self._target_model_ids(
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            target_keys=[item.target_model_key for item in relations],
        )
        rows = [
            ContentModelRelationRecord(
                model_definition_id=model_id,
                target_model_definition_id=target_key_to_id.get(item.target_model_key),
                target_model_key=item.target_model_key,
                key=item.key,
                relation_type=ContentModelRelationType(item.relation),
                is_required=item.required,
                config=item.config,
                sort_order=index,
            )
            for index, item in enumerate(relations)
        ]
        await ContentModelRelationRecord.bulk_create(rows, using_db=conn)

    async def _replace_views(
        self,
        *,
        conn: BaseDBAsyncClient,
        model_id: UUID,
        views: list[ContentModelViewContract],
    ) -> None:
        await ContentModelViewRecord.filter(model_definition_id=model_id).using_db(conn).delete()
        if not views:
            return

        rows = [
            ContentModelViewRecord(
                model_definition_id=model_id,
                key=item.key,
                label=item.label,
                view_type=ContentModelViewType(item.type),
                dsl=item.config,
                is_enabled=True,
                sort_order=index,
            )
            for index, item in enumerate(views)
        ]
        await ContentModelViewRecord.bulk_create(rows, using_db=conn)

    async def _target_model_ids(
        self,
        *,
        conn: BaseDBAsyncClient,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        target_keys: list[str],
    ) -> dict[str, UUID]:
        unique_keys = sorted({key for key in target_keys if key})
        if not unique_keys:
            return {}

        # Relation targets use the target model's singular API identifier.
        rows = await (
            ContentModelDefinitionRecord
            .filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                singular_key__in=unique_keys,
            )
            .using_db(conn)
            .values("id", "singular_key")
        )
        return {str(item["singular_key"]): UUID(str(item["id"])) for item in rows}
