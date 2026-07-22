from __future__ import annotations

import asyncio
import json
import uuid
from typing import Annotated, cast
from uuid import UUID

from asgi_correlation_id import correlation_id
from fastapi import APIRouter, Body, Depends, Query
from starlette.responses import StreamingResponse

from src.agents import AgentRunContext, AgentRunEngine, AgentRunState, AgentSessionManager, build_default_agent_registry
from src.agents.checkpointing import build_agent_checkpointer_factory
from src.agents.context_security import redact_sensitive_agent_context
from src.agents.langgraph_runtime import AgentGraphCheckpointerFactory
from src.agents.settings_policy import (
    WRITE_SKILL_IDS,
    bool_setting,
    str_setting,
    write_skill_disabled_reason,
)
from src.agents.tools import build_read_only_content_tools
from src.agents.types import AgentRunEvent, AgentRunEventType
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import Forbidden
from src.core.http.response import ApiResponse, ResponseModel
from src.core.i18n import t
from src.models.agents.approval import AgentApprovalStatus
from src.modules.ai.service import AIChatService
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.agents.approval_repository import AgentApprovalRepository
from src.modules.projects.agents.approval_schema import (
    AgentApprovalApplyOut,
    AgentApprovalDecisionRequest,
    AgentApprovalListOut,
    AgentApprovalOut,
    AgentContentApprovalDryRunRequest,
    AgentContentApprovalModifyRequest,
    AgentContentDraftProposalOut,
    AgentContentDraftProposalRequest,
    AgentContentModelDraftProposalOut,
    AgentContentModelDraftProposalRequest,
)
from src.modules.projects.agents.approval_service import AgentApprovalService
from src.modules.projects.agents.content_model_service import AgentContentModelProposalService
from src.modules.projects.agents.content_writer_service import AgentContentWriterProposalService
from src.modules.projects.agents.repository import AgentRunRepository
from src.modules.projects.agents.schema import (
    AgentCatalogOut,
    AgentRunCreateRequest,
    AgentRunOut,
    AgentRunResumeRequest,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.router_helpers import (
    get_project_content_canonical_item_reads,
    get_project_content_canonical_items_service,
)
from src.modules.projects.content.models.canonical_service import ProjectContentCanonicalModelsService
from src.modules.projects.content.models.router_helpers import get_project_content_canonical_models_service
from src.modules.projects.content.shared.router import (
    ProjectContentRouteContext,
    require_project_content_manage_context,
    require_project_content_read_context,
)
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.tenancy.router_helpers import resolve_project_tenant_context
from src.settings.runtime import get_core_settings_value_cached

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
    assert state.langgraph_thread_id is not None
    return AgentRunOut(
        id=state.id,
        agent_id=state.agent_id,
        status=state.status,
        prompt=state.prompt,
        model=state.model,
        result=state.result,
        tool_outputs=cast(JsonObject, redact_sensitive_agent_context(state.tool_outputs)),
        events=[_to_public_event(event) for event in state.events],
        cancellation_requested=state.cancellation_requested,
        error_code=state.error_code,
        error_message=state.error_message,
        langgraph_thread_id=state.langgraph_thread_id,
        langgraph_checkpoint_ns=state.langgraph_checkpoint_ns,
        langgraph_checkpoint_id=state.langgraph_checkpoint_id,
        langgraph_checkpoint_node=state.langgraph_checkpoint_node,
    )


def _to_public_event(event: AgentRunEvent) -> AgentRunEvent:
    return AgentRunEvent(event=event.event, data=cast(JsonObject, redact_sensitive_agent_context(event.data)))


async def _agent_settings(settings: Settings) -> dict[str, object]:
    core = await get_core_settings_value_cached(settings)
    section = core.get("ai_agents")
    return cast(dict[str, object], section) if isinstance(section, dict) else {}


async def _langgraph_settings(settings: Settings) -> dict[str, object]:
    core = await get_core_settings_value_cached(settings)
    section = core.get("langgraph")
    return cast(dict[str, object], section) if isinstance(section, dict) else {}


async def _require_langgraph_enabled(settings: Settings) -> None:
    if bool_setting(await _langgraph_settings(settings), "enabled", True):
        return
    raise Forbidden(
        message=t("errors", "AGENT_LANGGRAPH_DISABLED"),
        error="AGENT_LANGGRAPH_DISABLED",
        meta={"disabledReason": "langgraph_disabled"},
    )


async def _langgraph_checkpointer_factory(settings: Settings) -> AgentGraphCheckpointerFactory:
    langgraph_settings = await _langgraph_settings(settings)
    checkpointer = str_setting(langgraph_settings, "checkpointer", "database")
    return cast(
        AgentGraphCheckpointerFactory,
        build_agent_checkpointer_factory(settings=settings, checkpointer=checkpointer),
    )


async def _interrupt_resume_enabled(settings: Settings) -> bool:
    return bool_setting(await _langgraph_settings(settings), "interrupt_resume_enabled", True)


async def _require_content_writer_enabled(settings: Settings) -> None:
    agent_settings = await _agent_settings(settings)
    disabled_reason = write_skill_disabled_reason(agent_settings, skill_id="content.writer")
    if disabled_reason is None:
        return
    _raise_write_skill_unavailable(
        agent_settings=agent_settings,
        disabled_reason=disabled_reason,
        skill_id="content.writer",
    )


def _raise_write_skill_unavailable(
    *,
    agent_settings: dict[str, object],
    disabled_reason: str,
    skill_id: str,
    include_skill_id: bool = False,
) -> None:
    if disabled_reason == "approval_policy_unsupported":
        raise Forbidden(
            message=t("errors", "AGENT_APPROVAL_POLICY_UNSUPPORTED"),
            error="AGENT_APPROVAL_POLICY_UNSUPPORTED",
            meta={
                "disabledReason": disabled_reason,
                "approvalPolicy": str_setting(agent_settings, "approval_policy", "always_approve"),
                "skillId": skill_id,
            },
        )
    if disabled_reason == "dry_run_required_disabled":
        raise Forbidden(
            message=t("errors", "AGENT_DRY_RUN_REQUIRED"),
            error="AGENT_DRY_RUN_REQUIRED",
            meta={"disabledReason": disabled_reason, "skillId": skill_id},
        )
    meta = {"disabledReason": disabled_reason}
    if include_skill_id:
        meta["skillId"] = skill_id
    raise Forbidden(
        message=t("errors", "AGENT_CONTENT_WRITER_DISABLED"),
        error="AGENT_CONTENT_WRITER_DISABLED",
        meta=meta,
    )


async def _require_agent_write_skill_enabled(settings: Settings, *, skill_id: str) -> None:
    if skill_id not in WRITE_SKILL_IDS:
        raise Forbidden(
            message=t("errors", "AGENT_TOOL_WRITE_FORBIDDEN"),
            error="AGENT_TOOL_WRITE_FORBIDDEN",
            meta={"skillId": skill_id},
        )
    agent_settings = await _agent_settings(settings)
    disabled_reason = write_skill_disabled_reason(agent_settings, skill_id=skill_id)
    if disabled_reason is None:
        return
    _raise_write_skill_unavailable(
        agent_settings=agent_settings,
        disabled_reason=disabled_reason,
        skill_id=skill_id,
        include_skill_id=True,
    )


async def _registry(
    *,
    settings: Settings,
    item_reads: ProjectContentCanonicalItemReadService,
    model_reads: ProjectContentCanonicalModelsService,
):
    agent_settings = await _agent_settings(settings)
    return build_default_agent_registry(
        tools=build_read_only_content_tools(item_reads=item_reads, model_reads=model_reads),
        agents_enabled=bool_setting(agent_settings, "enabled", True),
        write_tools_enabled=bool_setting(agent_settings, "write_tools_enabled", False),
        approval_policy=str_setting(agent_settings, "approval_policy", "always_approve"),
        dry_run_required=bool_setting(agent_settings, "dry_run_required", True),
        system_prompt=str_setting(agent_settings, "system_prompt", ""),
    )


async def _engine(
    *,
    settings: Settings,
    item_reads: ProjectContentCanonicalItemReadService,
    model_reads: ProjectContentCanonicalModelsService,
) -> AgentRunEngine:
    return AgentRunEngine(
        registry=await _registry(settings=settings, item_reads=item_reads, model_reads=model_reads),
        sessions=_AGENT_SESSIONS,
        chat_service=AIChatService(settings),
        graph_checkpointer_factory=await _langgraph_checkpointer_factory(settings),
        interrupt_resume_enabled=await _interrupt_resume_enabled(settings),
    )


def get_agent_approval_service(
    ctx: Annotated[ProjectRequestContext, Depends(get_project_context)],
) -> AgentApprovalService:
    return AgentApprovalService(
        repo=AgentApprovalRepository(
            tenant_context=resolve_project_tenant_context(project_id=ctx.project_id, runtime_id=ctx.runtime_id)
        )
    )


def get_agent_content_writer_proposal_service(
    settings: Annotated[Settings, Depends(get_settings)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    approval_service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
) -> AgentContentWriterProposalService:
    return AgentContentWriterProposalService(
        chat_service=AIChatService(settings),
        approval_service=approval_service,
        item_reads=item_reads,
    )


def get_agent_content_model_proposal_service(
    settings: Annotated[Settings, Depends(get_settings)],
    model_service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
    approval_service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
) -> AgentContentModelProposalService:
    return AgentContentModelProposalService(
        chat_service=AIChatService(settings),
        approval_service=approval_service,
        model_service=model_service,
    )


@router.get(
    "",
    response_model=ResponseModel[AgentCatalogOut],
    summary="List read-only project agents",
)
async def list_project_agents(
    _ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    settings: Annotated[Settings, Depends(get_settings)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    model_reads: Annotated[ProjectContentCanonicalModelsService, Depends(get_project_content_canonical_models_service)],
) -> ResponseModel[AgentCatalogOut]:
    registry = await _registry(settings=settings, item_reads=item_reads, model_reads=model_reads)
    agents = list(registry.list_agents())
    tool_names = {name for agent in agents for name in agent.tool_names}
    tools = [registry.require_tool(name).spec for name in sorted(tool_names)]
    return ApiResponse.success(data=AgentCatalogOut(agents=agents, tools=tools, skills=list(registry.list_skills())))


@router.post(
    "/content-draft-proposals",
    response_model=ResponseModel[AgentContentDraftProposalOut],
    response_model_exclude_none=True,
    summary="Generate a content draft proposal and create an approval checkpoint",
)
async def create_project_agent_content_draft_proposal(
    payload: Annotated[AgentContentDraftProposalRequest, Body(description="Content writer proposal request.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[AgentContentWriterProposalService, Depends(get_agent_content_writer_proposal_service)],
) -> ResponseModel[AgentContentDraftProposalOut]:
    await _require_content_writer_enabled(settings)
    data = await service.create_content_draft_proposal(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        requester_user_id=user_id,
        correlation_id=correlation_id.get(None) or uuid.uuid4().hex,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/content-model-draft-proposals",
    response_model=ResponseModel[AgentContentModelDraftProposalOut],
    response_model_exclude_none=True,
    summary="Generate a content model schema proposal and create an approval checkpoint",
)
async def create_project_agent_content_model_draft_proposal(
    payload: Annotated[AgentContentModelDraftProposalRequest, Body(description="Content modeler proposal request.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[AgentContentModelProposalService, Depends(get_agent_content_model_proposal_service)],
) -> ResponseModel[AgentContentModelDraftProposalOut]:
    await _require_agent_write_skill_enabled(settings, skill_id="content.modeler")
    data = await service.create_content_model_draft_proposal(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        requester_user_id=user_id,
        correlation_id=correlation_id.get(None) or uuid.uuid4().hex,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/approvals/dry-run",
    response_model=ResponseModel[AgentApprovalOut],
    response_model_exclude_none=True,
    summary="Create a dry-run approval checkpoint for a proposed Agent write",
)
async def create_project_agent_approval_dry_run(
    payload: Annotated[AgentContentApprovalDryRunRequest, Body(description="Agent write dry-run request.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
) -> ResponseModel[AgentApprovalOut]:
    await _require_content_writer_enabled(settings)
    data = await service.create_content_dry_run(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        requester_user_id=user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.get(
    "/approvals",
    response_model=ResponseModel[AgentApprovalListOut],
    response_model_exclude_none=True,
    summary="List Agent write approval checkpoints",
)
async def list_project_agent_approvals(
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_read_context)],
    service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
    approval_status: Annotated[AgentApprovalStatus | None, Query(alias="status")] = None,
) -> ResponseModel[AgentApprovalListOut]:
    data = await service.list_approvals(
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        status=approval_status,
    )
    return ApiResponse.success(data=data)


@router.patch(
    "/approvals/{approval_id}",
    response_model=ResponseModel[AgentApprovalOut],
    response_model_exclude_none=True,
    summary="Modify a pending Agent content approval checkpoint",
)
async def modify_project_agent_approval(
    approval_id: PublicUUID,
    payload: Annotated[AgentContentApprovalModifyRequest, Body(description="Approval content patch.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
    model_service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[AgentApprovalOut]:
    approval = await service.get_approval(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
    )
    await _require_agent_write_skill_enabled(settings, skill_id=approval.skill_id)
    data = await service.modify_content_approval(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        payload=payload,
        model_service=model_service,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/approvals/{approval_id}/approve",
    response_model=ResponseModel[AgentApprovalOut],
    response_model_exclude_none=True,
    summary="Approve a pending Agent write checkpoint without applying it",
)
async def approve_project_agent_approval(
    approval_id: PublicUUID,
    payload: Annotated[AgentApprovalDecisionRequest, Body(description="Approval decision metadata.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
    model_service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[AgentApprovalOut]:
    approval = await service.get_approval(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
    )
    await _require_agent_write_skill_enabled(settings, skill_id=approval.skill_id)
    data = await service.approve(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        approver_user_id=user_id,
        payload=payload,
        model_service=model_service,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/approvals/{approval_id}/reject",
    response_model=ResponseModel[AgentApprovalOut],
    response_model_exclude_none=True,
    summary="Reject a pending Agent write checkpoint",
)
async def reject_project_agent_approval(
    approval_id: PublicUUID,
    payload: Annotated[AgentApprovalDecisionRequest, Body(description="Approval decision metadata.")],
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
) -> ResponseModel[AgentApprovalOut]:
    data = await service.reject(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        rejecter_user_id=user_id,
        payload=payload,
    )
    return ApiResponse.success(data=data)


@router.post(
    "/approvals/{approval_id}/apply",
    response_model=ResponseModel[AgentApprovalApplyOut],
    response_model_exclude_none=True,
    summary="Apply an approved Agent write checkpoint through the canonical content draft writer",
)
async def apply_project_agent_approval(
    approval_id: PublicUUID,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    approval_service: Annotated[AgentApprovalService, Depends(get_agent_approval_service)],
    content_service: Annotated[
        ProjectContentCanonicalItemsService,
        Depends(get_project_content_canonical_items_service),
    ],
    model_service: Annotated[
        ProjectContentCanonicalModelsService,
        Depends(get_project_content_canonical_models_service),
    ],
) -> ResponseModel[AgentApprovalApplyOut]:
    approval = await approval_service.get_approval(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
    )
    await _require_agent_write_skill_enabled(settings, skill_id=approval.skill_id)
    data = await approval_service.apply(
        approval_id=approval_id,
        workspace_id=ctx.workspace_id,
        project_id=ctx.project_id,
        site_id=ctx.site_id,
        environment_id=ctx.environment_id,
        actor_user_id=user_id,
        content_service=content_service,
        model_service=model_service,
        correlation_id=correlation_id.get(None),
    )
    return ApiResponse.success(data=data)


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
    await _require_langgraph_enabled(settings)
    engine = await _engine(settings=settings, item_reads=item_reads, model_reads=model_reads)
    state = await engine.run(
        context=_run_context(ctx, user_id),
        agent_id=payload.agent_id,
        prompt=payload.prompt,
        model=payload.model,
        reasoning_effort=payload.reasoning_effort,
        tool_inputs=payload.tool_inputs,
    )
    return ApiResponse.success(data=_to_run_out(state))


@router.post(
    "/runs/{run_id}/resume",
    response_model=ResponseModel[AgentRunOut],
    summary="Resume an interrupted project agent run",
)
async def resume_project_agent_run(
    run_id: UUID,
    payload: AgentRunResumeRequest,
    ctx: Annotated[ProjectContentRouteContext, Depends(require_project_content_manage_context)],
    user_id: Annotated[UUID, Depends(get_current_user_id)],
    settings: Annotated[Settings, Depends(get_settings)],
    item_reads: Annotated[ProjectContentCanonicalItemReadService, Depends(get_project_content_canonical_item_reads)],
    model_reads: Annotated[ProjectContentCanonicalModelsService, Depends(get_project_content_canonical_models_service)],
) -> ResponseModel[AgentRunOut]:
    await _require_langgraph_enabled(settings)
    engine = await _engine(settings=settings, item_reads=item_reads, model_reads=model_reads)
    state = await engine.resume(
        context=_run_context(ctx, user_id),
        run_id=run_id,
        resume=cast(JsonObject, payload.model_dump(mode="json", exclude_none=True)),
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
    await _require_langgraph_enabled(settings)
    run_context = _run_context(ctx, user_id)
    engine = await _engine(settings=settings, item_reads=item_reads, model_reads=model_reads)

    async def event_generator():
        stream_run_id: UUID | None = None
        try:
            async for event in engine.stream(
                context=run_context,
                agent_id=payload.agent_id,
                prompt=payload.prompt,
                model=payload.model,
                reasoning_effort=payload.reasoning_effort,
                tool_inputs=payload.tool_inputs,
            ):
                if event.event is AgentRunEventType.RUN_CREATED:
                    stream_run_id = UUID(str(event.data["runId"]))
                yield _format_sse(event)
        except asyncio.CancelledError:
            if stream_run_id is not None:
                await _AGENT_SESSIONS.cancel_run(run_id=stream_run_id, context=run_context)
            raise

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
    payload = json.dumps(_to_public_event(event).data, ensure_ascii=False)
    return f"event: {event.event}\ndata: {payload}\n\n"
