from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.agent_catalog_schema import WorkspaceAgentCatalogV1
from src.modules.ai.agent_catalog_service import AgentCatalogService
from src.modules.workspaces.authz.http.service import require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(prefix="/workspaces/{workspace_id}/agents", tags=["domain.workspaces.agents"])


@router.get(
    "",
    response_model=ResponseModel[WorkspaceAgentCatalogV1],
    summary="List effective workspace Agent assignments",
    dependencies=[require_workspace_permission("system:content:read")],
)
async def list_workspace_agents(
    project_id: Annotated[PublicUUID | None, Query(alias="projectId")] = None,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceAgentCatalogV1]:
    catalog = await AgentCatalogService(settings).list_available(
        workspace_id=ctx.workspace_id,
        project_id=project_id,
    )
    return ApiResponse.success(data=catalog)
