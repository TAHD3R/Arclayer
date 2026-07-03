from __future__ import annotations

import json
import re
from typing import Any, Literal, cast
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, status
from pydantic import Field, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import APIError, BadRequest, Forbidden
from src.core.http.pagination import PageParams
from src.core.http.response import ApiResponse, ResponseModel
from src.llm.runtime import LLMRequestContext, LLMRuntime, LLMRuntimeError
from src.models.agents.conversation import AgentConversationMode
from src.models.projects.environment import ProjectEnvironmentKey
from src.modules.auth.http.service import get_current_user_id
from src.modules.projects.content.contracts.schema import ContentModelDefinitionContract
from src.modules.projects.content.models.canonical_service import ProjectContentCanonicalModelsService
from src.modules.projects.content.models.repository import ProjectContentModelsRepository
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut, to_mutation_out
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.http.router_helpers import ensure_project_permission_granted
from src.modules.projects.http.service import get_project_context
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.projects.service import ProjectService
from src.modules.tenancy.router_helpers import resolve_project_tenant_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.service import require_workspace_manage_access, resolve_workspace_context_by_id

WorkspaceAIActionKind = Literal[
    "create_project",
    "create_content_model",
    "list_projects",
    "open_projects",
    "refine_plan",
]
WorkspaceAIActionResolutionKind = Literal["tool_call", "chat", "clarification"]
WorkspaceAIActionStatus = Literal["completed", "planned", "routed_to_chat", "needs_clarification"]
WorkspaceAIActionStepStatus = Literal["planned", "running", "completed"]

router = APIRouter(prefix="/workspace-actions", tags=["AI"])

_QUOTED_TEXT = re.compile(r"[\"'“‘](?P<value>[^\"'”’]{1,64})[\"'”’]")
_DIRECTIVE_TEXT = re.compile(r":[\w-]{1,64}\[[^\]\n]{1,1024}\](?:\{name=[^}\n]{1,1024}\})?")
_NAMED_CONTENT_MODEL = re.compile(
    r"(?:创建|新建|建立|生成|create|start)\s*(?:一个|一個|个|新的|new)?\s*"
    r"(?P<name>[^，。,.!?！？]{1,64}?)\s*(?:内容模型|内容类型|content model|content type)",
    re.IGNORECASE,
)
_ACRONYM_IDENTIFIER_BOUNDARY = re.compile(r"([A-Z]+)([A-Z][a-z])")
_CAMEL_IDENTIFIER_BOUNDARY = re.compile(r"([a-z0-9])([A-Z])")
_IDENTIFIER_WORD_SEPARATOR = re.compile(r"[^A-Za-z0-9]+")
_LEADING_NON_LETTERS = re.compile(r"^[^A-Za-z]+")
_PLANNER_TOOL_TO_ACTION: dict[str, WorkspaceAIActionKind] = {
    "workspace_create_project": "create_project",
    "workspace_create_content_model": "create_content_model",
    "workspace_list_projects": "list_projects",
    "workspace_open_projects": "open_projects",
    "workspace_refine_plan": "refine_plan",
}


class WorkspaceAIPlannerToolCall(BaseSchema):
    tool_name: WorkspaceAIActionKind = Field(..., description="Workspace tool selected by the planner.")
    arguments: JsonObject = Field(default_factory=dict, description="Structured tool arguments.")


class WorkspaceAIPlannerDecision(BaseSchema):
    kind: WorkspaceAIActionResolutionKind = Field(..., description="How the workspace orchestrator should proceed.")
    confidence: float = Field(default=0, ge=0, le=1, description="Planner confidence from 0 to 1.")
    tool_call: WorkspaceAIPlannerToolCall | None = Field(
        default=None,
        description="First selected tool call when kind is tool_call.",
    )
    tool_calls: list[WorkspaceAIPlannerToolCall] = Field(
        default_factory=list,
        description="Ordered workspace tool calls selected by the planner.",
    )
    missing_fields: list[str] = Field(default_factory=list, description="Required details missing from the request.")
    requires_confirmation: bool = Field(
        default=False,
        description="Whether this plan should be shown before execution.",
    )
    user_visible_plan: str = Field(default="", description="Concise user-facing plan or routing reason.")


class WorkspaceAIActionExecutionStep(BaseSchema):
    id: str = Field(..., description="Stable step id for UI rendering.")
    title: str = Field(..., description="User-facing step label.")
    status: WorkspaceAIActionStepStatus = Field(..., description="Step execution status.")
    detail: str | None = Field(default=None, description="Optional step detail.")
    tool_name: str | None = Field(default=None, description="Tool associated with this step.")


