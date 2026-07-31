from __future__ import annotations

import inspect

from fastapi.routing import APIRoute

from src.core.registry import create_app, create_platform_app
from src.modules.platform_identity.http import require_instance_owner
from src.modules.platform_identity.management_router import router
from src.modules.platform_identity.permissions import PlatformPermissionCode


def _route_permissions(routes: list[APIRoute]) -> dict[str, PlatformPermissionCode]:
    permissions: dict[str, PlatformPermissionCode] = {}
    for route in routes:
        dependencies = list(route.dependant.dependencies)
        while dependencies:
            dependency = dependencies.pop()
            dependencies.extend(dependency.dependencies)
            if not inspect.isfunction(dependency.call):
                continue
            permission = inspect.getclosurevars(dependency.call).nonlocals.get("permission_code")
            if permission is not None:
                endpoint_name = getattr(route.endpoint, "__name__", None)
                assert isinstance(endpoint_name, str)
                permissions[endpoint_name] = PlatformPermissionCode(permission)
    return permissions


def test_platform_identity_management_routes_are_platform_only_and_exactly_guarded() -> None:
    product_paths = {route.path for route in create_app().routes if isinstance(route, APIRoute)}
    platform_paths = {route.path for route in create_platform_app().routes if isinstance(route, APIRoute)}

    expected_paths = {
        "/platform-api/v1/access/team",
        "/platform-api/v1/access/team/me",
        "/platform-api/v1/access/team/invitations",
        "/platform-api/v1/access/team/invitations/{invitation_id}",
        "/platform-api/v1/access/team/operators/{target_user_id}/offboard",
        "/platform-api/v1/access/team/ownership-transfers",
        "/platform-api/v1/access/roles",
        "/platform-api/v1/access/permissions",
        "/platform-api/v1/access/sessions/me",
        "/platform-api/v1/access/mfa/readiness",
        "/platform-api/v1/access/sign-in/readiness",
    }
    assert expected_paths <= platform_paths
    assert expected_paths.isdisjoint(product_paths)

    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    ownership_transfer_route = next(
        route for route in routes if getattr(route.endpoint, "__name__", None) == "nominate_platform_ownership_transfer"
    )
    assert any(
        dependency.call is require_instance_owner for dependency in ownership_transfer_route.dependant.dependencies
    )
    assert _route_permissions(routes) == {
        "list_platform_team": PlatformPermissionCode.ACCESS_TEAM_READ,
        "get_current_team_identity": PlatformPermissionCode.ACCESS_TEAM_READ,
        "list_platform_invitations": PlatformPermissionCode.ACCESS_TEAM_READ,
        "get_platform_invitation": PlatformPermissionCode.ACCESS_TEAM_READ,
        "invite_platform_operator": PlatformPermissionCode.ACCESS_TEAM_INVITE,
        "offboard_platform_operator": PlatformPermissionCode.ACCESS_TEAM_REMOVE,
        "list_platform_roles": PlatformPermissionCode.ACCESS_ROLES_READ,
        "list_platform_permissions": PlatformPermissionCode.ACCESS_ROLES_READ,
        "list_current_platform_sessions": PlatformPermissionCode.ACCESS_SESSIONS_READ,
        "get_current_platform_mfa_readiness": PlatformPermissionCode.ACCESS_TEAM_READ,
        "get_platform_sign_in_readiness": PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_READ,
    }
