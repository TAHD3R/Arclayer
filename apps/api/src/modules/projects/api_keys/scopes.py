from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from typing import Final

from src.modules.projects.authz.schema import ProjectAuthzSnapshot
from src.modules.projects.permissions.schema import (
    PermissionContext,
    PermissionDecision,
    PermissionSubjectKind,
)
from src.modules.projects.permissions.service import PolicyEvaluationService, get_project_action_catalog


class ApiKeyScope(StrEnum):
    CONTENT_READ = "content.read"
    CONTENT_WRITE = "content.write"
    MODELS_READ = "models.read"
    MODELS_WRITE = "models.write"
    DELIVERY_READ = "delivery.read"
    GRAPHQL_READ = "graphql.read"
    KEYS_READ = "keys.read"
    KEYS_WRITE = "keys.write"
    SETTINGS_READ = "settings.read"
    SETTINGS_WRITE = "settings.write"


@dataclass(frozen=True)
class ApiKeyAccessProfile:
    scopes: tuple[ApiKeyScope, ...]
    management_permission_codes: frozenset[str]
    granted_actions: frozenset[str]
    delivery_read: bool
    graphql_read: bool


_SCOPE_TO_PROJECT_ACTIONS: Final[dict[ApiKeyScope, frozenset[str]]] = {
    ApiKeyScope.CONTENT_READ: frozenset({
        "project:content:read",
        "project:content:models:read",
        "project:content:routing:read",
    }),
    ApiKeyScope.CONTENT_WRITE: frozenset({
        "project:content:manage",
        "project:content:publish",
        "project:content:items:write",
        "project:content:site-builder:write",
        "project:content:routing:write",
    }),
    ApiKeyScope.MODELS_READ: frozenset({"project:content:models:read"}),
    ApiKeyScope.MODELS_WRITE: frozenset({"project:content:models:write"}),
    ApiKeyScope.KEYS_READ: frozenset({"project:api-keys:read"}),
    ApiKeyScope.KEYS_WRITE: frozenset({"project:api-keys:manage"}),
    ApiKeyScope.SETTINGS_READ: frozenset({"project:settings:read"}),
    ApiKeyScope.SETTINGS_WRITE: frozenset({"project:settings:manage"}),
    ApiKeyScope.DELIVERY_READ: frozenset({"project:delivery:read"}),
    ApiKeyScope.GRAPHQL_READ: frozenset({"project:delivery:graphql:read"}),
}


@lru_cache(maxsize=1)
def _get_project_policy_evaluator() -> PolicyEvaluationService:
    return PolicyEvaluationService(registry=get_project_action_catalog())


def normalize_api_key_scopes(scopes: Iterable[str | ApiKeyScope]) -> tuple[ApiKeyScope, ...]:
    normalized = {ApiKeyScope(str(scope)) for scope in scopes}
    return tuple(sorted(normalized, key=lambda value: value.value))


def build_api_key_access_profile(scopes: Iterable[str | ApiKeyScope]) -> ApiKeyAccessProfile:
    normalized_scopes = normalize_api_key_scopes(scopes)
    granted_actions: set[str] = set()
    for scope in normalized_scopes:
        granted_actions.update(_SCOPE_TO_PROJECT_ACTIONS[scope])

    action_catalog = get_project_action_catalog()
    permission_codes = {
        permission_code
        for action in granted_actions
        for permission_code in action_catalog[action].permission_codes
        if str(permission_code).strip()
    }

    return ApiKeyAccessProfile(
        scopes=normalized_scopes,
        management_permission_codes=frozenset(sorted(permission_codes)),
        granted_actions=frozenset(sorted(granted_actions)),
        delivery_read=ApiKeyScope.DELIVERY_READ in normalized_scopes,
        graphql_read=ApiKeyScope.GRAPHQL_READ in normalized_scopes,
    )


def resolve_personal_management_permissions(
    *,
    authz_snapshot: ProjectAuthzSnapshot,
    scopes: Iterable[str | ApiKeyScope],
) -> frozenset[str]:
    profile = build_api_key_access_profile(scopes)
    return frozenset(sorted(set(authz_snapshot.permission_codes) & set(profile.management_permission_codes)))


def resolve_project_service_permissions(*, scopes: Iterable[str | ApiKeyScope]) -> frozenset[str]:
    return build_api_key_access_profile(scopes).management_permission_codes


def resolve_actions_for_api_key_scopes(*, scopes: Iterable[str | ApiKeyScope]) -> frozenset[str]:
    return build_api_key_access_profile(scopes).granted_actions


def evaluate_api_key_action(
    *,
    action: str,
    subject_kind: PermissionSubjectKind,
    scopes: Iterable[str | ApiKeyScope],
    authz_snapshot: ProjectAuthzSnapshot | None = None,
) -> PermissionDecision:
    profile = build_api_key_access_profile(scopes)
    effective_permission_codes = (
        list(resolve_personal_management_permissions(authz_snapshot=authz_snapshot, scopes=scopes))
        if subject_kind == PermissionSubjectKind.PERSONAL_API_KEY and authz_snapshot is not None
        else list(profile.management_permission_codes)
    )
    return _get_project_policy_evaluator().evaluate(
        context=PermissionContext(
            action=action,
            subject_kind=subject_kind,
            user_id=authz_snapshot.user_id if authz_snapshot is not None else None,
            role_codes=authz_snapshot.role_codes if authz_snapshot is not None else [],
            permission_codes=effective_permission_codes,
            is_superuser=authz_snapshot.is_superuser if authz_snapshot is not None else False,
            granted_actions=list(profile.granted_actions),
        )
    )