class WorkspaceAIActionToolCallOut(BaseSchema):
    tool_name: str = Field(..., description="Executed or planned workspace tool name.")
    status: WorkspaceAIActionStepStatus = Field(..., description="Tool call status.")
    arguments: JsonObject = Field(default_factory=dict, description="Validated public arguments.")


class WorkspaceCreateProjectArgs(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128, description="Project display name.")
    description: str = Field(..., min_length=1, max_length=500, description="Project purpose summary.")


class WorkspaceCreateContentModelArgs(BaseSchema):
    name: str | None = Field(default=None, max_length=128, description="Content model display name.")
    description: str | None = Field(default=None, max_length=500, description="Content model purpose summary.")


class WorkspaceListProjectsArgs(BaseSchema):
    query: str | None = Field(default=None, max_length=128, description="Optional project search query.")


class WorkspaceOpenProjectsArgs(BaseSchema):
    pass


class WorkspaceRefinePlanArgs(BaseSchema):
    title: str = Field(..., min_length=1, max_length=128, description="Product-ready refined plan title.")
    summary: str = Field(..., min_length=1, max_length=1000, description="Refined plan summary.")
    steps: list[str] = Field(
        ...,
        min_length=2,
        max_length=8,
        description="Concrete next execution steps inferred from the conversation.",
    )


class WorkspaceAIActionContextMessage(BaseSchema):
    role: Literal["user", "assistant"] = Field(..., description="Conversation message role.")
    content: str = Field(..., min_length=1, max_length=1600, description="Conversation context content.")


class WorkspaceAIActionRequest(BaseSchema):
    workspace_id: PublicUUID = Field(..., description="Workspace that owns this AI action.")
    project_id: PublicUUID | None = Field(
        default=None,
        description="Optional target project for project-scoped workspace actions.",
    )
    message: str = Field(..., min_length=1, max_length=2000, description="Latest user instruction.")
    mode: AgentConversationMode = Field(
        default=AgentConversationMode.BUILD,
        description="Composer mode that triggered this workspace action.",
    )
    conversation_context: list[WorkspaceAIActionContextMessage] = Field(
        default_factory=list,
        max_length=8,
        description="Recent conversation context used for follow-up workspace action planning.",
    )


class WorkspaceAIActionNavigation(BaseSchema):
    label: str = Field(..., description="Product label for the target navigation.")
    path: str = Field(..., description="Admin route path.")


class WorkspaceAIActionResponse(BaseSchema):
    kind: WorkspaceAIActionResolutionKind = Field(
        default="tool_call",
        description="Planner route selected for the latest message.",
    )
    action: WorkspaceAIActionKind | None = Field(default=None, description="Resolved workspace AI action.")
    status: WorkspaceAIActionStatus = Field(default="completed", description="Action execution status.")
    content: str = Field(..., description="Assistant-facing response text.")
    plan: str | None = Field(default=None, description="User-facing planner summary.")
    execution_steps: list[WorkspaceAIActionExecutionStep] = Field(
        default_factory=list,
        description="Planner and tool execution steps for UI rendering.",
    )
    tool_calls: list[WorkspaceAIActionToolCallOut] = Field(
        default_factory=list,
        description="Workspace tool calls selected by the planner.",
    )
    project: ProjectListItemOut | None = Field(default=None, description="Created or primary project.")
    content_model: ContentModelMutationOut | None = Field(default=None, description="Created or primary content model.")
    content_models: list[ContentModelMutationOut] = Field(
        default_factory=list,
        description="Created content models for batch workspace actions.",
    )
    projects: list[ProjectListItemOut] = Field(default_factory=list, description="Project search results.")
    total: int | None = Field(default=None, ge=0, description="Total matched projects for list actions.")
    navigation: WorkspaceAIActionNavigation | None = Field(default=None, description="Recommended navigation.")


