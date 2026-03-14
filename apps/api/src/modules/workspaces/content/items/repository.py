from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from apps.api.src.common.repositories.base import BaseRepository
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.presentation_document import PresentationDocumentRecord
from apps.api.src.modules.workspaces.content.contracts.schema import ContentPresentationKind


class WorkspaceContentItemsRepository(BaseRepository):
    async def get_model_definition_by_key(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentModelDefinitionRecord | None:
        query = ContentModelDefinitionRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            key=model_key,
        ).first()
        return await self.using_db(query, conn)

    async def create_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_definition_id: UUID,
        slug: str,
        title: str | None,
        locale: str,
        status: str,
        visibility: str,
        actor_user_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentItemRecord:
        return await self.create(
            ContentItemRecord,
            conn=conn,
            workspace_id=workspace_id,
            site_id=site_id,
            model_definition_id=model_definition_id,
            slug=slug,
            title=title,
            locale=locale,
            status=status,
            visibility=visibility,
            draft_version=0,
            published_version=None,
            created_by_user_id=actor_user_id,
            updated_by_user_id=actor_user_id,
        )

    async def get_item_with_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> ContentItemRecord | None:
        query = ContentItemRecord.filter(
            workspace_id=workspace_id,
            site_id=site_id,
            id=item_id,
        )
        if for_update:
            query = query.select_for_update()
        query = query.prefetch_related("model_definition").first()
        return await self.using_db(query, conn)

    async def create_version(
        self,
        *,
        item_id: UUID,
        version: int,
        state: str,
        fields_snapshot: dict[str, Any],
        change_summary: str | None,
        actor_user_id: UUID | None,
        last_transition_by_user_id: UUID | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionRecord:
        return await self.create(
            ContentVersionRecord,
            conn=conn,
            item_id=item_id,
            version=version,
            state=state,
            fields_snapshot=fields_snapshot,
            change_summary=change_summary,
            created_by_user_id=actor_user_id,
            last_transition_by_user_id=last_transition_by_user_id,
        )

    async def get_version_by_number(
        self,
        *,
        item_id: UUID,
        version_number: int,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> ContentVersionRecord | None:
        query = ContentVersionRecord.filter(item_id=item_id, version=version_number)
        if for_update:
            query = query.select_for_update()
        query = query.prefetch_related("presentation_documents").first()
        return await self.using_db(query, conn)

    async def update_item_fields(
        self,
        item: ContentItemRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentItemRecord:
        return await self.update_fields(item, fields=fields, conn=conn)  # type: ignore[return-value]

    async def update_version_fields(
        self,
        version: ContentVersionRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionRecord:
        return await self.update_fields(version, fields=fields, conn=conn)  # type: ignore[return-value]

    async def replace_presentations(
        self,
        *,
        version_id: UUID,
        presentations: list[tuple[ContentPresentationKind, dict[str, Any] | None]],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        query = PresentationDocumentRecord.filter(version_id=version_id)
        await self.using_db(query, conn).delete()
        if not presentations:
            return

        rows = [
            PresentationDocumentRecord(
                version_id=version_id,
                kind=kind,
                payload=payload,
            )
            for kind, payload in presentations
        ]
        if conn is None:
            await PresentationDocumentRecord.bulk_create(rows)
            return
        await PresentationDocumentRecord.bulk_create(rows, using_db=conn)

    async def list_presentations(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[PresentationDocumentRecord]:
        query = PresentationDocumentRecord.filter(version_id=version_id).order_by("kind")
        return list(await self.using_db(query, conn))
