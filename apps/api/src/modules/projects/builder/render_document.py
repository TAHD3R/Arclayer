from __future__ import annotations

from collections.abc import Mapping
from typing import cast
from uuid import UUID

from src.common.types.json_types import JsonValue
from src.models.content.content_version import ContentVersionRecord
from src.models.content.seo_profile import SEOProfileRecord
from src.modules.projects.builder.render_document_design import (
    RENDERER_PROFILE,
    RENDERER_VERSION,
    resolve_renderer_design,
)
from src.modules.projects.builder.render_document_errors import (
    raise_render_conflict,
    raise_render_not_found,
)
from src.modules.projects.builder.render_document_schema import (
    BuilderPageRenderDocumentOut,
    BuilderRendererIdentityOut,
    BuilderRenderEvidenceOut,
    BuilderRenderPinsOut,
    BuilderRenderSeoOut,
)
from src.modules.projects.builder.render_document_sections import build_render_sections
from src.modules.projects.builder.schema import BuilderRevisionOut, BuilderRevisionPageOut
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1


def build_page_render_document(
    *,
    revision: BuilderRevisionOut,
    page_item_id: UUID,
    locale: str,
    theme_key: str | None,
    version_by_item: Mapping[UUID, ContentVersionRecord],
    seo_profile: SEOProfileRecord | None,
    design_manifest: DesignSystemManifestV1,
    catalog: ComponentCatalogV1,
) -> BuilderPageRenderDocumentOut:
    page = next((item for item in revision.pages if UUID(str(item.item_id)) == page_item_id), None)
    if page is None:
        raise_render_not_found("BUILDER_RENDER_PAGE_NOT_FOUND")
    route_path = _route_path(page=page, locale=locale)
    theme, token_values, recipes = resolve_renderer_design(
        revision=revision,
        design_manifest=design_manifest,
        catalog=catalog,
        theme_key=theme_key,
    )
    sections = build_render_sections(
        page=page,
        revision=revision,
        version_by_item=version_by_item,
        catalog=catalog,
        recipes=recipes,
        token_values=token_values,
    )
    document = BuilderPageRenderDocumentOut(
        renderer=BuilderRendererIdentityOut(profile=RENDERER_PROFILE, version=RENDERER_VERSION),
        render_source=("visual_blueprint" if page.visual_blueprint is not None else "wireframe_preview"),
        pins=_render_pins(revision=revision, page=page, catalog=catalog),
        locale=locale,
        route_path=route_path,
        theme=theme,
        seo=_render_seo(page=page, seo_profile=seo_profile),
        sections=sections,
        evidence=_render_evidence(has_visual_blueprint=page.visual_blueprint is not None),
        document_hash=f"sha256:{'0' * 64}",
    )
    hash_input = cast(
        JsonValue,
        document.model_dump(mode="json", by_alias=True, exclude={"document_hash"}),
    )
    return document.model_copy(update={"document_hash": canonical_hash(hash_input)})


def _route_path(*, page: BuilderRevisionPageOut, locale: str) -> str:
    route = next((item for item in page.routes if item.locale == locale and item.is_active), None)
    if route is None:
        raise_render_conflict("BUILDER_RENDER_LOCALE_NOT_AVAILABLE", details={"locale": locale})
    return route.path


def _render_pins(
    *,
    revision: BuilderRevisionOut,
    page: BuilderRevisionPageOut,
    catalog: ComponentCatalogV1,
) -> BuilderRenderPinsOut:
    manifest = revision.site_revision
    return BuilderRenderPinsOut(
        site_revision_id=manifest.id,
        site_revision_hash=manifest.manifest_hash,
        content_structure_revision_id=revision.content_structure_revision.id,
        content_structure_hash=revision.content_structure_revision.structure_hash,
        page_item_id=page.item_id,
        page_content_version_id=page.content_version_id,
        page_version_number=page.version_number,
        design_system_id=manifest.design_system_id,
        design_system_version_id=manifest.design_system_version_id,
        design_system_manifest_checksum=manifest.design_system_manifest_checksum,
        component_catalog_version=catalog.catalog_version,
        component_catalog_checksum=catalog.checksum,
        visual_blueprint_checksum=(
            canonical_hash(page.visual_blueprint.model_dump(mode="json", by_alias=True))
            if page.visual_blueprint is not None
            else None
        ),
    )


def _render_seo(*, page: BuilderRevisionPageOut, seo_profile: SEOProfileRecord | None) -> BuilderRenderSeoOut:
    return BuilderRenderSeoOut(
        title=(seo_profile.meta_title if seo_profile is not None else None) or page.title,
        description=(seo_profile.meta_description if seo_profile is not None else None) or page.summary,
        canonical_url=seo_profile.canonical_url if seo_profile is not None else None,
        robots_directive=seo_profile.robots_directive if seo_profile is not None else None,
    )


def _render_evidence(*, has_visual_blueprint: bool) -> tuple[BuilderRenderEvidenceOut, ...]:
    passed = (
        "manifest",
        "content_structure",
        "content_versions",
        "presentations_and_bindings",
        "wireframe_and_catalog",
        "global_sections",
        "design_system",
        "document_hash",
    )
    if has_visual_blueprint:
        passed = (*passed, "visual_blueprint")
    pending = (
        *(("visual_blueprint",) if not has_visual_blueprint else ()),
        "assets_and_font_rights",
        "compiler",
        "smoke",
        "publication",
    )
    return tuple(BuilderRenderEvidenceOut(concern=concern, status="passed") for concern in passed) + tuple(
        BuilderRenderEvidenceOut(concern=concern, status="not_evaluated") for concern in pending
    )


__all__ = ["build_page_render_document"]
