from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.modules.projects.builder.change_set_schema import (
    BuilderGlobalSectionCreateOperationV1,
    BuilderGlobalSectionDeleteOperationV1,
    BuilderGlobalSectionIntentReplaceOperationV1,
    BuilderPageCreateOperationV1,
    BuilderPageDeleteOperationV1,
    BuilderPageIntentReplaceOperationV1,
    BuilderPageMoveOperationV1,
    BuilderPageRenameOperationV1,
    BuilderPageReorderOperationV1,
    BuilderRevisionRestoreOperationV1,
    BuilderRouteDisableOperationV1,
    BuilderRouteSetOperationV1,
    BuilderSitemapOperationV1,
)
from src.modules.projects.builder.restore_change_set_context import ResolvedBuilderRestoreTarget
from src.modules.projects.builder.schema import (
    BuilderPagePlanningV1,
    ContentStructureSnapshotV1,
    SiteRevisionManifestV1,
)
from src.modules.projects.content.items.transaction_commands import (
    ContentItemAfterCommitEffect,
    ProjectContentItemTransactionCommands,
)
from src.modules.projects.content.routing.schema import HierarchyNodeUpsertIn, RouteBindingUpsertIn
from src.modules.projects.content.routing.service import (
    set_route_binding_active_for_locale,
    upsert_hierarchy_node_record,
    upsert_route_binding_record,
)


class AppliedBuilderOperations(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    client_page_ids: dict[str, UUID]
    client_global_section_ids: dict[str, UUID]
    after_commit_effects: tuple[ContentItemAfterCommitEffect, ...]
    planning_overrides: dict[UUID, BuilderPagePlanningV1] = Field(default_factory=dict)


async def apply_sitemap_operations(
    *,
    commands: ProjectContentItemTransactionCommands,
    structure: ContentStructureSnapshotV1,
    operations: tuple[BuilderSitemapOperationV1, ...],
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> AppliedBuilderOperations:
    client_page_ids: dict[str, UUID] = {}
    client_global_section_ids: dict[str, UUID] = {}
    effects: list[ContentItemAfterCommitEffect] = []
    planning_overrides: dict[UUID, BuilderPagePlanningV1] = {}
    parent_by_item = {
        UUID(str(page.item_id)): UUID(str(page.parent_item_id)) if page.parent_item_id is not None else None
        for page in structure.pages
    }

    for operation in operations:
        if isinstance(operation, BuilderPageCreateOperationV1):
            mutation = await commands.create_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                actor_user_id=actor_user_id,
                model_key=operation.model_key,
                title=operation.title,
                slug=operation.slug,
                locale=operation.locale,
                fields_snapshot=operation.fields_snapshot,
                conn=conn,
            )
            item_id = mutation.item_id
            client_page_ids[operation.client_page_id] = item_id
            parent_by_item[item_id] = UUID(str(operation.parent_item_id)) if operation.parent_item_id else None
            await upsert_hierarchy_node_record(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                payload=HierarchyNodeUpsertIn(
                    parent_item_id=operation.parent_item_id,
                    sort_order=operation.sort_order,
                ),
                conn=conn,
            )
            await upsert_route_binding_record(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                payload=RouteBindingUpsertIn(
                    locale=operation.locale,
                    path=operation.path,
                    route_mode="static",
                    is_active=True,
                ),
                conn=conn,
            )
            effects.append(mutation.after_commit)
            if operation.purpose is not None or operation.section_intents:
                planning_overrides[item_id] = BuilderPagePlanningV1(
                    purpose=operation.purpose,
                    section_intents=operation.section_intents,
                )
            continue

        if isinstance(operation, BuilderGlobalSectionCreateOperationV1):
            mutation = await commands.create_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                actor_user_id=actor_user_id,
                model_key="reusable-section",
                title=operation.title,
                slug=operation.slug,
                locale=operation.locale,
                fields_snapshot=operation.fields_snapshot,
                conn=conn,
            )
            item_id = mutation.item_id
            client_global_section_ids[operation.client_global_section_id] = item_id
            effects.append(mutation.after_commit)
            if operation.purpose is not None or operation.section_intents:
                planning_overrides[item_id] = BuilderPagePlanningV1(
                    purpose=operation.purpose,
                    section_intents=operation.section_intents,
                )
            continue

        item_id = _item_id(operation)
        if isinstance(
            operation,
            (
                BuilderPageIntentReplaceOperationV1,
                BuilderGlobalSectionIntentReplaceOperationV1,
            ),
        ):
            planning_overrides[item_id] = BuilderPagePlanningV1(
                purpose=operation.purpose,
                section_intents=operation.section_intents,
            )
            continue
        if isinstance(operation, BuilderPageRenameOperationV1):
            mutation = await commands.rename_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                expected_draft_version=operation.expected_draft_version,
                title=operation.title,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            effects.append(mutation.after_commit)
            continue

        if isinstance(operation, BuilderGlobalSectionDeleteOperationV1):
            mutation = await commands.delete_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                expected_draft_version=operation.expected_draft_version,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            effects.append(mutation.after_commit)
            continue

        if isinstance(operation, BuilderPageMoveOperationV1):
            parent_id = UUID(str(operation.parent_item_id)) if operation.parent_item_id else None
            parent_by_item[item_id] = parent_id
            await upsert_hierarchy_node_record(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                payload=HierarchyNodeUpsertIn(
                    parent_item_id=operation.parent_item_id,
                    sort_order=operation.sort_order,
                ),
                conn=conn,
            )
            continue

        if isinstance(operation, BuilderPageReorderOperationV1):
            await _apply_reorder(
                structure=structure,
                item_id=item_id,
                target_order=operation.sort_order,
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                conn=conn,
            )
            continue

        if isinstance(operation, BuilderPageDeleteOperationV1):
            mutation = await commands.delete_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                expected_draft_version=operation.expected_draft_version,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            parent_by_item.pop(item_id, None)
            effects.append(mutation.after_commit)
            continue

        if isinstance(operation, BuilderRouteSetOperationV1):
            await upsert_route_binding_record(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                payload=RouteBindingUpsertIn(
                    locale=operation.locale,
                    path=operation.path,
                    route_mode=operation.route_mode,
                    route_priority=operation.route_priority,
                    primary_source=operation.primary_source,
                    is_active=True,
                ),
                conn=conn,
            )
            continue

        if isinstance(operation, BuilderRouteDisableOperationV1):
            await set_route_binding_active_for_locale(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                locale=operation.locale,
                is_active=False,
                conn=conn,
            )
            continue

        raise Conflict(error="BUILDER_OPERATION_INVALID", message=t("errors", "BUILDER_OPERATION_INVALID"))

    return AppliedBuilderOperations(
        client_page_ids=client_page_ids,
        client_global_section_ids=client_global_section_ids,
        after_commit_effects=tuple(effects),
        planning_overrides=planning_overrides,
    )


