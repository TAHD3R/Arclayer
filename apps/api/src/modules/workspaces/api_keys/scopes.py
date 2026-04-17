from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from src.modules.workspaces.authz.schema import AuthzSnapshot


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
    delivery_read: bool
    graphql_read: bool


_SCOPE_TO_MANAGEMENT_PERMISSIONS: Final[dict[ApiKeyScope, frozenset[str]]] = {
    ApiKeyScope.CONTENT_READ: frozenset({"system:content:read"}),
    ApiKeyScope.CONTENT_WRITE: frozenset({"system:content:manage", "system:content:publish"}),
    ApiKeyScope.MODELS_READ: frozenset({"system:content:read"}),
    ApiKeyScope.MODELS_WRITE: frozenset({"system:content:manage"}),
    ApiKeyScope.KEYS_READ: frozenset({"system:keys:read"}),
    ApiKeyScope.KEYS_WRITE: frozenset({"system:keys:manage"}),
    ApiKeyScope.SETTINGS_READ: frozenset({"system:settings:read"}),
    ApiKeyScope.SETTINGS_WRITE: frozenset({"system:settings:manage"}),
    ApiKeyScope.DELIVERY_READ: frozenset(),
    ApiKeyScope.GRAPHQL_READ: frozenset(),
}


def normalize_api_key_scopes(scopes: Iterable[str | ApiKeyScope]) -> tuple[ApiKeyScope, ...]:
    normalized = {ApiKeyScope(str(scope)) for scope in scopes}
    return tuple(sorted(normalized, key=lambda value: value.value))


def build_api_key_access_profile(scopes: Iterable[str | ApiKeyScope]) -> ApiKeyAccessProfile:
    normalized_scopes = normalize_api_key_scopes(scopes)
    permission_codes: set[str] = set()
    for scope in normalized_scopes:
        permission_codes.update(_SCOPE_TO_MANAGEMENT_PERMISSIONS[scope])
    normalized_scope_set = set(normalized_scopes)
    return ApiKeyAccessProfile(
        scopes=normalized_scopes,
        management_permission_codes=frozenset(sorted(permission_codes)),
        delivery_read=ApiKeyScope.DELIVERY_READ in normalized_scope_set,
        graphql_read=ApiKeyScope.GRAPHQL_READ in normalized_scope_set,
    )


def resolve_personal_management_permissions(
    *,
    authz_snapshot: AuthzSnapshot,
    scopes: Iterable[str | ApiKeyScope],
) -> frozenset[str]:
    profile = build_api_key_access_profile(scopes)
    if authz_snapshot.is_superuser:
        return profile.management_permission_codes
    return frozenset(sorted(set(authz_snapshot.permission_codes) & set(profile.management_permission_codes)))


def resolve_workspace_service_permissions(*, scopes: Iterable[str | ApiKeyScope]) -> frozenset[str]:
    return build_api_key_access_profile(scopes).management_permission_codes
