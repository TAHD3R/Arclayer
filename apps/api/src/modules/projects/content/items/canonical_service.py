from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.types.json_types import JsonObject
from src.core.entity_manager.manager import EntityManager
from src.core.exceptions import Conflict, NotFound
from src.core.services import BaseService
from src.models.content._enums import (
    ContentItemStatus,
    ContentItemVisibility,
    ContentVersionState,
    ContentWorkflowStage,
)
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.content.continuation import resolve_item_continuation_truth
from src.modules.projects.content.contracts.schema import (
    ContentItemBulkTransitionOut,
    ContentItemOut,
    ContentPresentationKind,
    ContentTranslationGroupOut,
    ContentTranslationStatusOut,
    ContentVersionCompareChangeOut,
    ContentVersionCompareOut,
    ContentVersionOut,
)
from src.modules.projects.content.items.domain_helpers import (
    VERSION_TRANSITIONS,
    PresentationPayload,
    build_duplicate_item_title,
    build_formless_draft_slug,
    build_patch_item_fields,
    build_patch_version_fields,
    build_workflow_patch_fields,
    derive_item_publish_blocker_codes,
    ensure_expected_version,
    extract_component_bindings,
    extract_seo_payload,
    item_fields_for_transition,
    item_has_capability,
    normalize_bootstrap_shape,
    normalize_capability_pack_ids,
    normalize_initial_status,
    normalize_presentations,
    normalize_visibility,
    status_by_published_version,
    to_item_out,
    validate_version_publish_contract,
)
from src.modules.projects.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentItemWorkflowPatchIn,
    ContentTranslationCreateIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from src.modules.projects.content.items.password_fields import (
    carry_forward_missing_password_field_values,
    hash_password_field_values,
    password_field_keys,
    sanitize_password_presentations,
)
from src.modules.projects.content.items.read_service import (
    ProjectContentCanonicalItemReadService,
)
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.items.workflow_policy import (
    resolve_workflow_actor,
    resolve_workflow_policy,
    validate_workflow_transition,
)
from src.modules.projects.content.routing.schema import RouteBindingUpsertIn
from src.modules.projects.content.routing.service import (
    resolve_duplicate_route_path,
    set_route_bindings_active_for_item,
    upsert_route_binding_record,
)
from src.modules.tenancy.router_helpers import tenant_payload_from_context

CONTENT_ITEM_CREATED_EVENT = "content.item.created"
CONTENT_ITEM_UPDATED_EVENT = "content.item.updated"
CONTENT_ITEM_DELETED_EVENT = "content.item.deleted"
CONTENT_ITEM_PUBLISHED_EVENT = "content.item.published"
CONTENT_ITEM_UNPUBLISHED_EVENT = "content.item.unpublished"
CONTENT_ITEM_RESTORED_EVENT = "content.item.restored"

CONTENT_RUNTIME_ITEM_ARCHIVED_EVENT = "project.content.item.archived"
CONTENT_RUNTIME_ITEM_BOOTSTRAP_APPLIED_EVENT = "project.content.item.bootstrap.applied"
CONTENT_RUNTIME_ITEM_DUPLICATED_EVENT = "project.content.item.duplicated"
CONTENT_RUNTIME_ITEM_TRANSLATION_CREATED_EVENT = "project.content.item.translation.created"
CONTENT_RUNTIME_ITEM_UNARCHIVED_EVENT = "project.content.item.unarchived"
CONTENT_RUNTIME_ITEM_WORKFLOW_UPDATED_EVENT = "project.content.item.workflow.updated"
CONTENT_RUNTIME_VERSION_ARCHIVED_EVENT = "project.content.version.archived"
CONTENT_RUNTIME_VERSION_SCHEDULED_EVENT = "project.content.version.scheduled"


def _compare_mapping(
    prefix: str, before: dict[str, Any], after: dict[str, Any]
) -> list[ContentVersionCompareChangeOut]:
    changes: list[ContentVersionCompareChangeOut] = []
    for key in sorted(set(before) | set(after)):
        before_value = before.get(key)
        after_value = after.get(key)
        if before_value != after_value:
            changes.append(
                ContentVersionCompareChangeOut(path=f"{prefix}.{key}", before=before_value, after=after_value)
            )
    return changes


def _presentation_payloads(version: ContentVersionOut) -> dict[str, dict[str, Any] | None]:
    return {str(presentation.kind): presentation.payload for presentation in version.presentations}


def _compare_version_payloads(
    before: ContentVersionOut, after: ContentVersionOut
) -> list[ContentVersionCompareChangeOut]:
    changes = _compare_mapping("fields", before.fields_snapshot, after.fields_snapshot)
    changes.extend(_compare_mapping("presentations", _presentation_payloads(before), _presentation_payloads(after)))
    return changes


def _draft_route_path(fields_snapshot: JsonObject) -> str | None:
    if "path" not in fields_snapshot:
        return None
    path = fields_snapshot["path"]
    if not isinstance(path, str) or not path.strip():
        raise Conflict("Routable content item path must be a non-empty string", error="CONTENT_ROUTE_PATH_INVALID")
    return path


