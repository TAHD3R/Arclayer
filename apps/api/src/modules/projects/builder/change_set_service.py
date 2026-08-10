from __future__ import annotations

from typing import NoReturn, cast
from uuid import UUID

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.builder._enums import BuilderChangeSetCommandKind
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.analytics.audit import write_required_activity_event
from src.modules.projects.builder.authority import require_builder_authority
from src.modules.projects.builder.change_set_analysis import require_builder_change_set_not_blocked
from src.modules.projects.builder.change_set_apply_context import resolve_builder_change_set_apply_context
from src.modules.projects.builder.change_set_apply_operations import (
    AppliedBuilderOperations,
    apply_revision_restore_operation,
    apply_sitemap_operations,
)
from src.modules.projects.builder.change_set_apply_persistence import (
    persist_builder_change_set_apply,
    replay_builder_change_set_apply,
)
from src.modules.projects.builder.change_set_context import (
    resolve_builder_change_set_preview_context,
)
from src.modules.projects.builder.change_set_persistence import (
    persist_builder_change_set_preview,
    replay_builder_change_set_preview,
)
from src.modules.projects.builder.change_set_preview import analyze_sitemap_change_set
from src.modules.projects.builder.change_set_revision import (
    create_design_system_refresh_revision,
    create_next_builder_revision,
)
from src.modules.projects.builder.change_set_schema import (
    BuilderChangeSetApplyOut,
    BuilderChangeSetApplyRequest,
    BuilderChangeSetPreviewOut,
    BuilderChangeSetPreviewRequest,
    BuilderRevisionRestoreOperationV1,
    BuilderSitemapOperationV1,
)
from src.modules.projects.builder.change_set_token import builder_change_set_preview_token_hash
from src.modules.projects.builder.command import builder_request_fingerprint, require_builder_idempotency_key
from src.modules.projects.builder.design_change_set import analyze_design_change_set
from src.modules.projects.builder.design_change_set_apply import apply_design_operations
from src.modules.projects.builder.design_change_set_schema import (
    BuilderDesignOperationV1,
    BuilderDesignTargetOperationV1,
)
from src.modules.projects.builder.design_contract_context import ResolvedBuilderDesignContract
from src.modules.projects.builder.design_system_change_set import analyze_design_system_change_set
from src.modules.projects.builder.design_system_change_set_schema import (
    BuilderDesignSystemOperationV1,
    BuilderDesignSystemRefreshOperationV1,
)
from src.modules.projects.builder.design_system_context import ResolvedBuilderDesignSystem
from src.modules.projects.builder.initialization import ActivityWriter
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.restore_change_set import analyze_revision_restore_change_set
from src.modules.projects.builder.restore_change_set_context import resolve_builder_restore_target
from src.modules.projects.builder.wireframe_change_set import analyze_wireframe_change_set
from src.modules.projects.builder.wireframe_change_set_apply import apply_wireframe_operations
from src.modules.projects.builder.wireframe_change_set_schema import (
    BuilderWireframeOperationV1,
    BuilderWireframeTargetOperationV1,
)
from src.modules.projects.content.items.transaction_commands import ProjectContentItemTransactionCommands
from src.modules.projects.content.items.visual_blueprint_transaction_command import (
    ProjectContentVisualBlueprintTransactionCommand,
)
from src.modules.projects.content.items.wireframe_transaction_command import (
    ProjectContentWireframeTransactionCommand,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.sites.component_catalogs.registry import ComponentCatalogResolver
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


class SiteBuilderChangeSetService(BaseService):
    def __init__(
        self,
        *,
        repository: SiteBuilderRepository,
        design_system_repository: ProjectDesignSystemsRepository,
        component_catalog_resolver: ComponentCatalogResolver,
        content_commands: ProjectContentItemTransactionCommands | None,
        wireframe_commands: ProjectContentWireframeTransactionCommand | None = None,
        design_commands: ProjectContentVisualBlueprintTransactionCommand | None = None,
        agent_catalog_service: AgentCatalogService | None = None,
        settings: Settings | None = None,
        activity_writer: ActivityWriter = write_required_activity_event,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._design_system_repository = design_system_repository
        self._component_catalog_resolver = component_catalog_resolver
        self._content_commands = content_commands
        self._wireframe_commands = wireframe_commands
        self._design_commands = design_commands
        self._agents = agent_catalog_service or AgentCatalogService(self.settings)
        self._activity_writer = activity_writer

    async def preview(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        idempotency_key: str,
        payload: BuilderChangeSetPreviewRequest,
    ) -> BuilderChangeSetPreviewOut:
        key = require_builder_idempotency_key(idempotency_key)
        fingerprint = builder_request_fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "actorUserId": str(actor_user_id),
            **payload.model_dump(mode="json", by_alias=True),
        })
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")

        async with self.tx() as conn:
            project = await self._repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            replay = await self._repository.get_change_set_command(
                project_id=project_id,
                command_kind=BuilderChangeSetCommandKind.PREVIEW,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                if replay.request_fingerprint != fingerprint:
                    _raise_conflict("CHANGE_SET_IDEMPOTENCY_CONFLICT")
                return await replay_builder_change_set_preview(
                    repository=self._repository,
                    settings=self.settings,
                    project_id=project_id,
                    change_set_id=replay.change_set_id,
                    snapshot=cast(JsonObject, replay.result_snapshot),
                    conn=conn,
                )

            require_builder_authority(project)
            context = await resolve_builder_change_set_preview_context(
                repository=self._repository,
                agent_catalog_service=self._agents,
                design_system_repository=self._design_system_repository,
                component_catalog_resolver=self._component_catalog_resolver,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                actor_user_id=actor_user_id,
                payload=payload,
                conn=conn,
            )
            if isinstance(payload.operations[0], BuilderRevisionRestoreOperationV1):
                restore_operation = cast(BuilderRevisionRestoreOperationV1, payload.operations[0])
                target = await resolve_builder_restore_target(
                    repository=self._repository,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    current_manifest=context.manifest,
                    operation=restore_operation,
                    conn=conn,
                )
                analysis = analyze_revision_restore_change_set(
                    current_manifest=context.manifest,
                    current_structure=context.structure,
                    target_manifest=target.manifest,
                    target_structure=target.structure,
                    operation=restore_operation,
                    live_item_ids=set(target.live_item_ids),
                    target_version_ids=set(target.version_ids),
                    missing_model_definition_item_ids=set(target.missing_model_definition_item_ids),
                    provenance_source=context.provenance,
                )
            elif isinstance(payload.operations[0], BuilderDesignSystemRefreshOperationV1):
                analysis = analyze_design_system_change_set(
                    manifest=context.manifest,
                    resolved=_require_design_system_refresh(context.design_system_refresh),
                    operations=cast(tuple[BuilderDesignSystemOperationV1, ...], payload.operations),
                    provenance_source=context.provenance,
                )
            elif isinstance(payload.operations[0], BuilderDesignTargetOperationV1):
                analysis = analyze_design_change_set(
                    structure=context.structure,
                    manifest=context.manifest,
                    wireframes_by_item=context.wireframes_by_item,
                    blueprints_by_item=context.blueprints_by_item,
                    design_contract=_require_design_contract(context.design_contract),
                    operations=cast(tuple[BuilderDesignOperationV1, ...], payload.operations),
                    provenance_source=context.provenance,
                )
            elif isinstance(payload.operations[0], BuilderWireframeTargetOperationV1):
                analysis = analyze_wireframe_change_set(
                    structure=context.structure,
                    manifest=context.manifest,
                    wireframes_by_item=context.wireframes_by_item,
                    component_catalog=_require_component_catalog(context.component_catalog),
                    operations=cast(tuple[BuilderWireframeOperationV1, ...], payload.operations),
                    provenance_source=context.provenance,
                )
            else:
                analysis = analyze_sitemap_change_set(
                    structure=context.structure,
                    manifest=context.manifest,
                    operations=cast(tuple[BuilderSitemapOperationV1, ...], payload.operations),
                    provenance_source=context.provenance,
                    wireframes_by_item=context.wireframes_by_item,
                )
            return await persist_builder_change_set_preview(
                repository=self._repository,
                settings=self.settings,
                activity_writer=self._activity_writer,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                site_id=context.site_id,
                environment_id=context.environment_id,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                fingerprint=fingerprint,
                payload=payload,
                manifest=context.manifest,
                provenance=context.provenance,
                agent_provenance=context.agent_provenance,
                analysis=analysis,
                conn=conn,
            )

    async def apply(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID | None,
        actor_user_id: UUID,
        change_set_id: UUID,
        idempotency_key: str,
        payload: BuilderChangeSetApplyRequest,
    ) -> BuilderChangeSetApplyOut:
        if self._content_commands is None:
            raise RuntimeError("Builder ChangeSet apply requires canonical Content transaction commands")
        key = require_builder_idempotency_key(idempotency_key)
        fingerprint = builder_request_fingerprint({
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "actorUserId": str(actor_user_id),
            "changeSetId": str(change_set_id),
            "previewTokenHash": builder_change_set_preview_token_hash(payload.preview_token),
            "approval": payload.approval.model_dump(mode="json", by_alias=True) if payload.approval else None,
        })
        if runtime_id is None:
            _raise_conflict("PROJECT_RUNTIME_IDENTITY_REQUIRED")

        after_commit_effects = ()
        command_dispatcher = self._content_commands
        async with self.tx() as conn:
            project = await self._repository.lock_project(
                project_id=project_id,
                workspace_id=workspace_id,
                conn=conn,
            )
            if project is None:
                _raise_not_found("PROJECT_NOT_FOUND")
            replay = await self._repository.get_change_set_command(
                project_id=project_id,
                command_kind=BuilderChangeSetCommandKind.APPLY,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                if replay.request_fingerprint != fingerprint:
                    _raise_conflict("CHANGE_SET_IDEMPOTENCY_CONFLICT")
                return replay_builder_change_set_apply(cast(JsonObject, replay.result_snapshot))
            require_builder_authority(project)
            context = await resolve_builder_change_set_apply_context(
                repository=self._repository,
                agent_catalog_service=self._agents,
                design_system_repository=self._design_system_repository,
                component_catalog_resolver=self._component_catalog_resolver,
                settings=self.settings,
                workspace_id=workspace_id,
                project_id=project_id,
                runtime_id=runtime_id,
                actor_user_id=actor_user_id,
                change_set_id=change_set_id,
                payload=payload,
                conn=conn,
            )
            is_design_system_refresh = isinstance(
                context.operations[0],
                BuilderDesignSystemRefreshOperationV1,
            )
            is_restore = isinstance(context.operations[0], BuilderRevisionRestoreOperationV1)
            if is_restore:
                restore_operation = cast(BuilderRevisionRestoreOperationV1, context.operations[0])
                target = context.restore_target
                if target is None:
                    raise RuntimeError("Restore ChangeSet apply requires a resolved target revision")
                analysis = analyze_revision_restore_change_set(
                    current_manifest=context.base_manifest,
                    current_structure=context.base_structure,
                    target_manifest=target.manifest,
                    target_structure=target.structure,
                    operation=restore_operation,
                    live_item_ids=set(target.live_item_ids),
                    target_version_ids=set(target.version_ids),
                    missing_model_definition_item_ids=set(target.missing_model_definition_item_ids),
                    provenance_source=context.provenance_source,
                )
                require_builder_change_set_not_blocked(analysis)
                applied_operations = await apply_revision_restore_operation(
                    commands=self._content_commands,
                    current_manifest=context.base_manifest,
                    current_structure=context.base_structure,
                    target=target,
                    operation=restore_operation,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    site_id=context.change_set.site_id,
                    environment_id=context.change_set.environment_id,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
                command_dispatcher = self._content_commands
            elif is_design_system_refresh:
                target = _require_design_system_refresh(context.design_system_refresh)
                applied_operations = AppliedBuilderOperations(
                    client_page_ids={},
                    client_global_section_ids={},
                    after_commit_effects=(),
                )
                revision = await create_design_system_refresh_revision(
                    repository=self._repository,
                    base_manifest=context.base_manifest,
                    base_structure=context.base_structure,
                    design_system_id=target.assignment.design_system_id,
                    design_system_version_id=target.version.id,
                    design_system_manifest_checksum=target.version.manifest_checksum,
                    provenance_source=context.provenance_source,
                    actor_user_id=actor_user_id,
                    agent_run_id=context.change_set.agent_run_id,
                    agent_id=context.change_set.agent_id,
                    agent_version_id=context.change_set.agent_version_id,
                    agent_assignment_id=context.change_set.agent_assignment_id,
                    conn=conn,
                )
            elif isinstance(context.operations[0], BuilderWireframeTargetOperationV1):
                if self._wireframe_commands is None:
                    raise RuntimeError("Wireframe ChangeSet apply requires canonical Wireframe transaction commands")
                command_dispatcher = self._wireframe_commands
                applied_operations = await apply_wireframe_operations(
                    commands=self._wireframe_commands,
                    structure=context.base_structure,
                    manifest=context.base_manifest,
                    wireframes_by_item=context.wireframes_by_item,
                    component_catalog=_require_component_catalog(context.component_catalog),
                    operations=cast(tuple[BuilderWireframeOperationV1, ...], context.operations),
                    provenance_source=context.provenance_source,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    site_id=context.change_set.site_id,
                    environment_id=context.change_set.environment_id,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
            elif isinstance(context.operations[0], BuilderDesignTargetOperationV1):
                if self._design_commands is None:
                    raise RuntimeError("Design ChangeSet apply requires canonical Visual Blueprint commands")
                command_dispatcher = self._design_commands
                applied_operations = await apply_design_operations(
                    commands=self._design_commands,
                    structure=context.base_structure,
                    manifest=context.base_manifest,
                    wireframes_by_item=context.wireframes_by_item,
                    blueprints_by_item=context.blueprints_by_item,
                    design_contract=_require_design_contract(context.design_contract),
                    operations=cast(tuple[BuilderDesignOperationV1, ...], context.operations),
                    provenance_source=context.provenance_source,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    site_id=context.change_set.site_id,
                    environment_id=context.change_set.environment_id,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
            else:
                analysis = analyze_sitemap_change_set(
                    structure=context.base_structure,
                    manifest=context.base_manifest,
                    operations=cast(tuple[BuilderSitemapOperationV1, ...], context.operations),
                    provenance_source=context.provenance_source,
                    wireframes_by_item=context.wireframes_by_item,
                )
                require_builder_change_set_not_blocked(analysis)
                applied_operations = await apply_sitemap_operations(
                    commands=self._content_commands,
                    structure=context.base_structure,
                    operations=cast(tuple[BuilderSitemapOperationV1, ...], context.operations),
                    workspace_id=workspace_id,
                    project_id=project_id,
                    runtime_id=runtime_id,
                    site_id=context.change_set.site_id,
                    environment_id=context.change_set.environment_id,
                    actor_user_id=actor_user_id,
                    conn=conn,
                )
            if not is_design_system_refresh:
                revision = await create_next_builder_revision(
                    repository=self._repository,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    site_id=context.change_set.site_id,
                    environment_id=context.change_set.environment_id,
                    default_locale=str(context.site.default_locale),
                    fallback_locale=str(context.site.fallback_locale),
                    base_manifest=context.base_manifest,
                    base_structure=context.base_structure,
                    base_structure_revision_number=context.base_structure_revision_number,
                    planning_overrides=applied_operations.planning_overrides,
                    provenance_source=context.provenance_source,
                    actor_user_id=actor_user_id,
                    agent_run_id=context.change_set.agent_run_id,
                    agent_id=context.change_set.agent_id,
                    agent_version_id=context.change_set.agent_version_id,
                    agent_assignment_id=context.change_set.agent_assignment_id,
                    conn=conn,
                )
            result = await persist_builder_change_set_apply(
                repository=self._repository,
                settings=self.settings,
                activity_writer=self._activity_writer,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                idempotency_key=key,
                fingerprint=fingerprint,
                context=context,
                operations=applied_operations,
                revision=revision,
                conn=conn,
            )
            after_commit_effects = applied_operations.after_commit_effects

        for effect in after_commit_effects:
            await command_dispatcher.dispatch_after_commit(effect)
        return result


def _raise_not_found(code: str) -> NoReturn:
    raise NotFound(error=code, message=t("errors", code))


def _require_component_catalog(catalog: ComponentCatalogV1 | None) -> ComponentCatalogV1:
    if catalog is None:
        raise RuntimeError("Wireframe ChangeSet requires an exact component catalog")
    return catalog


def _require_design_system_refresh(
    target: ResolvedBuilderDesignSystem | None,
) -> ResolvedBuilderDesignSystem:
    if target is None:
        raise RuntimeError("Design System refresh requires an exact validated assignment")
    return target


def _require_design_contract(
    contract: ResolvedBuilderDesignContract | None,
) -> ResolvedBuilderDesignContract:
    if contract is None:
        raise RuntimeError("Design ChangeSet requires an exact Design System and component catalog")
    return contract


def _raise_conflict(code: str) -> NoReturn:
    raise Conflict(error=code, message=t("errors", code))


__all__ = ["SiteBuilderChangeSetService"]
