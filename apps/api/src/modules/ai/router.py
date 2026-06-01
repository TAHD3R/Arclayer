from __future__ import annotations

import json
import uuid
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.responses import StreamingResponse

from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.llm.runtime import LLMRequestContext, LLMRuntimeError
from src.modules.ai.schemas import ChatRequest, ChatResponse, ChatUsage, ErrorDetail, ErrorResponse
from src.modules.ai.service import AIChatService
from src.modules.auth.http.service import get_current_user_id

router = APIRouter(tags=["AI"])


def _get_ai_service(settings: Settings = Depends(get_settings)) -> AIChatService:
    return AIChatService(settings)


def _make_context(
    request: Request,
    user_id: UUID | None,
) -> LLMRequestContext:
    """Build an LLMRequestContext from the current request state.

    Raises HTTPException(403) if workspace_id is not present in request state.
    """
    raw_ws = getattr(request.state, "workspace_id", None)
    if not raw_ws:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "AUTH_NOT_WORKSPACE_MEMBER",
                    "message": "User is not a member of any active workspace",
                }
            },
        )
    try:
        workspace_id = UUID(str(raw_ws))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "AUTH_NOT_WORKSPACE_MEMBER",
                    "message": "Invalid workspace identifier in session",
                }
            },
        )

    cid = correlation_id.get(None) or uuid.uuid4().hex

    return LLMRequestContext(
        workspace_id=workspace_id,
        user_id=user_id,
        correlation_id=cid,
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
    context = _make_context(request, user_id)

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
    detail = ErrorResponse(
        error=ErrorDetail(code=exc.code, message=exc.message),
    )
    headers = None
    if exc.code in ("RATE_LIMIT_EXCEEDED",):
        headers = {"Retry-After": "30"}
    return HTTPException(
        status_code=exc.status_code,
        detail=detail.model_dump(),
        headers=headers,
    )
