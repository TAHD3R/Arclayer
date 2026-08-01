from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.platform_capabilities.registry import (
    PlatformCapabilityNavigationRegistration,
    PlatformCapabilityRegistration,
)
from src.modules.platform_capabilities.schema import (
    PlatformCapabilityDomain,
    PlatformCapabilityEnablementState,
    PlatformCapabilityPermissionMatch,
    PlatformCapabilityReadinessState,
    PlatformCapabilityRouteTarget,
    PlatformCapabilityRuntimeHealth,
    PlatformCapabilitySupportState,
)
from src.modules.platform_capabilities.service import PlatformCapabilityCatalogService
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal


def _principal(*, is_owner: bool) -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=None if is_owner else uuid4(),
        is_instance_owner=is_owner,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


def _registration(
    *,
    capability_id: str,
    enablement_state: PlatformCapabilityEnablementState = PlatformCapabilityEnablementState.ENABLED,
    support_state: PlatformCapabilitySupportState = PlatformCapabilitySupportState.SUPPORTED,
) -> PlatformCapabilityRegistration:
    return PlatformCapabilityRegistration(
        capability_id=capability_id,
        domain=PlatformCapabilityDomain.TENANT_GOVERNANCE,
        name_i18n_key="navigation:WORKSPACES",
        description_i18n_key="tenants:WORKSPACES_DESCRIPTION",
        support_state=support_state,
        enablement_state=enablement_state,
        readiness_state=PlatformCapabilityReadinessState.READY,
        missing_prerequisite_codes=(),
        runtime_health=PlatformCapabilityRuntimeHealth.NOT_REPORTED,
        route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
        navigation_targets=(
            PlatformCapabilityNavigationRegistration(
                route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
                required_view_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_READ,),
                view_permission_match=PlatformCapabilityPermissionMatch.ALL,
            ),
        ),
        required_view_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_READ,),
        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
        required_manage_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_MANAGE,),
        manage_permission_match=PlatformCapabilityPermissionMatch.ALL,
    )


class _PermissionRepository:
    def __init__(self, permissions: frozenset[str]) -> None:
        self.permissions = permissions
        self.calls = 0

    async def list_effective_permission_codes(self, **_kwargs: object) -> frozenset[str]:
        self.calls += 1
        return self.permissions


@pytest.mark.asyncio
async def test_instance_owner_sees_every_registration_without_operator_permission_lookup() -> None:
    repository = _PermissionRepository(frozenset())
    registrations = (
        _registration(capability_id="tenant-governance"),
        _registration(
            capability_id="unsupported-domain",
            support_state=PlatformCapabilitySupportState.UNSUPPORTED,
        ),
    )

    catalog = await PlatformCapabilityCatalogService(repository, registrations=registrations).list_catalog(
        _principal(is_owner=True)
    )

    assert [item.capability_id for item in catalog.items] == ["tenant-governance", "unsupported-domain"]
    assert repository.calls == 0
    assert all(item.can_manage for item in catalog.items)
    assert catalog.items[1].navigation_candidate is False


@pytest.mark.asyncio
async def test_operator_catalog_is_filtered_by_current_exact_permissions_on_every_request() -> None:
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value}))
    registrations = (
        _registration(capability_id="visible"),
        _registration(capability_id="hidden").model_copy(
            update={
                "required_view_permissions": (PlatformPermissionCode.MONITORING_REQUESTS_READ,),
                "view_permission_match": PlatformCapabilityPermissionMatch.ALL,
                "navigation_targets": (
                    PlatformCapabilityNavigationRegistration(
                        route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
                        required_view_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
                        view_permission_match=PlatformCapabilityPermissionMatch.ALL,
                    ),
                ),
                "required_manage_permissions": (),
                "manage_permission_match": PlatformCapabilityPermissionMatch.ALL,
            }
        ),
    )
    service = PlatformCapabilityCatalogService(repository, registrations=registrations)
    principal = _principal(is_owner=False)

    first = await service.list_catalog(principal)
    repository.permissions = frozenset({PlatformPermissionCode.MONITORING_REQUESTS_READ.value})
    second = await service.list_catalog(principal)

    assert [item.capability_id for item in first.items] == ["visible"]
    assert first.items[0].can_manage is False
    assert [item.capability_id for item in second.items] == ["hidden"]
    assert repository.calls == 2


