from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Query, Request
from strawberry.fastapi import GraphQLRouter

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.runtime.router import get_runtime_context
from src.modules.projects.runtime.service import ProjectRuntimeContext
from src.modules.sites.content_api.rate_limit import enforce_content_api_rate_limit
from src.modules.sites.graphql.schema import schema
from src.modules.sites.graphql.service import SiteGraphQLContext, SiteGraphQLService
from src.modules.tenancy.database import TenantDatabaseRouter
from src.platform.cache.valkey import get_valkey


async def build_graphql_context(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    runtime_context: Annotated[ProjectRuntimeContext, Depends(get_runtime_context)],
    runtime_id: PublicUUID,
    environment: Annotated[str | None, Query(description="Environment key, id, or alias.")] = None,
    environment_id: Annotated[PublicUUID | None, Query(alias="environmentId", description="Environment id.")] = None,
) -> AsyncIterator[SiteGraphQLContext]:
    await enforce_content_api_rate_limit(request)
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    service = SiteGraphQLService(settings, valkey=valkey)
    target = environment_id if environment_id is not None else environment
    resolved_environment = await ProjectEnvironmentsService(
        runtime_context.tenant_context,
    ).resolve_environment_target(project_id=runtime_context.project_id, target=target)
    async with TenantDatabaseRouter(runtime_context.tenant_context).connection() as conn:
        yield SiteGraphQLContext(
            runtime_id=runtime_id,
            environment_id=resolved_environment.id,
            request=request,
            settings=settings,
            valkey=valkey,
            graphql=service.with_database_connection(conn),
        )


router = GraphQLRouter(
    schema,
    path="/runtimes/{runtime_id}/graphql",
    context_getter=build_graphql_context,
    graphql_ide=None,
    tags=["external.runtimes.graphql"],
)
