from __future__ import annotations

from functools import lru_cache

from src.modules.projects.permissions.catalog import build_project_permission_action_catalog
from src.modules.workspaces.permissions.registry import PermissionActionDefinition


@lru_cache(maxsize=1)
def get_project_action_catalog() -> dict[str, PermissionActionDefinition]:
    return build_project_permission_action_catalog()