@pytest.mark.asyncio
async def test_catalog_returns_only_navigation_targets_authorized_for_the_operator() -> None:
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == ["tenant-governance"]
    assert [target.route_target for target in catalog.items[0].navigation_targets] == [
        PlatformCapabilityRouteTarget.TENANT_WORKSPACES
    ]


@pytest.mark.parametrize(
    "permission",
    (
        PlatformPermissionCode.ACCESS_ROLES_READ,
        PlatformPermissionCode.ACCESS_SESSIONS_READ,
        PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_READ,
        PlatformPermissionCode.TENANT_USERS_READ,
        PlatformPermissionCode.TENANT_PROJECTS_READ,
    ),
)
@pytest.mark.asyncio
async def test_removed_peer_route_permissions_do_not_create_navigation_candidates(
    permission: PlatformPermissionCode,
) -> None:
    repository = _PermissionRepository(frozenset({permission.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert catalog.items == ()


@pytest.mark.parametrize(
    ("permission", "capability_id", "route_targets"),
    (
        (
            PlatformPermissionCode.MONITORING_REQUESTS_READ,
            "monitoring-audit",
            ["monitoring.requests", "monitoring.performance", "monitoring.ai-usage"],
        ),
        (
            PlatformPermissionCode.MONITORING_AUDIT_READ,
            "monitoring-audit",
            ["monitoring.activity", "monitoring.audit"],
        ),
        (
            PlatformPermissionCode.OPERATIONS_SIGNALS_READ,
            "operations-signals",
            ["operations.signals"],
        ),
    ),
)
@pytest.mark.asyncio
async def test_each_peer_route_uses_its_exact_platform_permission(
    permission: PlatformPermissionCode,
    capability_id: str,
    route_targets: list[str],
) -> None:
    repository = _PermissionRepository(frozenset({permission.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == [capability_id]
    assert [target.route_target.value for target in catalog.items[0].navigation_targets] == route_targets


@pytest.mark.parametrize(
    ("permission", "capability_id"),
    (
        (PlatformPermissionCode.COMMERCE_READ, "commerce"),
        (PlatformPermissionCode.AI_TASKS_READ, "ai-services"),
        (PlatformPermissionCode.MESSAGES_FEEDBACK_READ, "communications"),
        (PlatformPermissionCode.EXTENSIONS_CATALOG_READ, "extensions"),
        (PlatformPermissionCode.SITE_DELIVERY_READ, "site-delivery"),
    ),
)
@pytest.mark.asyncio
async def test_removed_capabilities_are_not_ready_navigation_candidates(
    permission: PlatformPermissionCode,
    capability_id: str,
) -> None:
    repository = _PermissionRepository(frozenset({permission.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == [capability_id]
    capability = catalog.items[0]
    assert capability.readiness_state is PlatformCapabilityReadinessState.NOT_READY
    assert capability.missing_prerequisite_codes == ("PLATFORM_FRONTEND_ROUTE_UNAVAILABLE",)
    assert capability.navigation_candidate is False


@pytest.mark.asyncio
async def test_disabled_capability_requires_manage_authority_for_activation() -> None:
    registration = _registration(
        capability_id="activatable",
        enablement_state=PlatformCapabilityEnablementState.DISABLED_ACTIVATABLE,
    )
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.TENANT_WORKSPACES_MANAGE.value}))

    catalog = await PlatformCapabilityCatalogService(repository, registrations=(registration,)).list_catalog(
        _principal(is_owner=False)
    )

    assert len(catalog.items) == 1
    assert catalog.items[0].can_manage is True
    assert catalog.items[0].activation_available is True
    assert catalog.items[0].navigation_candidate is False


@pytest.mark.asyncio
async def test_view_only_operator_does_not_see_disabled_activatable_capability() -> None:
    registration = _registration(
        capability_id="activatable",
        enablement_state=PlatformCapabilityEnablementState.DISABLED_ACTIVATABLE,
    )
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value}))

    catalog = await PlatformCapabilityCatalogService(repository, registrations=(registration,)).list_catalog(
        _principal(is_owner=False)
    )

    assert catalog.items == ()


@pytest.mark.asyncio
async def test_multiple_required_permissions_use_explicit_all_semantics() -> None:
    registration = _registration(capability_id="all-required").model_copy(
        update={
            "required_view_permissions": (
                PlatformPermissionCode.TENANT_WORKSPACES_READ,
                PlatformPermissionCode.TENANT_USERS_READ,
            ),
            "view_permission_match": PlatformCapabilityPermissionMatch.ALL,
            "navigation_targets": (
                PlatformCapabilityNavigationRegistration(
                    route_target=PlatformCapabilityRouteTarget.TENANT_WORKSPACES,
                    required_view_permissions=(
                        PlatformPermissionCode.TENANT_WORKSPACES_READ,
                        PlatformPermissionCode.TENANT_USERS_READ,
                    ),
                    view_permission_match=PlatformCapabilityPermissionMatch.ALL,
                ),
            ),
            "required_manage_permissions": (),
        }
    )
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value}))
    service = PlatformCapabilityCatalogService(repository, registrations=(registration,))
    principal = _principal(is_owner=False)

    incomplete = await service.list_catalog(principal)
    repository.permissions = frozenset({
        PlatformPermissionCode.TENANT_WORKSPACES_READ.value,
        PlatformPermissionCode.TENANT_USERS_READ.value,
    })
    complete = await service.list_catalog(principal)

    assert incomplete.items == ()
    assert [item.capability_id for item in complete.items] == ["all-required"]


