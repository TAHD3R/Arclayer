from __future__ import annotations

import inspect
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.routing import APIRoute

from src.common.utils.public_ids import encode_uuid
from src.core.registry import create_app, create_platform_app
from src.modules.platform_identity.http import require_instance_owner
from src.modules.platform_identity.management_router import router
from src.modules.platform_identity.management_schema import PlatformSessionInventoryItemOut
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.step_up_schema import PlatformStepUpProofIssueRequest


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
        "/platform-api/v1/access/me",
        "/platform-api/v1/access/team",
        "/platform-api/v1/access/team/me",
        "/platform-api/v1/access/team/invitations",
        "/platform-api/v1/access/team/invitation-options",
        "/platform-api/v1/access/team/invitations/{invitation_id}",
        "/platform-api/v1/access/team/invitations/{invitation_id}/revoke",
        "/platform-api/v1/access/team/operators/{target_user_id}/offboard",
        "/platform-api/v1/access/team/ownership-transfers",
        "/platform-api/v1/access/roles",
        "/platform-api/v1/access/roles/custom",
        "/platform-api/v1/access/roles/custom/copy",
        "/platform-api/v1/access/roles/custom/apply",
        "/platform-api/v1/access/roles/{role_id}/preview",
        "/platform-api/v1/access/roles/{role_id}/retire",
        "/platform-api/v1/access/team/operators/{target_user_id}/roles",
        "/platform-api/v1/access/permissions",
        "/platform-api/v1/access/sessions/me",
        "/platform-api/v1/access/sessions/me/{session_id}/revoke",
        "/platform-api/v1/access/sessions/me/revoke-others",
        "/platform-api/v1/access/team/operators/{operator_id}/sessions",
        "/platform-api/v1/access/team/operators/{operator_id}/sessions/{session_id}/revoke",
        "/platform-api/v1/access/team/operators/{operator_id}/mfa/reset",
        "/platform-api/v1/access/mfa/readiness",
        "/platform-api/v1/access/mfa/methods/{method_id}/remove",
        "/platform-api/v1/access/mfa/authenticator-app/setup",
        "/platform-api/v1/access/mfa/authenticator-app/setup/confirm",
        "/platform-api/v1/access/mfa/security-key/setup/options",
        "/platform-api/v1/access/mfa/security-key/setup/complete",
        "/platform-api/v1/access/step-up/authenticator-app/complete",
        "/platform-api/v1/access/step-up/security-key/options",
        "/platform-api/v1/access/step-up/security-key/complete",
        "/platform-api/v1/access/sign-in/settings",
        "/platform-api/v1/access/sign-in/settings/policy",
        "/platform-api/v1/access/sign-in/settings/providers/{provider_key}",
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
        "list_platform_invitations": PlatformPermissionCode.ACCESS_TEAM_READ,
        "get_platform_invitation": PlatformPermissionCode.ACCESS_TEAM_READ,
        "invite_platform_operator": PlatformPermissionCode.ACCESS_TEAM_INVITE,
        "get_platform_invitation_options": PlatformPermissionCode.ACCESS_TEAM_INVITE,
        "revoke_platform_operator_invitation": PlatformPermissionCode.ACCESS_TEAM_INVITE,
        "offboard_platform_operator": PlatformPermissionCode.ACCESS_TEAM_REMOVE,
        "list_platform_roles": PlatformPermissionCode.ACCESS_ROLES_READ,
        "create_platform_custom_role": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "copy_platform_custom_role": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "preview_platform_custom_role_revision": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "apply_platform_custom_role_revision": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "replace_platform_operator_roles": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "retire_platform_custom_role": PlatformPermissionCode.ACCESS_ROLES_MANAGE,
        "list_platform_permissions": PlatformPermissionCode.ACCESS_ROLES_READ,
        "list_platform_operator_sessions": PlatformPermissionCode.ACCESS_SESSIONS_READ,
        "revoke_platform_operator_session": PlatformPermissionCode.ACCESS_SESSIONS_REVOKE,
        "reset_platform_operator_mfa": PlatformPermissionCode.ACCESS_MFA_RESET,
        "get_platform_sign_in_settings": PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_READ,
        "update_platform_sign_in_policy": PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_MANAGE,
        "update_platform_sign_in_provider": PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_MANAGE,
        "delete_platform_sign_in_provider": PlatformPermissionCode.ACCESS_SIGN_IN_SETTINGS_MANAGE,
    }


def test_platform_session_revoke_path_accepts_public_session_ids() -> None:
    schema = create_platform_app().openapi()
    operation = schema["paths"]["/platform-api/v1/access/sessions/me/{session_id}/revoke"]["post"]
    session_parameter = next(parameter for parameter in operation["parameters"] if parameter["name"] == "session_id")

    assert session_parameter["schema"]["pattern"] == "^[A-Za-z0-9_-]{22}$"


def test_platform_session_and_step_up_contracts_use_public_principal_ids() -> None:
    components = create_platform_app().openapi()["components"]["schemas"]

    inventory_properties = components["PlatformSessionInventoryItemOut"]["properties"]
    assert inventory_properties["sessionId"]["pattern"] == "^[A-Za-z0-9_-]{22}$"
    assert inventory_properties["actorUserId"]["pattern"] == "^[A-Za-z0-9_-]{22}$"

    step_up_properties = components["PlatformStepUpProofIssueRequest"]["properties"]
    assert step_up_properties["sessionId"]["pattern"] == "^[A-Za-z0-9_-]{22}$"
    assert step_up_properties["actorUserId"]["pattern"] == "^[A-Za-z0-9_-]{22}$"


def test_platform_public_principal_ids_round_trip_through_boundary_models() -> None:
    actor_user_id = uuid4()
    session_id = uuid4()

    step_up = PlatformStepUpProofIssueRequest.model_validate({
        "actorUserId": encode_uuid(actor_user_id),
        "sessionId": encode_uuid(session_id),
        "actionCode": "platform.access.remove_operator",
        "targetType": "platform_operator",
        "scope": {},
        "idempotencyKey": "step-up-public-id-contract",
    })
    assert step_up.actor_user_id == actor_user_id
    assert step_up.session_id == session_id

    now = datetime.now(UTC)
    inventory = PlatformSessionInventoryItemOut(
        session_id=session_id,
        actor_user_id=actor_user_id,
        device_label="Current browser",
        recent_activity_at=now,
        inactivity_expires_at=now,
        absolute_expires_at=now,
        policy_revision=1,
        assurance="local_mfa",
        is_current=True,
    ).model_dump(mode="json", by_alias=True)
    assert inventory["sessionId"] == encode_uuid(session_id)
    assert inventory["actorUserId"] == encode_uuid(actor_user_id)
