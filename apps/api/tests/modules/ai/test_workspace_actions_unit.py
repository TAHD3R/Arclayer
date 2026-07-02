from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import httpx
import pytest

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest
from src.llm.runtime import LLMRuntime
from src.models.agents.conversation import AgentConversationMode
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.ai import workspace_actions
from src.modules.ai.workspace_actions import WorkspaceAIActionRequest, execute_workspace_ai_action
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


def _install_planner(monkeypatch: pytest.MonkeyPatch, decision: workspace_actions.WorkspaceAIPlannerDecision) -> None:
    class FakeWorkspaceActionPlanner:
        def __init__(self, settings):
            pass

        async def plan(self, *, payload, user_id):
            return decision

    monkeypatch.setattr(workspace_actions, "WorkspaceActionPlanner", FakeWorkspaceActionPlanner)


def _tool_decision(
    tool_name: workspace_actions.WorkspaceAIActionKind,
    arguments: JsonObject,
) -> workspace_actions.WorkspaceAIPlannerDecision:
    return workspace_actions.WorkspaceAIPlannerDecision(
        kind="tool_call",
        confidence=0.94,
        tool_call=workspace_actions.WorkspaceAIPlannerToolCall(
            tool_name=tool_name,
            arguments=arguments,
        ),
        user_visible_plan=f"准备调用 workspace.{tool_name}。",
    )


def test_project_create_request_uses_structured_planner_arguments() -> None:
    payload = workspace_actions._project_create_request(
        WorkspaceAIActionRequest(workspace_id=uuid4(), message="搭一个产品官网"),
        workspace_actions.WorkspaceCreateProjectArgs(
            name="产品官网",
            description="用于展示产品价值、功能亮点与转化入口的品牌官网项目。",
        ),
    )

    assert payload.name == "产品官网"
    assert payload.description == "用于展示产品价值、功能亮点与转化入口的品牌官网项目。"


def test_content_model_create_request_generates_camel_case_identifier_for_chinese_default_name() -> None:
    payload = workspace_actions._content_model_create_request("帮我的项目创建一个内容模型")

    assert re.fullmatch(r"[a-z][A-Za-z0-9]*", payload.singular_key)
    assert re.fullmatch(r"[a-z][A-Za-z0-9]*", payload.plural_key)
    assert "_" not in payload.singular_key
    assert payload.singular_key.startswith("contentModel")


def test_content_model_create_request_generates_readable_camel_case_identifier() -> None:
    payload = workspace_actions._content_model_create_request('create "Blog Post" content model')

    assert payload.name == "Blog Post"
    assert payload.singular_key == "blogPost"
    assert payload.plural_key == "blogPosts"


def test_parse_planner_tool_decision_accepts_tool_call() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_open_projects",
                "arguments": json.dumps({"user_visible_plan": "打开项目列表。"}, ensure_ascii=False),
            },
        }
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "open_projects"
    assert decision.user_visible_plan == "打开项目列表。"


def test_parse_planner_tool_decision_accepts_chat_route() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_route_chat",
                "arguments": json.dumps({"user_visible_plan": "交给常规对话。"}, ensure_ascii=False),
            },
        }
    ])

    assert decision.kind == "chat"
    assert decision.tool_call is None


def test_parse_planner_tool_decision_rejects_missing_tool_call() -> None:
    with pytest.raises(BadRequest) as exc_info:
        workspace_actions._parse_planner_tool_decision([])

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PLAN_INVALID"


def test_planner_tool_provider_params_register_workspace_tools() -> None:
    provider_params = workspace_actions._planner_tool_provider_params()
    tools = provider_params["tools"]

    assert "tool_choice" not in provider_params
    assert {item["function"]["name"] for item in tools} == {
        "workspace_create_project",
        "workspace_create_content_model",
        "workspace_list_projects",
        "workspace_open_projects",
        "workspace_route_chat",
        "workspace_request_clarification",
    }
    for item in tools:
        assert item["type"] == "function"
        assert item["function"]["parameters"]["additionalProperties"] is False

    create_project_schema = next(item for item in tools if item["function"]["name"] == "workspace_create_project")
    assert create_project_schema["function"]["parameters"]["required"] == [
        "name",
        "description",
        "user_visible_plan",
    ]


