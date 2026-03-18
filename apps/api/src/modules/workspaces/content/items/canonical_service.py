from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from apps.api.src.core.exceptions import Conflict, NotFound
from apps.api.src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentVersionState,
)
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.modules.workspaces.content.contracts.schema import ContentItemOut, ContentVersionOut
from apps.api.src.modules.workspaces.content.items.domain_helpers import (
    VERSION_TRANSITIONS,
    PresentationPayload,
    build_formless_draft_slug,
    build_patch_item_fields,
    build_patch_version_fields,
    ensure_expected_version,
    extract_component_bindings,
    extract_seo_payload,
    item_fields_for_transition,
    normalize_bootstrap_shape,
    normalize_initial_status,
    normalize_presentations,
    normalize_visibility,
    status_by_published_version,
    to_item_out,
)
from apps.api.src.modules.workspaces.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentVersionDraftSaveIn,
    ContentVersionPatchIn,
)
from apps.api.src.modules.workspaces.content.items.read_service import (
    WorkspaceContentCanonicalItemReadService,
)
from apps.api.src.modules.workspaces.content.items.repository import WorkspaceContentItemsRepository


class WorkspaceContentCanonicalItemsService:
    def __init__(self, repo: WorkspaceContentItemsRepository) -> None:
        self.repo = repo
        self.reads = WorkspaceContentCanonicalItemReadService(repo)

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
            item = await self.repo.create_item(
                workspace_id=workspace_id,
                site_id=site_id,
                model_definition_id=None,
                slug=build_formless_draft_slug(payload.title),
                title=payload.title.strip(),
                locale=payload.locale,
                status=normalize_initial_status(ContentItemStatus.DRAFT),
                visibility=normalize_visibility(ContentItemVisibility.PUBLIC),
                bootstrap_preset_key=None,
                bootstrap_preset_state=str(ContentBootstrapPresetState.NONE),
                capability_pack_ids=[],
                actor_user_id=actor_user_id,
            )
        except IntegrityError as exc:
            raise Conflict(
                "Content item conflict",
                error="CONTENT_ITEM_CONFLICT",
                meta={"title": payload.title, "locale": payload.locale},
            ) from exc

        return to_item_out(item, None)

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
            item = await self.repo.update_item_fields(
                item,
                fields={
                    "bootstrap_preset_key": preset_key,
                    "bootstrap_preset_state": preset_state,
                    "capability_pack_ids": capability_pack_ids,
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
