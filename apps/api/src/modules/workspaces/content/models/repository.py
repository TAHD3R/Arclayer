from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.repositories.base import BaseRepository
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
from src.modules.workspaces.content.contracts.schema import (
    ContentModelFieldContract,
    ContentModelRelationContract,
    ContentModelViewContract,
)


class WorkspaceContentModelsRepository(BaseRepository):
    async def list_model_definitions(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentModelDefinitionRecord]:
        qs = (
            ContentModelDefinitionRecord
            .filter(workspace_id=workspace_id, site_id=site_id)
            .prefetch_related("fields", "relations", "views")
            .order_by("name", "key")
        )
        return list(await self.using_db(qs, conn))

    async def get_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentModelDefinitionRecord | None:
        qs = (
            ContentModelDefinitionRecord
            .filter(
                workspace_id=workspace_id,
                site_id=site_id,
                id=model_id,
            )
            .prefetch_related("fields", "relations", "views")
            .first()
        )
        return await self.using_db(qs, conn)

    async def create_model_definition(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        key: str,
        name: str,
        description: str | None,
        category: str,
        default_editor: str,
        default_role: str,
        default_posture: str,
        default_surface: str,
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
    ) -> ContentModelDefinitionRecord:
        async with in_transaction() as conn:
            record = await ContentModelDefinitionRecord.create(
                workspace_id=workspace_id,
                site_id=site_id,
                key=key,
                name=name,
                description=description,
                category=category,
                default_editor=default_editor,
                default_role=default_role,
                default_posture=default_posture,
                default_surface=default_surface,
                starter_pack_policy=starter_pack_policy,
                surface_policy=surface_policy,
                kind=None,
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
                model_id=record.id,
                relations=relations,
            )
            await self._replace_views(conn=conn, model_id=record.id, views=views)
            hydrated = await self.get_model_definition(
                workspace_id=workspace_id,
                site_id=site_id,
                model_id=record.id,
                conn=conn,
            )
            if hydrated is None:
                raise RuntimeError("Created content model could not be reloaded")
            return hydrated

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
    ) -> ContentModelDefinitionRecord | None:
        async with in_transaction() as conn:
            record = await (
                ContentModelDefinitionRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
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
                    model_id=model_id,
                    relations=relations,
                )
            if views is not None:
                await self._replace_views(conn=conn, model_id=model_id, views=views)

            return await self.get_model_definition(
                workspace_id=workspace_id,
                site_id=site_id,
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
    ) -> list[ContentItemRecord]:
        qs = ContentItemRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            model_definition_id=model_id,
        ).order_by("id")
        return list(await self.using_db(qs, conn))

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
        target_keys: list[str],
    ) -> dict[str, UUID]:
        unique_keys = sorted({key for key in target_keys if key})
        if not unique_keys:
            return {}

        rows = await (
            ContentModelDefinitionRecord
            .filter(
                workspace_id=workspace_id,
                site_id=site_id,
                key__in=unique_keys,
            )
            .using_db(conn)
            .values("id", "key")
        )
        return {str(item["key"]): UUID(str(item["id"])) for item in rows}
