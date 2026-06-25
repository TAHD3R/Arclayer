from __future__ import annotations

import json
import uuid
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from src.agents import AgentRunContext, AgentRunEngine, AgentRunState, AgentSessionManager, build_default_agent_registry
from src.agents.tools import build_read_only_content_tools
from src.agents.types import AgentRunEvent
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.service import AIChatService
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.agents.repository import AgentRunRepository
from src.modules.projects.agents.schema import AgentCatalogOut, AgentRunCreateRequest, AgentRunOut
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.router_helpers import get_project_content_canonical_item_reads
from src.modules.projects.content.models.canonical_service import ProjectContentCanonicalModelsService
from src.modules.projects.content.models.router_helpers import get_project_content_canonical_models_service
from src.modules.projects.content.shared.router import ProjectContentRouteContext, require_project_content_read_context

router = APIRouter(
    prefix="/projects/{project_id}/agents",
    tags=["domain.projects.agents"],
)

_AGENT_SESSIONS = AgentSessionManager(store=AgentRunRepository())


def _run_context(ctx: ProjectContentRouteContext, user_id: UUID) -> AgentRunContext:
    return AgentRunContext(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        user_id=user_id,
        correlation_id=correlation_id.get(None) or uuid.uuid4().hex,
        runtime_id=ctx.runtime_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
    )


def _to_run_out(state: AgentRunState) -> AgentRunOut:
    return AgentRunOut(
        id=state.id,
        agent_id=state.agent_id,
        status=state.status,
        prompt=state.prompt,
        model=state.model,
        result=state.result,
        tool_outputs=state.tool_outputs,
        events=state.events,
        cancellation_requested=state.cancellation_requested,
        error_code=state.error_code,
        error_message=state.error_message,
    )


def _registry(
    *,
    item_reads: ProjectContentCanonicalItemReadService,
    model_reads: ProjectContentCanonicalModelsService,
):
    return build_default_agent_registry(
        tools=build_read_only_content_tools(item_reads=item_reads, model_reads=model_reads),
    )


def _engine(
    *,
    settings: Settings,
    item_reads: ProjectContentCanonicalItemReadService,
    model_reads: ProjectContentCanonicalModelsService,
) -> AgentRunEngine:
    return AgentRunEngine(
        registry=_registry(item_reads=item_reads, model_reads=model_reads),
        sessions=_AGENT_SESSIONS,
        chat_service=AIChatService(settings),
    )


@router.get(
    "",
    response_model=ResponseModel[AgentCatalogOut],
    summary="List read-only project agents",
)
async def list_project_agents(
    _ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    model_reads: Annotated[ProjectContentCanonicalModelsService, Depends(get_project_content_canonical_models_service)],
) -> ResponseModel[AgentCatalogOut]:
    registry = _registry(item_reads=item_reads, model_reads=model_reads)
    agents = list(registry.list_agents())
    tool_names = {name for agent in agents for name in agent.tool_names}
    tools = [registry.require_tool(name).spec for name in sorted(tool_names)]
    return ApiResponse.success(data=AgentCatalogOut(agents=agents, tools=tools))


@router.post(
    "/runs",
    response_model=ResponseModel[AgentRunOut],
    summary="Run a read-only project agent",
)
async def create_project_agent_run(
    payload: AgentRunCreateRequest,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    model_reads: Annotated[ProjectContentCanonicalModelsService, Depends(get_project_content_canonical_models_service)],
) -> ResponseModel[AgentRunOut]:
    state = await _engine(settings=settings, item_reads=item_reads, model_reads=model_reads).run(
        context=_run_context(ctx, user_id),
        agent_id=payload.agent_id,
        prompt=payload.prompt,
        model=payload.model,
        reasoning_effort=payload.reasoning_effort,
        tool_inputs=payload.tool_inputs,
    )
    return ApiResponse.success(data=_to_run_out(state))


@router.post(
    "/runs/stream",
    summary="Stream a read-only project agent run",
)
async def stream_project_agent_run(
    payload: AgentRunCreateRequest,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    model_reads: Annotated[ProjectContentCanonicalModelsService, Depends(get_project_content_canonical_models_service)],
) -> StreamingResponse:
    run_context = _run_context(ctx, user_id)
    engine = _engine(settings=settings, item_reads=item_reads, model_reads=model_reads)

    async def event_generator():
        async for event in engine.stream(
            context=run_context,
            agent_id=payload.agent_id,
            prompt=payload.prompt,
            model=payload.model,
            reasoning_effort=payload.reasoning_effort,
            tool_inputs=payload.tool_inputs,
        ):
            yield _format_sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "X-Correlation-Id": run_context.correlation_id,
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
        },
    )


@router.get(
    "/runs/{run_id}",
    response_model=ResponseModel[AgentRunOut],
    summary="Get read-only project agent run state",
)
async def get_project_agent_run(
    run_id: UUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[AgentRunOut]:
    state = await _AGENT_SESSIONS.get_run(run_id=run_id, context=_run_context(ctx, user_id))
    return ApiResponse.success(data=_to_run_out(state))


@router.post(
    "/runs/{run_id}/cancel",
    response_model=ResponseModel[AgentRunOut],
    summary="Cancel a read-only project agent run",
)
async def cancel_project_agent_run(
    run_id: UUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
) -> ResponseModel[AgentRunOut]:
    state = await _AGENT_SESSIONS.cancel_run(run_id=run_id, context=_run_context(ctx, user_id))
    return ApiResponse.success(data=_to_run_out(state))


def _format_sse(event: AgentRunEvent) -> str:
    payload = json.dumps(event.data, ensure_ascii=False)
    return f"event: {event.event}\ndata: {payload}\n\n"
