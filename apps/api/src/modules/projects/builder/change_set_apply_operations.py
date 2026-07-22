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
    BuilderRouteDisableOperationV1,
    BuilderRouteSetOperationV1,
    BuilderSitemapOperationV1,
)
from src.modules.projects.builder.schema import BuilderPagePlanningV1, ContentStructureSnapshotV1
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
            await upsert_hierarchy_node_record(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                item_id=item_id,
                payload=HierarchyNodeUpsertIn(
                    parent_item_id=parent_by_item.get(item_id),
                    sort_order=operation.sort_order,
                ),
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


def _item_id(operation: BuilderSitemapOperationV1) -> UUID:
    item_id = getattr(operation, "item_id", None)
    if item_id is None:
        raise Conflict(error="BUILDER_OPERATION_INVALID", message=t("errors", "BUILDER_OPERATION_INVALID"))
    return UUID(str(item_id))


__all__ = ["AppliedBuilderOperations", "apply_sitemap_operations"]