class ProjectContentCanonicalItemsService(BaseService):
    def __init__(
        self,
        repo: ProjectContentItemsRepository,
        *,
        entity_manager: EntityManager,
        organization_id: UUID | None = None,
    ) -> None:
        super().__init__()
        self.repo = repo
        self.entity_manager: EntityManager = entity_manager
        self.organization_id = organization_id
        self.reads = ProjectContentCanonicalItemReadService(repo)

    async def _write_content_item_activity_event(
        self,
        *,
        event_name: str,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload: JsonObject = {
            "organization_id": str(self.organization_id) if self.organization_id is not None else None,
            "workspace_id": str(workspace_id),
            "site_id": str(site_id),
            "content_item_id": str(item_id),
            "actor_user_id": str(actor_user_id) if actor_user_id is not None else None,
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                organization_id=self.organization_id,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="content_item",
                entity_id=item_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

    async def _publish_content_runtime_event(
        self,
        *,
        actor_user_id: UUID | None,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None,
        runtime_id: UUID | None,
        entity_id: UUID,
        entity_type: str,
        event_name: str,
        environment_id: UUID | None = None,
        properties: JsonObject | None = None,
    ) -> None:
        payload: JsonObject = {
            "organization_id": str(self.organization_id) if self.organization_id is not None else None,
            "workspace_id": str(workspace_id),
            "activity_ingest": False,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "tenant": tenant_payload_from_context(),
            **(properties or {}),
        }
        if project_id is not None:
            payload["project_id"] = str(project_id)
        if runtime_id is not None:
            payload["runtime_id"] = str(runtime_id)
        if environment_id is not None:
            payload["environment_id"] = str(environment_id)
        payload["site_id"] = str(site_id)
        await self.publish_optional_domain_event(
            name=event_name,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    async def _replace_presentations(
        self,
        *,
        version_id: UUID,
        presentations: PresentationPayload,
        conn: BaseDBAsyncClient,
    ) -> None:
        try:
            await self.repo.replace_presentations(version_id=version_id, presentations=presentations, conn=conn)
            await self.repo.replace_seo_profile(
                version_id=version_id,
                payload=extract_seo_payload(presentations),
                conn=conn,
            )
            await self.repo.replace_component_bindings(
                version_id=version_id,
                bindings=extract_component_bindings(presentations),
                conn=conn,
            )
        except IntegrityError as exc:
            raise Conflict("Invalid presentations payload", error="CONTENT_PRESENTATION_CONFLICT") from exc

    async def _get_locked_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemRecord:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            conn=conn,
            for_update=True,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        return item

    async def _get_locked_version(
        self,
        *,
        item_id: UUID,
        version_number: int,
        conn: BaseDBAsyncClient,
    ) -> ContentVersionRecord:
        version = await self.repo.get_version_by_number(
            item_id=item_id,
            version_number=version_number,
            conn=conn,
            for_update=True,
        )
        if version is None:
            raise NotFound("Content version not found", error="CONTENT_ITEM_VERSION_NOT_FOUND")
        return version

    async def _sync_draft_route_binding(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item: ContentItemRecord,
        fields_snapshot: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not item_has_capability(item, "routable"):
            return
        route_path = _draft_route_path(fields_snapshot)
        if route_path is None:
            return
        await upsert_route_binding_record(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item.id,
            item=item,
            payload=RouteBindingUpsertIn(locale=str(item.locale or "zh-CN"), path=route_path, is_active=True),
            conn=conn,
        )

    async def _prepare_duplicated_fields_snapshot(
        self,
        *,
        site_id: UUID,
        environment_id: UUID | None,
        item: ContentItemRecord,
        fields_snapshot: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> JsonObject:
        duplicated_fields = dict(fields_snapshot)
        if not item_has_capability(item, "routable"):
            return duplicated_fields
        route_path = _draft_route_path(duplicated_fields)
        if route_path is None:
            return duplicated_fields
        duplicated_fields["path"] = await resolve_duplicate_route_path(
            site_id=site_id,
            environment_id=environment_id,
            locale=str(item.locale or "zh-CN"),
            source_path=route_path,
            conn=conn,
        )
        return duplicated_fields

    async def _set_route_bindings_active(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item: ContentItemRecord,
        is_active: bool,
        conn: BaseDBAsyncClient,
    ) -> None:
        if not item_has_capability(item, "routable"):
            return
        await set_route_bindings_active_for_item(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item.id,
            is_active=is_active,
            conn=conn,
        )

    @staticmethod
    def _translation_status_from_items(
        *,
        group_id: UUID,
        primary_item_id: UUID | None,
        primary_locale: str,
        items: list[ContentItemRecord],
    ) -> ContentTranslationStatusOut:
        return ContentTranslationStatusOut(
            group_id=group_id,
            primary_item_id=primary_item_id,
            primary_locale=primary_locale,
            locales=sorted({str(item.locale) for item in items if str(item.locale or "").strip()}),
            missing_locales=[],
        )

    async def _build_translation_group_out(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        group_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentTranslationGroupOut:
        group = await self.repo.get_translation_group(
            workspace_id=workspace_id,
            site_id=site_id,
            translation_group_id=group_id,
            conn=conn,
        )
        if group is None:
            raise NotFound("Translation group not found", error="CONTENT_TRANSLATION_GROUP_NOT_FOUND")
        items = await self.repo.list_translation_items(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            translation_group_id=group.id,
            conn=conn,
        )
        status = self._translation_status_from_items(
            group_id=group.id,
            primary_item_id=group.primary_item_id,
            primary_locale=group.primary_locale,
            items=items,
        )
        return ContentTranslationGroupOut(
            group_id=group.id,
            primary_item_id=group.primary_item_id,
            primary_locale=group.primary_locale,
            items=[to_item_out(item, item.model_definition, translation_status=status) for item in items],
        )

    async def create_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemCreateIn,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None = None,
    ) -> ContentItemOut:
        try:
            model_key = payload.model_key.strip()
            if not model_key:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")

            model = await self.repo.get_model_definition_by_key(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_key=model_key,
            )
            if model is None:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
            model_kind = str(getattr(model, "model_kind", "collection_type") or "collection_type")
            if model_kind == "component":
                raise Conflict(
                    "Component models are embedded schemas and cannot create standalone content items",
                    error="CONTENT_ITEM_COMPONENT_MODEL_UNSUPPORTED",
                    meta={"modelKey": model_key},
                )
            if model_kind == "single_type":
                existing_count = await self.repo.count_items_for_model(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    model_definition_id=model.id,
                    locale=payload.locale,
                )
                if existing_count > 0:
                    raise Conflict(
                        "Single type content models can only have one content item per locale",
                        error="CONTENT_ITEM_SINGLE_TYPE_ALREADY_EXISTS",
                        meta={"modelKey": model_key, "locale": payload.locale},
                    )

            continuation = resolve_item_continuation_truth(
                model=model,
                preset_key=None,
                capability_pack_ids=[],
            )
            translation_group_id = payload.translation_group_id
            if translation_group_id is not None:
                group = await self.repo.get_translation_group(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    translation_group_id=translation_group_id,
                )
                if group is None:
                    raise NotFound("Translation group not found", error="CONTENT_TRANSLATION_GROUP_NOT_FOUND")
                existing_locale = await self.repo.get_translation_item_by_locale(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    translation_group_id=translation_group_id,
                    locale=payload.locale,
                )
                if existing_locale is not None:
                    raise Conflict(
                        "Translation locale already exists",
                        error="CONTENT_TRANSLATION_LOCALE_ALREADY_EXISTS",
                        meta={"locale": payload.locale},
                    )

            async def _before_create_commit(
                item: ContentItemRecord,
                version: ContentVersionRecord,
                conn: BaseDBAsyncClient,
            ) -> None:
                if translation_group_id is None:
                    await self.repo.ensure_translation_group_for_item(item=item, conn=conn)
                await self._write_content_item_activity_event(
                    event_name=CONTENT_ITEM_CREATED_EVENT,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=UUID(str(item.id)),
                    actor_user_id=actor_user_id,
                    properties={
                        "model_key": model_key,
                        "locale": str(item.locale),
                        "status": str(item.status),
                        "draft_version": int(version.version),
                        "published_version": None,
                        "translation_group_id": (
                            str(item.translation_group_id) if item.translation_group_id is not None else None
                        ),
                    },
                    conn=conn,
                )

            em_result = await self.entity_manager.create(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_key=model_key,
                data={"title": payload.title.strip()} if payload.title else {},
                slug=build_formless_draft_slug(payload.title),
                title=payload.title.strip() if payload.title else None,
                locale=payload.locale,
                actor_id=actor_user_id,
                resolved_role=continuation.resolved_role,
                resolved_posture=continuation.resolved_posture,
                resolved_surface=continuation.resolved_surface,
                shape_state=continuation.shape_state,
                shape_reason_code=continuation.shape_reason_code,
                shape_reason_meta=continuation.shape_reason_meta,
                translation_group_id=translation_group_id,
                before_commit=_before_create_commit,
            )
            item = em_result.item
        except IntegrityError as exc:
            raise Conflict(
                "Content item conflict",
                error="CONTENT_ITEM_CONFLICT",
                meta={"title": payload.title, "locale": payload.locale},
            ) from exc

        created_translation_group_id = item.translation_group_id
        if created_translation_group_id is not None:
            translations = await self.repo.list_translation_items(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                translation_group_id=created_translation_group_id,
            )
            status = self._translation_status_from_items(
                group_id=created_translation_group_id,
                primary_item_id=item.id if translation_group_id is None else None,
                primary_locale=item.locale,
                items=translations,
            )
        else:
            status = None
        data = to_item_out(item, model, translation_status=status)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            environment_id=environment_id,
            entity_id=data.id,
            entity_type="content_item",
            event_name=CONTENT_ITEM_CREATED_EVENT,
            properties={
                "model_key": data.model_key,
                "locale": data.locale,
                "status": str(data.status),
                "draft_version": data.draft_version,
                "published_version": data.published_version,
                "translation_group_id": str(data.translation_group_id)
                if data.translation_group_id is not None
                else None,
            },
        )
        return data

    async def apply_bootstrap_shape(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemBootstrapShapeIn,
    ) -> ContentItemOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            preset_key, preset_state, capability_pack_ids = normalize_bootstrap_shape(
                preset_key=payload.preset_key,
                preset_state=payload.preset_state,
                capability_pack_ids=payload.capability_pack_ids,
            )
            continuation = resolve_item_continuation_truth(
                model=item.model_definition,
                preset_key=preset_key,
                capability_pack_ids=capability_pack_ids,
            )
            item = await self.repo.update_item_fields(
                item,
                fields={
                    "bootstrap_preset_key": preset_key,
                    "bootstrap_preset_state": preset_state,
                    "capability_pack_ids": capability_pack_ids,
                    "resolved_role": continuation.resolved_role,
                    "resolved_posture": continuation.resolved_posture,
                    "resolved_surface": continuation.resolved_surface,
                    "shape_state": continuation.shape_state,
                    "shape_reason_code": continuation.shape_reason_code,
                    "shape_reason_meta": continuation.shape_reason_meta,
                    "updated_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            data = to_item_out(item, item.model_definition)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=data.id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_BOOTSTRAP_APPLIED_EVENT,
            properties={
                "bootstrap_preset_key": data.bootstrap_preset_key,
                "bootstrap_preset_state": str(data.bootstrap_preset_state),
            },
        )
        return data

    async def patch_workflow(
        self,
        *,
        project_id: UUID | None = None,
        workspace_id: UUID,
        site_id: UUID,
        runtime_id: UUID | None = None,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemWorkflowPatchIn,
        environment_id: UUID | None = None,
    ) -> ContentItemOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            if payload.stage is not None:
                actor = await resolve_workflow_actor(project_id=project_id, actor_user_id=actor_user_id)
                validate_workflow_transition(
                    current_stage=item.workflow_stage,
                    target_stage=payload.stage,
                    policy=resolve_workflow_policy(item.model_definition),
                    actor=actor,
                )
            fields = build_workflow_patch_fields(
                current_item=item,
                stage=payload.stage,
                assignee_user_id=payload.assignee_user_id,
                summary=payload.summary,
                note_body=payload.note.body if payload.note is not None else None,
                actor_user_id=actor_user_id,
            )
            if not fields:
                return to_item_out(item, item.model_definition)
            item = await self.repo.update_item_fields(item, fields=fields, conn=conn)
            data = to_item_out(item, item.model_definition)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=item_id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_WORKFLOW_UPDATED_EVENT,
            properties={
                "workflow_stage": str(data.workflow_stage),
                "workflow_assignee_user_id": str(data.workflow_assignee_user_id)
                if data.workflow_assignee_user_id is not None
                else None,
            },
        )
        return data

    async def duplicate_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with self.tx() as conn:
            source_item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            duplicate_title = build_duplicate_item_title(source_item.title or source_item.slug)
            continuation = resolve_item_continuation_truth(
                model=source_item.model_definition,
                preset_key=source_item.bootstrap_preset_key,
                capability_pack_ids=normalize_capability_pack_ids(source_item.capability_pack_ids or []),
            )
            duplicated_item = await self.repo.create_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=source_item.model_definition_id,
                slug=build_formless_draft_slug(duplicate_title),
                title=duplicate_title,
                locale=source_item.locale,
                status=normalize_initial_status(ContentItemStatus.DRAFT),
                visibility=normalize_visibility(ContentItemVisibility(source_item.visibility)),
                bootstrap_preset_key=source_item.bootstrap_preset_key,
                bootstrap_preset_state=str(source_item.bootstrap_preset_state),
                capability_pack_ids=normalize_capability_pack_ids(source_item.capability_pack_ids or []),
                resolved_role=continuation.resolved_role,
                resolved_posture=continuation.resolved_posture,
                resolved_surface=continuation.resolved_surface,
                shape_state=continuation.shape_state,
                shape_reason_code=continuation.shape_reason_code,
                shape_reason_meta=continuation.shape_reason_meta,
                actor_user_id=actor_user_id,
            )
            await self.repo.ensure_translation_group_for_item(item=duplicated_item, conn=conn)

            if int(source_item.draft_version or 0) > 0:
                source_version = await self._get_locked_version(
                    item_id=source_item.id,
                    version_number=int(source_item.draft_version),
                    conn=conn,
                )
                duplicated_fields_snapshot = await self._prepare_duplicated_fields_snapshot(
                    site_id=site_id,
                    environment_id=environment_id,
                    item=source_item,
                    fields_snapshot=source_version.fields_snapshot or {},
                    conn=conn,
                )
                duplicated_version = await self.repo.create_version(
                    item_id=duplicated_item.id,
                    version=1,
                    state=str(ContentVersionState.DRAFT),
                    fields_snapshot=duplicated_fields_snapshot,
                    change_summary=None,
                    actor_user_id=actor_user_id,
                    last_transition_by_user_id=actor_user_id,
                    conn=conn,
                )
                version_out = await self.reads.build_version_out(version=source_version, conn=conn)
                presentations: PresentationPayload = [
                    (presentation.kind, presentation.payload) for presentation in version_out.presentations
                ]
                await self._replace_presentations(
                    version_id=duplicated_version.id,
                    presentations=presentations,
                    conn=conn,
                )
                duplicated_item = await self.repo.update_item_fields(
                    duplicated_item,
                    fields={"draft_version": 1, "updated_by_user_id": actor_user_id},
                    conn=conn,
                )
                duplicated_item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=duplicated_item.id,
                    conn=conn,
                )
                await self._sync_draft_route_binding(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item=duplicated_item,
                    fields_snapshot=duplicated_fields_snapshot,
                    conn=conn,
                )

            data = to_item_out(duplicated_item, source_item.model_definition)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=item_id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_DUPLICATED_EVENT,
            properties={
                "duplicated_item_id": str(data.id),
                "duplicated_item_title": data.title,
                "duplicated_item_slug": data.slug,
            },
        )
        return data

    async def list_translations(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
    ) -> ContentTranslationGroupOut:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        group = await self.repo.ensure_translation_group_for_item(item=item)
        return await self._build_translation_group_out(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            group_id=group.id,
        )

    async def create_translation(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentTranslationCreateIn,
    ) -> ContentItemOut:
        target_locale = payload.target_locale.strip()
        async with self.tx() as conn:
            source_item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            group = await self.repo.ensure_translation_group_for_item(item=source_item, conn=conn)
            existing = await self.repo.get_translation_item_by_locale(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                translation_group_id=group.id,
                locale=target_locale,
                conn=conn,
            )
            if existing is not None:
                raise Conflict(
                    "Translation locale already exists",
                    error="CONTENT_TRANSLATION_LOCALE_ALREADY_EXISTS",
                    meta={"locale": target_locale},
                )
            translated_item = await self.repo.create_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_definition_id=source_item.model_definition_id,
                translation_group_id=group.id,
                slug=source_item.slug,
                title=source_item.title,
                locale=target_locale,
                status=normalize_initial_status(ContentItemStatus.DRAFT),
                visibility=normalize_visibility(ContentItemVisibility(source_item.visibility)),
                bootstrap_preset_key=source_item.bootstrap_preset_key,
                bootstrap_preset_state=str(source_item.bootstrap_preset_state),
                capability_pack_ids=normalize_capability_pack_ids(source_item.capability_pack_ids or []),
                resolved_role=source_item.resolved_role,
                resolved_posture=source_item.resolved_posture,
                resolved_surface=source_item.resolved_surface,
                shape_state=source_item.shape_state,
                shape_reason_code=source_item.shape_reason_code,
                shape_reason_meta=source_item.shape_reason_meta
                if isinstance(source_item.shape_reason_meta, dict)
                else None,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            source_version_number = int(source_item.draft_version or source_item.published_version or 0)
            if source_version_number > 0:
                source_version = await self._get_locked_version(
                    item_id=source_item.id,
                    version_number=source_version_number,
                    conn=conn,
                )
                translated_fields_snapshot = source_version.fields_snapshot or {}
                translated_version = await self.repo.create_version(
                    item_id=translated_item.id,
                    version=1,
                    state=str(ContentVersionState.DRAFT),
                    fields_snapshot=translated_fields_snapshot,
                    change_summary=None,
                    actor_user_id=actor_user_id,
                    last_transition_by_user_id=actor_user_id,
                    conn=conn,
                )
                version_out = await self.reads.build_version_out(version=source_version, conn=conn)
                presentations: PresentationPayload = [
                    (presentation.kind, presentation.payload) for presentation in version_out.presentations
                ]
                await self._replace_presentations(
                    version_id=translated_version.id,
                    presentations=presentations,
                    conn=conn,
                )
                translated_item = await self.repo.update_item_fields(
                    translated_item,
                    fields={"draft_version": 1, "updated_by_user_id": actor_user_id},
                    conn=conn,
                )
                translated_item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=translated_item.id,
                    conn=conn,
                )
                await self._sync_draft_route_binding(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item=translated_item,
                    fields_snapshot=translated_fields_snapshot,
                    conn=conn,
                )
            translations = await self.repo.list_translation_items(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                translation_group_id=group.id,
                conn=conn,
            )
            status = self._translation_status_from_items(
                group_id=group.id,
                primary_item_id=group.primary_item_id,
                primary_locale=group.primary_locale,
                items=translations,
            )
            data = to_item_out(translated_item, source_item.model_definition, translation_status=status)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=item_id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_TRANSLATION_CREATED_EVENT,
            properties={
                "translated_item_id": str(data.id),
                "target_locale": data.locale,
            },
        )
        return data

    async def get_translation_group(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
    ) -> ContentTranslationGroupOut:
        return await self.list_translations(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )

    async def delete_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> None:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
        )
        if item is None:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")
        if item.model_definition is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        model_key = str(item.model_definition.singular_key)
        deleted_status = str(item.status)
        deleted_locale = str(item.locale)
        deleted_draft_version = int(item.draft_version or 0)
        deleted_published_version = int(item.published_version) if item.published_version is not None else None

        async def _before_delete_commit(
            deleted_item: ContentItemRecord,
            conn: BaseDBAsyncClient,
        ) -> None:
            await self._write_content_item_activity_event(
                event_name=CONTENT_ITEM_DELETED_EVENT,
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=UUID(str(deleted_item.id)),
                actor_user_id=actor_user_id,
                properties={
                    "model_key": model_key,
                    "locale": deleted_locale,
                    "status": deleted_status,
                    "draft_version": deleted_draft_version,
                    "published_version": deleted_published_version,
                    "deleted": True,
                },
                conn=conn,
            )

        deleted = await self.entity_manager.delete(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_key=model_key,
            item_id=item_id,
            actor_id=actor_user_id,
            before_commit=_before_delete_commit,
        )
        if not deleted:
            raise NotFound("Content item not found", error="CONTENT_ITEM_NOT_FOUND")

    async def archive_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            current_version = int(item.draft_version or 0)
            if current_version > 0:
                version = await self._get_locked_version(
                    item_id=item.id,
                    version_number=current_version,
                    conn=conn,
                )
                if version.state not in VERSION_TRANSITIONS[ContentVersionState.ARCHIVED]:
                    raise Conflict("Invalid version transition", error="CONTENT_VERSION_TRANSITION_INVALID")

                version = await self.repo.update_version_fields(
                    version,
                    fields={
                        "state": str(ContentVersionState.ARCHIVED),
                        "last_transition_by_user_id": actor_user_id,
                    },
                    conn=conn,
                )
                item = await self.repo.update_item_fields(
                    item,
                    fields=item_fields_for_transition(
                        item=item,
                        version=version,
                        target_state=ContentVersionState.ARCHIVED,
                        actor_user_id=actor_user_id,
                    ),
                    conn=conn,
                )
                data = to_item_out(item, item.model_definition)
            else:
                item = await self.repo.update_item_fields(
                    item,
                    fields={
                        "status": str(ContentItemStatus.ARCHIVED),
                        "updated_by_user_id": actor_user_id,
                    },
                    conn=conn,
                )
                data = to_item_out(item, item.model_definition)
            await self._set_route_bindings_active(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                is_active=False,
                conn=conn,
            )
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=data.id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_ARCHIVED_EVENT,
            properties={"item_status": str(data.status)},
        )
        return data

    async def save_draft_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentVersionDraftSaveIn,
        conn: BaseDBAsyncClient | None = None,
    ) -> ContentVersionOut:
        async with self.tx(conn=conn) as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            current_version = int(item.draft_version or 0)
            ensure_expected_version(expected_version=payload.expected_version, current_version=current_version)
            next_version = current_version + 1

            password_keys = password_field_keys(item.model_definition)
            previous_version = None
            if current_version > 0:
                previous_version = await self._get_locked_version(
                    item_id=item.id,
                    version_number=current_version,
                    conn=conn,
                )
            fields_snapshot = hash_password_field_values(
                payload.fields_snapshot, model_definition=item.model_definition
            )
            fields_snapshot = carry_forward_missing_password_field_values(
                fields_snapshot,
                previous_payload=previous_version.fields_snapshot if previous_version is not None else None,
                model_definition=item.model_definition,
            )
            version = await self.repo.create_version(
                item_id=item.id,
                version=next_version,
                state=str(ContentVersionState.DRAFT),
                fields_snapshot=fields_snapshot,
                change_summary=payload.change_summary,
                actor_user_id=actor_user_id,
                last_transition_by_user_id=actor_user_id,
                conn=conn,
            )
            normalized = sanitize_password_presentations(
                normalize_presentations(payload.presentations),
                password_keys=password_keys,
            )
            await self._replace_presentations(version_id=version.id, presentations=normalized, conn=conn)
            await self.repo.update_item_fields(
                item,
                fields={
                    "draft_version": next_version,
                    "status": status_by_published_version(
                        published_version=item.published_version,
                        fallback=ContentItemStatus.DRAFT,
                    ),
                    "updated_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            await self._sync_draft_route_binding(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                fields_snapshot=fields_snapshot,
                conn=conn,
            )
            return await self.reads.build_version_out(version=version, conn=conn)

    async def transition_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        version_number: int,
        target_state: ContentVersionState,
        actor_user_id: UUID | None,
    ) -> ContentVersionOut:
        allowed_from = VERSION_TRANSITIONS.get(target_state)
        if allowed_from is None:
            raise Conflict("Invalid version transition target", error="CONTENT_VERSION_TRANSITION_INVALID")

        published_model_key: str | None = None
        published_item_id: UUID | None = None
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            version = await self._get_locked_version(item_id=item.id, version_number=version_number, conn=conn)
            if version.state not in allowed_from:
                raise Conflict("Invalid version transition", error="CONTENT_VERSION_TRANSITION_INVALID")

            if target_state == ContentVersionState.PUBLISHED:
                if item.model_definition is None:
                    raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
                workflow_policy = resolve_workflow_policy(item.model_definition)
                published_model_key = str(item.model_definition.singular_key)
                published_item_id = item.id
                await self.entity_manager.dispatch_before_publish(
                    model_key=published_model_key,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=published_item_id,
                    actor_id=actor_user_id,
                )
                blocker_codes = derive_item_publish_blocker_codes(item, publish_stage=workflow_policy.publish_stage)
                if blocker_codes:
                    raise Conflict(
                        "Content workflow gate blocked publish",
                        error="CONTENT_WORKFLOW_GATE_FAILED",
                        meta={
                            "workflowStage": str(item.workflow_stage or ContentWorkflowStage.DRAFTING),
                            "publishStage": workflow_policy.publish_stage,
                            "blockerCodes": blocker_codes,
                        },
                    )
                presentation_rows = await self.repo.list_presentations(version_id=version.id, conn=conn)
                presentations: PresentationPayload = [
                    (
                        cast(ContentPresentationKind, str(presentation.kind)),
                        presentation.payload if isinstance(presentation.payload, dict) else None,
                    )
                    for presentation in presentation_rows
                ]
                publish_reasons = validate_version_publish_contract(
                    model=item.model_definition,
                    version=version,
                    presentations=presentations,
                )
                if publish_reasons:
                    raise Conflict(
                        "Content publish validation failed",
                        error="CONTENT_PUBLISH_VALIDATION_FAILED",
                        meta={
                            "protocolKey": str(item.model_definition.protocol_key or item.model_definition.singular_key)
                            if item.model_definition is not None
                            else None,
                            "reasons": publish_reasons,
                        },
                    )

            version = await self.repo.update_version_fields(
                version,
                fields={"state": str(target_state), "last_transition_by_user_id": actor_user_id},
                conn=conn,
            )
            await self.repo.update_item_fields(
                item,
                fields=item_fields_for_transition(
                    item=item,
                    version=version,
                    target_state=target_state,
                    actor_user_id=actor_user_id,
                ),
                conn=conn,
            )
            event_name: str | None = None
            if target_state == ContentVersionState.PUBLISHED:
                event_name = CONTENT_ITEM_PUBLISHED_EVENT
            elif target_state == ContentVersionState.DRAFT and int(item.published_version or 0) == version_number:
                event_name = CONTENT_ITEM_UNPUBLISHED_EVENT
            if event_name is not None:
                await self._write_content_item_activity_event(
                    event_name=event_name,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=UUID(str(item.id)),
                    actor_user_id=actor_user_id,
                    properties={
                        "model_key": str(item.model_definition.singular_key)
                        if item.model_definition is not None
                        else None,
                        "locale": str(item.locale),
                        "version_number": int(version.version),
                        "version_state": str(version.state),
                        "status": str(
                            ContentItemStatus.PUBLISHED
                            if target_state == ContentVersionState.PUBLISHED
                            else ContentItemStatus.DRAFT
                        ),
                        "published_version": int(version.version)
                        if target_state == ContentVersionState.PUBLISHED
                        else None,
                    },
                    conn=conn,
                )
            result = await self.reads.build_version_out(version=version, conn=conn)

        if published_model_key is not None and published_item_id is not None:
            await self.entity_manager.dispatch_after_publish(
                model_key=published_model_key,
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=published_item_id,
                result=result,
                actor_id=actor_user_id,
            )
        if target_state in {ContentVersionState.SCHEDULED, ContentVersionState.ARCHIVED}:
            runtime_event_name = (
                CONTENT_RUNTIME_VERSION_SCHEDULED_EVENT
                if target_state == ContentVersionState.SCHEDULED
                else CONTENT_RUNTIME_VERSION_ARCHIVED_EVENT
            )
            await self._publish_content_runtime_event(
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                site_id=site_id,
                project_id=project_id,
                runtime_id=runtime_id,
                entity_id=item_id,
                entity_type="content_item",
                event_name=runtime_event_name,
                properties={
                    "version_number": result.version_number,
                    "version_state": str(result.state),
                    "change_summary": result.change_summary,
                },
            )
        return result

    async def bulk_publish_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_ids: list[UUID],
        actor_user_id: UUID | None,
    ) -> ContentItemBulkTransitionOut:
        items: list[ContentVersionOut] = []
        for item_id in item_ids:
            async with self.tx() as conn:
                item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=item_id,
                    conn=conn,
                )
                version_number = int(item.draft_version)
            data = await self.transition_version(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                version_number=version_number,
                target_state=ContentVersionState.PUBLISHED,
                actor_user_id=actor_user_id,
            )
            items.append(data)
        return ContentItemBulkTransitionOut(items=items)

    async def bulk_unpublish_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_ids: list[UUID],
        actor_user_id: UUID | None,
    ) -> ContentItemBulkTransitionOut:
        items: list[ContentVersionOut] = []
        for item_id in item_ids:
            async with self.tx() as conn:
                item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=item_id,
                    conn=conn,
                )
                if item.published_version is None:
                    raise Conflict("Content item is not published", error="CONTENT_ITEM_NOT_PUBLISHED")
                version = await self._get_locked_version(
                    item_id=item.id,
                    version_number=int(item.published_version),
                    conn=conn,
                )
                if version.state != ContentVersionState.PUBLISHED:
                    raise Conflict("Content version is not published", error="CONTENT_VERSION_NOT_PUBLISHED")
                version = await self.repo.update_version_fields(
                    version,
                    fields={"state": str(ContentVersionState.DRAFT), "last_transition_by_user_id": actor_user_id},
                    conn=conn,
                )
                await self.repo.update_item_fields(
                    item,
                    fields={
                        "published_version": None,
                        "status": str(ContentItemStatus.DRAFT),
                        "updated_by_user_id": actor_user_id,
                    },
                    conn=conn,
                )
                await self._write_content_item_activity_event(
                    event_name=CONTENT_ITEM_UNPUBLISHED_EVENT,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=UUID(str(item.id)),
                    actor_user_id=actor_user_id,
                    properties={
                        "model_key": str(item.model_definition.singular_key)
                        if item.model_definition is not None
                        else None,
                        "locale": str(item.locale),
                        "version_number": int(version.version),
                        "version_state": str(version.state),
                        "status": str(ContentItemStatus.DRAFT),
                        "published_version": None,
                    },
                    conn=conn,
                )
                items.append(await self.reads.build_version_out(version=version, conn=conn))
        return ContentItemBulkTransitionOut(items=items)

    async def compare_versions(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        source_version_number: int,
        target_version_number: int,
    ) -> ContentVersionCompareOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            source = await self._get_locked_version(
                item_id=item.id,
                version_number=source_version_number,
                conn=conn,
            )
            target = await self._get_locked_version(
                item_id=item.id,
                version_number=target_version_number,
                conn=conn,
            )
            source_out = await self.reads.build_version_out(version=source, conn=conn)
            target_out = await self.reads.build_version_out(version=target, conn=conn)
        return ContentVersionCompareOut(
            item_id=item.id,
            source_version_number=source_version_number,
            target_version_number=target_version_number,
            changes=_compare_version_payloads(source_out, target_out),
        )

    async def restore_version_to_draft(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        version_number: int,
        actor_user_id: UUID | None,
    ) -> ContentVersionOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            source = await self._get_locked_version(
                item_id=item.id,
                version_number=version_number,
                conn=conn,
            )
            source_out = await self.reads.build_version_out(version=source, conn=conn)
            next_version = int(item.draft_version or 0) + 1
            version = await self.repo.create_version(
                item_id=item.id,
                version=next_version,
                state=str(ContentVersionState.DRAFT),
                fields_snapshot=source_out.fields_snapshot,
                change_summary=f"Restored from version {version_number}",
                actor_user_id=actor_user_id,
                last_transition_by_user_id=actor_user_id,
                conn=conn,
            )
            presentations: PresentationPayload = [
                (presentation.kind, presentation.payload) for presentation in source_out.presentations
            ]
            await self._replace_presentations(version_id=version.id, presentations=presentations, conn=conn)
            await self.repo.update_item_fields(
                item,
                fields={
                    "draft_version": next_version,
                    "status": status_by_published_version(
                        published_version=item.published_version,
                        fallback=ContentItemStatus.DRAFT,
                    ),
                    "updated_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            await self._sync_draft_route_binding(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item=item,
                fields_snapshot=source_out.fields_snapshot,
                conn=conn,
            )
            await self._write_content_item_activity_event(
                event_name=CONTENT_ITEM_RESTORED_EVENT,
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=UUID(str(item.id)),
                actor_user_id=actor_user_id,
                properties={
                    "model_key": str(item.model_definition.singular_key) if item.model_definition is not None else None,
                    "locale": str(item.locale),
                    "source_version_number": int(version_number),
                    "version_number": next_version,
                    "version_state": str(version.state),
                    "published_version": int(item.published_version) if item.published_version is not None else None,
                },
                conn=conn,
            )
            return await self.reads.build_version_out(version=version, conn=conn)

    async def unarchive_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        environment_id: UUID | None,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            if item.status != ContentItemStatus.ARCHIVED:
                raise Conflict("Content item is not archived", error="CONTENT_ITEM_NOT_ARCHIVED")

            current_version = int(item.draft_version or 0)
            version = None
            if current_version > 0:
                version = await self._get_locked_version(
                    item_id=item.id,
                    version_number=current_version,
                    conn=conn,
                )
                if version.state != ContentVersionState.ARCHIVED:
                    raise Conflict("Content version is not archived", error="CONTENT_ITEM_VERSION_NOT_ARCHIVED")

                await self.repo.update_version_fields(
                    version,
                    fields={
                        "state": str(ContentVersionState.DRAFT),
                        "last_transition_by_user_id": actor_user_id,
                    },
                    conn=conn,
                )

            item = await self.repo.update_item_fields(
                item,
                fields={
                    "status": str(ContentItemStatus.DRAFT),
                    "updated_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            if version is not None:
                await self._sync_draft_route_binding(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item=item,
                    fields_snapshot=version.fields_snapshot if isinstance(version.fields_snapshot, dict) else {},
                    conn=conn,
                )
            data = to_item_out(item, item.model_definition)
        await self._publish_content_runtime_event(
            actor_user_id=actor_user_id,
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=runtime_id,
            entity_id=data.id,
            entity_type="content_item",
            event_name=CONTENT_RUNTIME_ITEM_UNARCHIVED_EVENT,
            properties={"item_status": str(data.status)},
        )
        return data

    async def patch_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        item_id: UUID,
        version_number: int,
        actor_user_id: UUID | None,
        payload: ContentVersionPatchIn,
    ) -> ContentVersionOut:
        async with self.tx() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                conn=conn,
            )
            version = await self._get_locked_version(item_id=item.id, version_number=version_number, conn=conn)
            if version.state != ContentVersionState.DRAFT:
                raise Conflict("Non-draft version is immutable", error="CONTENT_VERSION_IMMUTABLE")

            version_fields = build_patch_version_fields(payload=payload, actor_user_id=actor_user_id)
            if "fields_snapshot" in version_fields:
                version_fields["fields_snapshot"] = hash_password_field_values(
                    version_fields["fields_snapshot"] or {},
                    model_definition=item.model_definition,
                )
                version_fields["fields_snapshot"] = carry_forward_missing_password_field_values(
                    version_fields["fields_snapshot"],
                    previous_payload=version.fields_snapshot,
                    model_definition=item.model_definition,
                )
            has_version_changes = bool(version_fields)
            if has_version_changes:
                version = await self.repo.update_version_fields(version, fields=version_fields, conn=conn)

            has_presentation_changes = "presentations" in payload.model_fields_set
            if has_presentation_changes:
                if payload.presentations is None:
                    raise Conflict("Invalid presentations payload", error="CONTENT_VERSION_PATCH_INVALID")
                if not has_version_changes:
                    version = await self.repo.update_version_fields(
                        version,
                        fields={"last_transition_by_user_id": actor_user_id},
                        conn=conn,
                    )
                presentations = sanitize_password_presentations(
                    normalize_presentations(payload.presentations),
                    password_keys=password_field_keys(item.model_definition),
                )
                await self._replace_presentations(version_id=version.id, presentations=presentations, conn=conn)

            item_fields = build_patch_item_fields(
                payload=payload,
                actor_user_id=actor_user_id,
                has_version_changes=has_version_changes,
                has_presentation_changes=has_presentation_changes,
            )
            if item_fields:
                await self.repo.update_item_fields(item, fields=item_fields, conn=conn)
            if "fields_snapshot" in version_fields:
                await self._sync_draft_route_binding(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item=item,
                    fields_snapshot=version.fields_snapshot,
                    conn=conn,
                )
            if has_version_changes or has_presentation_changes or item_fields:
                await self._write_content_item_activity_event(
                    event_name=CONTENT_ITEM_UPDATED_EVENT,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=UUID(str(item.id)),
                    actor_user_id=actor_user_id,
                    properties={
                        "model_key": str(item.model_definition.singular_key)
                        if item.model_definition is not None
                        else None,
                        "locale": str(item.locale),
                        "version_number": int(version.version),
                        "version_state": str(version.state),
                        "updated_sections": sorted(
                            name
                            for name in (
                                "fields_snapshot",
                                "presentations",
                                "change_summary",
                                "workflow_metadata",
                            )
                            if name in payload.model_fields_set
                        ),
                        "status": str(item.status),
                        "draft_version": int(item.draft_version or 0),
                        "published_version": int(item.published_version)
                        if item.published_version is not None
                        else None,
                    },
                    conn=conn,
                )
            return await self.reads.build_version_out(version=version, conn=conn)
