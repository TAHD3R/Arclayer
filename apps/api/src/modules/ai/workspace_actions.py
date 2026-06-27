from __future__ import annotations

import re
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, status
from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.exceptions import BadRequest, Forbidden
from src.core.http.pagination import PageParams
from src.core.http.response import ApiResponse, ResponseModel
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
WorkspaceAIActionStatus = Literal["completed"]

router = APIRouter(prefix="/workspace-actions", tags=["AI"])

_PROJECT_TERMS = ("项目", "project", "projects")
_CONTENT_MODEL_TERMS = (
    "内容模型",
    "内容类型",
    "content model",
    "content type",
    "schema model",
)
_AI_MODEL_TERMS = ("大模型", "ai model", "模型选择", "选择模型", "切换模型")
_CREATE_TERMS = ("创建", "新建", "建立", "生成", "create", "start", "new project")
_LIST_TERMS = ("查看", "列出", "搜索", "查找", "找", "有哪些", "列表", "list", "find", "search", "show")
_OPEN_TERMS = ("打开", "进入", "跳转", "open", "go to")
_RANDOM_TERMS = ("随机", "随便", "任意", "random", "anything")
_QUOTED_TEXT = re.compile(r"[\"'“‘](?P<value>[^\"'”’]{1,64})[\"'”’]")
_DIRECTIVE_TEXT = re.compile(r":[\w-]{1,64}\[[^\]\n]{1,1024}\](?:\{name=[^}\n]{1,1024}\})?")
_NAMED_PROJECT = re.compile(
    r"(?:创建|新建|建立|生成|create|start)\s*(?:一个|一個|个|新的|new)?\s*"
    r"(?P<name>[^，。,.!?！？]{1,64}?)\s*(?:项目|project)",
    re.IGNORECASE,
)
_NAMED_CONTENT_MODEL = re.compile(
    r"(?:创建|新建|建立|生成|create|start)\s*(?:一个|一個|个|新的|new)?\s*"
    r"(?P<name>[^，。,.!?！？]{1,64}?)\s*(?:内容模型|内容类型|content model|content type)",
    re.IGNORECASE,
)
_PROJECT_QUERY = re.compile(
    r"(?:查找|搜索|找|打开|查看|find|search|open|show)\s*(?P<query>[^，。,.!?！？]{1,64}?)\s*(?:项目|project)",
    re.IGNORECASE,
)
_ACRONYM_IDENTIFIER_BOUNDARY = re.compile(r"([A-Z]+)([A-Z][a-z])")
_CAMEL_IDENTIFIER_BOUNDARY = re.compile(r"([a-z0-9])([A-Z])")
_IDENTIFIER_WORD_SEPARATOR = re.compile(r"[^A-Za-z0-9]+")
_LEADING_NON_LETTERS = re.compile(r"^[^A-Za-z]+")
_RANDOM_PROJECT_NAMES = (
    "内容实验室",
    "品牌发布站",
    "知识资料库",
    "活动工作台",
    "产品展示台",
)


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
    action: WorkspaceAIActionKind = Field(..., description="Resolved workspace AI action.")
    status: WorkspaceAIActionStatus = Field(default="completed", description="Action execution status.")
    content: str = Field(..., description="Assistant-facing response text.")
    project: ProjectListItemOut | None = Field(default=None, description="Created or primary project.")
    content_model: ContentModelMutationOut | None = Field(default=None, description="Created or primary content model.")
    projects: list[ProjectListItemOut] = Field(default_factory=list, description="Project search results.")
    total: int | None = Field(default=None, ge=0, description="Total matched projects for list actions.")
    navigation: WorkspaceAIActionNavigation | None = Field(default=None, description="Recommended navigation.")


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
    action = resolve_workspace_ai_action(payload.message)
    if action is None:
        raise BadRequest(
            "The message does not match a supported workspace AI action",
            error="AI_WORKSPACE_ACTION_UNSUPPORTED",
        )

    if payload.mode == AgentConversationMode.PLAN and _is_mutating_action(action):
        raise BadRequest(
            "Plan mode cannot execute mutating workspace AI actions",
            error="AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY",
        )

    ctx = await resolve_workspace_context_by_id(workspace_id=payload.workspace_id, user_id=user_id)
    if ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    service = ProjectService(settings)
    if action == "create_project":
        ctx = await require_workspace_manage_access(ctx)
        await ensure_workspace_permission_granted("system:content:manage", user_id=user_id, ctx=ctx)
        project = await service.create_project(
            workspace_id=ctx.workspace_id,
            payload=_project_create_request(payload),
            actor_user_id=user_id,
        )
        return ApiResponse.success(data=_created_project_response(project, payload.message))

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
        )
        return ApiResponse.success(data=_created_content_model_response(content_model, payload))

    if action == "list_projects":
        page = await service.list_projects(
            workspace_id=ctx.workspace_id,
            actor_user_id=user_id,
            params=PageParams(page=1, size=5),
            q=_project_query(payload.message),
            archived=False,
            ordering="-updated_at",
        )
        return ApiResponse.success(data=_project_list_response(page.items, page.total, payload.message))

    return ApiResponse.success(data=_open_projects_response(payload.message))


