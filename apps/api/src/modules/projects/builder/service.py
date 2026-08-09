from __future__ import annotations

from collections.abc import Sequence
from typing import NoReturn, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonValue
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.content.content_version import ContentVersionRecord
from src.models.design_systems.design_system_version import DesignSystemVersionRecord
from src.modules.analytics.audit import write_required_activity_event
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.baseline_content import ensure_builder_baseline_content
from src.modules.projects.builder.command import builder_request_fingerprint, require_builder_idempotency_key
from src.modules.projects.builder.design_contract_context import resolve_builder_design_contract
from src.modules.projects.builder.design_system_context import resolve_exact_builder_design_system
from src.modules.projects.builder.initialization import (
    ActivityWriter,
    BaselineInitializationContext,
    create_root_builder_baseline,
)
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.projection import get_project_builder_projection, get_project_builder_revision
from src.modules.projects.builder.render_document import build_page_render_document
from src.modules.projects.builder.render_document_design import BuilderRenderDesignPins, resolve_design_token_values
from src.modules.projects.builder.render_document_schema import BuilderPageRenderDocumentOut
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import (
    BuilderComponentCatalogOut,
    BuilderDesignTokenOut,
    BuilderInitializationOut,
    BuilderInitializationRequest,
    BuilderRevisionOut,
    ProjectBuilderProjectionOut,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.workspaces.design_systems.manifest import DesignSystemManifestV1, all_design_tokens


class SiteBuilderService(BaseService):
    def __init__(
        self,
        *,
        repository: SiteBuilderRepository,
        design_system_repository: ProjectDesignSystemsRepository,
        component_catalog_resolver: ComponentCatalogResolver,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._design_system_repository = design_system_repository
        self._component_catalog_resolver = component_catalog_resolver
        self._activity_writer = activity_writer

    async def get_projection(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
    ) -> ProjectBuilderProjectionOut:
        return await get_project_builder_projection(
            repository=self._repository,
            design_system_repository=self._design_system_repository,
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
        )

    async def get_revision(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        revision_id: UUID,
    ) -> BuilderRevisionOut:
        async with self.tx() as conn:
            return await get_project_builder_revision(
                repository=self._repository,
                workspace_id=workspace_id,
                project_id=project_id,
                revision_id=revision_id,
                conn=conn,
            )

    async def get_page_render_document(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        revision_id: UUID,
        page_item_id: UUID,
        locale: str,
        theme_key: str | None,
    ) -> BuilderPageRenderDocumentOut:
        async with self.tx() as conn:
            revision = await get_project_builder_revision(
                repository=self._repository,
                workspace_id=workspace_id,
                project_id=project_id,
                revision_id=revision_id,
                conn=conn,
            )
            versions = await self._repository.list_content_versions(
                item_ids=[UUID(str(item.item_id)) for item in (*revision.pages, *revision.global_sections)],
                conn=conn,
            )
            version_by_item = _select_render_versions(revision=revision, versions=versions)
            design_version = await self._design_system_repository.get_version(
                workspace_id=workspace_id,
                system_id=UUID(str(revision.site_revision.design_system_id)),
                version_id=UUID(str(revision.site_revision.design_system_version_id)),
                conn=conn,
            )
            design_manifest, catalog = self._resolve_render_design(
                revision=revision,
                design_version=design_version,
            )
            return await self._build_page_render_document(
                revision=revision,
                page_item_id=page_item_id,
                locale=locale,
                theme_key=theme_key,
                version_by_item=version_by_item,
                design_manifest=design_manifest,
                catalog=catalog,
                design_pins=None,
                conn=conn,
            )

    async def get_page_render_document_for_design_system(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        revision_id: UUID,
        page_item_id: UUID,
        locale: str,
        theme_key: str | None,
        design_pins: BuilderRenderDesignPins,
        design_manifest: DesignSystemManifestV1,
    ) -> BuilderPageRenderDocumentOut:
        async with self.tx() as conn:
            revision = await get_project_builder_revision(
                repository=self._repository,
                workspace_id=workspace_id,
                project_id=project_id,
                revision_id=revision_id,
                conn=conn,
            )
            catalog_version = design_manifest.component_catalog_version
            if catalog_version is None:
                _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
            catalog = self._component_catalog_resolver.resolve(catalog_version)
            if catalog is None:
                _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
            versions = await self._repository.list_content_versions(
                item_ids=[UUID(str(item.item_id)) for item in (*revision.pages, *revision.global_sections)],
                conn=conn,
            )
            version_by_item = _select_render_versions(revision=revision, versions=versions)
            return await self._build_page_render_document(
                revision=revision,
                page_item_id=page_item_id,
                locale=locale,
                theme_key=theme_key,
                version_by_item=version_by_item,
                design_manifest=design_manifest,
                catalog=catalog,
                design_pins=design_pins,
                conn=conn,
            )

    async def _build_page_render_document(
        self,
        *,
        revision: BuilderRevisionOut,
        page_item_id: UUID,
        locale: str,
        theme_key: str | None,
        version_by_item: dict[UUID, ContentVersionRecord],
        design_manifest: DesignSystemManifestV1,
        catalog: ComponentCatalogV1,
        design_pins: BuilderRenderDesignPins | None,
        conn: BaseDBAsyncClient,
    ) -> BuilderPageRenderDocumentOut:
        seo_profiles = await self._repository.list_seo_profiles(
            version_ids=[UUID(str(item.content_version_id)) for item in (*revision.pages, *revision.global_sections)],
            conn=conn,
        )
        page_version_id = next(
            (UUID(str(item.content_version_id)) for item in revision.pages if UUID(str(item.item_id)) == page_item_id),
            None,
        )
        if page_version_id is None:
            _raise_not_found("BUILDER_RENDER_PAGE_NOT_FOUND")
        seo_profile = next(
            (profile for profile in seo_profiles if UUID(str(profile.version_id)) == page_version_id),
            None,
        )
        return build_page_render_document(
            revision=revision,
            page_item_id=page_item_id,
            locale=locale,
            theme_key=theme_key,
            version_by_item=version_by_item,
            seo_profile=seo_profile,
            design_manifest=design_manifest,
            catalog=catalog,
            design_pins=design_pins,
        )

    def _resolve_render_design(
        self,
        *,
        revision: BuilderRevisionOut,
        design_version: DesignSystemVersionRecord | None,
    ) -> tuple[DesignSystemManifestV1, ComponentCatalogV1]:
        if design_version is None:
            _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
        try:
            design_manifest = DesignSystemManifestV1.model_validate(design_version.manifest)
        except ValidationError:
            _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
        catalog_version = design_manifest.component_catalog_version
        catalog = self._component_catalog_resolver.resolve(catalog_version) if catalog_version else None
        if (
            catalog is None
            or design_version.manifest_checksum != revision.site_revision.design_system_manifest_checksum
            or design_version.component_catalog_version != catalog.catalog_version
        ):
            _raise_conflict("DESIGN_SYSTEM_COMPONENT_INCOMPATIBLE")
        return design_manifest, catalog

    async def get_component_catalog(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
    ) -> BuilderComponentCatalogOut:
        project = await self._repository.get_project(project_id=project_id, workspace_id=workspace_id)
        if project is None:
            _raise_not_found("PROJECT_NOT_FOUND")
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")
        async with self.tx() as conn:
            site = await self._repository.get_site(project_id=project_id, runtime_id=runtime_id, conn=conn)
            environment = await self._repository.get_default_preview_environment(project_id=project_id, conn=conn)
            if site is None:
                _raise_not_found("BUILDER_SITE_NOT_FOUND")
            if environment is None:
                _raise_not_found("BUILDER_ENVIRONMENT_NOT_FOUND")
            record = await self._repository.get_latest_site_revision(
                project_id=project_id,
                site_id=site.id,
                environment_id=environment.id,
                conn=conn,
            )
            if record is None:
                _raise_not_found("SITE_REVISION_NOT_FOUND")
            manifest = parse_site_revision_manifest(record)
            design_contract = await resolve_builder_design_contract(
                repository=self._design_system_repository,
                resolver=self._component_catalog_resolver,
                workspace_id=workspace_id,
                manifest=manifest,
                conn=conn,
            )
            theme, resolved_tokens = resolve_design_token_values(
                design_manifest=design_contract.manifest,
            )
            token_definitions = all_design_tokens(design_contract.manifest)
            return BuilderComponentCatalogOut(
                site_revision_id=manifest.id,
                design_system_version_id=manifest.design_system_version_id,
                design_system_manifest_checksum=manifest.design_system_manifest_checksum,
                default_theme_key=theme.key,
                breakpoints=design_contract.manifest.breakpoints,
                design_tokens=tuple(
                    BuilderDesignTokenOut(
                        path=path,
                        type=token_definitions[path].type,
                        resolved_value=cast(JsonValue, resolved_tokens[path]),
                        deprecated=token_definitions[path].deprecated,
                        replacement=token_definitions[path].replacement,
                    )
                    for path in sorted(resolved_tokens)
                ),
                catalog=design_contract.catalog,
            )

    async def initialize(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: BuilderInitializationRequest,
    ) -> BuilderInitializationOut:
        key = require_builder_idempotency_key(idempotency_key)
        fingerprint = builder_request_fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")
        if payload.provenance_source == "agent":
            await self._ensure_agent_design_system_assignment(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                payload=payload,
            )
            project = await self._repository.get_project(project_id=project_id, workspace_id=workspace_id)
            site = await self._repository.get_site(
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=UUID(str(payload.site_id)),
            )
            environment = await self._repository.get_environment(
                project_id=project_id,
                environment_id=UUID(str(payload.environment_id)),
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            if site is None:
                _raise_not_found("BUILDER_SITE_NOT_FOUND")
            if environment is None:
                _raise_not_found("BUILDER_ENVIRONMENT_NOT_FOUND")
            await ensure_builder_baseline_content(
                settings=self.settings,
                tenant_context=self._repository.tenant_context,
                workspace_id=workspace_id,
                project_id=project_id,
                site_id=site.id,
                environment_id=environment.id,
                actor_user_id=actor_user_id,
                project_name=str(project.name),
            )
        async with self.tx() as conn:
            project = await self._repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            replay = await self._repository.get_initialization_command(
                project_id=project_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                if replay.request_fingerprint != fingerprint:
                    _raise_conflict("BUILDER_IDEMPOTENCY_CONFLICT")
                return BuilderInitializationOut.model_validate(replay.result_snapshot)
            require_builder_authority(project, expected_revision=payload.expected_authoring_revision)
            site = await self._repository.get_site(
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=payload.site_id,
                conn=conn,
            )
            if site is None:
                _raise_not_found("BUILDER_SITE_NOT_FOUND")
            environment = await self._repository.get_environment(
                project_id=project_id,
                environment_id=payload.environment_id,
                conn=conn,
            )
            if environment is None:
                _raise_not_found("BUILDER_ENVIRONMENT_NOT_FOUND")
            existing = await self._repository.get_latest_site_revision(
                project_id=project_id,
                site_id=site.id,
                environment_id=environment.id,
                conn=conn,
                for_update=True,
            )
            if existing is not None:
                _raise_conflict("SITE_REVISION_ALREADY_INITIALIZED")
            design_system = await resolve_exact_builder_design_system(
                repository=self._design_system_repository,
                component_catalog_resolver=self._component_catalog_resolver,
                workspace_id=workspace_id,
                project_id=project_id,
                payload=payload,
                conn=conn,
            )
            result = await create_root_builder_baseline(
                repository=self._repository,
                settings=self.settings,
                activity_writer=self._activity_writer,
                context=BaselineInitializationContext(
                    organization_id=organization_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    site=site,
                    environment=environment,
                    project=project,
                    design_system=design_system,
                    actor_user_id=actor_user_id,
                    payload=payload,
                ),
                conn=conn,
            )
            await self._repository.create_initialization_command(
                values={
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "site_id": site.id,
                    "environment_id": environment.id,
                    "request_idempotency_key": key,
                    "request_fingerprint": fingerprint,
                    "result_snapshot": result.model_dump(mode="json", by_alias=True),
                    "actor_user_id": actor_user_id,
                    "correlation_id": correlation_id.get(None),
                },
                conn=conn,
            )
            return result

    async def _ensure_agent_design_system_assignment(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID,
        payload: BuilderInitializationRequest,
    ) -> None:
        async with self.tx() as conn:
            await self._design_system_repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if (
                await self._design_system_repository.get_assignment(
                    project_id=project_id,
                    conn=conn,
                    for_update=True,
                )
                is not None
            ):
                return
            default = await self._design_system_repository.get_workspace_default(
                workspace_id=workspace_id,
                conn=conn,
            )
            if default is None:
                _raise_conflict("PROJECT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED")
            if (
                payload.expected_design_system_assignment_revision != 1
                or default.design_system_version_id != UUID(str(payload.expected_design_system_version_id))
                or default.manifest_checksum != payload.expected_design_system_manifest_checksum
            ):
                _raise_conflict("DESIGN_SYSTEM_REVISION_CONFLICT")
            await self._design_system_repository.create_assignment(
                values={
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "design_system_id": default.design_system_id,
                    "design_system_version_id": default.design_system_version_id,
                    "manifest_checksum": default.manifest_checksum,
                    "validation_finding_hash": default.validation_finding_hash,
                    "metadata_revision": 1,
                    "assigned_by_user_id": actor_user_id,
                },
                conn=conn,
            )


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


def _select_render_versions(
    *,
    revision: BuilderRevisionOut,
    versions: Sequence[ContentVersionRecord],
) -> dict[UUID, ContentVersionRecord]:
    version_by_id = {UUID(str(version.id)): version for version in versions}
    result: dict[UUID, ContentVersionRecord] = {}
    for item in (*revision.pages, *revision.global_sections):
        version = version_by_id.get(UUID(str(item.content_version_id)))
        if version is None:
            _raise_conflict("BUILDER_RENDER_DOCUMENT_INVALID")
        result[UUID(str(item.item_id))] = version
    return result
