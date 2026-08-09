from __future__ import annotations

from collections.abc import Callable
from typing import Literal, Protocol
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.transactions import in_transaction

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.core.exceptions import Conflict, NotFound
from src.models.agents.runtime_builder_v1 import AgentRunBuilderSnapshotV1Record
from src.models.agents.runtime_design_system_v1 import AgentRunDesignSystemSnapshotV1Record
from src.models.agents.runtime_v1 import AgentExecutionModeV1, AgentRunV1Record, AgentThreadV1Record
from src.models.builder._enums import BuilderProvenanceSource
from src.models.projects._enums import ProjectAuthoringMode
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeKind, ProjectRuntimeRecord
from src.modules.ai.agent_builder_context_schema import AgentRunBuilderContextInputV1
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_design_system_context_schema import AgentRunDesignSystemContextInputV1
from src.modules.ai.agent_design_system_context_service import AgentDesignSystemContextResolver
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import BuilderInitializationOut, BuilderInitializationRequest
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.design_systems.schema import WorkspaceDesignSystemDefaultOut


class ProjectBootstrapArgsV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=256)


class AgentProjectBootstrapToolExecutionRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    actor_user_id: PublicUUID
    agent_run_id: PublicUUID
    tool_call_id: str = Field(min_length=1, max_length=192)
    args: ProjectBootstrapArgsV1


class ProjectBootstrapResultV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    approved: bool = True
    project_id: PublicUUID
    thread_id: PublicUUID
    run_id: PublicUUID
    site_id: PublicUUID
    environment_id: PublicUUID
    site_revision_id: PublicUUID
    authoring_mode: Literal["builder_managed"] = "builder_managed"
    status: Literal["draft"] = "draft"
    editor_path: str
    capabilities: tuple[str, ...]


class ProjectCreationPort(Protocol):
    async def create_project(
        self,
        *,
        workspace_id: UUID,
        payload: ProjectCreateRequest,
        actor_user_id: UUID,
    ) -> ProjectListItemOut: ...


class BuilderInitializationPort(Protocol):
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
    ) -> BuilderInitializationOut: ...


ProjectServiceFactory = Callable[[], ProjectCreationPort]
BuilderServiceFactory = Callable[[TenantContext], BuilderInitializationPort]
TenantContextFactory = Callable[[], TenantContext]


class WorkspaceDesignSystemDefaultEnsurer(Protocol):
    async def ensure_default(
        self,
        *,
        workspace_id: UUID,
        organization_id: UUID,
        actor_user_id: UUID,
    ) -> WorkspaceDesignSystemDefaultOut: ...


class AgentProjectBootstrapToolExecutor(Protocol):
    async def execute(
        self,
        *,
        request: AgentProjectBootstrapToolExecutionRequest,
    ) -> ProjectBootstrapResultV1: ...