class WorkspaceActionPlanner:
    def __init__(self, settings: Settings, runtime: LLMRuntime | None = None) -> None:
        self._settings = settings
        self._runtime = runtime or LLMRuntime(
            litellm_base_url=settings.ai.litellm_base_url,
            litellm_master_key=settings.ai.litellm_master_key,
            litellm_timeout_seconds=settings.ai.litellm_timeout_seconds,
            default_max_tokens=settings.ai.default_max_tokens,
            default_data_retention_enabled=settings.ai.data_retention_enabled,
            master_key_path=settings.ai.master_key_path,
            allow_platform_key=settings.ai.allow_platform_key,
        )

    async def plan(
        self,
        *,
        payload: WorkspaceAIActionRequest,
        user_id: UUID,
    ) -> WorkspaceAIPlannerDecision:
        try:
            result = await self._runtime.chat(
                _planner_messages(payload),
                context=LLMRequestContext(
                    workspace_id=payload.workspace_id,
                    user_id=user_id,
                    source="agent",
                ),
                model=self._settings.ai.default_model,
                temperature=0,
                max_tokens=900,
                provider_params=_planner_tool_provider_params(),
            )
        except LLMRuntimeError as exc:
            raise APIError(exc.message, error=exc.code, status_code=exc.status_code) from exc
        except httpx.HTTPStatusError as exc:
            raise APIError(
                _provider_error_message(exc),
                error="AI_WORKSPACE_ACTION_PLANNER_PROVIDER_REJECTED",
                status_code=exc.response.status_code,
            ) from exc

        return _parse_planner_tool_decision(result.tool_calls)