def test_planner_messages_serializes_schema_mode_values() -> None:
    payload = WorkspaceAIActionRequest(
        workspace_id=uuid4(),
        message="帮我创建一个 SaaS 落地页",
        mode=AgentConversationMode.PLAN,
    )

    messages = workspace_actions._planner_messages(payload)
    user_content = json.loads(messages[1]["content"])

    assert payload.mode == "plan"
    assert user_content["context"]["mode"] == "plan"


@pytest.mark.asyncio
async def test_workspace_action_planner_exposes_provider_rejection() -> None:
    class RejectingRuntime:
        async def chat(self, *args, **kwargs):
            request = httpx.Request("POST", "http://litellm.local/v1/chat/completions")
            response = httpx.Response(
                400,
                request=request,
                text='{"error":{"message":"Thinking mode does not support this tool_choice"}}',
            )
            raise httpx.HTTPStatusError("bad request", request=request, response=response)

    planner = workspace_actions.WorkspaceActionPlanner(Settings(), runtime=cast(LLMRuntime, RejectingRuntime()))

    with pytest.raises(workspace_actions.APIError) as exc_info:
        await planner.plan(
            payload=WorkspaceAIActionRequest(
                workspace_id=uuid4(),
                message="帮我创建一个 SaaS 落地页",
                mode=AgentConversationMode.BUILD,
            ),
            user_id=uuid4(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PLANNER_PROVIDER_REJECTED"
    assert exc_info.value.status_code == 400
    assert "Thinking mode does not support this tool_choice" in exc_info.value.message


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_creates_project_with_canonical_service(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    resolved_call: tuple[UUID, UUID] | None = None
    permission_call: tuple[str, UUID, UUID] | None = None
    create_call: tuple[UUID, ProjectCreateRequest, UUID] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        nonlocal resolved_call
        resolved_call = (workspace_id, user_id)
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_require_workspace_manage_access(ctx):
        return ctx

    async def fake_ensure_workspace_permission_granted(permission, *, user_id, ctx):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.workspace_id)

    class FakeProjectService:
        def __init__(self, settings):
            pass

        async def create_project(self, *, workspace_id, payload, actor_user_id):
            nonlocal create_call
            create_call = (workspace_id, payload, actor_user_id)
            return _project(id=uuid4(), workspace_id=workspace_id, name=payload.name)

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "require_workspace_manage_access", fake_require_workspace_manage_access)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_workspace_permission_granted",
        fake_ensure_workspace_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectService", FakeProjectService)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_project",
            {
                "name": "SaaS 落地页",
                "description": "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            message="帮我创建一个 SaaS 落地页",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert resolved_call == (workspace_id, user_id)
    assert permission_call == ("system:content:manage", user_id, workspace_id)
    assert create_call is not None
    created_workspace_id, payload, actor_user_id = create_call
    assert created_workspace_id == workspace_id
    assert payload.workspace_id == workspace_id
    assert payload.name == "SaaS 落地页"
    assert payload.description == "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。"
    assert payload.slug is None
    assert actor_user_id == user_id
    assert response.data is not None
    assert response.data.action == "create_project"
    assert response.data.kind == "tool_call"
    assert response.data.tool_calls[0].tool_name == "workspace.create_project"
    assert response.data.project is not None
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{response.data.project.id}"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_plans_mutation_in_plan_mode(monkeypatch) -> None:
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_project",
            {
                "name": "产品官网",
                "description": "用于展示产品价值、功能亮点与转化入口的品牌官网项目。",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=uuid4(),
            message="搭一个产品官网",
            mode=AgentConversationMode.PLAN,
        ),
        user_id=uuid4(),
        settings=Settings(),
    )

    assert response.data is not None
    assert response.data.status == "planned"
    assert response.data.action == "create_project"
    assert response.data.tool_calls[0].status == "planned"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_requires_project_for_content_model(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_content_model",
            {
                "name": "文章",
                "description": "用于管理文章内容的集合模型。",
            },
        ),
    )

    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=workspace_id,
                message="帮我的项目创建一个内容模型",
                mode=AgentConversationMode.BUILD,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PROJECT_REQUIRED"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_creates_content_model_for_target_project(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    create_call: WorkspaceAIActionRequest | None = None
    model_id = uuid4()

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_create_content_model(*, payload, user_id, settings, arguments):
        nonlocal create_call
        create_call = payload
        return ContentModelMutationOut.model_construct(
            id=model_id,
            workspace_id=payload.workspace_id,
            site_id=uuid4(),
            singular_key="content_model",
            plural_key="content_models",
            name="内容模型 09F9",
            description="Created by AI",
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            model_kind="collection_type",
            draft_contract_revision=1,
            published_contract_revision=None,
            impact={},
        )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_create_content_model", fake_create_content_model)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_content_model",
            {
                "name": "内容模型 09F9",
                "description": "用于管理自定义内容记录的集合模型。",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="帮我的项目创建一个内容模型",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert create_call is not None
    assert create_call.project_id == project_id
    assert response.data is not None
    assert response.data.action == "create_content_model"
    assert response.data.content_model is not None
    assert response.data.content_model.id == model_id
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models/edit?modelId={model_id}"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_lists_projects_without_manage_permission(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    list_call: dict[str, object] | None = None
    project = _project(id=uuid4(), workspace_id=workspace_id, name="Launch Site")

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    class FakeProjectService:
        def __init__(self, settings):
            pass

        async def list_projects(self, **kwargs):
            nonlocal list_call
            list_call = kwargs
            return type(
                "ProjectPage",
                (),
                {
                    "items": [project],
                    "total": 1,
                },
            )()

    async def fail_manage_access(ctx):
        raise AssertionError("list_projects must not require workspace manage access")

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "require_workspace_manage_access", fail_manage_access)
    monkeypatch.setattr(workspace_actions, "ProjectService", FakeProjectService)
    _install_planner(
        monkeypatch,
        _tool_decision("list_projects", {"query": "Launch"}),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            message="查找 Launch 项目",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert list_call is not None
    assert list_call["workspace_id"] == workspace_id
    assert list_call["actor_user_id"] == user_id
    assert list_call["q"] == "Launch"
    assert response.data is not None
    assert response.data.action == "list_projects"
    assert response.data.projects == [project]


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_routes_normal_chat(monkeypatch) -> None:
    _install_planner(
        monkeypatch,
        workspace_actions.WorkspaceAIPlannerDecision(
            kind="chat",
            confidence=0.91,
            tool_call=None,
            user_visible_plan="这条消息不需要工作区工具，交给常规对话处理。",
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=uuid4(),
            message="你好",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=uuid4(),
        settings=Settings(),
    )

    assert response.data is not None
    assert response.data.kind == "chat"
    assert response.data.status == "routed_to_chat"


def _workspace_context(*, workspace_id, organization_id) -> WorkspaceContext:
    return WorkspaceContext(
        workspace_id=workspace_id,
        organization_id=organization_id,
        workspace_kind=WorkspaceKind.TEAM,
        access_type=WorkspaceAccessType.MEMBER,
        is_org_owner=True,
    )


def _project(*, id, workspace_id, name: str) -> ProjectListItemOut:
    now = datetime.now(tz=UTC)
    return ProjectListItemOut.model_construct(
        id=id,
        workspace_id=workspace_id,
        slug=name.casefold().replace(" ", "-"),
        name=name,
        description="Created by AI",
        icon_mode="initials",
        icon_color="#337ea9",
        icon_glyph=None,
        icon_emoji=None,
        icon_url=None,
        is_active=True,
        primary_runtime=None,
        member_count=1,
        members_preview=[],
        archived_at=None,
        archived_by_user_id=None,
        created_at=now,
        updated_at=now,
        enterable=True,
    )
