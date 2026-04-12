from __future__ import annotations

from uuid import UUID

from fastapi import FastAPI
from fastapi.routing import APIRoute


def ensure_unique_route_names(app: FastAPI) -> None:
    """Validate route name uniqueness (helps client generation and OpenAPI stability)."""
    temp_routes = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            if route.name in temp_routes:
                raise ValueError(f"Non-unique route name: {route.name}")
            temp_routes.add(route.name)


def simplify_operation_ids(app: FastAPI) -> None:
    """Simplify operation IDs so generated clients have more ergonomic function names."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name


def extract_workspace_id_from_path(path: str) -> UUID | None:
    """
    Parse a workspace-scoped v1 API URL and return the workspace id when present.

    Supported form:
    - `/api/v1/workspaces/{workspace_id}/...`
    """

    marker = "/workspaces/"
    if marker not in path:
        return None
    try:
        _, tail = path.split(marker, 1)
        raw = tail.split("/", 1)[0].strip()
        return UUID(raw)
    except (IndexError, ValueError):
        return None
