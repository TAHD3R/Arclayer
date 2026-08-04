from __future__ import annotations

from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.model_catalog import AIModelCatalogUnavailableError, list_ai_model_catalog
from src.modules.ai.schema import AIModelCatalogResponse
from src.modules.ai.workspace_actions import router as workspace_actions_router
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.http.service import resolve_workspace_context_by_id
from src.settings.runtime import get_core_settings_value_cached

router = APIRouter(tags=["AI"])
router.include_router(workspace_actions_router)


@router.get(
    "/models",
    summary="Available chat models",
    description="List chat models currently exposed by the configured LiteLLM proxy.",
)
async def list_chat_models(
    workspace_id: Annotated[
        PublicUUID,
        Query(..., alias="workspaceId", description="Workspace id used for provider key availability"),
    ],
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AIModelCatalogResponse]:
    ctx = await resolve_workspace_context_by_id(workspace_id=workspace_id, user_id=user_id)
    agent_settings = await _agent_settings(settings)
    try:
        catalog = await list_ai_model_catalog(
            settings,
            workspace_id=ctx.workspace_id,
            user_id=user_id,
            default_mode=_str_setting(agent_settings, "default_mode"),
            reasoning_effort=_str_setting(agent_settings, "reasoning_effort"),
        )
    except AIModelCatalogUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": exc.code,
                "error": exc.code,
            },
        ) from exc

    return ApiResponse.success(data=catalog)


async def _agent_settings(settings: Settings) -> dict[str, object]:
    core = await get_core_settings_value_cached(settings)
    section = core.get("ai_agents")
    return cast(dict[str, object], section) if isinstance(section, dict) else {}


def _str_setting(section: dict[str, object] | None, key: str) -> str | None:
    value = section.get(key) if section is not None else None
    return value.strip() if isinstance(value, str) and value.strip() else None
