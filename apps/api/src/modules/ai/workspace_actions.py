from __future__ import annotations

import json
import re
from typing import Any, Literal, cast
from uuid import UUID, uuid4

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

WorkspaceAIActionKind = Literal["create_project", "create_content_model", "list_projects", "open_projects"]
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
_SUPPORTED_WORKSPACE_TOOLS = ("create_project", "create_content_model", "list_projects", "open_projects")


class WorkspaceAIPlannerToolCall(BaseSchema):
    tool_name: WorkspaceAIActionKind = Field(..., description="Workspace tool selected by the planner.")
    arguments: JsonObject = Field(default_factory=dict, description="Structured tool arguments.")


class WorkspaceAIPlannerDecision(BaseSchema):
    kind: WorkspaceAIActionResolutionKind = Field(..., description="How the workspace orchestrator should proceed.")
    confidence: float = Field(default=0, ge=0, le=1, description="Planner confidence from 0 to 1.")
    tool_call: WorkspaceAIPlannerToolCall | None = Field(
        default=None,
        description="Selected tool call when kind is tool_call.",
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
                provider_params=_planner_response_format(),
            )
        except LLMRuntimeError as exc:
            raise APIError(exc.message, error=exc.code, status_code=exc.status_code) from exc

        return _parse_planner_decision(result.content)


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

    if decision.tool_call is None:
        raise BadRequest(
            "Workspace action planner did not provide a tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    action = decision.tool_call.tool_name

    if payload.mode == AgentConversationMode.PLAN and _is_mutating_action(action):
        return ApiResponse.success(data=_planned_action_response(decision))

    ctx = await resolve_workspace_context_by_id(workspace_id=payload.workspace_id, user_id=user_id)
    if ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    service = ProjectService(settings)
    if action == "create_project":
        args = _validate_tool_arguments(WorkspaceCreateProjectArgs, decision.tool_call.arguments)
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
            arguments=_validate_tool_arguments(WorkspaceCreateContentModelArgs, decision.tool_call.arguments),
        )
        return ApiResponse.success(data=_created_content_model_response(content_model, payload, decision))

    if action == "list_projects":
        args = _validate_tool_arguments(WorkspaceListProjectsArgs, decision.tool_call.arguments)
        page = await service.list_projects(
            workspace_id=ctx.workspace_id,
            actor_user_id=user_id,
            params=PageParams(page=1, size=5),
            q=args.query,
            archived=False,
            ordering="-updated_at",
        )
        return ApiResponse.success(data=_project_list_response(page.items, page.total, payload.message, decision, args))

    _validate_tool_arguments(WorkspaceOpenProjectsArgs, decision.tool_call.arguments)
    return ApiResponse.success(data=_open_projects_response(payload.message, decision))


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
        navigation=WorkspaceAIActionNavigation(
            label=label,
            path=f"/projects/{payload.project_id}/content/models/edit?modelId={content_model.id}",
        ),
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
        execution_steps=[
            WorkspaceAIActionExecutionStep(
                id="clarify",
                title=content,
                status="completed",
                detail=", ".join(decision.missing_fields) or None,
            )
        ],
    )


def _planned_action_response(decision: WorkspaceAIPlannerDecision) -> WorkspaceAIActionResponse:
    if decision.tool_call is None:
        raise BadRequest(
            "Workspace action planner did not provide a tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=decision.tool_call.tool_name,
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
            WorkspaceAIActionExecutionStep(
                id=f"tool.{decision.tool_call.tool_name}",
                title=f"准备调用 workspace.{decision.tool_call.tool_name}",
                status="planned",
                tool_name=f"workspace.{decision.tool_call.tool_name}",
            ),
        ],
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{decision.tool_call.tool_name}",
                status="planned",
                arguments=decision.tool_call.arguments,
            )
        ],
    )


def _completed_steps(
    decision: WorkspaceAIPlannerDecision, final_step_title: str
) -> list[WorkspaceAIActionExecutionStep]:
    tool_name = f"workspace.{decision.tool_call.tool_name}" if decision.tool_call else None
    return [
        WorkspaceAIActionExecutionStep(
            id="planner",
            title="理解指令并选择工作区工具",
            status="completed",
            detail=decision.user_visible_plan or None,
        ),
        WorkspaceAIActionExecutionStep(
            id="tool-call",
            title=f"调用 {tool_name}",
            status="completed",
            tool_name=tool_name,
        ),
        WorkspaceAIActionExecutionStep(
            id="result",
            title=final_step_title,
            status="completed",
        ),
    ]


