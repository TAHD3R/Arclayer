from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from src.common.utils.public_ids import encode_uuid
from src.modules.projects.builder.generation_schema import BuilderGenerationRecoveryOut
from src.modules.projects.builder.router import recover_builder_generation, router


def test_wireframe_recovery_route_precedes_generation_id_route_and_keeps_query_aliases() -> None:
    api_routes = [route for route in router.routes if isinstance(route, APIRoute)]
    route_paths = [route.path for route in api_routes]
    recovery_path = "/projects/{project_id}/builder/generations/recovery"
    generation_path = "/projects/{project_id}/builder/generations/{generation_id}"

    assert route_paths.index(recovery_path) < route_paths.index(generation_path)
    recovery = next(route for route in api_routes if route.path == recovery_path and "GET" in route.methods)
    query_aliases = {parameter.alias for parameter in recovery.dependant.query_params}

    assert query_aliases == {"target_stage", "target"}
    target = next(parameter for parameter in recovery.dependant.query_params if parameter.alias == "target")
    _, missing_errors = target.validate([], {}, loc=("query", "target"))
    _, oversized_errors = target.validate(["page:any"] * 101, {}, loc=("query", "target"))
    assert missing_errors
    assert oversized_errors


async def test_wireframe_recovery_route_parses_ordered_typed_public_targets() -> None:
    page_id, global_section_id = uuid4(), uuid4()
    service = SimpleNamespace(
        recover=AsyncMock(return_value=BuilderGenerationRecoveryOut(active=None, latest_terminal=None))
    )
    project_id, actor_user_id = uuid4(), uuid4()

    await recover_builder_generation(
        ctx=SimpleNamespace(project_id=project_id),
        actor_user_id=actor_user_id,
        service=service,
        target_stage="wireframe",
        targets=[
            f"page:{encode_uuid(page_id)}",
            f"global_section:{encode_uuid(global_section_id)}",
        ],
    )

    service.recover.assert_awaited_once()
    call = service.recover.await_args
    assert call is not None
    assert call.kwargs["project_id"] == project_id
    assert call.kwargs["actor_user_id"] == actor_user_id
    assert [(target.kind, target.item_id) for target in call.kwargs["targets"]] == [
        ("page", page_id),
        ("global_section", global_section_id),
    ]


async def test_wireframe_recovery_route_rejects_invalid_or_duplicate_typed_targets() -> None:
    page_id = encode_uuid(uuid4())
    invalid_scopes = [
        [f"page-{page_id}"],
        [f"asset:{page_id}"],
        ["page:not-a-public-id"],
        [f"page:{page_id}", f"page:{page_id}"],
    ]
    service = SimpleNamespace(
        recover=AsyncMock(return_value=BuilderGenerationRecoveryOut(active=None, latest_terminal=None))
    )

    for targets in invalid_scopes:
        with pytest.raises(RequestValidationError):
            await recover_builder_generation(
                ctx=SimpleNamespace(project_id=uuid4()),
                actor_user_id=uuid4(),
                service=service,
                target_stage="wireframe",
                targets=targets,
            )

    service.recover.assert_not_awaited()


def test_generation_create_summary_covers_supported_stages() -> None:
    create_route = next(
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/projects/{project_id}/builder/generations"
        and "POST" in route.methods
    )

    assert create_route.summary == "Start a durable Sitemap, Wireframe, or Design generation"
