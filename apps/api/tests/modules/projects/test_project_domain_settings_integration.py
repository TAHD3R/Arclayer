from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.domains.domain_binding import DomainBindingRecord, DomainBindingSource
from src.models.organization.organization import Organization, OrganizationKind
from src.models.projects.project import ProjectRecord
from src.models.projects.runtime import ProjectRuntimeRecord
from src.models.workspaces.workspace import Workspace
from src.modules.domains.service import DomainBindingService
from src.modules.projects.runtime.site.service import ProjectRuntimeSiteService

pytestmark = pytest.mark.integration


async def _create_project_runtime_site(
    slug: str = "domain-settings-project",
) -> tuple[Workspace, ProjectRecord, ProjectRuntimeRecord]:
    organization = await Organization.create(
        slug=f"org-{uuid4().hex[:12]}",
        name="Settings Org",
        kind=OrganizationKind.TEAM,
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
        name="Domain Settings Project",
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
async def test_project_domain_settings_lists_platform_and_custom_bindings(prepared_db) -> None:
    _ = prepared_db
    service = DomainBindingService(get_settings())
    _workspace, project, runtime = await _create_project_runtime_site()
    platform_binding = await DomainBindingRecord.filter(
        project_id=project.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    assert platform_binding is not None

    custom_binding = await service.create_custom_binding(
        workspace_id=platform_binding.workspace_id,
        project_id=project.id,
        runtime_id=runtime.id,
        site_id=platform_binding.site_id,
        hostname=f"project-domain-{uuid4().hex[:8]}.example.test",
        actor_user_id=None,
    )

    rows = [service.to_out(binding) for binding in await service.list_bindings_for_project(project_id=project.id)]
    assert {row["source"] for row in rows} == {"platform", "custom"}

    platform_row = next(row for row in rows if row["source"] == "platform")
    assert platform_row["isPrimary"] is True
    assert platform_row["isVerified"] is True
    assert platform_row["certificateStatus"] == "platform_managed"
    assert platform_row["dns"] is None

    custom_row = next(row for row in rows if row["source"] == "custom")
    assert custom_row["bindingId"] == custom_binding.id
    assert custom_row["dns"].txt_record_name == f"_arclayer-site-verification.{custom_binding.hostname}"
    assert custom_row["certificateStatus"] == "pending"


@pytest.mark.asyncio
async def test_project_domain_settings_verify_toggle_and_delete_guards(prepared_db, monkeypatch) -> None:
    _ = prepared_db
    service = DomainBindingService(get_settings())
    _workspace, project, runtime = await _create_project_runtime_site(f"domain-settings-{uuid4().hex[:6]}")
    platform_binding = await DomainBindingRecord.filter(
        project_id=project.id,
        source=DomainBindingSource.PLATFORM,
    ).first()
    assert platform_binding is not None

    custom_binding = await service.create_custom_binding(
        workspace_id=platform_binding.workspace_id,
        project_id=project.id,
        runtime_id=runtime.id,
        site_id=platform_binding.site_id,
        hostname=f"verify-domain-{uuid4().hex[:8]}.example.test",
        actor_user_id=None,
    )

    async def fake_lookup(self, *, txt_name: str):
        expected = f"_arclayer-site-verification.{custom_binding.hostname}"
        assert txt_name == expected
        return type(
            "Lookup",
            (),
            {"ok": True, "observed": [f"arclayer-site-verification={custom_binding.verification_token}"]},
        )()

    monkeypatch.setattr(DomainBindingService, "_lookup_dns_txt_async", fake_lookup)

    verified_binding, observed = await service.verify_custom_binding(
        project_id=project.id, binding_id=custom_binding.id
    )
    assert verified_binding.is_verified is True
    assert observed == [f"arclayer-site-verification={custom_binding.verification_token}"]

    inactive_binding = await service.set_binding_active(
        project_id=project.id,
        binding_id=custom_binding.id,
        is_active=False,
    )
    assert inactive_binding.is_active is False

    with pytest.raises(Conflict) as exc_info:
        await service.delete_custom_binding(project_id=project.id, binding_id=platform_binding.id)
    assert exc_info.value.error == "DOMAIN_BINDING_DELETE_NOT_ALLOWED"
