from __future__ import annotations

from src.modules.workspaces.api_keys.scopes import (
    ApiKeyScope,
    build_api_key_access_profile,
    evaluate_api_key_action,
    resolve_actions_for_api_key_scopes,
    resolve_personal_management_permissions,
    resolve_workspace_service_permissions,
)
from src.modules.workspaces.authz.schema import AuthzSnapshot
from src.modules.workspaces.permissions import PermissionSubjectKind


def test_build_api_key_access_profile_maps_management_and_delivery_capabilities() -> None:
    profile = build_api_key_access_profile([
        ApiKeyScope.CONTENT_READ,
        ApiKeyScope.CONTENT_WRITE,
        ApiKeyScope.DELIVERY_READ,
        ApiKeyScope.GRAPHQL_READ,
    ])

    assert profile.delivery_read is True
    assert profile.graphql_read is True
    assert profile.granted_actions == frozenset({"delivery:graphql:read", "delivery:read"})
    assert profile.management_permission_codes == frozenset({
        "system:content:read",
        "system:content:manage",
        "system:content:publish",
    })


def test_resolve_personal_management_permissions_intersects_snapshot_and_scope_profile() -> None:
    snapshot = AuthzSnapshot(
        user_id="0195f6c0-7c5f-7ae2-bdfa-9cd4fd840001",
        role_codes=["editor"],
        permission_codes=["system:content:read", "system:content:publish", "system:settings:read"],
        is_superuser=False,
    )

    effective = resolve_personal_management_permissions(
        authz_snapshot=snapshot,
        scopes=[ApiKeyScope.CONTENT_READ, ApiKeyScope.CONTENT_WRITE, ApiKeyScope.SETTINGS_WRITE],
    )

    assert effective == frozenset({"system:content:read", "system:content:publish"})


def test_resolve_personal_management_permissions_keeps_scope_profile_for_superuser() -> None:
    snapshot = AuthzSnapshot(
        user_id="0195f6c0-7c5f-7ae2-bdfa-9cd4fd840002",
        role_codes=["owner"],
        permission_codes=[],
        is_superuser=True,
    )

    effective = resolve_personal_management_permissions(
        authz_snapshot=snapshot,
        scopes=[ApiKeyScope.KEYS_WRITE, ApiKeyScope.SETTINGS_READ],
    )

    assert effective == frozenset({"system:keys:manage", "system:settings:read"})


def test_resolve_workspace_service_permissions_uses_scope_profile_directly() -> None:
    effective = resolve_workspace_service_permissions(
        scopes=[ApiKeyScope.MODELS_WRITE, ApiKeyScope.SETTINGS_READ],
    )

    assert effective == frozenset({"system:content:manage", "system:settings:read"})


def test_resolve_actions_for_api_key_scopes_returns_delivery_actions() -> None:
    effective = resolve_actions_for_api_key_scopes(
        scopes=[ApiKeyScope.DELIVERY_READ, ApiKeyScope.GRAPHQL_READ],
    )

    assert effective == frozenset({"delivery:graphql:read", "delivery:read"})


def test_evaluate_api_key_action_checks_delivery_action_grants() -> None:
    decision = evaluate_api_key_action(
        action="delivery:graphql:read",
        subject_kind=PermissionSubjectKind.DELIVERY_API_KEY,
        scopes=[ApiKeyScope.GRAPHQL_READ],
    )

    assert decision.allowed is True
    assert decision.reason == "ACTION_GRANTED"
