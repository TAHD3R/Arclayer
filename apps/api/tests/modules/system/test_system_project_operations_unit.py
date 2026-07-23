from __future__ import annotations

from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from src.core.exceptions import NotFound
from src.modules.projects.deployments.schema import ProjectDeploymentListOut, ProjectDeploymentOut
from src.modules.projects.environments.schema import ProjectEnvironmentListOut
from src.modules.projects.releases.schema import ReleaseListOut
from src.modules.projects.runtime.schema import ProjectRuntimeContextOut
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.system.directory.project_operations import SystemProjectOperationsService
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


class MembershipQuery:
    def __init__(self, rows: list[Any]) -> None:
        self.rows = rows
        self.limit_value: int | None = None

    async def count(self) -> int:
        return len(self.rows)

    def limit(self, value: int) -> MembershipQuery:
        self.limit_value = value
        return self

    async def all(self) -> list[Any]:
        if self.limit_value is None:
            return self.rows
        return self.rows[: self.limit_value]


def deployment(*, status: str, is_active: bool = True) -> ProjectDeploymentOut:
    return ProjectDeploymentOut.model_construct(
        id=uuid4(),
        status=status,
        is_active=is_active,
    )


def runtime_context(*, project_id: UUID, workspace_id: UUID) -> ProjectRuntimeContext:
    runtime_id = uuid4()
    site_id = uuid4()
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            schema_name="public",
            isolation_mode=TenantIsolationMode.PUBLIC,
        ),
        scope=TenantScope.RUNTIME,
    )
    return ProjectRuntimeContext(
        runtime_id=runtime_id,
        project_id=project_id,
        workspace_id=workspace_id,
        site_id=site_id,
        tenant_context=tenant_context,
        kind="website",
        name="Storefront",
        slug="storefront",
        default_locale="zh-CN",
        fallback_locale="en-US",
        is_active=True,
    )


def build_service(
    *,
    project: object | None,
    runtime: ProjectRuntimeContext | Exception,
    deployments: list[ProjectDeploymentOut] | None = None,
) -> tuple[SystemProjectOperationsService, MagicMock, MagicMock, MembershipQuery]:
    directory_repo = MagicMock(get_project_by_id=AsyncMock(return_value=project))
    membership_query = MembershipQuery([])
    members_repo = MagicMock(query_memberships=MagicMock(return_value=membership_query))
    runtime_service = MagicMock()
    if isinstance(runtime, Exception):
        runtime_service.get_context_by_project = AsyncMock(side_effect=runtime)
    else:
        runtime_service.get_context_by_project = AsyncMock(return_value=runtime)
    domain_service = MagicMock(list_bindings_for_project=AsyncMock(return_value=[]))
    environments_service = MagicMock(list_environments_out=AsyncMock(return_value=ProjectEnvironmentListOut()))
    deployments_service = MagicMock(
        list_deployments_out=AsyncMock(return_value=ProjectDeploymentListOut(items=deployments or []))
    )
    releases_service = MagicMock(list_releases_out=AsyncMock(return_value=ReleaseListOut()))
    service = SystemProjectOperationsService(
        directory_repo=cast(Any, directory_repo),
        members_repo=cast(Any, members_repo),
        runtime_service=cast(Any, runtime_service),
        domain_service=cast(Any, domain_service),
        environments_factory=cast(Any, MagicMock(return_value=environments_service)),
        deployments_factory=cast(Any, MagicMock(return_value=deployments_service)),
        releases_factory=cast(Any, MagicMock(return_value=releases_service)),
    )
    return service, runtime_service, deployments_service, membership_query


def test_health_states_are_explicit() -> None:
    active_runtime = ProjectRuntimeContextOut.model_construct(is_active=True)
    inactive_runtime = ProjectRuntimeContextOut.model_construct(is_active=False)

    assert SystemProjectOperationsService._health(None, []) == "unavailable"
    assert SystemProjectOperationsService._health(inactive_runtime, []) == "inactive"
    assert SystemProjectOperationsService._health(active_runtime, []) == "not_deployed"
    assert SystemProjectOperationsService._health(active_runtime, [deployment(status="ready")]) == "healthy"
    assert SystemProjectOperationsService._health(active_runtime, [deployment(status="failed")]) == "degraded"


async def test_operations_health_uses_all_deployments_before_preview_is_trimmed() -> None:
    project_id = uuid4()
    workspace_id = uuid4()
    context = runtime_context(project_id=project_id, workspace_id=workspace_id)
    service, runtime_service, deployments_service, membership_query = build_service(
        project=MagicMock(workspace_id=workspace_id),
        runtime=context,
        deployments=[deployment(status="ready"), deployment(status="failed")],
    )

    result = await service.get_operations(
        project_id=project_id,
        actor_user_id=uuid4(),
        preview_size=1,
    )

    assert result.runtime_state == "ready"
    assert result.health == "degraded"
    assert len(result.deployments) == 1
    assert membership_query.limit_value == 1
    runtime_service.get_context_by_project.assert_awaited_once()
    deployments_service.list_deployments_out.assert_awaited_once_with(project_id=project_id)


@pytest.mark.parametrize(
    ("error", "expected_state"),
    [
        ("PROJECT_RUNTIME_NOT_FOUND", "runtime_missing"),
        ("PROJECT_RUNTIME_SITE_NOT_FOUND", "site_missing"),
    ],
)
async def test_operations_exposes_runtime_absence(
    error: str,
    expected_state: str,
) -> None:
    project_id = uuid4()
    workspace_id = uuid4()
    service, _, deployments_service, _ = build_service(
        project=MagicMock(workspace_id=workspace_id),
        runtime=NotFound("Runtime data unavailable", error=error),
    )

    result = await service.get_operations(
        project_id=project_id,
        actor_user_id=uuid4(),
        preview_size=6,
    )

    assert result.runtime_state == expected_state
    assert result.runtime is None
    assert result.health == "unavailable"
    deployments_service.list_deployments_out.assert_not_awaited()


async def test_operations_rejects_unknown_project() -> None:
    service, runtime_service, _, _ = build_service(
        project=None,
        runtime=NotFound("Runtime data unavailable", error="PROJECT_RUNTIME_NOT_FOUND"),
    )

    with pytest.raises(NotFound) as exc_info:
        await service.get_operations(
            project_id=uuid4(),
            actor_user_id=uuid4(),
            preview_size=6,
        )

    assert exc_info.value.error == "NOT_FOUND"
    runtime_service.get_context_by_project.assert_not_awaited()