def resolve_workspace_ai_action(message: str) -> WorkspaceAIActionKind | None:
    text = _normalized_text(message)
    if _is_content_model_create_intent(text):
        return "create_content_model"
    if not _contains_any(text, _PROJECT_TERMS):
        return None
    if _contains_any(text, _CREATE_TERMS):
        return "create_project"
    if _contains_any(text, _OPEN_TERMS) and _contains_any(text, ("列表", "list", "projects")):
        return "open_projects"
    if _contains_any(text, _LIST_TERMS):
        return "list_projects"
    return None


def _is_content_model_create_intent(text: str) -> bool:
    if not _contains_any(text, _CREATE_TERMS):
        return False
    if _contains_any(text, _CONTENT_MODEL_TERMS):
        return True
    return "模型" in text and not _contains_any(text, _AI_MODEL_TERMS)


def _is_mutating_action(action: WorkspaceAIActionKind) -> bool:
    return action in {"create_project", "create_content_model"}


def _project_create_request(payload: WorkspaceAIActionRequest) -> ProjectCreateRequest:
    name = _project_name(payload.message)
    description = _project_description(payload.message)
    return ProjectCreateRequest(
        workspace_id=payload.workspace_id,
        name=name,
        slug=None,
        description=description,
    )


def _project_name(message: str) -> str:
    explicit_name = _explicit_project_name(message)
    if explicit_name:
        return explicit_name[:128]
    suffix = uuid4().hex[:4].upper()
    template = _RANDOM_PROJECT_NAMES[int(uuid4().hex[:2], 16) % len(_RANDOM_PROJECT_NAMES)]
    return f"{template} {suffix}"


def _explicit_project_name(message: str) -> str | None:
    if _contains_any(_normalized_text(message), _RANDOM_TERMS):
        return None
    quoted = _QUOTED_TEXT.search(message)
    if quoted is not None:
        value = _clean_project_name(quoted.group("value"))
        return value or None
    named = _NAMED_PROJECT.search(message)
    if named is None:
        return None
    value = _clean_project_name(named.group("name"))
    return value or None


def _project_description(message: str) -> str:
    cleaned = " ".join(message.strip().split())
    if not cleaned:
        return "由 Arclayer AI 创建的工作区项目。"
    return f"由 Arclayer AI 根据指令“{cleaned[:96]}”创建。"


async def _create_content_model(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
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
        payload=_content_model_create_request(payload.message),
    )
    return to_mutation_out(result)


def _content_model_create_request(message: str) -> ContentModelDefinitionContract:
    name = _content_model_name(message)
    key = _content_model_key(name)
    return ContentModelDefinitionContract(
        singular_key=key,
        plural_key=_content_model_plural_key(key),
        name=name,
        description=_content_model_description(message),
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


def _project_query(message: str) -> str | None:
    quoted = _QUOTED_TEXT.search(message)
    if quoted is not None:
        return _clean_project_name(quoted.group("value")) or None
    query = _PROJECT_QUERY.search(message)
    if query is None:
        return None
    value = _clean_project_name(query.group("query"))
    return value or None


def _created_project_response(
    project: ProjectListItemOut,
    message: str,
) -> WorkspaceAIActionResponse:
    if _is_chinese(message):
        content = f"已在当前工作区创建项目“{project.name}”。你可以直接进入项目继续配置内容、资源和发布流程。"
        label = "进入项目"
    else:
        content = f'Created "{project.name}" in this workspace. Open it to continue setup.'
        label = "Open project"
    return WorkspaceAIActionResponse(
        action="create_project",
        content=content,
        project=project,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{project.id}"),
    )


def _created_content_model_response(
    content_model: ContentModelMutationOut,
    payload: WorkspaceAIActionRequest,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = f"已在目标项目中创建内容模型“{content_model.name}”。你可以进入模型编辑器继续添加字段、关系和工作流。"
        label = "编辑内容模型"
    else:
        content = f'Created the content model "{content_model.name}" in the target project.'
        label = "Edit content model"
    return WorkspaceAIActionResponse(
        action="create_content_model",
        content=content,
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
) -> WorkspaceAIActionResponse:
    items = list(projects)
    if _is_chinese(message):
        content = "这是当前工作区里与你的请求匹配的项目。" if items else "当前工作区没有匹配的项目。"
        label = "查看全部项目"
    else:
        content = "These projects match your request." if items else "No matching projects were found."
        label = "See all projects"
    return WorkspaceAIActionResponse(
        action="list_projects",
        content=content,
        projects=items,
        total=total,
        navigation=WorkspaceAIActionNavigation(label=label, path="/projects"),
    )


def _open_projects_response(message: str) -> WorkspaceAIActionResponse:
    if _is_chinese(message):
        content = "可以从项目列表查看、筛选和新建当前工作区的项目。"
        label = "打开项目列表"
    else:
        content = "Open the project list to view, filter, and create projects in this workspace."
        label = "Open projects"
    return WorkspaceAIActionResponse(
        action="open_projects",
        content=content,
        navigation=WorkspaceAIActionNavigation(label=label, path="/projects"),
    )


def _clean_project_name(value: str) -> str:
    cleaned = " ".join(value.strip(" \t\r\n：:，,。.!！?？").split())
    for token in ("帮我", "请", "一个", "一個", "新的", "new", "project", "项目"):
        cleaned = cleaned.replace(token, "")
    return " ".join(cleaned.split()).strip(" -_")


def _normalized_text(message: str) -> str:
    return " ".join(message.casefold().strip().split())


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term.casefold() in text for term in terms)


def _is_chinese(message: str) -> bool:
    return any("\u4e00" <= char <= "\u9fff" for char in message)
