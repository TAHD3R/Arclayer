from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.change_set_analysis import require_builder_change_set_not_blocked
from src.modules.projects.builder.change_set_apply_operations import AppliedBuilderOperations
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.builder.wireframe_change_set import analyze_wireframe_change_set
from src.modules.projects.builder.wireframe_change_set_schema import BuilderWireframeOperationV1
from src.modules.projects.builder.wireframe_schema import WireframeDocumentV1
from src.modules.projects.content.items.wireframe_transaction_command import (
    ProjectContentWireframeTransactionCommand,
)
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


async def apply_wireframe_operations(
    *,
    commands: ProjectContentWireframeTransactionCommand,
    structure: ContentStructureSnapshotV1,
    manifest: SiteRevisionManifestV1,
    wireframes_by_item: dict[UUID, WireframeDocumentV1 | None],
    component_catalog: ComponentCatalogV1,
    operations: tuple[BuilderWireframeOperationV1, ...],
    provenance_source: BuilderProvenanceSource,
    workspace_id: UUID,
    project_id: UUID,
    runtime_id: UUID,
    site_id: UUID,
    environment_id: UUID,
    actor_user_id: UUID,
    conn: BaseDBAsyncClient,
) -> AppliedBuilderOperations:
    analysis = analyze_wireframe_change_set(
        structure=structure,
        manifest=manifest,
        wireframes_by_item=wireframes_by_item,
        component_catalog=component_catalog,
        operations=operations,
        provenance_source=provenance_source,
    )
    require_builder_change_set_not_blocked(analysis)
    effects = []
    for candidate in analysis.wireframe_candidates:
        mutation = await commands.replace_wireframe(
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            environment_id=environment_id,
            item_id=UUID(str(candidate.item_id)),
            expected_content_version_id=UUID(str(candidate.base_content_version_id)),
            expected_draft_version=candidate.base_version_number,
            wireframe=candidate.wireframe,
            actor_user_id=actor_user_id,
            conn=conn,
        )
        effects.append(mutation.after_commit)
    return AppliedBuilderOperations(
        client_page_ids={},
        client_global_section_ids={},
        after_commit_effects=tuple(effects),
    )


__all__ = ["apply_wireframe_operations"]