@router.post(
    "",
    response_model=ResponseModel[WorkspaceAIActionResponse],
    status_code=status.HTTP_200_OK,
    summary="Execute a workspace-scoped AI action",
)
async def execute_workspace_ai_action(
    payload: WorkspaceAIActionRequest,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceAIActionResponse]:
    decision = await WorkspaceActionPlanner(settings).plan(payload=payload, user_id=user_id)
    if decision.kind == "chat":
        return ApiResponse.success(data=_chat_routing_response(decision))
    if decision.kind == "clarification":
        return ApiResponse.success(data=_clarification_response(decision))

    tool_calls = _decision_tool_calls(decision)
    if not tool_calls:
        raise BadRequest(
            "Workspace action planner did not provide a tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    if len(tool_calls) > 1:
        return ApiResponse.success(
            data=await _execute_workspace_ai_tool_calls(
                payload=payload,
                user_id=user_id,
                settings=settings,
                decision=decision,
                tool_calls=tool_calls,
            )
        )

    tool_call = tool_calls[0]
    action = tool_call.tool_name

    if action == "refine_plan":
        args = _validate_tool_arguments(WorkspaceRefinePlanArgs, tool_call.arguments)
        return ApiResponse.success(data=_refined_plan_response(payload.message, decision, args))

    if _conversation_mode_value(payload.mode) == AgentConversationMode.PLAN.value and _is_mutating_action(action):
        return ApiResponse.success(data=_planned_action_response(decision))

    ctx = await resolve_workspace_context_by_id(workspace_id=payload.workspace_id, user_id=user_id)
    if ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    service = ProjectService(settings)
    if action == "create_project":
        args = _validate_tool_arguments(WorkspaceCreateProjectArgs, tool_call.arguments)
        ctx = await require_workspace_manage_access(ctx)
        await ensure_workspace_permission_granted("system:content:manage", user_id=user_id, ctx=ctx)
        project = await service.create_project(
            workspace_id=ctx.workspace_id,
            payload=_project_create_request(payload, args),
            actor_user_id=user_id,
        )
        return ApiResponse.success(data=_created_project_response(project, payload.message, decision, args))

    if action == "create_content_model":
        if payload.project_id is None:
            raise BadRequest(
                "A target project is required to create a content model",
                error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED",
            )
        content_model = await _create_content_model(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=_validate_tool_arguments(WorkspaceCreateContentModelArgs, tool_call.arguments),
        )
        return ApiResponse.success(data=_created_content_model_response(content_model, payload, decision))

    if action == "list_projects":
        args = _validate_tool_arguments(WorkspaceListProjectsArgs, tool_call.arguments)
        page = await service.list_projects(
            workspace_id=ctx.workspace_id,
            actor_user_id=user_id,
            params=PageParams(page=1, size=5),
            q=args.query,
            archived=False,
            ordering="-updated_at",
        )
        return ApiResponse.success(data=_project_list_response(page.items, page.total, payload.message, decision, args))

    _validate_tool_arguments(WorkspaceOpenProjectsArgs, tool_call.arguments)
    return ApiResponse.success(data=_open_projects_response(payload.message, decision))


async def _execute_workspace_ai_tool_calls(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    if _conversation_mode_value(payload.mode) == AgentConversationMode.PLAN.value and any(
        _is_mutating_action(tool_call.tool_name) for tool_call in tool_calls
    ):
        return _planned_action_response(decision)

    if all(tool_call.tool_name == "create_content_model" for tool_call in tool_calls):
        if payload.project_id is None:
            raise BadRequest(
                "A target project is required to create content models",
                error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED",
            )
        content_models = [
            await _create_content_model(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=_validate_tool_arguments(WorkspaceCreateContentModelArgs, tool_call.arguments),
            )
            for tool_call in tool_calls
        ]
        return _created_content_models_response(content_models, payload, decision, tool_calls)

    raise BadRequest(
        "Workspace action planner produced multiple tool calls for an unsupported action group",
        error="AI_WORKSPACE_ACTION_PLAN_INVALID",
    )


def _validate_tool_arguments[T: BaseSchema](schema: type[T], arguments: JsonObject) -> T:
    try:
        return schema.model_validate(arguments)
    except ValidationError as exc:
        raise BadRequest(
            "Workspace action planner produced invalid tool arguments",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
            details=exc.errors(),
        ) from exc


def _is_mutating_action(action: WorkspaceAIActionKind) -> bool:
    return action in {"create_project", "create_content_model"}


def _workspace_tool_label(action: WorkspaceAIActionKind) -> str:
    labels: dict[WorkspaceAIActionKind, str] = {
        "create_project": "项目创建",
        "create_content_model": "内容模型创建",
        "list_projects": "项目检索",
        "open_projects": "项目列表导航",
        "refine_plan": "方案细化",
    }
    return labels[action]


def _decision_tool_calls(decision: WorkspaceAIPlannerDecision) -> list[WorkspaceAIPlannerToolCall]:
    if decision.tool_calls:
        return decision.tool_calls
    return [decision.tool_call] if decision.tool_call is not None else []


def _conversation_mode_value(mode: AgentConversationMode | str) -> str:
    return mode.value if isinstance(mode, AgentConversationMode) else mode


def _project_create_request(
    payload: WorkspaceAIActionRequest,
    arguments: WorkspaceCreateProjectArgs,
) -> ProjectCreateRequest:
    return ProjectCreateRequest(
        workspace_id=payload.workspace_id,
        name=arguments.name,
        slug=None,
        description=arguments.description,
    )


async def _create_content_model(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceCreateContentModelArgs,
) -> ContentModelMutationOut:
    if payload.project_id is None:
        raise BadRequest(
            "A target project is required to create a content model",
            error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED",
        )

    project_ctx = await get_project_context(project_id=payload.project_id, user_id=user_id)
    if project_ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    await ensure_project_permission_granted(
        "project:content:manage",
        user_id=user_id,
        ctx=project_ctx,
        error_code="PERMISSION_DENIED",
    )
    runtime_ctx = await ProjectRuntimeService(settings).get_context_by_project(
        project_id=project_ctx.project_id,
        actor_user_id=user_id,
    )
    environment = await ProjectEnvironmentsService(runtime_ctx.tenant_context).resolve_environment_target(
        project_id=project_ctx.project_id,
        target=None,
        default_key=ProjectEnvironmentKey.PRODUCTION,
    )
    service = ProjectContentCanonicalModelsService(
        repo=ProjectContentModelsRepository(
            resolve_project_tenant_context(project_id=project_ctx.project_id, runtime_id=runtime_ctx.runtime_id)
        ),
        settings=settings,
    )
    result = await service.create_model(
        workspace_id=project_ctx.workspace_id,
        site_id=runtime_ctx.site_id,
        environment_id=environment.id,
        actor_user_id=user_id,
        payload=_content_model_create_request(payload.message, arguments),
    )
    return to_mutation_out(result)


def _content_model_create_request(
    message: str,
    arguments: WorkspaceCreateContentModelArgs | None = None,
) -> ContentModelDefinitionContract:
    name = (arguments.name.strip() if arguments and arguments.name else "") or _content_model_name(message)
    key = _content_model_key(name)
    return ContentModelDefinitionContract(
        singular_key=key,
        plural_key=_content_model_plural_key(key),
        name=name,
        description=(arguments.description.strip() if arguments and arguments.description else None)
        or _content_model_description(message),
        category="custom",
        model_kind="collection_type",
        capabilities=["queryable"],
    )


def _content_model_name(message: str) -> str:
    explicit_name = _explicit_content_model_name(message)
    if explicit_name:
        return explicit_name[:128]
    return f"内容模型 {uuid4().hex[:4].upper()}"


def _explicit_content_model_name(message: str) -> str | None:
    quoted = _QUOTED_TEXT.search(message)
    if quoted is not None:
        value = _clean_content_model_name(quoted.group("value"))
        return value or None
    named = _NAMED_CONTENT_MODEL.search(message)
    if named is None:
        return None
    value = _clean_content_model_name(named.group("name"))
    return value or None


def _clean_content_model_name(value: str) -> str:
    cleaned = _DIRECTIVE_TEXT.sub("", value)
    cleaned = " ".join(cleaned.strip(" \t\r\n：:，,。.!！?？").split())
    for token in ("帮我", "请", "我的项目", "项目", "一个", "一個", "新的", "new"):
        cleaned = cleaned.replace(token, "")
    return " ".join(cleaned.split()).strip(" -_")


def _content_model_description(message: str) -> str:
    cleaned = " ".join(message.strip().split())
    if not cleaned:
        return "由 Arclayer AI 创建的内容模型。"
    return f"由 Arclayer AI 根据指令“{cleaned[:96]}”创建。"


def _content_model_key(name: str) -> str:
    if name.startswith("内容模型 "):
        return _generated_content_model_key()
    words = _content_model_identifier_words(name)
    if words:
        first, *rest = words
        raw = "".join([first.casefold(), *(word[:1].upper() + word[1:].casefold() for word in rest)])
        key = _LEADING_NON_LETTERS.sub("", raw)[:54]
        if key:
            return f"{key[:1].casefold()}{key[1:]}"
    return _generated_content_model_key()


def _generated_content_model_key() -> str:
    return f"contentModel{uuid4().hex[:8]}"


def _content_model_identifier_words(value: str) -> list[str]:
    separated = _ACRONYM_IDENTIFIER_BOUNDARY.sub(r"\1 \2", value)
    separated = _CAMEL_IDENTIFIER_BOUNDARY.sub(r"\1 \2", separated)
    return [word for word in _IDENTIFIER_WORD_SEPARATOR.split(separated) if word[:1].isalpha()]


def _content_model_plural_key(singular_key: str) -> str:
    irregular = {"category": "categories", "person": "people"}.get(singular_key)
    if irregular:
        return irregular
    if singular_key.endswith("y") and re.search(r"[^aeiou]y$", singular_key):
        return f"{singular_key[:-1]}ies"
    if singular_key.endswith(("s", "x", "z", "ch", "sh")):
        return f"{singular_key}es"
    return f"{singular_key}s"


def _created_project_response(
    project: ProjectListItemOut,
    message: str,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceCreateProjectArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(message):
        content = f"已在当前工作区创建项目“{project.name}”。你可以直接进入项目继续配置内容、资源和发布流程。"
        label = "进入项目"
    else:
        content = f'Created "{project.name}" in this workspace. Open it to continue setup.'
        label = "Open project"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="create_project",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "创建项目并生成访问入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_project",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        project=project,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{project.id}"),
    )


def _created_content_model_response(
    content_model: ContentModelMutationOut,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = f"已在目标项目中创建内容模型“{content_model.name}”。你可以进入模型编辑器继续添加字段、关系和工作流。"
        label = "编辑内容模型"
    else:
        content = f'Created the content model "{content_model.name}" in the target project.'
        label = "Edit content model"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="create_content_model",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "创建内容模型并打开编辑入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_content_model",
                status="completed",
                arguments=decision.tool_call.arguments if decision.tool_call else {},
            )
        ],
        content_model=content_model,
        content_models=[content_model],
        navigation=WorkspaceAIActionNavigation(
            label=label,
            path=f"/projects/{payload.project_id}/content/models/edit?modelId={content_model.id}",
        ),
    )


