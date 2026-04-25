from __future__ import annotations

from typing import Any, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.core.exceptions import Conflict, NotFound
from src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentVersionState,
    ContentWorkflowStage,
)
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.modules.projects.content.continuation import resolve_item_continuation_truth
from src.modules.projects.content.contracts.schema import (
    ContentItemBulkTransitionOut,
    ContentItemOut,
    ContentPresentationKind,
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
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from src.modules.projects.content.items.read_service import (
    ProjectContentCanonicalItemReadService,
)
from src.modules.projects.content.items.repository import ProjectContentItemsRepository


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


class ProjectContentCanonicalItemsService:
    def __init__(self, repo: ProjectContentItemsRepository) -> None:
        self.repo = repo
        self.reads = ProjectContentCanonicalItemReadService(repo)

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
        item_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ContentItemRecord:
        item = await self.repo.get_item_with_model(
            workspace_id=workspace_id,
            site_id=site_id,
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

    async def create_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemCreateIn,
    ) -> ContentItemOut:
        try:
            model_key = payload.model_key.strip()
            if not model_key:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")

            model = await self.repo.get_model_definition_by_key(
                workspace_id=workspace_id,
                site_id=site_id,
                model_key=model_key,
            )
            if model is None:
                raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")

            continuation = resolve_item_continuation_truth(
                model=model,
                preset_key=None,
                capability_pack_ids=[],
            )
            item = await self.repo.create_item(
                workspace_id=workspace_id,
                site_id=site_id,
                model_definition_id=model.id,
                slug=build_formless_draft_slug(payload.title),
                title=payload.title.strip(),
                locale=payload.locale,
                status=normalize_initial_status(ContentItemStatus.DRAFT),
                visibility=normalize_visibility(ContentItemVisibility.PUBLIC),
                bootstrap_preset_key=None,
                bootstrap_preset_state=str(ContentBootstrapPresetState.NONE),
                capability_pack_ids=[],
                resolved_role=continuation.resolved_role,
                resolved_posture=continuation.resolved_posture,
                resolved_surface=continuation.resolved_surface,
                shape_state=continuation.shape_state,
                shape_reason_code=continuation.shape_reason_code,
                shape_reason_meta=continuation.shape_reason_meta,
                actor_user_id=actor_user_id,
            )
        except IntegrityError as exc:
            raise Conflict(
                "Content item conflict",
                error="CONTENT_ITEM_CONFLICT",
                meta={"title": payload.title, "locale": payload.locale},
            ) from exc

        return to_item_out(item, model)

    async def apply_bootstrap_shape(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemBootstrapShapeIn,
    ) -> ContentItemOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
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
            return to_item_out(item, item.model_definition)

    async def patch_workflow(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentItemWorkflowPatchIn,
    ) -> ContentItemOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
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
            return to_item_out(item, item.model_definition)

    async def duplicate_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with in_transaction() as conn:
            source_item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
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

            if int(source_item.draft_version or 0) > 0:
                source_version = await self._get_locked_version(
                    item_id=source_item.id,
                    version_number=int(source_item.draft_version),
                    conn=conn,
                )
                duplicated_version = await self.repo.create_version(
                    item_id=duplicated_item.id,
                    version=1,
                    state=str(ContentVersionState.DRAFT),
                    fields_snapshot=source_version.fields_snapshot or {},
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

            return to_item_out(duplicated_item, source_item.model_definition)

    async def delete_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
    ) -> None:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
            )
            await self.repo.delete_item(item_id=item.id, conn=conn)

    async def archive_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
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
                return to_item_out(item, item.model_definition)

            item = await self.repo.update_item_fields(
                item,
                fields={
                    "status": str(ContentItemStatus.ARCHIVED),
                    "updated_by_user_id": actor_user_id,
                },
                conn=conn,
            )
            return to_item_out(item, item.model_definition)

    async def save_draft_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
        payload: ContentVersionDraftSaveIn,
    ) -> ContentVersionOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
            )
            current_version = int(item.draft_version or 0)
            ensure_expected_version(expected_version=payload.expected_version, current_version=current_version)
            next_version = current_version + 1

            version = await self.repo.create_version(
                item_id=item.id,
                version=next_version,
                state=str(ContentVersionState.DRAFT),
                fields_snapshot=payload.fields_snapshot,
                change_summary=payload.change_summary,
                actor_user_id=actor_user_id,
                last_transition_by_user_id=actor_user_id,
                conn=conn,
            )
            normalized = normalize_presentations(payload.presentations)
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
            return await self.reads.build_version_out(version=version, conn=conn)

    async def transition_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
        target_state: ContentVersionState,
        actor_user_id: UUID | None,
    ) -> ContentVersionOut:
        allowed_from = VERSION_TRANSITIONS.get(target_state)
        if allowed_from is None:
            raise Conflict("Invalid version transition target", error="CONTENT_VERSION_TRANSITION_INVALID")

        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
            )
            version = await self._get_locked_version(item_id=item.id, version_number=version_number, conn=conn)
            if version.state not in allowed_from:
                raise Conflict("Invalid version transition", error="CONTENT_VERSION_TRANSITION_INVALID")

            if target_state == ContentVersionState.PUBLISHED:
                blocker_codes = derive_item_publish_blocker_codes(item)
                if blocker_codes:
                    raise Conflict(
                        "Content workflow gate blocked publish",
                        error="CONTENT_WORKFLOW_GATE_FAILED",
                        meta={
                            "workflowStage": str(item.workflow_stage or ContentWorkflowStage.DRAFTING),
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
                            "protocolKey": str(item.model_definition.protocol_key or item.model_definition.key)
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
            return await self.reads.build_version_out(version=version, conn=conn)

    async def bulk_publish_items(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_ids: list[UUID],
        actor_user_id: UUID | None,
    ) -> ContentItemBulkTransitionOut:
        items: list[ContentVersionOut] = []
        for item_id in item_ids:
            async with in_transaction() as conn:
                item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    item_id=item_id,
                    conn=conn,
                )
                version_number = int(item.draft_version)
            data = await self.transition_version(
                workspace_id=workspace_id,
                site_id=site_id,
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
        item_ids: list[UUID],
        actor_user_id: UUID | None,
    ) -> ContentItemBulkTransitionOut:
        items: list[ContentVersionOut] = []
        for item_id in item_ids:
            async with in_transaction() as conn:
                item = await self._get_locked_item(
                    workspace_id=workspace_id,
                    site_id=site_id,
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
                items.append(await self.reads.build_version_out(version=version, conn=conn))
        return ContentItemBulkTransitionOut(items=items)

    async def compare_versions(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        source_version_number: int,
        target_version_number: int,
    ) -> ContentVersionCompareOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
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
        item_id: UUID,
        version_number: int,
        actor_user_id: UUID | None,
    ) -> ContentVersionOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
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
            return await self.reads.build_version_out(version=version, conn=conn)

    async def unarchive_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        actor_user_id: UUID | None,
    ) -> ContentItemOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
            )
            if item.status != ContentItemStatus.ARCHIVED:
                raise Conflict("Content item is not archived", error="CONTENT_ITEM_NOT_ARCHIVED")

            current_version = int(item.draft_version or 0)
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
            return to_item_out(item, item.model_definition)

    async def patch_version(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        version_number: int,
        actor_user_id: UUID | None,
        payload: ContentVersionPatchIn,
    ) -> ContentVersionOut:
        async with in_transaction() as conn:
            item = await self._get_locked_item(
                workspace_id=workspace_id,
                site_id=site_id,
                item_id=item_id,
                conn=conn,
            )
            version = await self._get_locked_version(item_id=item.id, version_number=version_number, conn=conn)
            if version.state != ContentVersionState.DRAFT:
                raise Conflict("Non-draft version is immutable", error="CONTENT_VERSION_IMMUTABLE")

            version_fields = build_patch_version_fields(payload=payload, actor_user_id=actor_user_id)
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
                presentations = normalize_presentations(payload.presentations)
                await self._replace_presentations(version_id=version.id, presentations=presentations, conn=conn)

            item_fields = build_patch_item_fields(
                payload=payload,
                actor_user_id=actor_user_id,
                has_version_changes=has_version_changes,
                has_presentation_changes=has_presentation_changes,
            )
            if item_fields:
                await self.repo.update_item_fields(item, fields=item_fields, conn=conn)
            return await self.reads.build_version_out(version=version, conn=conn)
