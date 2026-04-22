from __future__ import annotations

from functools import lru_cache

from src.models.projects.membership import ProjectMemberRole
from src.modules.projects.permissions.catalog import build_project_permission_action_catalog
from src.modules.workspaces.permissions.registry import PermissionActionDefinition

_PROJECT_ROLE_ACTION_CODES: dict[ProjectMemberRole, frozenset[str]] = {
    ProjectMemberRole.OWNER: frozenset({
        "project:settings:read",
        "project:settings:manage",
        "project:team:members:read",
        "project:team:roles:manage",
        "project:content:read",
        "project:content:manage",
        "project:content:publish",
        "project:content:items:write",
        "project:content:site-builder:write",
        "project:content:routing:read",
        "project:content:routing:write",
        "project:content:models:read",
        "project:content:models:write",
        "project:site:read",
        "project:site:manage",
        "project:release:read",
        "project:release:publish",
        "project:release:rollback",
        "project:automation:read",
        "project:automation:manage",
        "project:api-keys:read",
        "project:api-keys:manage",
        "project:domains:read",
        "project:domains:manage",
        "project:delivery:preview",
    }),
    ProjectMemberRole.EDITOR: frozenset({
        "project:settings:read",
        "project:team:members:read",
        "project:content:read",
        "project:content:manage",
        "project:content:publish",
        "project:content:items:write",
        "project:content:site-builder:write",
        "project:content:routing:read",
        "project:content:routing:write",
        "project:content:models:read",
        "project:content:models:write",
        "project:site:read",
        "project:site:manage",
        "project:release:read",
        "project:release:publish",
        "project:automation:read",
        "project:domains:read",
        "project:delivery:preview",
    }),
    ProjectMemberRole.VIEWER: frozenset({
        "project:settings:read",
        "project:team:members:read",
        "project:content:read",
        "project:content:routing:read",
        "project:content:models:read",
        "project:site:read",
        "project:release:read",
        "project:automation:read",
        "project:domains:read",
    }),
}


@lru_cache(maxsize=1)
def get_project_action_catalog() -> dict[str, PermissionActionDefinition]:
    return build_project_permission_action_catalog()


@lru_cache(maxsize=1)
def get_project_role_action_map() -> dict[ProjectMemberRole, tuple[str, ...]]:
    catalog = get_project_action_catalog()
    role_action_map: dict[ProjectMemberRole, tuple[str, ...]] = {}
    for role, action_codes in _PROJECT_ROLE_ACTION_CODES.items():
        unknown_action_codes = sorted(code for code in action_codes if code not in catalog)
        if unknown_action_codes:
            raise RuntimeError(f"Unknown project action codes for role '{role.value}': {unknown_action_codes}")
        role_action_map[role] = tuple(sorted(action_codes))
    return role_action_map


def get_project_action_codes_for_role(role: ProjectMemberRole) -> tuple[str, ...]:
    return get_project_role_action_map().get(role, ())


@lru_cache(maxsize=1)
def get_project_role_permission_map() -> dict[ProjectMemberRole, tuple[str, ...]]:
    catalog = get_project_action_catalog()
    role_permission_map: dict[ProjectMemberRole, tuple[str, ...]] = {}
    for role, action_codes in get_project_role_action_map().items():
        permission_codes = {
            code for action in action_codes for code in catalog[action].permission_codes if str(code).strip()
        }
        role_permission_map[role] = tuple(sorted(permission_codes))
    return role_permission_map


def get_project_permission_codes_for_role(role: ProjectMemberRole) -> tuple[str, ...]:
    return get_project_role_permission_map().get(role, ())
