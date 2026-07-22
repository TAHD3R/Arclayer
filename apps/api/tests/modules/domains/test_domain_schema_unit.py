from __future__ import annotations

from uuid import uuid4

from src.modules.domains.schema import DomainBindingOut, resolve_routable_domain_binding


def _binding(
    hostname: str,
    *,
    site_id=None,
    is_primary: bool = False,
    is_verified: bool = True,
    is_active: bool = True,
) -> DomainBindingOut:
    workspace_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    return DomainBindingOut(
        bindingId=uuid4(),
        hostname=hostname,
        source="custom",
        targetType="project_runtime",
        workspaceId=workspace_id,
        projectId=project_id,
        runtimeId=runtime_id,
        siteId=site_id or uuid4(),
        isPrimary=is_primary,
        isVerified=is_verified,
        isActive=is_active,
        certificateStatus="issued",
    )


def test_resolve_routable_domain_binding_prefers_verified_active_primary() -> None:
    site_id = uuid4()
    fallback = _binding("fallback.example.com", site_id=site_id)
    primary = _binding("primary.example.com", site_id=site_id, is_primary=True)

    assert resolve_routable_domain_binding([fallback, primary], site_id=site_id) == primary


def test_resolve_routable_domain_binding_rejects_unroutable_and_other_site_bindings() -> None:
    site_id = uuid4()
    bindings = [
        _binding("inactive.example.com", site_id=site_id, is_primary=True, is_active=False),
        _binding("unverified.example.com", site_id=site_id, is_verified=False),
        _binding("other.example.com", site_id=uuid4()),
    ]

    assert resolve_routable_domain_binding(bindings, site_id=site_id) is None
