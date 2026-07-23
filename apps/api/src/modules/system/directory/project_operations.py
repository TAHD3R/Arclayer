from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import NotFound
from src.core.services import BaseService
from src.models.projects.deployment import ProjectDeploymentStatus
from src.modules.domains.schema import DomainBindingOut
from src.modules.domains.service import DomainBindingService
from src.modules.projects.deployments.schema import ProjectDeploymentOut
from src.modules.projects.deployments.service import ProjectDeploymentsService
from src.modules.projects.environments.schema import (
    ProjectEnvironmentAliasOut,
    ProjectEnvironmentOut,
)
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.members_repository import ProjectMembersRepository
from src.modules.projects.members_schema import ProjectMemberOut
from src.modules.projects.releases.schema import ReleaseOut
from src.modules.projects.releases.service import ProjectReleasesService
from src.modules.projects.runtime.schema import ProjectRuntimeContextOut
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.system.directory.repository import ProjectOperationalFacts, SystemDirectoryRepository
from src.modules.system.directory.schema import (
    DirectoryProjectActivitySource,
    DirectoryProjectDomainState,
    DirectoryProjectHealthState,
    DirectoryProjectListFilters,
    DirectoryProjectOperationalSummaryOut,
    DirectoryProjectReleaseState,
    DirectoryProjectRuntimeState,
    DirectoryProjectUsageCoverage,
    DirectoryProjectUsageOut,
)
from src.modules.tenancy.schema import TenantContext

PROJECT_DIRECTORY_USAGE_WINDOW_DAYS = 30


class ProjectDirectoryProjectionPersistence(Protocol):
    async def list_project_record_activity(
        self,
        *,
        project_ids: Iterable[UUID] | None = None,
    ) -> dict[UUID, datetime]: ...

    async def list_project_operational_facts(
        self,
        *,
        project_ids: Iterable[UUID],
        usage_start: datetime,
        usage_end: datetime,
    ) -> dict[UUID, ProjectOperationalFacts]: ...