def _planner_messages(payload: WorkspaceAIActionRequest) -> list[dict[str, str]]:
    tool_catalog = [
        {
            "name": "create_project",
            "description": "Create a new workspace project. Use this for project, website, landing page, app, portal, dashboard, or similar build requests that need a new project container.",
            "arguments": {
                "name": "Concise product-ready project name inferred from the instruction.",
                "description": "One sentence describing the project's purpose and operating scope.",
            },
        },
        {
            "name": "create_content_model",
            "description": "Create a content model inside an existing target project. Requires project_id from context.",
            "arguments": {
                "name": "Content model display name.",
                "description": "One sentence describing what records this model manages.",
            },
        },
        {
            "name": "list_projects",
            "description": "Find or list projects in the current workspace.",
            "arguments": {"query": "Optional search text, or null for all recent projects."},
        },
        {
            "name": "open_projects",
            "description": "Navigate to the project list without creating or changing anything.",
            "arguments": {},
        },
    ]
    system = (
        "You are Arclayer's workspace action planner. Decide whether the latest user message should call a "
        "workspace tool, continue as normal chat, or ask a clarification question. Use the tool catalog only; "
        "do not invent tool names. Produce product-ready Chinese copy when the user writes Chinese, and product-ready "
        "English copy when the user writes English. For tool calls, fill arguments completely from the user's intent "
        "and the available context. If a required argument cannot be inferred, return clarification instead of guessing. "
        "Return only JSON that matches the supplied schema."
    )
    context = {
        "workspace_id": str(payload.workspace_id),
        "project_id": str(payload.project_id) if payload.project_id else None,
        "mode": payload.mode.value,
        "tools": tool_catalog,
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"context": context, "message": payload.message}, ensure_ascii=False)},
    ]


def _planner_response_format() -> dict[str, Any]:
    tool_call_schemas = [
        _planner_tool_call_schema(
            tool_name="create_project",
            arguments={
                "name": {
                    "type": "string",
                    "description": "Concise product-ready project name inferred from the instruction.",
                },
                "description": {
                    "type": "string",
                    "description": "One sentence describing the project's purpose and operating scope.",
                },
            },
            required_arguments=["name", "description"],
        ),
        _planner_tool_call_schema(
            tool_name="create_content_model",
            arguments={
                "name": {
                    "type": ["string", "null"],
                    "description": "Content model display name, or null when the user did not provide enough naming context.",
                },
                "description": {
                    "type": ["string", "null"],
                    "description": "One sentence describing what records this model manages, or null when unavailable.",
                },
            },
            required_arguments=["name", "description"],
        ),
        _planner_tool_call_schema(
            tool_name="list_projects",
            arguments={
                "query": {
                    "type": ["string", "null"],
                    "description": "Optional project search text, or null for recent projects.",
                },
            },
            required_arguments=["query"],
        ),
        _planner_tool_call_schema(
            tool_name="open_projects",
            arguments={},
            required_arguments=[],
        ),
    ]
    return {
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "workspace_action_planner_decision",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "kind",
                        "confidence",
                        "tool_call",
                        "missing_fields",
                        "requires_confirmation",
                        "user_visible_plan",
                    ],
                    "properties": {
                        "kind": {"type": "string", "enum": ["tool_call", "chat", "clarification"]},
                        "confidence": {"type": "number"},
                        "tool_call": {
                            "anyOf": [
                                {"type": "null"},
                                *tool_call_schemas,
                            ]
                        },
                        "missing_fields": {"type": "array", "items": {"type": "string"}},
                        "requires_confirmation": {"type": "boolean"},
                        "user_visible_plan": {"type": "string"},
                    },
                },
            },
        }
    }


def _planner_tool_call_schema(
    *,
    tool_name: WorkspaceAIActionKind,
    arguments: dict[str, Any],
    required_arguments: list[str],
) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["tool_name", "arguments"],
        "properties": {
            "tool_name": {"type": "string", "enum": [tool_name]},
            "arguments": {
                "type": "object",
                "additionalProperties": False,
                "required": required_arguments,
                "properties": arguments,
            },
        },
    }


def _parse_planner_decision(content: str) -> WorkspaceAIPlannerDecision:
    try:
        raw = json.loads(_strip_json_code_fence(content))
        decision = WorkspaceAIPlannerDecision.model_validate(raw)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise BadRequest(
            "Workspace action planner returned invalid structured output",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        ) from exc
    if decision.kind == "tool_call" and decision.tool_call is None:
        raise BadRequest(
            "Workspace action planner returned a tool route without a tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    if decision.kind != "tool_call" and decision.tool_call is not None:
        raise BadRequest(
            "Workspace action planner returned a tool call for a non-tool route",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )
    return decision


def _strip_json_code_fence(content: str) -> str:
    stripped = content.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].strip() == "```":
        return "\n".join(lines[1:-1]).strip()
    return stripped


def _is_chinese(message: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in message)
