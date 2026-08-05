from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query, Request, status
from starlette.responses import StreamingResponse

from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.http.response import ApiResponse, ResponseModel
from src.modules.ai.agent_builder_context_service import AgentBuilderContextResolver
from src.modules.ai.agent_design_system_context_service import AgentDesignSystemContextResolver
from src.modules.ai.agent_skill_grant_service import build_agent_skill_grant_resolver
from src.modules.ai.runtime_command_schema import (
    AgentRunCommandResponseV1,
    AgentToolResponseRequestV1,
    AgentToolResponseV1,
    ResumeAgentRunRequestV1,
)
from src.modules.ai.runtime_command_service import AgentRuntimeCommandService
from src.modules.ai.runtime_knowledge_context import TenantAgentKnowledgeContextResolver
from src.modules.ai.runtime_run_schema import AgentRunCreateRequestV1, AgentRunCreateResponseV1
from src.modules.ai.runtime_run_service import AgentRunService
from src.modules.ai.runtime_snapshot_schema import AgentRunSnapshotV1
from src.modules.ai.runtime_stream_service import AgentRunStreamService
from src.modules.ai.runtime_thread_schema import (
    AgentThreadCreateRequestV1,
    AgentThreadDeleteResultV1,
    AgentThreadDetailV1,
    AgentThreadListV1,
    AgentThreadOutV1,
    AgentThreadUpdateRequestV1,
)
from src.modules.ai.runtime_thread_service import AgentThreadService
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.schema import RestrictedRecoveryEffect
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.tenancy.context import require_current_tenant_context
from src.modules.workspaces.authz.http.service import require_workspace_commercial_effect, require_workspace_permission
from src.modules.workspaces.http.schema import WorkspaceContext
from src.modules.workspaces.http.service import require_workspace_manage_access

router = APIRouter(prefix="/workspaces/{workspace_id}/ai", tags=["domain.workspaces.ai"])
IdempotencyKeyHeader = Annotated[
    str,
    Header(alias="Idempotency-Key", min_length=1, max_length=192, pattern=r".*\S.*"),
]