class ProjectDirectoryProjectionService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: ProjectDirectoryProjectionPersistence,
    ) -> None:
        super().__init__(settings)
        self._repository = repository

    @staticmethod
    def _runtime_state(facts: ProjectOperationalFacts) -> DirectoryProjectRuntimeState:
        if not facts.runtime_exists:
            return DirectoryProjectRuntimeState.RUNTIME_MISSING
        if not facts.site_exists:
            return DirectoryProjectRuntimeState.SITE_MISSING
        return DirectoryProjectRuntimeState.READY

    @staticmethod
    def _health(facts: ProjectOperationalFacts) -> DirectoryProjectHealthState:
        if not facts.runtime_exists or not facts.site_exists:
            return DirectoryProjectHealthState.UNAVAILABLE
        if not facts.runtime_active:
            return DirectoryProjectHealthState.INACTIVE
        if facts.active_deployment_count == 0:
            return DirectoryProjectHealthState.NOT_DEPLOYED
        if facts.degraded_active_deployment_count > 0:
            return DirectoryProjectHealthState.DEGRADED
        return DirectoryProjectHealthState.HEALTHY

    @staticmethod
    def _domain_state(facts: ProjectOperationalFacts) -> DirectoryProjectDomainState:
        if facts.domain_count == 0:
            return DirectoryProjectDomainState.NONE
        if facts.domain_attention_count > 0:
            return DirectoryProjectDomainState.ATTENTION_REQUIRED
        return DirectoryProjectDomainState.READY

    @staticmethod
    def _release_state(facts: ProjectOperationalFacts) -> DirectoryProjectReleaseState:
        if facts.latest_release_status is None:
            return DirectoryProjectReleaseState.NOT_RELEASED
        return DirectoryProjectReleaseState(facts.latest_release_status)

    @staticmethod
    def _activity(
        project_updated_at: datetime,
        facts: ProjectOperationalFacts,
    ) -> tuple[datetime, DirectoryProjectActivitySource]:
        candidates: list[tuple[datetime, DirectoryProjectActivitySource]] = [
            (project_updated_at, DirectoryProjectActivitySource.PROJECT_RECORD)
        ]
        optional_candidates = (
            (facts.latest_deployment_at, DirectoryProjectActivitySource.DEPLOYMENT),
            (facts.latest_release_at, DirectoryProjectActivitySource.RELEASE),
            (facts.latest_audit_at, DirectoryProjectActivitySource.AUDIT_EVENT),
        )
        candidates.extend((value, source) for value, source in optional_candidates if value is not None)
        source_priority = {
            DirectoryProjectActivitySource.PROJECT_RECORD: 0,
            DirectoryProjectActivitySource.DEPLOYMENT: 1,
            DirectoryProjectActivitySource.RELEASE: 2,
            DirectoryProjectActivitySource.AUDIT_EVENT: 3,
        }
        return max(candidates, key=lambda item: (item[0], source_priority[item[1]]))

    async def list_projections(
        self,
        *,
        project_activity: Mapping[UUID, datetime],
    ) -> dict[UUID, DirectoryProjectOperationalSummaryOut]:
        captured_at = datetime.now(UTC)
        usage_start = captured_at - timedelta(days=PROJECT_DIRECTORY_USAGE_WINDOW_DAYS)
        facts_by_project = await self._repository.list_project_operational_facts(
            project_ids=project_activity,
            usage_start=usage_start,
            usage_end=captured_at,
        )
        projections: dict[UUID, DirectoryProjectOperationalSummaryOut] = {}
        for project_id, updated_at in project_activity.items():
            facts = facts_by_project[project_id]
            last_activity_at, activity_source = self._activity(updated_at, facts)
            has_usage = any((
                facts.usage_requests,
                facts.usage_prompt_tokens,
                facts.usage_completion_tokens,
                facts.usage_cost_micros,
            ))
            projections[project_id] = DirectoryProjectOperationalSummaryOut(
                captured_at=captured_at,
                runtime_state=self._runtime_state(facts),
                health=self._health(facts),
                domain_state=self._domain_state(facts),
                domain_count=facts.domain_count,
                verified_domain_count=facts.verified_domain_count,
                latest_deployment_status=facts.latest_deployment_status,
                latest_deployment_at=facts.latest_deployment_at,
                release_state=self._release_state(facts),
                latest_release_status=facts.latest_release_status,
                latest_release_number=facts.latest_release_number,
                latest_release_at=facts.latest_release_at,
                last_activity_at=last_activity_at,
                last_activity_source=activity_source,
                usage=DirectoryProjectUsageOut(
                    window_start=usage_start,
                    window_end=captured_at,
                    coverage=(
                        DirectoryProjectUsageCoverage.AI_AUDIT_LOG
                        if has_usage
                        else DirectoryProjectUsageCoverage.NO_OBSERVED_USAGE
                    ),
                    requests=facts.usage_requests,
                    prompt_tokens=facts.usage_prompt_tokens,
                    completion_tokens=facts.usage_completion_tokens,
                    cost_micros=facts.usage_cost_micros,
                ),
            )
        return projections

    async def filter_project_ids(self, *, filters: DirectoryProjectListFilters) -> set[UUID] | None:
        if filters.runtime_health is None and filters.domain_state is None and filters.release_state is None:
            return None
        activity = await self._repository.list_project_record_activity()
        projections = await self.list_projections(project_activity=activity)
        return {
            project_id
            for project_id, projection in projections.items()
            if (filters.runtime_health is None or projection.health == filters.runtime_health)
            and (filters.domain_state is None or projection.domain_state == filters.domain_state)
            and (filters.release_state is None or projection.release_state == filters.release_state)
        }


def build_project_directory_projection_service(settings: Settings) -> ProjectDirectoryProjectionService:
    return ProjectDirectoryProjectionService(settings, repository=SystemDirectoryRepository())


class DirectoryProjectOperationsOut(BaseSchema):
    collected_at: datetime = Field(..., description="Time at which the operational projection was collected.")
    runtime_state: DirectoryProjectRuntimeState = Field(..., description="Availability of runtime-backed data.")
    runtime: ProjectRuntimeContextOut | None = Field(..., description="Primary project runtime identity.")
    health: DirectoryProjectHealthState = Field(..., description="Derived runtime and deployment health state.")
    environments: list[ProjectEnvironmentOut] = Field(...)
    environment_aliases: list[ProjectEnvironmentAliasOut] = Field(...)
    deployments: list[ProjectDeploymentOut] = Field(...)
    domains: list[DomainBindingOut] = Field(...)
    releases: list[ReleaseOut] = Field(...)
    members: list[ProjectMemberOut] = Field(...)
    member_total: int = Field(..., ge=0)


