from __future__ import annotations

import json
import uuid
from typing import Annotated
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.responses import StreamingResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.modules.ai.model_catalog import AIModelCatalogUnavailableError, list_ai_model_catalog
from src.modules.ai.schemas import AIModelCatalogResponse, ChatRequest, ChatResponse, ChatUsage
from src.modules.ai.service import AIChatService
from src.modules.auth.http.service import get_current_user_id
from src.modules.workspaces.http.service import resolve_workspace_context_by_id

router = APIRouter(tags=["AI"])


def _get_ai_service(settings: Settings = Depends(get_settings)) -> AIChatService:
    return AIChatService(settings)


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
    """Return the model catalog used by the Admin AI model selector."""
    ctx = await resolve_workspace_context_by_id(workspace_id=workspace_id, user_id=user_id)
    try:
        catalog = await list_ai_model_catalog(
            settings,
            workspace_id=ctx.workspace_id,
            user_id=user_id,
        )
    except AIModelCatalogUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": str(exc),
                "error": "AI_MODEL_CATALOG_UNAVAILABLE",
            },
        ) from exc

    return ApiResponse.success(data=catalog)


async def _make_context(
    request: Request,
    user_id: UUID,
    payload: ChatRequest,
) -> LLMRequestContext:
    """Build an LLMRequestContext from request state or explicit chat payload.

    Raises HTTPException(403) if no workspace context is present.
    """
    raw_ws = getattr(request.state, "workspace_id", None)
    if raw_ws:
        workspace_id = _parse_state_workspace_id(raw_ws)
    elif payload.workspace_id is not None:
        ctx = await resolve_workspace_context_by_id(
            workspace_id=payload.workspace_id,
            user_id=user_id,
        )
        workspace_id = ctx.workspace_id
    else:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "User is not a member of any active workspace",
                "error": "AUTH_NOT_WORKSPACE_MEMBER",
            },
        )

    cid = correlation_id.get(None) or uuid.uuid4().hex

    return LLMRequestContext(
        workspace_id=workspace_id,
        user_id=user_id,
        correlation_id=cid,
    )


def _parse_state_workspace_id(raw_ws: object) -> UUID:
    """Parse workspace id injected by workspace-aware middleware."""
    try:
        return UUID(str(raw_ws))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Invalid workspace identifier in session",
                "error": "AUTH_NOT_WORKSPACE_MEMBER",
            },
        )


@router.post(
    "",
    summary="Chat completion",
    description="Send a chat completion request. Supports streaming via ?stream=true.",
)
async def chat_completion(
    payload: ChatRequest,
    request: Request,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
    service: AIChatService = Depends(_get_ai_service),
    stream: bool = Query(default=False, description="Enable SSE streaming"),
):
    """Execute a chat completion or start an SSE stream."""
    context = await _make_context(request, user_id, payload)

    if stream:
        return await _streaming_chat(payload, context, service, settings)

    return await _non_streaming_chat(payload, context, service)


async def _non_streaming_chat(
    payload: ChatRequest,
    context: LLMRequestContext,
    service: AIChatService,
) -> ResponseModel[ChatResponse]:
    """Execute a non-streaming chat completion."""
    try:
        result = await service.chat(
            messages=payload.messages,
            context=context,
            model=payload.model,
            reasoning_effort=payload.reasoning_effort,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
        )
    except LLMRuntimeError as exc:
        raise _to_http_exception(exc)

    return ApiResponse.success(
        data=ChatResponse(
            id=result["id"],
            model=result["model"],
            content=result["content"],
            usage=ChatUsage(
                prompt_tokens=result["usage"]["prompt_tokens"],
                completion_tokens=result["usage"]["completion_tokens"],
            ),
            finish_reason=result["finish_reason"],
        ),
    )


async def _streaming_chat(
    payload: ChatRequest,
    context: LLMRequestContext,
    service: AIChatService,
    settings: Settings,
) -> StreamingResponse:
    """Execute a streaming chat completion via SSE."""

    async def event_generator():
        """Generate SSE events for the streaming response."""
        async for event in _collect_stream_events(context, payload, service):
            yield _format_sse(event["event"], event["data"])

    async def _collect_stream_events(
        ctx: LLMRequestContext,
        req: ChatRequest,
        svc: AIChatService = service,
    ):
        """Collect all streaming events into an async generator."""
        try:
            async for event in svc.chat_stream(
                messages=req.messages,
                context=ctx,
                model=req.model,
                reasoning_effort=req.reasoning_effort,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
            ):
                yield event
        except LLMRuntimeError as exc:
            yield {
                "event": "error",
                "data": {"code": exc.code, "message": exc.message},
            }

    sse_headers = {
        "X-Correlation-Id": context.correlation_id,
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
    }

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=sse_headers,
    )


def _format_sse(event: str, data: dict) -> str:
    """Format a dict as an SSE message."""
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _to_http_exception(exc: LLMRuntimeError) -> HTTPException:
    """Convert an LLMRuntimeError to a FastAPI HTTPException."""
    headers = None
    if exc.code in ("RATE_LIMIT_EXCEEDED",):
        headers = {"Retry-After": "30"}
    return HTTPException(
        status_code=exc.status_code,
        detail={
            "message": exc.message,
            "error": exc.code,
        },
        headers=headers,
    )
