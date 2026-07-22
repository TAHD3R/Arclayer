from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from fastapi.routing import APIRoute

from src.common.utils.public_ids import encode_uuid
from src.modules.projects.builder.composition_saga_schema import BuilderCompositionSagaRecoveryOut
from src.modules.projects.builder.composition_saga_service import BuilderCompositionSagaService
from src.modules.projects.builder.composition_saga_transition import BuilderCompositionChildCreator
from src.modules.projects.builder.generation_authority import CanonicalBuilderGenerationAuthorityResolver
from src.modules.projects.builder.generation_service import BuilderGenerationService
from src.modules.projects.builder.router import (
    get_builder_composition_saga_service,
    recover_builder_composition_saga,
    router,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


def test_composition_saga_routes_expose_the_canonical_resource_contract() -> None:
    api_routes = [route for route in router.routes if isinstance(route, APIRoute)]
    routes = {(route.path, method): route for route in api_routes for method in route.methods}
    base = "/projects/{project_id}/builder/composition-sagas"

    assert (base, "POST") in routes
    assert (f"{base}/recovery", "GET") in routes
    assert (f"{base}/{{saga_id}}", "GET") in routes
    assert (f"{base}/{{saga_id}}/phase-transitions", "POST") in routes
    assert (f"{base}/{{saga_id}}/cancel", "POST") in routes
    route_paths = [route.path for route in api_routes]
    assert route_paths.index(f"{base}/recovery") < route_paths.index(f"{base}/{{saga_id}}")


def test_composition_saga_production_factory_injects_canonical_transition_dependencies() -> None:
    tenant_context = TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=uuid4(),
            runtime_id=uuid4(),
            schema_name="workspace_factory_contract",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.PROJECT,
    )

    with patch(
        "src.modules.projects.builder.router.require_current_tenant_context",
        return_value=tenant_context,
    ):
        service = get_builder_composition_saga_service(cast(ProjectRequestContext, SimpleNamespace()))

    assert isinstance(service, BuilderCompositionSagaService)
    assert isinstance(service._authority, CanonicalBuilderGenerationAuthorityResolver)
    assert isinstance(service._composition_child_creator, BuilderCompositionChildCreator)
    assert isinstance(service._generation_service, BuilderGenerationService)
    assert service._authority._generations is service._generations
    assert service._composition_child_creator._generations is service._generations
    assert service._generation_service._repository is service._generations


async def test_composition_saga_recovery_forwards_the_complete_ordered_typed_target_tuple() -> None:
    page_id, global_section_id = uuid4(), uuid4()
    project_id, actor_user_id = uuid4(), uuid4()
    service = SimpleNamespace(
        recover=AsyncMock(return_value=BuilderCompositionSagaRecoveryOut(active=None, latest_terminal=None))
    )

    await recover_builder_composition_saga(
        ctx=cast(ProjectRequestContext, SimpleNamespace(project_id=project_id)),
        actor_user_id=actor_user_id,
        service=cast(BuilderCompositionSagaService, service),
        targets=[
            f"page:{encode_uuid(page_id)}",
            f"global_section:{encode_uuid(global_section_id)}",
        ],
    )

    call = service.recover.await_args
    assert call is not None
    assert call.kwargs["project_id"] == project_id
    assert call.kwargs["actor_user_id"] == actor_user_id
    assert [(target.kind, target.item_id) for target in call.kwargs["targets"]] == [
        ("page", page_id),
        ("global_section", global_section_id),
    ]
