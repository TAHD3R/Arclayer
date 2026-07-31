from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import NotFound
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace
from src.modules.domains.resolver import DomainResolver
from src.modules.projects.runtime.site.service import ProjectRuntimeSiteService

pytestmark = pytest.mark.integration


async def _create_project_runtime_site(
    slug: str = "resolver-project",
) -> tuple[Workspace, ProjectRecord, ProjectRuntimeRecord]:
    owner_user_id = uuid4()
    organization = await Organization.create(
        slug=f"org-{uuid4().hex[:12]}",
        name="Resolver Org",
        owner_user_id=None,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Workspace",
        is_active=True,
        owner_user_id=owner_user_id,
        created_by_user_id=owner_user_id,
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=slug,
        name="Resolver Project",
        is_active=True,
        created_by_user_id=None,
    )
    runtime = await ProjectRuntimeRecord.filter(project_id=project.id).first()
    assert runtime is not None
    await ProjectRuntimeSiteService(get_settings()).get_or_create_site_for_project_runtime(
        workspace_id=workspace.id,
        project_id=project.id,
        runtime_id=runtime.id,
        project_slug=project.slug,
        project_name=project.name,
        actor_user_id=None,
    )
    return workspace, project, runtime


@pytest.mark.asyncio
async def test_resolve_host_returns_platform_binding_identity(prepared_db) -> None:
    _ = prepared_db
    workspace, project, runtime = await _create_project_runtime_site()
    resolver = DomainResolver(get_settings())
    platform_binding = await DomainBindingRecord.filter(
        project_id=project.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    assert platform_binding is not None

    resolved = await resolver.resolve_host(platform_binding.hostname)
    assert resolved.workspace_id == workspace.id
    assert resolved.project_id == project.id
    assert resolved.runtime_id == runtime.id
    assert resolved.site_id == platform_binding.site_id
    assert resolved.hostname == platform_binding.hostname
    assert resolved.source == DomainBindingSource.PLATFORM


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("is_verified", "is_active", "should_resolve"),
    [
        (True, True, True),
        (False, True, False),
        (True, False, False),
    ],
)
async def test_resolve_host_honors_custom_binding_state(
    prepared_db,
    is_verified: bool,
    is_active: bool,
    should_resolve: bool,
) -> None:
    _ = prepared_db
    _workspace, project, runtime = await _create_project_runtime_site(f"resolver-{uuid4().hex[:6]}")
    resolver = DomainResolver(get_settings())
    platform_binding = await DomainBindingRecord.filter(
        project_id=project.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    assert platform_binding is not None

    hostname = f"resolve-{uuid4().hex[:8]}.example.test"
    await DomainBindingRecord.create(
        workspace_id=platform_binding.workspace_id,
        project_id=project.id,
        runtime_id=runtime.id,
        site_id=platform_binding.site_id,
        hostname=hostname,
        source=DomainBindingSource.CUSTOM,
        target_type="project_runtime",
        environment_id=None,
        is_primary=False,
        is_verified=is_verified,
        is_active=is_active,
        verification_token="resolver-token",
        certificate_status="pending",
        created_by_user_id=None,
    )

    if should_resolve:
        resolved = await resolver.resolve_host(hostname)
        assert resolved.source == DomainBindingSource.CUSTOM
        assert resolved.project_id == project.id
        return

    with pytest.raises(NotFound) as exc_info:
        await resolver.resolve_host(hostname)
    assert exc_info.value.error == "SITE_NOT_FOUND"


@pytest.mark.asyncio
async def test_resolve_host_rejects_unknown_host(prepared_db) -> None:
    _ = prepared_db
    await _create_project_runtime_site("resolver-unknown")
    resolver = DomainResolver(get_settings())

    with pytest.raises(NotFound) as exc_info:
        await resolver.resolve_host(f"missing-{uuid4().hex[:8]}.example.test")
    assert exc_info.value.error == "SITE_NOT_FOUND"
