from __future__ import annotations

from typing import NoReturn
from uuid import UUID

from pydantic import BaseModel, ConfigDict, ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.modules.projects.builder.schema import SiteRevisionManifestV1
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1


class ResolvedBuilderDesignContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    manifest: DesignSystemManifestV1
    catalog: ComponentCatalogV1


async def resolve_builder_design_contract(
    *,
    repository: ProjectDesignSystemsRepository,
    resolver: ComponentCatalogResolver,
    workspace_id: UUID,
    manifest: SiteRevisionManifestV1,
    conn: BaseDBAsyncClient,
) -> ResolvedBuilderDesignContract:
    version = await repository.get_version(
        workspace_id=workspace_id,
        system_id=UUID(str(manifest.design_system_id)),
        version_id=UUID(str(manifest.design_system_version_id)),
        conn=conn,
    )
    if version is None or version.manifest_checksum != manifest.design_system_manifest_checksum:
        _raise_incompatible()
    try:
        design_manifest = DesignSystemManifestV1.model_validate(version.manifest)
    except ValidationError:
        _raise_incompatible()
    catalog_version = design_manifest.component_catalog_version
    if catalog_version is None or version.component_catalog_version != catalog_version:
        _raise_incompatible()
    catalog = resolver.resolve(catalog_version)
    if catalog is None:
        _raise_incompatible()
    return ResolvedBuilderDesignContract(manifest=design_manifest, catalog=catalog)


def _raise_incompatible() -> NoReturn:
    raise Conflict(
        error="DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE",
        message=t("errors", "DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE"),
    )


__all__ = ["ResolvedBuilderDesignContract", "resolve_builder_design_contract"]