@pytest.mark.asyncio
async def test_access_capability_is_manageable_without_read_authority_but_not_navigable() -> None:
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.ACCESS_TEAM_INVITE.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == ["access"]
    access = catalog.items[0]
    assert access.can_manage is True
    assert access.manage_permission_match is PlatformCapabilityPermissionMatch.ANY
    assert access.readiness_state is PlatformCapabilityReadinessState.READY
    assert access.missing_prerequisite_codes == ()
    assert access.navigation_candidate is False


@pytest.mark.asyncio
async def test_access_team_read_authority_exposes_the_ready_trusted_route() -> None:
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.ACCESS_TEAM_READ.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == ["access"]
    access = catalog.items[0]
    assert access.navigation_candidate is True
    assert [target.route_target for target in access.navigation_targets] == [PlatformCapabilityRouteTarget.ACCESS_TEAM]


@pytest.mark.asyncio
async def test_operations_signal_manage_authority_does_not_create_navigation_without_read_access() -> None:
    repository = _PermissionRepository(frozenset({PlatformPermissionCode.OPERATIONS_SIGNALS_CLAIM.value}))

    catalog = await PlatformCapabilityCatalogService(repository).list_catalog(_principal(is_owner=False))

    assert [item.capability_id for item in catalog.items] == ["operations-signals"]
    signals = catalog.items[0]
    assert signals.can_manage is True
    assert signals.navigation_targets == ()
    assert signals.navigation_candidate is False


def test_registration_rejects_untrusted_route_target() -> None:
    payload = _registration(capability_id="trusted").model_dump()
    payload["route_target"] = "https://attacker.invalid/component.js"

    with pytest.raises(ValidationError):
        PlatformCapabilityRegistration.model_validate(payload)


@pytest.mark.asyncio
async def test_catalog_serialization_has_no_ambiguous_enabled_flag() -> None:
    repository = _PermissionRepository(frozenset())
    catalog = await PlatformCapabilityCatalogService(
        repository,
        registrations=(_registration(capability_id="trusted"),),
    ).list_catalog(_principal(is_owner=True))

    item = catalog.model_dump(mode="json")["items"][0]
    assert "enabled" not in item
    assert item["enablement_state"] == "enabled"
