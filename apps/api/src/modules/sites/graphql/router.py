from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from strawberry.fastapi import GraphQLRouter

from src.common.utils.public_ids import decode_public_id
from src.config import Settings, get_settings
from src.modules.sites.graphql.schema import schema
from src.modules.sites.graphql.service import SiteGraphQLContext
from src.platform.cache.valkey import get_valkey


async def build_graphql_context(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SiteGraphQLContext:
    site_id = decode_public_id(str(request.path_params["site_id"]))
    try:
        valkey = get_valkey(request)
    except RuntimeError:
        valkey = None
    return SiteGraphQLContext(site_id=site_id, request=request, settings=settings, valkey=valkey)


router = GraphQLRouter(
    schema,
    path="/sites/{site_id}/graphql",
    context_getter=build_graphql_context,
    graphql_ide=None,
    tags=["domain.sites.graphql"],
)