class ProjectBootstrapResources(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    site_id: PublicUUID
    environment_id: PublicUUID
    design_system_version_id: PublicUUID
    design_system_manifest_checksum: str


class _RunContextSnapshot(Protocol):
    context_hash: str
    context_byte_size: int


def _require_matching_run_context_snapshot(
    *,
    snapshot: _RunContextSnapshot,
    created: bool,
    expected_context_hash: str,
    expected_context_byte_size: int,
) -> None:
    if created:
        return
    if snapshot.context_hash != expected_context_hash or snapshot.context_byte_size != expected_context_byte_size:
        raise Conflict("Build Run context snapshot conflicts", error="AGENT_RUN_IDEMPOTENCY_CONFLICT")


class ProjectBootstrapRepository:
    async def find_project(self, *, workspace_id: UUID, slug: str) -> ProjectRecord | None:
        return await ProjectRecord.filter(workspace_id=workspace_id, slug=slug, is_active=True).first()

    @staticmethod
    async def get_primary_runtime_id(*, project_id: UUID) -> UUID:
        runtime = await ProjectRuntimeRecord.filter(
            project_id=project_id,
            kind=ProjectRuntimeKind.PRIMARY,
            is_active=True,
        ).first()
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        return UUID(str(runtime.id))

    async def resolve_resources(
        self,
        *,
        tenant_context: TenantContext,
        workspace_id: UUID,
        project_id: UUID,
        runtime_id: UUID,
    ) -> ProjectBootstrapResources:
        builder_repository = SiteBuilderRepository(tenant_context)
        design_system_repository = ProjectDesignSystemsRepository(tenant_context)
        async with in_transaction() as conn:
            site = await builder_repository.get_site(
                project_id=project_id,
                runtime_id=runtime_id,
                conn=conn,
            )
            environment = await builder_repository.get_default_preview_environment(
                project_id=project_id,
                conn=conn,
            )
            design_system = await design_system_repository.get_workspace_default(
                workspace_id=workspace_id,
                conn=conn,
            )
        if site is None or environment is None:
            raise NotFound("Builder runtime resources are missing", error="BUILDER_BOOTSTRAP_RESOURCES_MISSING")
        if design_system is None:
            raise Conflict(
                "Workspace default Design System is required", error="PROJECT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED"
            )
        return ProjectBootstrapResources(
            site_id=site.id,
            environment_id=environment.id,
            design_system_version_id=design_system.design_system_version_id,
            design_system_manifest_checksum=design_system.manifest_checksum,
        )

    async def resolve_run_contexts(
        self,
        *,
        tenant_context: TenantContext,
        workspace_id: UUID,
        project_id: UUID,
        site_revision_id: UUID,
    ) -> tuple[AgentRunDesignSystemContextInputV1, AgentRunBuilderContextInputV1]:
        async with in_transaction() as conn:
            design_system_context = await AgentDesignSystemContextResolver(
                repository=ProjectDesignSystemsRepository(tenant_context),
            ).resolve_run_context(
                workspace_id=workspace_id,
                project_id=project_id,
                conn=conn,
            )
            builder_context = await AgentBuilderContextResolver(
                repository=SiteBuilderRepository(tenant_context),
            ).resolve_run_context(
                workspace_id=workspace_id,
                project_id=project_id,
                site_revision_id=site_revision_id,
                conn=conn,
            )
        return design_system_context, builder_context

    @staticmethod
    async def bind_run_and_thread(
        *,
        workspace_id: UUID,
        run_id: UUID,
        actor_user_id: UUID,
        project_id: UUID,
        site_revision_id: UUID | None = None,
        design_system_context: AgentRunDesignSystemContextInputV1 | None = None,
        builder_context: AgentRunBuilderContextInputV1 | None = None,
    ) -> UUID:
        async with in_transaction() as conn:
            run = (
                await AgentRunV1Record
                .filter(
                    id=run_id,
                    workspace_id=workspace_id,
                    owner_user_id=actor_user_id,
                    execution_mode=AgentExecutionModeV1.BUILD,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if run is None:
                raise NotFound("Build Run not found", error="AGENT_RUN_NOT_FOUND")
            thread = (
                await AgentThreadV1Record
                .filter(
                    id=run.thread_id,
                    workspace_id=workspace_id,
                    owner_user_id=actor_user_id,
                    deleted_at=None,
                )
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if thread is None:
                raise NotFound("Build Thread not found", error="AGENT_THREAD_NOT_FOUND")
            if run.project_id not in (None, project_id) or thread.project_id not in (None, project_id):
                raise Conflict("Build Run project binding conflicts", error="AGENT_RUN_PROJECT_BINDING_CONFLICT")
            if run.site_revision_id not in (None, site_revision_id):
                raise Conflict("Build Run revision binding conflicts", error="AGENT_RUN_REVISION_BINDING_CONFLICT")
            if (design_system_context is None) != (builder_context is None):
                raise Conflict("Build Run context binding is incomplete", error="AGENT_RUN_CONTEXT_BINDING_INVALID")
            if run.project_id is None:
                run.project_id = project_id
            if site_revision_id is not None and run.site_revision_id is None:
                run.site_revision_id = site_revision_id
            if run.project_id is not None or run.site_revision_id is not None:
                await run.save(using_db=conn, update_fields=["project_id", "site_revision_id", "updated_at"])
            if thread.project_id is None:
                thread.project_id = project_id
                await thread.save(using_db=conn, update_fields=["project_id", "updated_at"])
            if design_system_context is not None and builder_context is not None:
                (
                    design_system_snapshot,
                    design_system_snapshot_created,
                ) = await AgentRunDesignSystemSnapshotV1Record.get_or_create(
                    run_id=run.id,
                    defaults={
                        "project_id": design_system_context.context.project_id,
                        "assignment_id": design_system_context.context.assignment_id,
                        "assignment_revision": design_system_context.context.assignment_revision,
                        "design_system_id": design_system_context.context.design_system_id,
                        "design_system_version_id": design_system_context.context.version_id,
                        "owner_kind": design_system_context.context.owner_kind,
                        "manifest_checksum": design_system_context.context.manifest_checksum,
                        "validation_finding_hash": design_system_context.context.validation_finding_hash,
                        "token_index_hash": design_system_context.context.token_index_hash,
                        "context_hash": design_system_context.context.context_hash,
                        "context_snapshot": design_system_context.context.model_dump(mode="json", by_alias=True),
                        "context_byte_size": design_system_context.context_byte_size,
                    },
                    using_db=conn,
                )
                _require_matching_run_context_snapshot(
                    snapshot=design_system_snapshot,
                    created=design_system_snapshot_created,
                    expected_context_hash=design_system_context.context.context_hash,
                    expected_context_byte_size=design_system_context.context_byte_size,
                )
                builder_snapshot, builder_snapshot_created = await AgentRunBuilderSnapshotV1Record.get_or_create(
                    run_id=run.id,
                    defaults={
                        "workspace_id": builder_context.context.workspace_id,
                        "project_id": builder_context.context.project_id,
                        "site_id": builder_context.context.site_id,
                        "environment_id": builder_context.context.environment_id,
                        "site_revision_id": builder_context.context.site_revision_id,
                        "revision_number": builder_context.context.revision_number,
                        "manifest_hash": builder_context.context.manifest_hash,
                        "status_etag": builder_context.context.status_etag,
                        "content_structure_revision_id": builder_context.context.content_structure_revision_id,
                        "content_structure_hash": builder_context.context.content_structure_hash,
                        "context_hash": builder_context.context.context_hash,
                        "context_snapshot": builder_context.context.model_dump(mode="json", by_alias=True),
                        "context_byte_size": builder_context.context_byte_size,
                    },
                    using_db=conn,
                )
                _require_matching_run_context_snapshot(
                    snapshot=builder_snapshot,
                    created=builder_snapshot_created,
                    expected_context_hash=builder_context.context.context_hash,
                    expected_context_byte_size=builder_context.context_byte_size,
                )
            return UUID(str(thread.id))


class ProjectBootstrapToolExecutor:
    """Create and bind a builder project, then initialize its editable baseline."""

    def __init__(
        self,
        *,
        project_service_factory: ProjectServiceFactory,
        builder_service_factory: BuilderServiceFactory,
        tenant_context_factory: TenantContextFactory,
        workspace_design_system_default_ensurer: WorkspaceDesignSystemDefaultEnsurer,
        repository: ProjectBootstrapRepository | None = None,
    ) -> None:
        self._project_service_factory = project_service_factory
        self._builder_service_factory = builder_service_factory
        self._tenant_context_factory = tenant_context_factory
        self._workspace_design_system_default_ensurer = workspace_design_system_default_ensurer
        self._repository = repository or ProjectBootstrapRepository()

    async def execute(
        self,
        *,
        request: AgentProjectBootstrapToolExecutionRequest,
    ) -> ProjectBootstrapResultV1:
        args = request.args
        slug = f"ai-build-{str(request.agent_run_id).replace('-', '')[:24]}"
        project_service = self._project_service_factory()
        project, runtime_id = await self._find_or_create_project(
            service=project_service,
            workspace_id=request.workspace_id,
            actor_user_id=request.actor_user_id,
            slug=slug,
            args=args,
        )
        project_id = UUID(str(project.id))
        tenant_context = self._tenant_context_factory().with_project(project_id=project_id)
        await self._workspace_design_system_default_ensurer.ensure_default(
            workspace_id=request.workspace_id,
            organization_id=tenant_context.organization_id,
            actor_user_id=request.actor_user_id,
        )
        resources = await self._repository.resolve_resources(
            tenant_context=tenant_context,
            workspace_id=request.workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
        )
        builder = self._builder_service_factory(
            tenant_context.with_project(
                project_id=project_id,
                runtime_id=runtime_id,
                site_id=resources.site_id,
            )
        )
        initialized: BuilderInitializationOut = await builder.initialize(
            organization_id=tenant_context.organization_id,
            workspace_id=request.workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            actor_user_id=request.actor_user_id,
            idempotency_key=f"agent-bootstrap:{request.agent_run_id}",
            payload=BuilderInitializationRequest(
                site_id=resources.site_id,
                environment_id=resources.environment_id,
                expected_authoring_revision=1,
                expected_design_system_assignment_revision=1,
                expected_design_system_version_id=resources.design_system_version_id,
                expected_design_system_manifest_checksum=resources.design_system_manifest_checksum,
                provenance_source=BuilderProvenanceSource.AGENT,
                agent_run_id=request.agent_run_id,
            ),
        )
        design_system_context, builder_context = await self._repository.resolve_run_contexts(
            tenant_context=tenant_context,
            workspace_id=request.workspace_id,
            project_id=project_id,
            site_revision_id=UUID(str(initialized.site_revision.id)),
        )
        thread_id = await self._repository.bind_run_and_thread(
            workspace_id=request.workspace_id,
            run_id=request.agent_run_id,
            actor_user_id=request.actor_user_id,
            project_id=project_id,
            site_revision_id=UUID(str(initialized.site_revision.id)),
            design_system_context=design_system_context,
            builder_context=builder_context,
        )
        return ProjectBootstrapResultV1(
            project_id=project_id,
            thread_id=thread_id,
            run_id=request.agent_run_id,
            site_id=resources.site_id,
            environment_id=resources.environment_id,
            site_revision_id=initialized.site_revision.id,
            editor_path=f"/projects/{project_id}/editor?stage=sitemap",
            capabilities=("sitemap", "wireframe", "draft_content", "preview"),
        )

    async def _find_or_create_project(
        self,
        *,
        service: ProjectCreationPort,
        workspace_id: UUID,
        actor_user_id: UUID,
        slug: str,
        args: ProjectBootstrapArgsV1,
    ) -> tuple[ProjectRecord, UUID]:
        existing = await self._repository.find_project(workspace_id=workspace_id, slug=slug)
        if existing is not None:
            runtime_id = await self._repository.get_primary_runtime_id(project_id=UUID(str(existing.id)))
            return existing, runtime_id
        created = await service.create_project(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            payload=ProjectCreateRequest(
                workspace_id=workspace_id,
                authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
                name=args.name.strip(),
                slug=slug,
                description=args.description.strip() if args.description else None,
            ),
        )
        project = await self._repository.find_project(workspace_id=workspace_id, slug=slug)
        if project is None:
            raise NotFound("Project bootstrap did not persist", error="PROJECT_BOOTSTRAP_PERSISTENCE_FAILED")
        runtime = created.primary_runtime
        if runtime is None:
            raise NotFound("Project runtime not found", error="PROJECT_RUNTIME_NOT_FOUND")
        return project, UUID(str(runtime.id))
