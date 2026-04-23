from __future__ import annotations

from uuid import uuid4

from src.modules.projects.api_keys.scopes import (
    ApiKeyScope,
    build_api_key_access_profile,
    evaluate_api_key_action,
    resolve_actions_for_api_key_scopes,
    resolve_personal_management_permissions,
    resolve_project_service_permissions,
)
from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.workspaces.permissions import PermissionSubjectKind


def _project_snapshot(
    *,
    permission_codes: list[str],
    is_superuser: bool = False,
) -> ProjectAuthzSnapshot:
    return ProjectAuthzSnapshot(
        project_id=uuid4(),
        user_id=uuid4(),
        role_codes=["owner"] if is_superuser else ["editor"],
        permission_codes=permission_codes,
        is_superuser=is_superuser,
    )


def test_build_api_key_access_profile_maps_project_management_and_delivery_capabilities() -> None:
    profile = build_api_key_access_profile([
        ApiKeyScope.CONTENT_READ,
        ApiKeyScope.CONTENT_WRITE,
        ApiKeyScope.DELIVERY_READ,
        ApiKeyScope.GRAPHQL_READ,
    ])

    assert profile.delivery_read is True
    assert profile.graphql_read is True
    assert profile.granted_actions == frozenset({
        "project:content:items:write",
        "project:content:manage",
        "project:content:models:read",
        "project:content:publish",
        "project:content:read",
        "project:content:routing:read",
        "project:content:routing:write",
        "project:content:site-builder:write",
        "project:delivery:graphql:read",
        "project:delivery:read",
    })
    assert profile.management_permission_codes == frozenset({
        "system:content:manage",
        "system:content:publish",
        "system:content:read",
    })


def test_resolve_personal_management_permissions_intersects_snapshot_and_scope_profile() -> None:
    snapshot = _project_snapshot(
        permission_codes=[
            "system:content:read",
            "system:content:publish",
            "system:settings:read",
        ]
    )

    effective = resolve_personal_management_permissions(
        authz_snapshot=snapshot,
        scopes=[ApiKeyScope.CONTENT_READ, ApiKeyScope.CONTENT_WRITE, ApiKeyScope.SETTINGS_WRITE],
    )

    assert effective == frozenset({"system:content:read", "system:content:publish"})


def test_evaluate_api_key_action_allows_personal_superuser_without_explicit_permissions() -> None:
    snapshot = _project_snapshot(permission_codes=[], is_superuser=True)

    decision = evaluate_api_key_action(
        action="project:api-keys:manage",
        subject_kind=PermissionSubjectKind.PERSONAL_API_KEY,
        scopes=[ApiKeyScope.KEYS_WRITE],
        authz_snapshot=snapshot,
    )

    assert decision.allowed is True
    assert decision.reason == "SUPERUSER"


def test_resolve_project_service_permissions_uses_scope_profile_directly() -> None:
    effective = resolve_project_service_permissions(
        scopes=[ApiKeyScope.MODELS_WRITE, ApiKeyScope.SETTINGS_READ],
    )

    assert effective == frozenset({"system:content:manage", "system:settings:read"})


def test_resolve_actions_for_api_key_scopes_returns_project_delivery_actions() -> None:
    effective = resolve_actions_for_api_key_scopes(
        scopes=[ApiKeyScope.DELIVERY_READ, ApiKeyScope.GRAPHQL_READ],
    )

    assert effective == frozenset({"project:delivery:graphql:read", "project:delivery:read"})


def test_resolve_actions_for_api_key_scopes_derives_project_management_actions_from_catalog() -> None:
    effective = resolve_actions_for_api_key_scopes(
        scopes=[ApiKeyScope.CONTENT_WRITE, ApiKeyScope.MODELS_READ],
    )

    assert "project:content:items:write" in effective
    assert "project:content:models:read" in effective
    assert "project:content:site-builder:write" in effective
    assert "project:delivery:read" not in effective


def test_evaluate_api_key_action_checks_project_delivery_action_grants() -> None:
    decision = evaluate_api_key_action(
        action="project:delivery:graphql:read",
        subject_kind=PermissionSubjectKind.DELIVERY_API_KEY,
        scopes=[ApiKeyScope.GRAPHQL_READ],
    )

    assert decision.allowed is True
    assert decision.reason == "ACTION_GRANTED"


def test_evaluate_api_key_action_rejects_project_delivery_action_for_workspace_subject() -> None:
    decision = evaluate_api_key_action(
        action="project:delivery:graphql:read",
        subject_kind=PermissionSubjectKind.WORKSPACE_API_KEY,
        scopes=[ApiKeyScope.GRAPHQL_READ],
    )

    assert decision.allowed is False
    assert decision.reason == "SUBJECT_KIND_FORBIDDEN"
