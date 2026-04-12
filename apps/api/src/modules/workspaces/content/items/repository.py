from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.repositories import BaseRepository
from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.workspaces.content.contracts.schema import ContentPresentationKind


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
        model_definition_id: UUID | None,
        slug: str,
        title: str | None,
        locale: str,
        status: str,
        visibility: str,
        bootstrap_preset_key: str | None,
        bootstrap_preset_state: str,
        capability_pack_ids: list[str],
        resolved_role: str | None,
        resolved_posture: str | None,
        resolved_surface: str | None,
        shape_state: str,
        shape_reason_code: str | None,
        shape_reason_meta: dict[str, Any] | None,
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
            bootstrap_preset_key=bootstrap_preset_key,
            bootstrap_preset_state=bootstrap_preset_state,
            capability_pack_ids=capability_pack_ids,
            resolved_role=resolved_role,
            resolved_posture=resolved_posture,
            resolved_surface=resolved_surface,
            shape_state=shape_state,
            shape_reason_code=shape_reason_code,
            shape_reason_meta=shape_reason_meta,
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

    async def list_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_definition_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentItemRecord]:
        query = ContentItemRecord.filter(workspace_id=workspace_id, site_id=site_id)
        if model_definition_id is not None:
            query = query.filter(model_definition_id=model_definition_id)
        query = query.prefetch_related("model_definition").order_by("-updated_at", "-id")
        return list(await self.using_db(query, conn))

    async def list_versions_for_items(
        self,
        *,
        item_ids: list[UUID],
        version_numbers: list[int],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentVersionRecord]:
        if not item_ids or not version_numbers:
            return []

        query = ContentVersionRecord.filter(
            item_id__in=item_ids,
            version__in=version_numbers,
        )
        return list(await self.using_db(query, conn))

    async def list_versions_for_item(
        self,
        *,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentVersionRecord]:
        query = ContentVersionRecord.filter(item_id=item_id).order_by("-version")
        return list(await self.using_db(query, conn))

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

    async def delete_item(
        self,
        *,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        return await self.delete_by_id(ContentItemRecord, item_id, conn=conn)

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

    async def get_seo_profile(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SEOProfileRecord | None:
        query = SEOProfileRecord.filter(version_id=version_id).first()
        return await self.using_db(query, conn)

    async def replace_seo_profile(
        self,
        *,
        version_id: UUID,
        payload: dict[str, Any] | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await self.using_db(SEOProfileRecord.filter(version_id=version_id), conn).delete()
        if payload is None:
            return

        await self.create(
            SEOProfileRecord,
            conn=conn,
            version_id=version_id,
            meta_title=payload.get("metaTitle"),
            meta_description=payload.get("metaDescription"),
            canonical_url=payload.get("canonicalUrl"),
            robots_directive=payload.get("robotsDirective"),
            payload=payload,
        )

    async def replace_component_bindings(
        self,
        *,
        version_id: UUID,
        bindings: list[dict[str, Any]],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        await self.using_db(ComponentBindingRecord.filter(version_id=version_id), conn).delete()
        if not bindings:
            return

        rows = [
            ComponentBindingRecord(
                version_id=version_id,
                component_key=str(item["component_key"]),
                binding_key=str(item["binding_key"]),
                binding_payload=item.get("binding_payload"),
                sort_order=index,
            )
            for index, item in enumerate(bindings)
        ]
        if conn is None:
            await ComponentBindingRecord.bulk_create(rows)
            return
        await ComponentBindingRecord.bulk_create(rows, using_db=conn)

    async def list_component_bindings(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ComponentBindingRecord]:
        query = ComponentBindingRecord.filter(version_id=version_id).order_by("sort_order", "id")
        return list(await self.using_db(query, conn))
