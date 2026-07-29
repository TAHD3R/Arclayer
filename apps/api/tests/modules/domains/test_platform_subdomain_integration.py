from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.organization.organization import Organization
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace
from src.modules.domains.platform import build_platform_hostname
from src.modules.domains.service import DomainBindingService
from src.modules.projects.runtime.site.service import ProjectRuntimeSiteService

pytestmark = pytest.mark.integration


async def _create_project_runtime_site(
    slug: str = "test-project",
) -> tuple[Workspace, ProjectRecord, ProjectRuntimeRecord]:
    organization = await Organization.create(
        slug=f"org-{uuid4().hex[:12]}",
        name="Test Org",
        owner_user_id=None,
        is_active=True,
    )
    workspace = await Workspace.create(
        organization_id=organization.id,
        name="Workspace",
        is_active=True,
        created_by_user_id=uuid4(),
    )
    project = await ProjectRecord.create(
        workspace_id=workspace.id,
        slug=slug,
        name="Test Project",
        is_active=True,
        created_by_user_id=None,
    )
    runtime = await ProjectRuntimeRecord.filter(project_id=project.id).first()
    assert runtime is not None

    site_service = ProjectRuntimeSiteService(get_settings())
    await site_service.get_or_create_site_for_project_runtime(
        workspace_id=workspace.id,
        project_id=project.id,
        runtime_id=runtime.id,
        project_slug=project.slug,
        project_name=project.name,
        actor_user_id=None,
    )
    return workspace, project, runtime


@pytest.mark.asyncio
async def test_project_creation_creates_verified_platform_binding(prepared_db) -> None:
    _ = prepared_db
    workspace, project, runtime = await _create_project_runtime_site()

    bindings = await DomainBindingRecord.filter(project_id=project.id).all()
    assert len(bindings) == 1

    binding = bindings[0]
    assert binding.source == DomainBindingSource.PLATFORM
    assert binding.workspace_id == workspace.id
    assert binding.runtime_id == runtime.id
    assert binding.project_id == project.id
    assert binding.is_verified is True
    assert binding.is_active is True
    assert binding.is_primary is True
    assert binding.hostname == build_platform_hostname(project.slug, project.id, get_settings().saas.base_domain)


@pytest.mark.asyncio
async def test_repeated_runtime_site_creation_keeps_single_platform_binding(prepared_db) -> None:
    _ = prepared_db
    workspace, project, runtime = await _create_project_runtime_site()
    site_service = ProjectRuntimeSiteService(get_settings())

    await site_service.get_or_create_site_for_project_runtime(
        workspace_id=workspace.id,
        project_id=project.id,
        runtime_id=runtime.id,
        project_slug=project.slug,
        project_name=project.name,
        actor_user_id=None,
    )

    assert (
        await DomainBindingRecord.filter(
            project_id=project.id,
            runtime_id=runtime.id,
            source=DomainBindingSource.PLATFORM,
        ).count()
    ) == 1


@pytest.mark.asyncio
async def test_custom_domain_hostname_is_globally_unique(prepared_db) -> None:
    _ = prepared_db
    _workspace_one, project_one, runtime_one = await _create_project_runtime_site("first-project")
    _workspace_two, project_two, runtime_two = await _create_project_runtime_site("second-project")
    service = DomainBindingService(get_settings())

    site_one_binding = await DomainBindingRecord.filter(
        project_id=project_one.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    site_two_binding = await DomainBindingRecord.filter(
        project_id=project_two.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    assert site_one_binding is not None and site_two_binding is not None

    hostname = f"shared-domain-{uuid4().hex[:8]}.example.test"
    await service.create_custom_binding(
        workspace_id=site_one_binding.workspace_id,
        project_id=project_one.id,
        runtime_id=runtime_one.id,
        site_id=site_one_binding.site_id,
        hostname=hostname,
        actor_user_id=None,
    )

    with pytest.raises(Exception) as exc_info:
        await service.create_custom_binding(
            workspace_id=site_two_binding.workspace_id,
            project_id=project_two.id,
            runtime_id=runtime_two.id,
            site_id=site_two_binding.site_id,
            hostname=hostname,
            actor_user_id=None,
        )
    assert getattr(exc_info.value, "error", None) == "DOMAIN_BINDING_HOSTNAME_CONFLICT"