def _created_content_models_response(
    content_models: list[ContentModelMutationOut],
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    if not content_models:
        raise BadRequest(
            "Workspace action planner did not create any content models",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    names = "、".join(content_model.name for content_model in content_models[:5])
    if _is_chinese(payload.message):
        content = f"已在目标项目中创建 {len(content_models)} 个内容模型：{names}。你可以进入内容模型继续配置字段、关系和工作流。"
        label = "查看内容模型"
    else:
        content = f"Created {len(content_models)} content models in the target project: {names}."
        label = "View content models"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="create_content_model",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps_for_tool_calls(tool_calls, "创建内容模型并生成访问入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="completed",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
        content_model=content_models[0],
        content_models=content_models,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/models"),
    )


def _project_list_response(
    projects,
    total: int,
    message: str,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceListProjectsArgs,
) -> WorkspaceAIActionResponse:
    items = list(projects)
    if _is_chinese(message):
        content = "这是当前工作区里与你的请求匹配的项目。" if items else "当前工作区没有匹配的项目。"
        label = "查看全部项目"
    else:
        content = "These projects match your request." if items else "No matching projects were found."
        label = "See all projects"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="list_projects",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "读取当前工作区项目列表"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.list_projects",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        projects=items,
        total=total,
        navigation=WorkspaceAIActionNavigation(label=label, path="/projects"),
    )


def _refined_plan_response(
    message: str,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceRefinePlanArgs,
) -> WorkspaceAIActionResponse:
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="refine_plan",
        status="planned",
        content=arguments.summary,
        plan=arguments.summary,
        execution_steps=[
            WorkspaceAIActionExecutionStep(
                id="planner",
                title="读取上下文并细化执行方案",
                status="completed",
                detail=decision.user_visible_plan or None,
            ),
            *[
                WorkspaceAIActionExecutionStep(
                    id=f"refine.{index + 1}",
                    title=step,
                    status="planned",
                    tool_name="workspace.refine_plan",
                )
                for index, step in enumerate(arguments.steps)
            ],
        ],
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.refine_plan",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
    )


