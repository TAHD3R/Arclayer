from __future__ import annotations

from uuid import UUID

from src.config import Settings
from src.core.entity_manager.manager import EntityManager
from src.modules.projects.content.contracts.schema import (
    ContentModelDefinitionContract,
    ContentRoutingContract,
    ContentWorkflowContract,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentPresentationIn,
    ContentVersionDraftSaveIn,
)
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.models.canonical_service import ProjectContentCanonicalModelsService
from src.modules.projects.content.models.protocol_registry import get_official_model_protocol
from src.modules.projects.content.models.repository import ProjectContentModelsRepository
from src.modules.projects.content.routing.schema import HierarchyNodeUpsertIn
from src.modules.projects.content.routing.service import ProjectContentRoutingService
from src.modules.tenancy.schema import TenantContext


async def ensure_builder_baseline_content(
    *,
    settings: Settings,
    tenant_context: TenantContext,
    workspace_id: UUID,
    project_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    project_name: str,
) -> None:
    models_repo = ProjectContentModelsRepository(tenant_context)
    items_repo = ProjectContentItemsRepository(tenant_context)
    models = ProjectContentCanonicalModelsService(repo=models_repo, settings=settings)
    for key in ("page", "article", "reusable-section"):
        if (
            await items_repo.get_model_definition_by_key(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                model_key=key,
            )
            is None
        ):
            await models.create_model(
                workspace_id=workspace_id,
                site_id=site_id,
                environment_id=environment_id,
                actor_user_id=actor_user_id,
                payload=_official_model_contract(key),
            )

    page_model = await items_repo.get_model_definition_by_key(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        model_key="page",
    )
    if page_model is None:
        raise RuntimeError("BUILDER_PAGE_MODEL_BOOTSTRAP_FAILED")
    existing = await items_repo.list_items(
        workspace_id=workspace_id,
        site_id=site_id,
        model_definition_id=page_model.id,
        locale="zh-CN",
        environment_id=environment_id,
    )
    items = ProjectContentCanonicalItemsService(
        repo=items_repo,
        entity_manager=EntityManager(items_repo=items_repo),
        organization_id=tenant_context.organization_id,
    )
    home = (
        existing[0]
        if existing
        else await items.create_item(
            workspace_id=workspace_id,
            site_id=site_id,
            project_id=project_id,
            runtime_id=tenant_context.runtime_id,
            environment_id=environment_id,
            actor_user_id=actor_user_id,
            payload=ContentItemCreateIn(model_key="page", title=project_name, locale="zh-CN"),
        )
    )
    await items.apply_bootstrap_shape(
        workspace_id=workspace_id,
        site_id=site_id,
        project_id=project_id,
        runtime_id=tenant_context.runtime_id,
        environment_id=environment_id,
        item_id=home.id,
        actor_user_id=actor_user_id,
        payload=ContentItemBootstrapShapeIn(
            preset_key="page",
            preset_state="selected",
            capability_pack_ids=["publishable", "routable", "treeable", "visual_editable", "has_slots", "seo_managed"],
        ),
    )
    if not await items_repo.list_versions_for_item(item_id=home.id):
        await items.save_draft_version(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=home.id,
            actor_user_id=actor_user_id,
            payload=ContentVersionDraftSaveIn(
                change_summary="Builder baseline home page",
                fields_snapshot={"title": project_name, "path": "/"},
                presentations=[ContentPresentationIn(kind="form_data", payload={"title": project_name, "path": "/"})],
            ),
        )
    await ProjectContentRoutingService(tenant_context).upsert_hierarchy_node(
        workspace_id=workspace_id,
        site_id=site_id,
        item_id=home.id,
        payload=HierarchyNodeUpsertIn(parent_item_id=None, sort_order=0),
    )


def _official_model_contract(key: str) -> ContentModelDefinitionContract:
    protocol = get_official_model_protocol(key)
    if protocol is None:
        raise RuntimeError(f"BUILDER_OFFICIAL_MODEL_PROTOCOL_MISSING:{key}")
    return ContentModelDefinitionContract.model_validate({
        "singularKey": protocol.singular_key,
        "pluralKey": protocol.plural_key,
        "name": protocol.name,
        "description": protocol.description,
        "category": protocol.category,
        "defaultEditor": protocol.default_editor,
        "defaultRole": protocol.default_role,
        "defaultPosture": protocol.default_posture,
        "defaultSurface": protocol.default_surface,
        "capabilities": list(protocol.capabilities),
        "routing": ContentRoutingContract.model_validate(protocol.routing_policy or {"mode": "none"}),
        "workflow": ContentWorkflowContract.model_validate(
            protocol.workflow_policy or {"states": ["draft", "published"]}
        ),
        "presentation": protocol.presentation_policy,
        "seo": protocol.seo_policy,
        "starterPackPolicy": protocol.starter_pack_policy,
        "surfacePolicy": protocol.surface_policy,
    })
