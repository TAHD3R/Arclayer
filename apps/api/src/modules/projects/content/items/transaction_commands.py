from __future__ import annotations

from typing import cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.types.json_types import JsonObject, JsonValue
from src.core.entity_manager.manager import EntityAfterCommitHook, EntityManager
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.content.continuation import resolve_item_continuation_truth
from src.modules.projects.content.contracts.schema import ContentPresentationKind
from src.modules.projects.content.items.domain_helpers import (
    PresentationPayload,
    ensure_expected_version,
    extract_component_bindings,
    extract_seo_payload,
)
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.tenancy.router_helpers import tenant_payload_from_context

CONTENT_ITEM_CREATED_EVENT = "content.item.created"
CONTENT_ITEM_UPDATED_EVENT = "content.item.updated"
CONTENT_ITEM_DELETED_EVENT = "content.item.deleted"


class ContentItemAfterCommitEffect(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    lifecycle: EntityAfterCommitHook
    event_name: str
    payload: JsonObject
    actor_user_id: UUID | None


class ContentItemTransactionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    item_id: UUID
    version_id: UUID | None
    version_number: int | None
    after_commit: ContentItemAfterCommitEffect


class ProjectContentItemTransactionCommands(BaseService):
    """Canonical Content mutations that participate in a caller-owned transaction."""

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

    async def create_item(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        actor_user_id: UUID,
        model_key: str,
        title: str,
        slug: str,
        locale: str,
        fields_snapshot: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> ContentItemTransactionResult:
        normalized_model_key = model_key.strip()
        model = await self._repo.get_model_definition_by_key(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=normalized_model_key,
            conn=conn,
        )
        if model is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        model_kind = str(getattr(model, "model_kind", "collection_type") or "collection_type")
        if model_kind == "component":
            raise Conflict(
                "Component models cannot create standalone content items",
                error="CONTENT_ITEM_COMPONENT_MODEL_UNSUPPORTED",
                meta={"modelKey": normalized_model_key},
            )
        if model_kind == "single_type":
            count = await self._repo.count_items_for_model(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=model.id,
                locale=locale,
                conn=conn,
            )
            if count > 0:
                raise Conflict(
                    "Single type content models can only have one content item per locale",
                    error="CONTENT_ITEM_SINGLE_TYPE_ALREADY_EXISTS",
                    meta={"modelKey": normalized_model_key, "locale": locale},
                )
        continuation = resolve_item_continuation_truth(model=model, preset_key=None, capability_pack_ids=[])

        async def before_commit(
            item: ContentItemRecord,
            version: ContentVersionRecord,
            transaction: BaseDBAsyncClient,
        ) -> None:
            await self._repo.ensure_translation_group_for_item(item=item, conn=transaction)
            await self._write_activity(
                event_name=CONTENT_ITEM_CREATED_EVENT,
                workspace_id=workspace_id,
                site_id=site_id,
                item=item,
                model_key=normalized_model_key,
                version_number=int(version.version),
                actor_user_id=actor_user_id,
                deleted=False,
                conn=transaction,
            )

        try:
            mutation = await self._entity_manager.create_in_transaction(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_key=normalized_model_key,
                data=fields_snapshot,
                slug=slug.strip(),
                title=title.strip(),
                locale=locale,
                actor_id=actor_user_id,
                resolved_role=continuation.resolved_role,
                resolved_posture=continuation.resolved_posture,
                resolved_surface=continuation.resolved_surface,
                shape_state=continuation.shape_state,
                shape_reason_code=continuation.shape_reason_code,
                shape_reason_meta=continuation.shape_reason_meta,
                before_commit=before_commit,
                conn=conn,
            )
        except IntegrityError as exc:
            raise Conflict(
                "Content item conflict",
                error="CONTENT_ITEM_CONFLICT",
                meta={"title": title, "locale": locale},
            ) from exc
        item = mutation.result.item
        version = mutation.result.version
        return ContentItemTransactionResult(
            item_id=item.id,
            version_id=version.id,
            version_number=int(version.version),
            after_commit=self._after_commit_effect(
                lifecycle=mutation.after_commit,
                event_name=CONTENT_ITEM_CREATED_EVENT,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                model_key=normalized_model_key,
                actor_user_id=actor_user_id,
            ),
        )

    async def rename_item(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item_id: UUID,
        expected_draft_version: int,
        title: str,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemTransactionResult:
        item = await self._require_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            conn=conn,
        )
        current_version = int(item.draft_version or 0)
        ensure_expected_version(expected_version=expected_draft_version, current_version=current_version)
        previous = await self._repo.get_version_by_number(
            item_id=item.id,
            version_number=current_version,
            conn=conn,
            for_update=True,
        )
        if previous is None:
            raise NotFound("Content version not found", error="CONTENT_ITEM_VERSION_NOT_FOUND")
        model_key = self._model_key(item)
        next_fields = {**cast(JsonObject, previous.fields_snapshot), "title": title.strip()}
        presentations = self._presentations(previous)

        async def before_commit(
            updated_item: ContentItemRecord,
            version: ContentVersionRecord,
            transaction: BaseDBAsyncClient,
        ) -> None:
            await self._repo.update_item_fields(
                updated_item,
                fields={"title": title.strip(), "updated_by_user_id": actor_user_id},
                conn=transaction,
            )
            await self._replace_presentations(version_id=version.id, presentations=presentations, conn=transaction)
            await self._write_activity(
                event_name=CONTENT_ITEM_UPDATED_EVENT,
                workspace_id=workspace_id,
                site_id=site_id,
                item=updated_item,
                model_key=model_key,
                version_number=int(version.version),
                actor_user_id=actor_user_id,
                deleted=False,
                conn=transaction,
            )

        mutation = await self._entity_manager.update_in_transaction(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
            item_id=item.id,
            data=next_fields,
            actor_id=actor_user_id,
            before_commit=before_commit,
            conn=conn,
        )
        version = mutation.result.version
        return ContentItemTransactionResult(
            item_id=item.id,
            version_id=version.id,
            version_number=int(version.version),
            after_commit=self._after_commit_effect(
                lifecycle=mutation.after_commit,
                event_name=CONTENT_ITEM_UPDATED_EVENT,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                model_key=model_key,
                actor_user_id=actor_user_id,
            ),
        )

    async def delete_item(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item_id: UUID,
        expected_draft_version: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemTransactionResult:
        item = await self._require_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            conn=conn,
        )
        ensure_expected_version(
            expected_version=expected_draft_version,
            current_version=int(item.draft_version or 0),
        )
        model_key = self._model_key(item)
        version_number = int(item.draft_version or 0)

        async def before_commit(
            deleted_item: ContentItemRecord,
            transaction: BaseDBAsyncClient,
        ) -> None:
            await self._write_activity(
                event_name=CONTENT_ITEM_DELETED_EVENT,
                workspace_id=workspace_id,
                site_id=site_id,
                item=deleted_item,
                model_key=model_key,
                version_number=version_number,
                actor_user_id=actor_user_id,
                deleted=True,
                conn=transaction,
            )

        mutation = await self._entity_manager.delete_in_transaction(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
            item_id=item.id,
            actor_id=actor_user_id,
            before_commit=before_commit,
            conn=conn,
        )
        if not mutation.deleted or mutation.after_commit is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        return ContentItemTransactionResult(
            item_id=item.id,
            version_id=None,
            version_number=None,
            after_commit=self._after_commit_effect(
                lifecycle=mutation.after_commit,
                event_name=CONTENT_ITEM_DELETED_EVENT,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                model_key=model_key,
                actor_user_id=actor_user_id,
                extra={"deleted": True},
            ),
        )

    async def dispatch_after_commit(self, effect: ContentItemAfterCommitEffect) -> None:
        await self._entity_manager.dispatch_after_commit(effect.lifecycle)
        await self.publish_optional_domain_event(
            name=effect.event_name,
            payload=effect.payload,
            actor_user_id=effect.actor_user_id,
        )

    async def _require_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemRecord:
        item = await self._repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            conn=conn,
            for_update=True,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        if item.model_definition is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        return item

    async def _replace_presentations(
        self,
        *,
        version_id: UUID,
        presentations: PresentationPayload,
        conn: BaseDBAsyncClient,
    ) -> None:
        await self._repo.replace_presentations(version_id=version_id, presentations=presentations, conn=conn)
        await self._repo.replace_seo_profile(
            version_id=version_id,
            payload=extract_seo_payload(presentations),
            conn=conn,
        )
        await self._repo.replace_component_bindings(
            version_id=version_id,
            bindings=extract_component_bindings(presentations),
            conn=conn,
        )

    async def _write_activity(
        self,
        *,
        event_name: str,
        workspace_id: UUID,
        site_id: UUID,
        item: ContentItemRecord,
        model_key: str,
        version_number: int,
        actor_user_id: UUID,
        deleted: bool,
        conn: BaseDBAsyncClient,
    ) -> None:
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=self._organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="content_item",
                entity_id=item.id,
                source="api",
                properties={
                    "organization_id": str(self._organization_id) if self._organization_id is not None else None,
                    "workspace_id": str(workspace_id),
                    "site_id": str(site_id),
                    "content_item_id": str(item.id),
                    "actor_user_id": str(actor_user_id),
                    "model_key": model_key,
                    "locale": str(item.locale),
                    "status": str(item.status),
                    "draft_version": version_number,
                    "published_version": int(item.published_version) if item.published_version is not None else None,
                    "deleted": deleted,
                },
            ),
            conn=conn,
        )

    @staticmethod
    def _presentations(version: ContentVersionRecord) -> PresentationPayload:
        records = list(getattr(version, "presentation_documents", ()) or ())
        return [
            (
                cast(ContentPresentationKind, str(record.kind)),
                cast(JsonObject | None, record.payload),
            )
            for record in records
        ]

    def _after_commit_effect(
        self,
        *,
        lifecycle: EntityAfterCommitHook,
        event_name: str,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
        environment_id: UUID,
        item: ContentItemRecord,
        model_key: str,
        actor_user_id: UUID,
        extra: JsonObject | None = None,
    ) -> ContentItemAfterCommitEffect:
        payload: JsonObject = {
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
            **(extra or {}),
        }
        return ContentItemAfterCommitEffect(
            lifecycle=lifecycle,
            event_name=event_name,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    @staticmethod
    def _model_key(item: ContentItemRecord) -> str:
        model = item.model_definition
        if model is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        return str(model.singular_key)


__all__ = [
    "ContentItemAfterCommitEffect",
    "ContentItemTransactionResult",
    "ProjectContentItemTransactionCommands",
]