def _open_projects_response(message: str, decision: WorkspaceAIPlannerDecision) -> WorkspaceAIActionResponse:
    if _is_chinese(message):
        content = "可以从项目列表查看、筛选和新建当前工作区的项目。"
        label = "打开项目列表"
    else:
        content = "Open the project list to view, filter, and create projects in this workspace."
        label = "Open projects"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="open_projects",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "打开项目列表入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.open_projects",
                status="completed",
                arguments=decision.tool_call.arguments if decision.tool_call else {},
            )
        ],
        navigation=WorkspaceAIActionNavigation(label=label, path="/projects"),
    )


def _chat_routing_response(decision: WorkspaceAIPlannerDecision) -> WorkspaceAIActionResponse:
    return WorkspaceAIActionResponse(
        kind="chat",
        action=None,
        status="routed_to_chat",
        content="",
        plan=decision.user_visible_plan,
        execution_steps=[
            WorkspaceAIActionExecutionStep(
                id="route-chat",
                title=decision.user_visible_plan or "交给常规对话继续处理",
                status="completed",
            )
        ],
    )


def _clarification_response(decision: WorkspaceAIPlannerDecision) -> WorkspaceAIActionResponse:
    content = decision.user_visible_plan or "我还需要更多信息才能执行这个工作区操作。"
    return WorkspaceAIActionResponse(
        kind="clarification",
        action=None,
        status="needs_clarification",
        content=content,
        plan=content,
        execution_steps=[],
    )


def _planned_action_response(decision: WorkspaceAIPlannerDecision) -> WorkspaceAIActionResponse:
    tool_calls = _decision_tool_calls(decision)
    if not tool_calls:
        raise BadRequest(
            "Workspace action planner did not provide a tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=tool_calls[0].tool_name,
        status="planned",
        content=decision.user_visible_plan or "我已整理好执行方案。规划模式不会修改工作区。",
        plan=decision.user_visible_plan,
        execution_steps=[
            WorkspaceAIActionExecutionStep(
                id="planner",
                title="理解指令并选择工作区工具",
                status="completed",
                detail=decision.user_visible_plan or None,
            ),
            *[
                WorkspaceAIActionExecutionStep(
                    id=f"tool.{index + 1}.{tool_call.tool_name}",
                    title=f"准备执行{_workspace_tool_label(tool_call.tool_name)}",
                    status="planned",
                    tool_name=f"workspace.{tool_call.tool_name}",
                )
                for index, tool_call in enumerate(tool_calls)
            ],
        ],
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="planned",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
    )


def _completed_steps(
    decision: WorkspaceAIPlannerDecision, final_step_title: str
) -> list[WorkspaceAIActionExecutionStep]:
    tool_name = f"workspace.{decision.tool_call.tool_name}" if decision.tool_call else None
    tool_label = _workspace_tool_label(decision.tool_call.tool_name) if decision.tool_call else "工作区工具"
    return [
        WorkspaceAIActionExecutionStep(
            id="planner",
            title="理解指令并选择工作区工具",
            status="completed",
            detail=decision.user_visible_plan or None,
        ),
        WorkspaceAIActionExecutionStep(
            id="tool-call",
            title=f"执行{tool_label}",
            status="completed",
            tool_name=tool_name,
        ),
        WorkspaceAIActionExecutionStep(
            id="result",
            title=final_step_title,
            status="completed",
        ),
    ]


