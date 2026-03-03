from __future__ import annotations

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