class SystemProjectOperationsService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        directory_repo: SystemDirectoryRepository,
        members_repo: ProjectMembersRepository,
        runtime_service: ProjectRuntimeService,
        domain_service: DomainBindingService,
        environments_factory: Callable[[TenantContext], ProjectEnvironmentsService],
        deployments_factory: Callable[[TenantContext], ProjectDeploymentsService],
        releases_factory: Callable[[TenantContext], ProjectReleasesService],
    ) -> None:
        super().__init__(settings)
        self._directory_repo = directory_repo
        self._members_repo = members_repo
        self._runtime_service = runtime_service
        self._domain_service = domain_service
        self._environments_factory = environments_factory
        self._deployments_factory = deployments_factory
        self._releases_factory = releases_factory

    @staticmethod
    def _health(
        runtime: ProjectRuntimeContextOut | None,
        deployments: list[ProjectDeploymentOut],
    ) -> DirectoryProjectHealthState:
        if runtime is None:
            return DirectoryProjectHealthState.UNAVAILABLE
        if not runtime.is_active:
            return DirectoryProjectHealthState.INACTIVE
        active = [deployment for deployment in deployments if deployment.is_active]
        if not active:
            return DirectoryProjectHealthState.NOT_DEPLOYED
        unhealthy = {ProjectDeploymentStatus.FAILED.value, ProjectDeploymentStatus.CANCELED.value}
        if any(deployment.status in unhealthy for deployment in active):
            return DirectoryProjectHealthState.DEGRADED
        return DirectoryProjectHealthState.HEALTHY

    async def _members(
        self,
        *,
        project_id: UUID,
        workspace_id: UUID,
        preview_size: int,
    ) -> tuple[list[ProjectMemberOut], int]:
        query = self._members_repo.query_memberships(
            project_id=project_id,
            workspace_id=workspace_id,
            q=None,
        )
        total = int(await query.count())
        rows = await query.limit(preview_size).all()
        members = [
            ProjectMemberOut(
                id=row.id,
                project_id=project_id,
                workspace_id=workspace_id,
                user_id=row.user.id,
                username=row.user.username,
                email=row.user.email,
                display_name=row.user.display_name,
                avatar_url=row.user.avatar_url,
                user_status=row.user.status,
                role=row.role,
            )
            for row in rows
        ]
        return members, total

    async def get_operations(
        self,
        *,
        project_id: UUID,
        actor_user_id: UUID,
        preview_size: int,
    ) -> DirectoryProjectOperationsOut:
        project = await self._directory_repo.get_project_by_id(project_id=project_id)
        if project is None:
            raise NotFound(error="NOT_FOUND")
        workspace_id = UUID(str(project.workspace_id))

        domains_task = self._domain_service.list_bindings_for_project(project_id=project_id)
        members_task = self._members(
            project_id=project_id,
            workspace_id=workspace_id,
            preview_size=preview_size,
        )
        domain_rows, (members, member_total) = await asyncio.gather(domains_task, members_task)
        domains = [DomainBindingOut.model_validate(self._domain_service.to_out(row)) for row in domain_rows]

        try:
            runtime_context = await self._runtime_service.get_context_by_project(
                project_id=project_id,
                actor_user_id=actor_user_id,
            )
        except NotFound as exc:
            runtime_states: dict[str, DirectoryProjectRuntimeState] = {
                "PROJECT_RUNTIME_NOT_FOUND": DirectoryProjectRuntimeState.RUNTIME_MISSING,
                "PROJECT_RUNTIME_SITE_NOT_FOUND": DirectoryProjectRuntimeState.SITE_MISSING,
            }
            runtime_state = runtime_states.get(str(exc.error))
            if runtime_state is None:
                raise
            return DirectoryProjectOperationsOut(
                collected_at=datetime.now(UTC),
                runtime_state=runtime_state,
                runtime=None,
                health=DirectoryProjectHealthState.UNAVAILABLE,
                environments=[],
                environment_aliases=[],
                deployments=[],
                domains=domains,
                releases=[],
                members=members,
                member_total=member_total,
            )

        environments_service = self._environments_factory(runtime_context.tenant_context)
        deployments_service = self._deployments_factory(runtime_context.tenant_context)
        releases_service = self._releases_factory(runtime_context.tenant_context)
        environments_out, deployments_out, releases_out = await asyncio.gather(
            environments_service.list_environments_out(project_id=project_id),
            deployments_service.list_deployments_out(project_id=project_id),
            releases_service.list_releases_out(
                workspace_id=runtime_context.workspace_id,
                site_id=runtime_context.site_id,
            ),
        )
        all_deployments = list(deployments_out.items)
        deployments = all_deployments[:preview_size]
        runtime_out = ProjectRuntimeService.to_runtime_context_out(runtime_context)
        return DirectoryProjectOperationsOut(
            collected_at=datetime.now(UTC),
            runtime_state=DirectoryProjectRuntimeState.READY,
            runtime=runtime_out,
            health=self._health(runtime_out, all_deployments),
            environments=list(environments_out.items),
            environment_aliases=list(environments_out.aliases),
            deployments=deployments,
            domains=domains,
            releases=list(releases_out.items[:preview_size]),
            members=members,
            member_total=member_total,
        )
