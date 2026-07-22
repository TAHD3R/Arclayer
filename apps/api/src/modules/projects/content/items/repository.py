from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.content.component_binding import ComponentBindingRecord
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.models.content.translation_group import TranslationGroupRecord
from src.modules.projects.content.contracts.schema import ContentPresentationKind
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class ProjectContentItemsRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def get_model_definition_by_key(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_key: str,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentModelDefinitionRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = ContentModelDefinitionRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                singular_key=model_key,
            ).first()
            return await self.using_db(query, tenant_conn)

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
        translation_group_id: UUID | None = None,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentItemRecord:
        async with self.connection(conn) as tenant_conn:
            return await self.create_record(
                ContentItemRecord,
                conn=tenant_conn,
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=model_definition_id,
                translation_group_id=translation_group_id,
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

    async def create_translation_group(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        primary_item_id: UUID | None,
        primary_locale: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> TranslationGroupRecord:
        async with self.connection(conn) as tenant_conn:
            return await self.create_record(
                TranslationGroupRecord,
                conn=tenant_conn,
                workspace_id=workspace_id,
                site_id=site_id,
                primary_item_id=primary_item_id,
                primary_locale=primary_locale,
            )

    async def get_translation_group(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        translation_group_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> TranslationGroupRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = TranslationGroupRecord.filter(
                id=translation_group_id,
                workspace_id=workspace_id,
                site_id=site_id,
            )
            if for_update:
                query = query.select_for_update()
            return await self.using_db(query.first(), tenant_conn)

    async def ensure_translation_group_for_item(
        self,
        *,
        item: ContentItemRecord,
        conn: BaseDBAsyncClient | None = None,
    ) -> TranslationGroupRecord:
        async with self.connection(conn) as tenant_conn:
            translation_group_id = getattr(item, "translation_group_id", None)
            if translation_group_id is not None:
                group = await self.using_db(
                    TranslationGroupRecord.filter(id=translation_group_id).first(),
                    tenant_conn,
                )
                if group is not None:
                    return group

            group = await self.create_translation_group(
                workspace_id=item.workspace_id,
                site_id=item.site_id,
                primary_item_id=item.id,
                primary_locale=str(item.locale or "zh-CN"),
                conn=tenant_conn,
            )
            await self.update_fields(item, fields={"translation_group_id": group.id}, conn=tenant_conn)
            item.translation_group_id = group.id
            return group

    async def list_translation_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        translation_group_id: UUID,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentItemRecord]:
        async with self.connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                translation_group_id=translation_group_id,
            ).prefetch_related("model_definition", "model_definition__fields")
            return list(await self.using_db(query.order_by("locale", "id"), tenant_conn))

    async def list_translation_items_for_groups(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        translation_group_ids: list[UUID],
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentItemRecord]:
        if not translation_group_ids:
            return []
        async with self.connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                translation_group_id__in=translation_group_ids,
            ).prefetch_related("model_definition", "model_definition__fields")
            return list(await self.using_db(query.order_by("translation_group_id", "locale", "id"), tenant_conn))

    async def get_translation_item_by_locale(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        translation_group_id: UUID,
        locale: str,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentItemRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = (
                ContentItemRecord
                .filter(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    translation_group_id=translation_group_id,
                    locale=locale,
                )
                .prefetch_related("model_definition", "model_definition__fields")
                .first()
            )
            return await self.using_db(query, tenant_conn)

    async def count_items_for_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_definition_id: UUID,
        locale: str | None = None,
        environment_id: UUID | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        async with self.connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=model_definition_id,
            )
            if locale is not None:
                query = query.filter(locale=locale)
            return await self.using_db(query, tenant_conn).count()

    async def get_item_with_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
        environment_id: UUID | None = None,
    ) -> ContentItemRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                id=item_id,
            )
            if for_update:
                query = query.select_for_update()
            query = query.prefetch_related("model_definition", "model_definition__fields").first()
            return await self.using_db(query, tenant_conn)

    async def list_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_definition_id: UUID | None = None,
        locale: str | None = None,
        conn: BaseDBAsyncClient | None = None,
        environment_id: UUID | None = None,
    ) -> list[ContentItemRecord]:
        async with self.connection(conn) as tenant_conn:
            query = ContentItemRecord.filter(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
            )
            if model_definition_id is not None:
                query = query.filter(model_definition_id=model_definition_id)
            if locale is not None:
                query = query.filter(locale=locale)
            query = query.prefetch_related("model_definition", "model_definition__fields").order_by(
                "-updated_at", "-id"
            )
            return list(await self.using_db(query, tenant_conn))

    async def list_versions_for_items(
        self,
        *,
        item_ids: list[UUID],
        version_numbers: list[int],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentVersionRecord]:
        if not item_ids or not version_numbers:
            return []

        async with self.connection(conn) as tenant_conn:
            query = ContentVersionRecord.filter(
                item_id__in=item_ids,
                version__in=version_numbers,
            )
            return list(await self.using_db(query, tenant_conn))

    async def list_versions_for_item(
        self,
        *,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ContentVersionRecord]:
        async with self.connection(conn) as tenant_conn:
            query = (
                ContentVersionRecord
                .filter(item_id=item_id)
                .prefetch_related(
                    "item__model_definition",
                    "item__model_definition__fields",
                )
                .order_by("-version")
            )
            return list(await self.using_db(query, tenant_conn))

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
        async with self.connection(conn) as tenant_conn:
            return await self.create_record(
                ContentVersionRecord,
                conn=tenant_conn,
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
        async with self.connection(conn) as tenant_conn:
            query = ContentVersionRecord.filter(item_id=item_id, version=version_number)
            if for_update:
                query = query.select_for_update()
            query = query.prefetch_related(
                "item__model_definition",
                "item__model_definition__fields",
                "presentation_documents",
            ).first()
            return await self.using_db(query, tenant_conn)

    async def get_version_by_id_with_model(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = (
                ContentVersionRecord
                .filter(id=version_id)
                .prefetch_related(
                    "item__model_definition",
                    "item__model_definition__fields",
                    "presentation_documents",
                )
                .first()
            )
            return await self.using_db(query, tenant_conn)

    async def update_item_fields(
        self,
        item: ContentItemRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentItemRecord:
        async with self.connection(conn) as tenant_conn:
            return await self.update_fields(item, fields=fields, conn=tenant_conn)  # type: ignore[return-value]

    async def delete_item(
        self,
        *,
        item_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        async with self.connection(conn) as tenant_conn:
            return await self.delete_by_id(ContentItemRecord, item_id, conn=tenant_conn)

    async def update_version_fields(
        self,
        version: ContentVersionRecord,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionRecord:
        async with self.connection(conn) as tenant_conn:
            return await self.update_fields(version, fields=fields, conn=tenant_conn)  # type: ignore[return-value]

    async def replace_presentations(
        self,
        *,
        version_id: UUID,
        presentations: list[tuple[ContentPresentationKind, dict[str, Any] | None]],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            query = PresentationDocumentRecord.filter(version_id=version_id)
            await self.using_db(query, tenant_conn).delete()
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
            await PresentationDocumentRecord.bulk_create(rows, using_db=tenant_conn)

    async def list_presentations(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[PresentationDocumentRecord]:
        async with self.connection(conn) as tenant_conn:
            query = PresentationDocumentRecord.filter(version_id=version_id).order_by("kind")
            return list(await self.using_db(query, tenant_conn))

    async def get_seo_profile(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> SEOProfileRecord | None:
        async with self.connection(conn) as tenant_conn:
            query = SEOProfileRecord.filter(version_id=version_id).first()
            return await self.using_db(query, tenant_conn)

    async def replace_seo_profile(
        self,
        *,
        version_id: UUID,
        payload: dict[str, Any] | None,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        async with self.connection(conn) as tenant_conn:
            await self.using_db(SEOProfileRecord.filter(version_id=version_id), tenant_conn).delete()
            if payload is None:
                return

            await self.create_record(
                SEOProfileRecord,
                conn=tenant_conn,
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
        async with self.connection(conn) as tenant_conn:
            await self.using_db(ComponentBindingRecord.filter(version_id=version_id), tenant_conn).delete()
            if not bindings:
                return

            rows = [
                ComponentBindingRecord(
                    version_id=version_id,
                    component_key=str(item["component_key"]),
                    binding_key=str(item["binding_key"]),
                    binding_payload=item.get("binding_payload"),
                    sort_order=int(item.get("sort_order", index)),
                )
                for index, item in enumerate(bindings)
            ]
            await ComponentBindingRecord.bulk_create(rows, using_db=tenant_conn)

    async def list_component_bindings(
        self,
        *,
        version_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> list[ComponentBindingRecord]:
        async with self.connection(conn) as tenant_conn:
            query = ComponentBindingRecord.filter(version_id=version_id).order_by("sort_order", "id")
            return list(await self.using_db(query, tenant_conn))
