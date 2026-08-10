from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import NotFound
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.modules.projects.builder.change_set_context import require_builder_structure_revision
from src.modules.projects.builder.change_set_schema import BuilderRevisionRestoreOperationV1
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import ContentStructureSnapshotV1, SiteRevisionManifestV1
from src.modules.projects.content.items.retention import (
    get_retained_content_item_ids,
    get_retained_content_model_definition_ids,
    get_retained_content_version_ids,
)


class ResolvedBuilderRestoreTarget(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    manifest: SiteRevisionManifestV1
    structure: ContentStructureSnapshotV1
    live_item_ids: frozenset[UUID]
    retained_item_ids: frozenset[UUID]
    version_ids: frozenset[UUID]
    missing_model_definition_item_ids: frozenset[UUID]


async def resolve_builder_restore_target(
    *,
    repository: SiteBuilderRepository,
    workspace_id: UUID,
    project_id: UUID,
    current_manifest: SiteRevisionManifestV1,
    operation: BuilderRevisionRestoreOperationV1,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderRestoreTarget:
    record = await repository.get_site_revision(
        project_id=project_id,
        revision_id=UUID(str(operation.target_revision_id)),
        conn=conn,
    )
    if record is None:
        raise NotFound("Restore target revision not found", error="SITE_REVISION_NOT_FOUND")
    manifest = parse_site_revision_manifest(record)
    if (
        manifest.workspace_id != workspace_id
        or manifest.project_id != project_id
        or manifest.site_id != current_manifest.site_id
        or manifest.environment_id != current_manifest.environment_id
    ):
        raise NotFound("Restore target revision not found", error="SITE_REVISION_NOT_FOUND")
    structure = await require_builder_structure_revision(
        repository=repository,
        workspace_id=workspace_id,
        project_id=project_id,
        manifest=manifest,
        conn=conn,
    )
    _, _, items = await repository.list_structure_records(
        workspace_id=workspace_id,
        site_id=UUID(str(current_manifest.site_id)),
        environment_id=UUID(str(current_manifest.environment_id)),
        conn=conn,
    )
    global_items = await repository.list_global_section_records(
        workspace_id=workspace_id,
        site_id=UUID(str(current_manifest.site_id)),
        environment_id=UUID(str(current_manifest.environment_id)),
        conn=conn,
    )
    target_item_ids = [UUID(str(item.item_id)) for item in (*structure.pages, *structure.global_references)]
    versions = await repository.list_content_versions(item_ids=target_item_ids, conn=conn)
    target_item_id_set = set(target_item_ids)
    retained_item_ids = await get_retained_content_item_ids(
        workspace_id=workspace_id,
        site_id=UUID(str(current_manifest.site_id)),
        environment_id=UUID(str(current_manifest.environment_id)),
        item_ids=target_item_id_set,
        conn=conn,
    )
    retained_version_ids = await get_retained_content_version_ids(
        workspace_id=workspace_id,
        site_id=UUID(str(current_manifest.site_id)),
        environment_id=UUID(str(current_manifest.environment_id)),
        item_ids=target_item_id_set,
        conn=conn,
    )
    retained_model_ids = await get_retained_content_model_definition_ids(
        workspace_id=workspace_id,
        site_id=UUID(str(current_manifest.site_id)),
        environment_id=UUID(str(current_manifest.environment_id)),
        item_ids=target_item_id_set,
        conn=conn,
    )
    current_items = {UUID(str(item.id)): item for item in (*items, *global_items)}
    target_model_ids: dict[UUID, UUID | None] = {}
    for item_id in target_item_id_set:
        current_item = current_items.get(item_id)
        target_model_ids[item_id] = (
            UUID(str(current_item.model_definition_id))
            if current_item is not None and current_item.model_definition_id is not None
            else retained_model_ids.get(item_id)
        )
    available_model_ids = {
        UUID(str(model_id))
        for model_id in await ContentModelDefinitionRecord
        .filter(
            workspace_id=workspace_id,
            site_id=UUID(str(current_manifest.site_id)),
            environment_id=UUID(str(current_manifest.environment_id)),
            id__in=[model_id for model_id in target_model_ids.values() if model_id is not None],
        )
        .using_db(conn)
        .values_list("id", flat=True)
    }
    missing_model_definition_item_ids = frozenset(
        item_id
        for item_id, model_id in target_model_ids.items()
        if model_id is None or model_id not in available_model_ids
    )
    return ResolvedBuilderRestoreTarget(
        manifest=manifest,
        structure=structure,
        live_item_ids=frozenset(UUID(str(item.id)) for item in (*items, *global_items)) | retained_item_ids,
        retained_item_ids=retained_item_ids,
        version_ids=frozenset(UUID(str(version.id)) for version in versions) | retained_version_ids,
        missing_model_definition_item_ids=missing_model_definition_item_ids,
    )


__all__ = ["ResolvedBuilderRestoreTarget", "resolve_builder_restore_target"]
