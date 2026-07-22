from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from inspect import signature
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import NotFound
from src.models.tenancy.workspace_tenant import (
    WorkspaceTenantIsolationMode,
    WorkspaceTenantStatus,
)
from src.modules.jobs.execution_errors import (
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.target_resolver import (
    ProjectJobTargetResolver,
    ProjectRecordLike,
    ProjectRepositoryLike,
    TenancyRepositoryLike,
    WorkspaceJobTargetResolver,
    WorkspaceRecordLike,
    WorkspaceRepositoryLike,
    WorkspaceTenantRecordLike,
)
from src.modules.tenancy.schema import TenantIsolationMode, TenantScope

if TYPE_CHECKING:
    from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
    from src.modules.projects.repository import ProjectRepository
    from src.modules.tenancy.repository import TenancyRepository

    _PROJECT_REPOSITORY_CONTRACT: ProjectRepositoryLike = ProjectRepository()
    _TENANCY_REPOSITORY_CONTRACT: TenancyRepositoryLike = TenancyRepository()


@dataclass(frozen=True)
class _Project:
    id: UUID
    workspace_id: UUID
    is_active: bool = True


@dataclass(frozen=True)
class _Workspace:
    id: UUID
    organization_id: UUID
    is_active: bool = True
    archived_at: datetime | None = None
    deleted_at: datetime | None = None


@dataclass(frozen=True)
class _WorkspaceTenant:
    workspace_id: UUID
    organization_id: UUID
    schema_name: str
    isolation_mode: WorkspaceTenantIsolationMode | str
    status: WorkspaceTenantStatus | str
    schema_version: int


class _ProjectRepository:
    def __init__(
        self,
        *,
        project: ProjectRecordLike | None,
        workspace: WorkspaceRecordLike,
    ) -> None:
        self.project = project
        self.workspace = workspace
        self.requested_project_ids: list[UUID] = []

    async def get_project_with_workspace(
        self,
        *,
        project_id: UUID,
    ) -> tuple[ProjectRecordLike, WorkspaceRecordLike]:
        self.requested_project_ids.append(project_id)
        if self.project is None:
            raise NotFound("Project not found", error="PROJECT_NOT_FOUND")
        return self.project, self.workspace


class _TenancyRepository:
    def __init__(self, record: WorkspaceTenantRecordLike | None) -> None:
        self.record = record
        self.requested_workspace_ids: list[UUID] = []

    async def get_workspace_tenant(self, *, workspace_id: UUID) -> WorkspaceTenantRecordLike | None:
        self.requested_workspace_ids.append(workspace_id)
        return self.record


class _WorkspaceRepository:
    def __init__(self, workspace: WorkspaceRecordLike | None) -> None:
        self.workspace = workspace
        self.requested_workspace_ids: list[UUID] = []

    async def get_by_id(self, *, workspace_id: UUID) -> WorkspaceRecordLike | None:
        self.requested_workspace_ids.append(workspace_id)
        return self.workspace


if TYPE_CHECKING:
    _WORKSPACE_REPOSITORY_CONTRACT: WorkspaceRepositoryLike = OrganizationWorkspaceRepository()


@dataclass(frozen=True)
class _Scenario:
    resolver: ProjectJobTargetResolver
    workspace_id: UUID
    project_id: UUID
    organization_id: UUID
    project_repository: _ProjectRepository
    tenancy_repository: _TenancyRepository


def _build_scenario(
    *,
    project_exists: bool = True,
    project_in_requested_workspace: bool = True,
    project_active: bool = True,
    workspace_active: bool = True,
    workspace_archived: bool = False,
    tenant_exists: bool = True,
    tenant_organization_matches: bool = True,
    tenant_status: WorkspaceTenantStatus | str = WorkspaceTenantStatus.READY,
    tenant_schema_version: int = 4,
    tenant_schema_name: str = "workspace_0123456789abcdef0123",
    tenant_isolation_mode: WorkspaceTenantIsolationMode | str = (WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA),
    required_schema_version: int = 4,
) -> _Scenario:
    workspace_id = uuid4()
    project_id = uuid4()
    organization_id = uuid4()
    project_workspace_id = workspace_id if project_in_requested_workspace else uuid4()
    workspace: WorkspaceRecordLike = _Workspace(
        id=project_workspace_id,
        organization_id=organization_id,
        is_active=workspace_active,
        archived_at=datetime.now(UTC) if workspace_archived else None,
    )
    project: ProjectRecordLike | None = (
        _Project(
            id=project_id,
            workspace_id=project_workspace_id,
            is_active=project_active,
        )
        if project_exists
        else None
    )
    tenant: WorkspaceTenantRecordLike | None = (
        _WorkspaceTenant(
            workspace_id=workspace_id,
            organization_id=organization_id if tenant_organization_matches else uuid4(),
            schema_name=tenant_schema_name,
            isolation_mode=tenant_isolation_mode,
            status=tenant_status,
            schema_version=tenant_schema_version,
        )
        if tenant_exists
        else None
    )
    project_repository = _ProjectRepository(project=project, workspace=workspace)
    tenancy_repository = _TenancyRepository(tenant)
    return _Scenario(
        resolver=ProjectJobTargetResolver(
            project_repository=project_repository,
            tenancy_repository=tenancy_repository,
            required_schema_version=required_schema_version,
        ),
        workspace_id=workspace_id,
        project_id=project_id,
        organization_id=organization_id,
        project_repository=project_repository,
        tenancy_repository=tenancy_repository,
    )


@pytest.mark.asyncio
async def test_resolver_builds_job_tenant_context_only_from_live_records() -> None:
    scenario = _build_scenario(tenant_schema_name="WORKSPACE_0123456789ABCDEF0123")

    context = await scenario.resolver.resolve_for_reconciliation(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
    )

    assert context.scope == TenantScope.JOB
    assert context.organization_id == scenario.organization_id
    assert context.workspace_id == scenario.workspace_id
    assert context.project_id == scenario.project_id
    assert context.runtime_id is None
    assert context.site_id is None
    assert context.schema_name == "workspace_0123456789abcdef0123"
    assert context.isolation_mode == TenantIsolationMode.WORKSPACE_SCHEMA
    assert scenario.project_repository.requested_project_ids == [scenario.project_id]
    assert scenario.tenancy_repository.requested_workspace_ids == [scenario.workspace_id]


@pytest.mark.asyncio
async def test_workspace_resolver_builds_job_scope_without_inventing_project_context() -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    workspace = _Workspace(id=workspace_id, organization_id=organization_id)
    tenant = _WorkspaceTenant(
        workspace_id=workspace_id,
        organization_id=organization_id,
        schema_name="workspace_0123456789abcdef0123",
        isolation_mode=WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA,
        status=WorkspaceTenantStatus.READY,
        schema_version=4,
    )
    workspace_repository = _WorkspaceRepository(workspace)
    tenancy_repository = _TenancyRepository(tenant)
    resolver = WorkspaceJobTargetResolver(
        workspace_repository=workspace_repository,
        tenancy_repository=tenancy_repository,
        required_schema_version=4,
    )

    context = await resolver.resolve_for_reconciliation(workspace_id=workspace_id)
    await resolver.authorize_new_effect(workspace_id=workspace_id)

    assert context.scope == TenantScope.JOB
    assert context.workspace_id == workspace_id
    assert context.organization_id == organization_id
    assert context.project_id is None
    assert workspace_repository.requested_workspace_ids == [workspace_id, workspace_id]
    assert tenancy_repository.requested_workspace_ids == [workspace_id]


@pytest.mark.asyncio
async def test_workspace_resolver_routes_reconciliation_before_rejecting_archived_effect() -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    workspace = _Workspace(
        id=workspace_id,
        organization_id=organization_id,
        archived_at=datetime.now(UTC),
    )
    tenant = _WorkspaceTenant(
        workspace_id=workspace_id,
        organization_id=organization_id,
        schema_name="workspace_0123456789abcdef0123",
        isolation_mode=WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA,
        status=WorkspaceTenantStatus.READY,
        schema_version=4,
    )
    resolver = WorkspaceJobTargetResolver(
        workspace_repository=_WorkspaceRepository(workspace),
        tenancy_repository=_TenancyRepository(tenant),
        required_schema_version=4,
    )

    context = await resolver.resolve_for_reconciliation(workspace_id=workspace_id)
    with pytest.raises(PermanentJobExecutionError) as error:
        await resolver.authorize_new_effect(workspace_id=workspace_id)

    assert context.workspace_id == workspace_id
    assert error.value.code == "BACKGROUND_JOB_TARGET_DISABLED"


@pytest.mark.asyncio
async def test_workspace_resolver_rejects_missing_target_as_permanent() -> None:
    workspace_id = uuid4()
    resolver = WorkspaceJobTargetResolver(
        workspace_repository=_WorkspaceRepository(None),
        tenancy_repository=_TenancyRepository(None),
        required_schema_version=4,
    )

    with pytest.raises(PermanentJobExecutionError) as error:
        await resolver.resolve_for_reconciliation(workspace_id=workspace_id)

    assert error.value.code == "BACKGROUND_JOB_TARGET_NOT_FOUND"


def test_resolver_accepts_only_decoded_public_target_ids() -> None:
    for method in (
        ProjectJobTargetResolver.resolve_for_reconciliation,
        ProjectJobTargetResolver.authorize_new_effect,
    ):
        parameters = signature(method).parameters
        assert tuple(parameters) == ("self", "workspace_id", "project_id")
        assert "schema_name" not in parameters
        assert "isolation_mode" not in parameters
        assert "target_descriptor" not in parameters


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("disabled_target", "expected_entity_type"),
    [
        ("project", "project"),
        ("workspace", "workspace"),
        ("archived_workspace", "workspace"),
    ],
)
async def test_resolver_reconciles_before_rejecting_new_effect_on_disabled_target(
    disabled_target: str,
    expected_entity_type: str,
) -> None:
    scenario = _build_scenario(
        project_active=disabled_target != "project",
        workspace_active=disabled_target != "workspace",
        workspace_archived=disabled_target == "archived_workspace",
    )

    context = await scenario.resolver.resolve_for_reconciliation(
        workspace_id=scenario.workspace_id,
        project_id=scenario.project_id,
    )
    with pytest.raises(PermanentJobExecutionError) as error:
        await scenario.resolver.authorize_new_effect(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert context.project_id == scenario.project_id
    assert error.value.code == "BACKGROUND_JOB_TARGET_DISABLED"
    assert error.value.metadata is not None
    assert error.value.metadata["entityType"] == expected_entity_type
    assert scenario.tenancy_repository.requested_workspace_ids == [scenario.workspace_id]


@pytest.mark.asyncio
async def test_resolver_rejects_project_outside_job_workspace() -> None:
    scenario = _build_scenario(project_in_requested_workspace=False)

    with pytest.raises(PermanentJobExecutionError) as error:
        await scenario.resolver.resolve_for_reconciliation(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert error.value.code == "BACKGROUND_JOB_TARGET_WORKSPACE_MISMATCH"


@pytest.mark.asyncio
async def test_resolver_rejects_missing_project_as_permanent() -> None:
    scenario = _build_scenario(project_exists=False)

    with pytest.raises(PermanentJobExecutionError) as error:
        await scenario.resolver.resolve_for_reconciliation(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert error.value.code == "BACKGROUND_JOB_TARGET_NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "expected_reason",
    [
        "missing",
        "pending",
        "schema_outdated",
    ],
)
async def test_resolver_marks_unready_tenant_registry_as_transient(
    expected_reason: str,
) -> None:
    scenario = _build_scenario(
        tenant_exists=expected_reason != "missing",
        tenant_status=(WorkspaceTenantStatus.PENDING if expected_reason == "pending" else WorkspaceTenantStatus.READY),
        tenant_schema_version=3 if expected_reason == "schema_outdated" else 4,
    )

    with pytest.raises(TransientJobExecutionError) as error:
        await scenario.resolver.resolve_for_reconciliation(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert error.value.code == "BACKGROUND_JOB_TENANT_NOT_READY"
    assert error.value.metadata is not None
    assert error.value.metadata["reason"] == expected_reason


@pytest.mark.asyncio
async def test_resolver_marks_failed_tenant_registry_as_permanent() -> None:
    scenario = _build_scenario(tenant_status=WorkspaceTenantStatus.FAILED)

    with pytest.raises(PermanentJobExecutionError) as error:
        await scenario.resolver.resolve_for_reconciliation(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert error.value.code == "BACKGROUND_JOB_TENANT_FAILED"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("invalid_invariant", "expected_code"),
    [
        (
            "organization",
            "BACKGROUND_JOB_TENANT_INVARIANT_INVALID",
        ),
        (
            "schema",
            "BACKGROUND_JOB_TENANT_SCHEMA_INVALID",
        ),
        (
            "isolation",
            "BACKGROUND_JOB_TENANT_ISOLATION_UNSUPPORTED",
        ),
    ],
)
async def test_resolver_rejects_invalid_tenant_routing_invariants(
    invalid_invariant: str,
    expected_code: str,
) -> None:
    scenario = _build_scenario(
        tenant_organization_matches=invalid_invariant != "organization",
        tenant_schema_name=(
            'workspace_bad"schema' if invalid_invariant == "schema" else "workspace_0123456789abcdef0123"
        ),
        tenant_isolation_mode="public" if invalid_invariant == "isolation" else "workspace_schema",
    )

    with pytest.raises(PermanentJobExecutionError) as error:
        await scenario.resolver.resolve_for_reconciliation(
            workspace_id=scenario.workspace_id,
            project_id=scenario.project_id,
        )

    assert error.value.code == expected_code


def test_resolver_rejects_negative_required_schema_version() -> None:
    with pytest.raises(ValueError, match="required_schema_version must be non-negative"):
        _build_scenario(required_schema_version=-1)