async def apply_revision_restore_operation(
    *,
    commands: ProjectContentItemTransactionCommands,
    current_manifest: SiteRevisionManifestV1,
    current_structure: ContentStructureSnapshotV1,
    target: ResolvedBuilderRestoreTarget,
    operation: BuilderRevisionRestoreOperationV1,
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> AppliedBuilderOperations:
    current_ids = _structure_item_ids(current_structure)
    target_ids = _structure_item_ids(target.structure)
    effects: list[ContentItemAfterCommitEffect] = []
    if not target_ids.issubset(target.live_item_ids):
        raise Conflict(
            error="BUILDER_RESTORE_TARGET_UNAVAILABLE", message=t("errors", "BUILDER_RESTORE_TARGET_UNAVAILABLE")
        )
    current_versions = {
        UUID(str(pin.item_id)): int(pin.version_number)
        for pin in (*current_manifest.page_versions, *current_manifest.global_section_versions)
    }
    for item_id in sorted(current_ids - target_ids, key=str):
        deletion = await commands.delete_item(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            expected_draft_version=current_versions.get(item_id, 1),
            actor_user_id=actor_user_id,
            conn=conn,
        )
        effects.append(deletion.after_commit)
    for item_id in _restore_item_order(target.structure, target_ids - current_ids):
        if item_id in target.retained_item_ids:
            await commands.restore_deleted_item(
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
    target_versions = {
        UUID(str(pin.item_id)): int(pin.version_number)
        for pin in (*target.manifest.page_versions, *target.manifest.global_section_versions)
    }
    for item_id, version_number in target_versions.items():
        mutation = await commands.restore_version_to_draft(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            source_version_number=version_number,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        effects.append(mutation.after_commit)

    target_routes = {
        (UUID(str(page.item_id)), route.locale): route
        for page in target.structure.pages
        for route in page.routes
        if route.is_active
    }
    for page in current_structure.pages:
        for route in page.routes:
            if route.is_active and (UUID(str(page.item_id)), route.locale) not in target_routes:
                await set_route_binding_active_for_locale(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=UUID(str(page.item_id)),
                    locale=route.locale,
                    is_active=False,
                    conn=conn,
                )
    for page in target.structure.pages:
        item_id = UUID(str(page.item_id))
        await upsert_hierarchy_node_record(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=item_id,
            payload=HierarchyNodeUpsertIn(
                parent_item_id=page.parent_item_id,
                sort_order=page.sort_order,
            ),
            conn=conn,
        )
        for route in page.routes:
            if route.is_active:
                await upsert_route_binding_record(
                    workspace_id=workspace_id,
                    site_id=site_id,
                    environment_id=environment_id,
                    item_id=item_id,
                    payload=RouteBindingUpsertIn(
                        locale=route.locale,
                        path=route.path,
                        is_active=True,
                    ),
                    conn=conn,
                )
    return AppliedBuilderOperations(
        client_page_ids={},
        client_global_section_ids={},
        after_commit_effects=tuple(effects),
        planning_overrides={
            UUID(str(page.item_id)): BuilderPagePlanningV1(
                purpose=page.purpose,
                section_intents=page.section_intents,
            )
            for page in target.structure.pages
            if page.purpose is not None or page.section_intents
        },
    )


def _item_id(operation: BuilderSitemapOperationV1) -> UUID:
    item_id = getattr(operation, "item_id", None)
    if item_id is None:
        raise Conflict(error="BUILDER_OPERATION_INVALID", message=t("errors", "BUILDER_OPERATION_INVALID"))
    return UUID(str(item_id))


def _structure_item_ids(structure: ContentStructureSnapshotV1) -> set[UUID]:
    return {UUID(str(item.item_id)) for item in (*structure.pages, *structure.global_references)}


def _restore_item_order(structure: ContentStructureSnapshotV1, item_ids: set[UUID]) -> tuple[UUID, ...]:
    parent_by_item = {
        UUID(str(page.item_id)): UUID(str(page.parent_item_id))
        for page in structure.pages
        if page.parent_item_id is not None
    }
    remaining = set(item_ids)
    ordered: list[UUID] = []
    while remaining:
        ready = {item_id for item_id in remaining if parent_by_item.get(item_id) not in remaining}
        if not ready:
            raise Conflict(
                error="BUILDER_RESTORE_HIERARCHY_INVALID",
                message=t("errors", "BUILDER_RESTORE_HIERARCHY_INVALID"),
            )
        ordered.extend(sorted(ready, key=str))
        remaining.difference_update(ready)
    return tuple(ordered)


async def _apply_reorder(
    *,
    structure: ContentStructureSnapshotV1,
    item_id: UUID,
    target_order: int,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    conn: BaseDBAsyncClient,
) -> None:
    pages = {UUID(str(page.item_id)): page for page in structure.pages}
    item = pages.get(item_id)
    if item is None:
        raise Conflict(error="BUILDER_PAGE_NOT_FOUND", message=t("errors", "BUILDER_PAGE_NOT_FOUND"))
    siblings = sorted(
        (page for page in structure.pages if page.parent_item_id == item.parent_item_id),
        key=lambda page: page.sort_order,
    )
    bounded_target = max(0, min(target_order, len(siblings) - 1))
    current_order = item.sort_order
    if current_order < bounded_target:
        shifted = [
            page for page in siblings if page.item_id != item_id and current_order < page.sort_order <= bounded_target
        ]
        delta = -1
    elif current_order > bounded_target:
        shifted = [
            page for page in siblings if page.item_id != item_id and bounded_target <= page.sort_order < current_order
        ]
        delta = 1
    else:
        shifted = []
        delta = 0
    for page in shifted:
        await upsert_hierarchy_node_record(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=UUID(str(page.item_id)),
            payload=HierarchyNodeUpsertIn(
                parent_item_id=page.parent_item_id,
                sort_order=page.sort_order + delta,
            ),
            conn=conn,
        )
    await upsert_hierarchy_node_record(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=item_id,
        payload=HierarchyNodeUpsertIn(
            parent_item_id=item.parent_item_id,
            sort_order=bounded_target,
        ),
        conn=conn,
    )


__all__ = ["AppliedBuilderOperations", "apply_revision_restore_operation", "apply_sitemap_operations"]