def _completed_steps_for_tool_calls(
    tool_calls: list[WorkspaceAIPlannerToolCall],
    final_step_title: str,
) -> list[WorkspaceAIActionExecutionStep]:
    return [
        WorkspaceAIActionExecutionStep(
            id="planner",
            title="理解指令并选择工作区工具",
            status="completed",
        ),
        *[
            WorkspaceAIActionExecutionStep(
                id=f"tool-call.{index + 1}",
                title=f"执行{_workspace_tool_label(tool_call.tool_name)}",
                status="completed",
                tool_name=f"workspace.{tool_call.tool_name}",
            )
            for index, tool_call in enumerate(tool_calls)
        ],
        WorkspaceAIActionExecutionStep(
            id="result",
            title=final_step_title,
            status="completed",
        ),
    ]


def _planner_messages(payload: WorkspaceAIActionRequest) -> list[dict[str, str]]:
    tool_catalog = [
        {
            "name": "workspace_create_project",
            "description": "Create a new workspace project. Use this for project, website, landing page, app, portal, dashboard, or similar build requests that need a new project container.",
            "arguments": {
                "name": "Concise product-ready project name inferred from the instruction.",
                "description": "One sentence describing the project's purpose and operating scope.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_create_content_model",
            "description": "Create a content model inside an existing target project. Requires project_id from context.",
            "arguments": {
                "name": "Content model display name.",
                "description": "One sentence describing what records this model manages.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_list_projects",
            "description": "Find or list projects in the current workspace.",
            "arguments": {
                "query": "Optional search text, or null for all recent projects.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_open_projects",
            "description": "Navigate to the project list without creating or changing anything.",
            "arguments": {"user_visible_plan": "Concise plan shown to the user."},
        },
        {
            "name": "workspace_refine_plan",
            "description": "Refine the prior workspace plan using conversation context. Use this for follow-up requests such as expanding, detailing, adjusting, or breaking down an existing plan.",
            "arguments": {
                "title": "Product-ready refined plan title.",
                "summary": "Concise refined plan summary in the user's language.",
                "steps": "Concrete next execution steps.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_route_chat",
            "description": "Use this when the user message should continue as normal assistant chat instead of a workspace action.",
            "arguments": {"user_visible_plan": "Short routing reason shown internally."},
        },
        {
            "name": "workspace_request_clarification",
            "description": "Use this when a supported workspace action is likely but required details cannot be inferred.",
            "arguments": {
                "user_visible_plan": "Question or clarification message shown to the user.",
                "missing_fields": "Required details that are missing.",
            },
        },
    ]
    system = (
        "You are Arclayer's workspace action planner. Decide whether the latest user message should call a "
        "workspace tool, continue as normal chat, or ask a clarification question. You must select at least one "
        "provided tool. Use exactly one control tool for normal chat routing or clarification. For batch content "
        "model requests, call workspace_create_content_model once per model in the intended execution order. "
        "Produce product-ready Chinese copy when the user writes Chinese, and product-ready English "
        "copy when the user writes English. For mutating workspace tools, fill arguments completely from the user's "
        "intent and the available context. If a required argument cannot be inferred, call "
        "workspace_request_clarification instead of guessing. For follow-up requests that refer to the prior plan "
        "or result, use conversation_context to continue the workspace action instead of treating the message as a "
        "standalone generic chat."
    )
    context = {
        "workspace_id": str(payload.workspace_id),
        "project_id": str(payload.project_id) if payload.project_id else None,
        "mode": _conversation_mode_value(payload.mode),
        "conversation_context": [item.model_dump(mode="json") for item in payload.conversation_context[-8:]],
        "tools": tool_catalog,
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"context": context, "message": payload.message}, ensure_ascii=False)},
    ]


def _planner_tool_provider_params() -> dict[str, Any]:
    return {
        "tools": [
            _planner_function_tool(
                name="workspace_create_project",
                description="Create a new workspace project for a website, landing page, app, portal, dashboard, or similar build request.",
                properties={
                    "name": {"type": "string", "description": "Product-ready project display name."},
                    "description": {"type": "string", "description": "One sentence describing the project purpose."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["name", "description", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_create_content_model",
                description="Create a content model inside the target project.",
                properties={
                    "name": {"type": "string", "description": "Content model display name."},
                    "description": {
                        "type": "string",
                        "description": "One sentence describing what records this model manages.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_list_projects",
                description="Find or list projects in the current workspace.",
                properties={
                    "query": {"type": "string", "description": "Optional project search text."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_open_projects",
                description="Navigate to the project list without creating or changing anything.",
                properties={
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_refine_plan",
                description="Refine the previous workspace plan using conversation context.",
                properties={
                    "title": {"type": "string", "description": "Product-ready refined plan title."},
                    "summary": {
                        "type": "string",
                        "description": "Concise refined plan summary in the user's language.",
                    },
                    "steps": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Concrete next execution steps.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["title", "summary", "steps", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_route_chat",
                description="Continue as normal assistant chat when no workspace tool should run.",
                properties={
                    "user_visible_plan": {"type": "string", "description": "Short routing reason."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_request_clarification",
                description="Ask the user for missing details before running a supported workspace action.",
                properties={
                    "user_visible_plan": {"type": "string", "description": "Clarification question shown to the user."},
                    "missing_fields": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Required details that are missing.",
                    },
                },
                required=["user_visible_plan", "missing_fields"],
            ),
        ],
    }


def _provider_error_message(exc: httpx.HTTPStatusError) -> str:
    response_text = exc.response.text.strip()
    if response_text:
        return f"Workspace action planner provider rejected the request: {response_text[:1000]}"
    return f"Workspace action planner provider rejected the request with HTTP {exc.response.status_code}."


def _planner_function_tool(
    *,
    name: str,
    description: str,
    properties: dict[str, Any],
    required: list[str],
) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "additionalProperties": False,
                "properties": properties,
                "required": required,
            },
        },
    }


def _parse_planner_tool_decision(tool_calls: list[dict[str, Any]]) -> WorkspaceAIPlannerDecision:
    if not tool_calls:
        raise BadRequest(
            "Workspace action planner must return at least one tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    first_tool_name, first_arguments = _planner_tool_call_payload(tool_calls[0])
    user_visible_plan = _take_string(first_arguments, "user_visible_plan") or "已整理工作区操作计划。"

    if first_tool_name == "workspace_route_chat":
        if len(tool_calls) != 1:
            raise BadRequest(
                "Workspace action planner cannot combine chat routing with workspace tools",
                error="AI_WORKSPACE_ACTION_PLAN_INVALID",
            )
        return WorkspaceAIPlannerDecision(
            kind="chat",
            confidence=1,
            tool_call=None,
            user_visible_plan=user_visible_plan,
        )

    if first_tool_name == "workspace_request_clarification":
        if len(tool_calls) != 1:
            raise BadRequest(
                "Workspace action planner cannot combine clarification with workspace tools",
                error="AI_WORKSPACE_ACTION_PLAN_INVALID",
            )
        raw_missing_fields = first_arguments.get("missing_fields", [])
        missing_fields = [item for item in raw_missing_fields if isinstance(item, str)]
        return WorkspaceAIPlannerDecision(
            kind="clarification",
            confidence=1,
            tool_call=None,
            missing_fields=missing_fields,
            user_visible_plan=user_visible_plan,
        )

    parsed_calls = [_parse_planner_tool_call(tool_call) for tool_call in tool_calls]
    first_call = parsed_calls[0]
    return WorkspaceAIPlannerDecision(
        kind="tool_call",
        confidence=1,
        tool_call=first_call,
        tool_calls=parsed_calls,
        user_visible_plan=user_visible_plan,
    )


def _parse_planner_tool_call(tool_call: dict[str, Any]) -> WorkspaceAIPlannerToolCall:
    tool_name, raw_arguments = _planner_tool_call_payload(tool_call)
    action = _PLANNER_TOOL_TO_ACTION.get(tool_name)
    if action is None:
        raise BadRequest(
            "Workspace action planner returned an unsupported tool",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    return WorkspaceAIPlannerToolCall(
        tool_name=action,
        arguments=cast(JsonObject, raw_arguments),
    )


def _planner_tool_call_payload(tool_call: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    function_call = tool_call.get("function")
    raw_name = function_call.get("name") if isinstance(function_call, dict) else tool_call.get("name")
    if not isinstance(raw_name, str):
        raise BadRequest(
            "Workspace action planner returned a tool call without a function name",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    raw_arguments = (
        function_call.get("arguments") if isinstance(function_call, dict) else tool_call.get("arguments", {})
    )
    if isinstance(raw_arguments, str):
        try:
            parsed_arguments = json.loads(raw_arguments or "{}")
        except json.JSONDecodeError as exc:
            raise BadRequest(
                "Workspace action planner returned invalid tool arguments",
                error="AI_WORKSPACE_ACTION_PLAN_INVALID",
            ) from exc
    else:
        parsed_arguments = raw_arguments

    if not isinstance(parsed_arguments, dict):
        raise BadRequest(
            "Workspace action planner returned non-object tool arguments",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    return raw_name, parsed_arguments


def _take_string(arguments: dict[str, Any], key: str) -> str | None:
    value = arguments.pop(key, None)
    return value if isinstance(value, str) and value.strip() else None


def _is_chinese(message: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in message)
