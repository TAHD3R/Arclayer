from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.entity_manager.manager import EntityManager
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.contracts.schema import ContentPresentationKind
from src.modules.projects.content.items.domain_helpers import (
    PresentationPayload,
    ensure_expected_version,
    extract_seo_payload,
)
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.items.transaction_commands import (
    CONTENT_ITEM_UPDATED_EVENT,
    ContentItemAfterCommitEffect,
    ContentItemTransactionResult,
)
from src.modules.tenancy.router_helpers import tenant_payload_from_context

WIREFRAME_PRESENTATION_KIND: ContentPresentationKind = "wireframe"


class ProjectContentWireframeTransactionCommand(BaseService):
    """Canonical immutable Wireframe Content Version mutation."""

    def __init__(
        self,
        *,
        repo: ProjectContentItemsRepository,
        entity_manager: EntityManager,
        organization_id: UUID | None,
    ) -> None:
        super().__init__()
        self._repo = repo
        self._entity_manager = entity_manager
        self._organization_id = organization_id

    async def replace_wireframe(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item_id: UUID,
        expected_content_version_id: UUID,
        expected_draft_version: int,
        wireframe: WireframeDocumentV1,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemTransactionResult:
        item, previous = await self._require_pinned_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            expected_content_version_id=expected_content_version_id,
            expected_draft_version=expected_draft_version,
            conn=conn,
        )
        if UUID(str(wireframe.page_item_id)) != item.id:
            raise Conflict(
                "Wireframe host does not match content item",
                error="BUILDER_WIREFRAME_INVALID",
            )
        model_key = self._model_key(item)
        presentations = self._replace_wireframe_presentation(previous=previous, wireframe=wireframe)
        component_bindings = await self._repo.list_component_bindings(version_id=previous.id, conn=conn)

        async def before_commit(
            updated_item: ContentItemRecord,
            version: ContentVersionRecord,
            transaction: BaseDBAsyncClient,
        ) -> None:
            await self._repo.update_item_fields(
                updated_item,
                fields={"updated_by_user_id": actor_user_id},
                conn=transaction,
            )
            await self._repo.replace_presentations(
                version_id=version.id,
                presentations=presentations,
                conn=transaction,
            )
            await self._repo.replace_seo_profile(
                version_id=version.id,
                payload=extract_seo_payload(presentations),
                conn=transaction,
            )
            await self._repo.replace_component_bindings(
                version_id=version.id,
                bindings=[
                    {
                        "component_key": str(binding.component_key),
                        "binding_key": str(binding.binding_key),
                        "binding_payload": cast(JsonObject | None, binding.binding_payload),
                        "sort_order": int(binding.sort_order),
                    }
                    for binding in component_bindings
                ],
                conn=transaction,
            )
            await self._write_activity(
                workspace_id=workspace_id,
                site_id=site_id,
                item=updated_item,
                model_key=model_key,
                version_number=int(version.version),
                actor_user_id=actor_user_id,
                conn=transaction,
            )

        mutation = await self._entity_manager.update_in_transaction(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
            item_id=item.id,
            data=cast(JsonObject, previous.fields_snapshot),
            actor_id=actor_user_id,
            before_commit=before_commit,
            conn=conn,
        )
        version = mutation.result.version
        return ContentItemTransactionResult(
            item_id=item.id,
            version_id=version.id,
            version_number=int(version.version),
            after_commit=ContentItemAfterCommitEffect(
                lifecycle=mutation.after_commit,
                event_name=CONTENT_ITEM_UPDATED_EVENT,
                payload={
                    "organization_id": str(self._organization_id) if self._organization_id is not None else None,
                    "workspace_id": str(workspace_id),
                    "project_id": str(project_id),
                    "runtime_id": str(runtime_id),
                    "site_id": str(site_id),
                    "environment_id": str(environment_id),
                    "activity_ingest": False,
                    "entity_type": "content_item",
                    "entity_id": str(item.id),
                    "tenant": cast(JsonValue, tenant_payload_from_context()),
                    "model_key": model_key,
                    "locale": str(item.locale),
                },
                actor_user_id=actor_user_id,
            ),
        )

    async def dispatch_after_commit(self, effect: ContentItemAfterCommitEffect) -> None:
        await self._entity_manager.dispatch_after_commit(effect.lifecycle)
        await self.publish_optional_domain_event(
            name=effect.event_name,
            payload=effect.payload,
            actor_user_id=effect.actor_user_id,
        )

    async def _require_pinned_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item_id: UUID,
        expected_content_version_id: UUID,
        expected_draft_version: int,
        conn: BaseDBAsyncClient,
    ) -> tuple[ContentItemRecord, ContentVersionRecord]:
        item = await self._repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            conn=conn,
            for_update=True,
        )
        if item is None or item.model_definition is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        current_version = int(item.draft_version or 0)
        ensure_expected_version(expected_version=expected_draft_version, current_version=current_version)
        previous = await self._repo.get_version_by_number(
            item_id=item.id,
            version_number=current_version,
            conn=conn,
            for_update=True,
        )
        if previous is None or previous.id != expected_content_version_id:
            raise Conflict("Content version is stale", error="SITE_REVISION_STALE")
        return item, previous

    async def _write_activity(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item: ContentItemRecord,
        model_key: str,
        version_number: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=CONTENT_ITEM_UPDATED_EVENT,
                organization_id=self._organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="content_item",
                entity_id=item.id,
                source="api",
                properties={
                    "workspace_id": str(workspace_id),
                    "site_id": str(site_id),
                    "content_item_id": str(item.id),
                    "model_key": model_key,
                    "locale": str(item.locale),
                    "status": str(item.status),
                    "draft_version": version_number,
                    "published_version": int(item.published_version) if item.published_version is not None else None,
                    "deleted": False,
                },
            ),
            conn=conn,
        )

    @staticmethod
    def _replace_wireframe_presentation(
        *,
        previous: ContentVersionRecord,
        wireframe: WireframeDocumentV1,
    ) -> PresentationPayload:
        presentations: PresentationPayload = [
            (cast(ContentPresentationKind, str(record.kind)), cast(JsonObject | None, record.payload))
            for record in list(getattr(previous, "presentation_documents", ()) or ())
        ]
        if sum(str(kind) == WIREFRAME_PRESENTATION_KIND for kind, _ in presentations) > 1:
            raise Conflict("Wireframe presentation set is invalid", error="BUILDER_WIREFRAME_INVALID")
        retained = [(kind, payload) for kind, payload in presentations if str(kind) != WIREFRAME_PRESENTATION_KIND]
        retained.append((
            WIREFRAME_PRESENTATION_KIND,
            cast(JsonObject, wireframe.model_dump(mode="json", by_alias=True)),
        ))
        return retained

    @staticmethod
    def _model_key(item: ContentItemRecord) -> str:
        if item.model_definition is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        return str(item.model_definition.singular_key)


__all__ = ["ProjectContentWireframeTransactionCommand"]