@router.get(
    "/runs/{run_id}",
    response_model=ResponseModel[AgentRunSnapshotV1],
    summary="Get a durable AI Run snapshot",
    dependencies=[require_workspace_permission("system:content:read")],
)
async def get_agent_run_snapshot(
    run_id: Annotated[PublicUUID, Path(description="Run ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[AgentRunSnapshotV1]:
    """Return one owner-scoped, transactionally consistent Run snapshot."""
    snapshot = await AgentRunStreamService().get_snapshot(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        run_id=run_id,
    )
    return ApiResponse.success(data=snapshot)


@router.post(
    "/runs/{run_id}/cancel",
    response_model=ResponseModel[AgentRunSnapshotV1],
    summary="Cancel a durable AI Run",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def cancel_agent_run(
    run_id: Annotated[PublicUUID, Path(description="Run ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentRunSnapshotV1]:
    """Atomically request Job cancellation and project the owner-scoped Run state."""
    snapshot = await AgentRunService(settings).cancel(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        run_id=run_id,
    )
    return ApiResponse.success(data=snapshot)


@router.post(
    "/tool-calls/{tool_call_id}/responses",
    response_model=ResponseModel[AgentToolResponseV1],
    summary="Respond to an interrupted AI Tool call",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def respond_to_agent_tool_call(
    payload: AgentToolResponseRequestV1,
    tool_call_id: Annotated[str, Path(min_length=1, max_length=192, description="Tool call ID")],
    idempotency_key: IdempotencyKeyHeader,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentToolResponseV1]:
    """Record one owner-scoped approval decision or human Tool result idempotently."""
    response = await AgentRuntimeCommandService(settings).respond_to_tool_call(
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        tool_call_id=tool_call_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=response)


@router.post(
    "/runs/{run_id}/resume",
    response_model=ResponseModel[AgentRunCommandResponseV1],
    summary="Resume an interrupted AI Run",
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
)
async def resume_agent_run(
    payload: ResumeAgentRunRequestV1,
    run_id: Annotated[PublicUUID, Path(description="Run ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentRunCommandResponseV1]:
    """Consume one recorded Tool response and requeue its exact durable checkpoint."""
    response = await AgentRuntimeCommandService(settings).resume_run(
        workspace_id=ctx.workspace_id,
        actor_user_id=user_id,
        run_id=run_id,
        payload=payload,
    )
    return ApiResponse.success(data=response)


@router.get(
    "/runs/{run_id}/events",
    summary="Replay and stream durable AI Run events",
    dependencies=[require_workspace_permission("system:content:read")],
    responses={200: {"content": {"text/event-stream": {}}}, 410: {"description": "Event cursor expired"}},
)
async def stream_agent_run_events(
    request: Request,
    run_id: Annotated[PublicUUID, Path(description="Run ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID", max_length=512)] = None,
) -> StreamingResponse:
    """Replay after an opaque cursor and tail committed events without mutating the Run."""
    service = AgentRunStreamService()
    session = await service.prepare_stream(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        run_id=run_id,
        query_cursor=cursor,
        last_event_id=last_event_id,
    )
    return StreamingResponse(
        service.iter_sse(session=session, is_disconnected=request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/threads",
    response_model=ResponseModel[AgentThreadListV1],
    summary="List durable AI threads",
    dependencies=[require_workspace_permission("system:content:read")],
)
async def list_agent_threads(
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    project_id: Annotated[PublicUUID | None, Query(alias="projectId")] = None,
    archived: bool | None = Query(default=None),
    q: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
    cursor: Annotated[PublicUUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentThreadListV1]:
    """Return the current user's server-filtered Thread list."""
    result = await AgentThreadService(settings).list(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        project_id=project_id,
        archived=archived,
        query=q,
        cursor=cursor,
        limit=limit,
    )
    return ApiResponse.success(data=result)


@router.post(
    "/threads",
    response_model=ResponseModel[AgentThreadOutV1],
    status_code=status.HTTP_201_CREATED,
    summary="Initialize a durable AI thread",
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def create_agent_thread(
    payload: AgentThreadCreateRequestV1,
    idempotency_key: IdempotencyKeyHeader,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentThreadOutV1]:
    """Idempotently initialize one backend-owned Thread with a server-generated ID."""
    result = await AgentThreadService(settings).create(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=result)


@router.post(
    "/threads/{thread_id}/runs",
    response_model=ResponseModel[AgentRunCreateResponseV1],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create a durable AI Run",
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT),
    ],
)
async def create_agent_run(
    payload: AgentRunCreateRequestV1,
    thread_id: Annotated[PublicUUID, Path(description="Thread ID")],
    idempotency_key: IdempotencyKeyHeader,
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentRunCreateResponseV1]:
    """Atomically persist the Run, initiating message, Job outbox, and queued event."""
    result = await AgentRunService(
        settings,
        skill_grant_resolver=build_agent_skill_grant_resolver(require_current_tenant_context()),
        knowledge_context_resolver=TenantAgentKnowledgeContextResolver(require_current_tenant_context()),
        design_system_context_resolver=AgentDesignSystemContextResolver(
            repository=ProjectDesignSystemsRepository(require_current_tenant_context()),
        ),
        builder_context_resolver=AgentBuilderContextResolver(
            repository=SiteBuilderRepository(require_current_tenant_context()),
        ),
    ).create(
        workspace_id=ctx.workspace_id,
        thread_id=thread_id,
        owner_user_id=user_id,
        idempotency_key=idempotency_key,
        payload=payload,
    )
    return ApiResponse.success(data=result)


@router.get(
    "/threads/{thread_id}",
    response_model=ResponseModel[AgentThreadDetailV1],
    summary="Get durable AI thread history",
    dependencies=[require_workspace_permission("system:content:read")],
)
async def get_agent_thread(
    thread_id: Annotated[PublicUUID, Path(description="Thread ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentThreadDetailV1]:
    """Return authorized Thread metadata and normalized message history."""
    result = await AgentThreadService(settings).get(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        thread_id=thread_id,
    )
    return ApiResponse.success(data=result)


@router.patch(
    "/threads/{thread_id}",
    response_model=ResponseModel[AgentThreadOutV1],
    summary="Update durable AI thread metadata",
    dependencies=[
        require_workspace_permission("system:content:manage"),
        require_workspace_commercial_effect(RestrictedRecoveryEffect.CONTENT_MUTATION),
    ],
)
async def update_agent_thread(
    payload: AgentThreadUpdateRequestV1,
    thread_id: Annotated[PublicUUID, Path(description="Thread ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentThreadOutV1]:
    """Rename, archive, or restore one owned Thread."""
    result = await AgentThreadService(settings).update(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        thread_id=thread_id,
        payload=payload,
    )
    return ApiResponse.success(data=result)


@router.delete(
    "/threads/{thread_id}",
    response_model=ResponseModel[AgentThreadDeleteResultV1],
    summary="Soft-delete a durable AI thread",
    dependencies=[require_workspace_permission("system:content:manage")],
)
async def delete_agent_thread(
    thread_id: Annotated[PublicUUID, Path(description="Thread ID")],
    ctx: WorkspaceContext = Depends(require_workspace_manage_access),
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[AgentThreadDeleteResultV1]:
    """Hide one Thread without erasing its auditable Runs or approvals."""
    result = await AgentThreadService(settings).delete(
        workspace_id=ctx.workspace_id,
        owner_user_id=user_id,
        thread_id=thread_id,
    )
    return ApiResponse.success(data=result)
