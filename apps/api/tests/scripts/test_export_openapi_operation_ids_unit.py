from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute

from scripts.export_openapi import _assign_stable_operation_ids


def _route_operation_ids(app: FastAPI) -> dict[tuple[str, str], str]:
    operation_ids: dict[tuple[str, str], str] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        method = next(iter(sorted(method for method in (route.methods or set()) if method != "HEAD")), "")
        operation_ids[(route.path, method)] = route.operation_id or ""
    return operation_ids


def test_assign_stable_operation_ids_uses_runtime_graphql_metadata_rule() -> None:
    app = FastAPI()
    router = APIRouter(tags=["domain.sites"])

    async def handle_http_get(runtime_id: str) -> dict[str, bool]:
        _ = runtime_id
        return {"ok": True}

    async def handle_http_post(runtime_id: str) -> dict[str, bool]:
        _ = runtime_id
        return {"ok": True}

    router.add_api_route(
        "/runtimes/{runtime_id}/graphql",
        handle_http_get,
        methods=["GET"],
        tags=["external.runtimes.graphql"],
        name="handle_http_get",
    )
    router.add_api_route(
        "/runtimes/{runtime_id}/graphql",
        handle_http_post,
        methods=["POST"],
        tags=["external.runtimes.graphql"],
        name="handle_http_post",
    )
    app.include_router(router, prefix="/api/v1")

    _assign_stable_operation_ids(app)
    operation_ids = _route_operation_ids(app)

    assert operation_ids[("/api/v1/runtimes/{runtime_id}/graphql", "GET")] == (
        "external_runtimes_handle_runtime_graphql_get"
    )
    assert operation_ids[("/api/v1/runtimes/{runtime_id}/graphql", "POST")] == (
        "external_runtimes_handle_runtime_graphql_post"
    )


def test_assign_stable_operation_ids_keeps_default_prefix_when_metadata_does_not_match() -> None:
    app = FastAPI()
    router = APIRouter(tags=["domain.sites"])

    async def untagged_handle_http_get(runtime_id: str) -> dict[str, bool]:
        _ = runtime_id
        return {"ok": True}

    async def graphql_status(runtime_id: str) -> dict[str, bool]:
        _ = runtime_id
        return {"ok": True}

    router.add_api_route(
        "/runtimes/{runtime_id}/graphql/untagged",
        untagged_handle_http_get,
        methods=["GET"],
        name="handle_http_get",
    )
    router.add_api_route(
        "/runtimes/{runtime_id}/graphql/status",
        graphql_status,
        methods=["GET"],
        tags=["external.runtimes.graphql"],
        name="graphql_status",
    )
    app.include_router(router, prefix="/api/v1")

    _assign_stable_operation_ids(app)
    operation_ids = _route_operation_ids(app)

    assert operation_ids[("/api/v1/runtimes/{runtime_id}/graphql/untagged", "GET")] == "domain_sites_handle_http_get"
    assert operation_ids[("/api/v1/runtimes/{runtime_id}/graphql/status", "GET")] == "domain_sites_graphql_status"
