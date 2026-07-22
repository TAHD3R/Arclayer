from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import httpx
import pytest

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageData
from src.llm.runtime import LLMRuntime
from src.models.agents.conversation import AgentConversationMode
from src.models.projects._enums import ProjectAuthoringMode
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.ai import workspace_actions
from src.modules.ai.workspace_actions import (
    WorkspaceAIActionRequest,
    _execute_workspace_ai_action_impl,
)
from src.modules.domains.schema import DomainBindingOut
from src.modules.projects.content.contracts.schema import (
    ContentItemOut,
    ContentModelImpactOut,
    ContentModelOut,
    ContentVersionOut,
)
from src.modules.projects.content.items.input_schema import ContentVersionDraftSaveIn
from src.modules.projects.content.models.protocol_registry import get_official_model_protocol
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.projects.source.schema import (
    ProjectSourceFileDeleteOut,
    ProjectSourceFileOut,
    ProjectSourceFileRole,
    ProjectSourceFileUpsertIn,
    ProjectSourceManifestOut,
)
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


async def execute_workspace_ai_action(
    payload: WorkspaceAIActionRequest,
    *,
    request: workspace_actions.Request | None = None,
    user_id: UUID,
    settings: Settings,
) -> workspace_actions.ResponseModel[workspace_actions.WorkspaceAIActionResponse]:
    return await _execute_workspace_ai_action_impl(
        payload=payload,
        request=request,
        user_id=user_id,
        settings=settings,
    )


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


def _tool_calls_decision(
    tool_calls: list[workspace_actions.WorkspaceAIPlannerToolCall],
) -> workspace_actions.WorkspaceAIPlannerDecision:
    return workspace_actions.WorkspaceAIPlannerDecision(
        kind="tool_call",
        confidence=0.94,
        tool_call=tool_calls[0],
        tool_calls=tool_calls,
        user_visible_plan="准备执行多个工作区工具。",
    )


def _source_file(
    path: str,
    role: ProjectSourceFileRole = "source",
    language: str = "text",
    contents: str = "",
) -> ProjectSourceFileOut:
    return ProjectSourceFileOut(path=path, role=role, language=language, contents=contents)


def test_project_create_request_uses_structured_planner_arguments() -> None:
    payload = workspace_actions._project_create_request(
        WorkspaceAIActionRequest(workspace_id=uuid4(), message="搭一个产品官网"),
        workspace_actions.WorkspaceCreateProjectArgs(
            name="产品官网",
            description="用于展示产品价值、功能亮点与转化入口的品牌官网项目。",
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
        ),
    )

    assert payload.name == "产品官网"
    assert payload.description == "用于展示产品价值、功能亮点与转化入口的品牌官网项目。"


def test_created_project_page_model_contract_defines_site_builder_page() -> None:
    payload = workspace_actions._created_project_page_model_contract()

    assert payload.singular_key == "page"
    assert payload.plural_key == "pages"
    assert payload.category == "site_builder"
    assert payload.model_kind == "collection_type"
    assert payload.default_editor == "visual"
    assert payload.default_role == "page"
    assert payload.default_posture == "page"
    assert payload.default_surface == "canvas"
    assert {
        "has_slots",
        "publishable",
        "queryable",
        "routable",
        "seo_managed",
        "treeable",
        "versioned",
        "visual_editable",
    }.issubset(payload.capabilities)
    assert payload.routing.mode == "localized"
    assert payload.routing.slug_field == "path"
    assert payload.workflow.states == ["draft", "published"]
    assert payload.workflow.initial_state == "draft"
    assert len(payload.views) == 1
    assert payload.views[0].key == "pages"
    assert payload.views[0].config == {"columns": ["title", "path"]}
    assert payload.presentation == {
        "allowedKinds": ["form_data", "wireframe", "visual_blueprint", "slot_mapping", "seo"]
    }
    assert payload.seo == {"titleField": "title"}
    assert payload.starter_pack_policy == {"mode": "page"}
    assert payload.surface_policy == {"allowedSurfaces": ["canvas", "structured"]}
    protocol = get_official_model_protocol("page")
    assert protocol is not None
    system_field_keys = {field.key for field in protocol.system_fields}
    field_keys = {field.key for field in payload.fields}
    assert system_field_keys.isdisjoint(field_keys)
    assert field_keys == {
        "heroHeadline",
        "heroSubheading",
        "primaryCtaLabel",
        "sections",
    }


def test_created_project_reusable_block_model_contract_defines_site_builder_block() -> None:
    payload = workspace_actions._created_project_reusable_block_model_contract()

    assert payload.singular_key == "reusableBlock"
    assert payload.plural_key == "reusableBlocks"
    assert payload.category == "site_builder"
    assert payload.model_kind == "collection_type"
    assert payload.default_editor == "visual"
    assert payload.default_role == "reusable-section"
    assert payload.default_posture == "composition"
    assert payload.default_surface == "canvas"
    assert {
        "has_slots",
        "localizable",
        "publishable",
        "queryable",
        "versioned",
        "visual_editable",
    }.issubset(payload.capabilities)
    assert payload.routing.mode == "none"
    assert payload.workflow.states == ["draft", "published"]
    assert payload.workflow.initial_state == "draft"
    assert len(payload.views) == 1
    assert payload.views[0].key == "blocks"
    assert payload.views[0].config == {"columns": ["title", "sectionKey"]}
    assert payload.presentation == {"allowedKinds": ["form_data", "wireframe", "visual_blueprint", "slot_mapping"]}
    assert payload.starter_pack_policy == {"mode": "section"}
    assert payload.surface_policy == {"allowedSurfaces": ["canvas", "structured"]}
    assert {field.key for field in payload.fields} == {"title", "sectionKey", "propsDefaults"}


def test_created_project_home_fields_link_settings_domain_and_sections() -> None:
    domain = DomainBindingOut.model_construct(hostname="landing.arclayer.localhost")
    fields = workspace_actions._created_project_home_fields(
        arguments=workspace_actions.WorkspaceCreateProjectArgs(
            name="Landing",
            description="A conversion website.",
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
        ),
        domain=domain,
    )

    assert fields["title"] == "Landing"
    assert fields["path"] == "/"
    assert fields["heroHeadline"] == "Landing"
    assert fields["heroSubheading"] == "A conversion website."
    assert fields["canonicalUrl"] == "https://landing.arclayer.localhost"
    assert isinstance(fields["sections"], list)
    assert len(fields["sections"]) == 3


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
    assert len(decision.tool_calls) == 1
    assert decision.user_visible_plan == "打开项目列表。"


def test_parse_planner_tool_decision_accepts_multiple_content_model_tool_calls() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_create_content_model",
                "arguments": json.dumps(
                    {
                        "name": "新闻文章",
                        "description": "管理品牌新闻和发布内容。",
                        "user_visible_plan": "创建官网所需的内容模型。",
                    },
                    ensure_ascii=False,
                ),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_create_content_model",
                "arguments": json.dumps(
                    {
                        "name": "案例展示",
                        "description": "管理客户案例和项目成果。",
                        "user_visible_plan": "创建官网所需的内容模型。",
                    },
                    ensure_ascii=False,
                ),
            },
        },
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "create_content_model"
    assert [tool_call.arguments["name"] for tool_call in decision.tool_calls] == ["新闻文章", "案例展示"]


def test_parse_planner_tool_decision_accepts_content_model_crud_tools() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_list_content_models",
                "arguments": json.dumps({"query": "article", "user_visible_plan": "读取内容模型。"}),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_update_content_model",
                "arguments": json.dumps({
                    "modelId": str(uuid4()),
                    "name": "Article",
                    "user_visible_plan": "更新内容模型。",
                }),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_delete_content_model",
                "arguments": json.dumps({"modelId": str(uuid4()), "user_visible_plan": "删除内容模型。"}),
            },
        },
    ])

    assert decision.kind == "tool_call"
    assert [tool_call.tool_name for tool_call in decision.tool_calls] == [
        "list_content_models",
        "update_content_model",
        "delete_content_model",
    ]


def test_parse_planner_tool_decision_accepts_content_item_crud_tools() -> None:
    item_id = uuid4()
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_list_content_items",
                "arguments": json.dumps({"modelKey": "page", "user_visible_plan": "读取页面内容。"}),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_update_content_item",
                "arguments": json.dumps({
                    "itemId": str(item_id),
                    "fields": {"headline": "New headline"},
                    "user_visible_plan": "更新页面内容。",
                }),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_update_homepage",
                "arguments": json.dumps({
                    "fields": {"heroHeadline": "New homepage"},
                    "publish": True,
                    "user_visible_plan": "更新首页内容。",
                }),
            },
        },
        {
            "type": "function",
            "function": {
                "name": "workspace_delete_content_item",
                "arguments": json.dumps({"itemId": str(item_id), "user_visible_plan": "删除旧内容。"}),
            },
        },
    ])

    assert decision.kind == "tool_call"
    assert [tool_call.tool_name for tool_call in decision.tool_calls] == [
        "list_content_items",
        "update_content_item",
        "update_homepage",
        "delete_content_item",
    ]


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


def test_parse_planner_tool_decision_accepts_refine_plan() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_refine_plan",
                "arguments": json.dumps(
                    {
                        "title": "企业官网细化方案",
                        "summary": "继续拆解企业官网的页面结构、实施步骤和风险处理。",
                        "steps": ["确认页面范围", "规划内容模块", "拆分上线检查"],
                        "user_visible_plan": "细化上一步企业官网方案。",
                    },
                    ensure_ascii=False,
                ),
            },
        }
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "refine_plan"
    assert decision.user_visible_plan == "细化上一步企业官网方案。"


def test_parse_planner_tool_decision_accepts_read_project_source() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_read_project_source",
                "arguments": json.dumps(
                    {
                        "filePath": "src/App.tsx",
                        "user_visible_plan": "读取项目源码文件。",
                    },
                    ensure_ascii=False,
                ),
            },
        }
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "read_project_source"
    assert decision.tool_call.arguments["filePath"] == "src/App.tsx"
    assert decision.user_visible_plan == "读取项目源码文件。"


def test_parse_planner_tool_decision_accepts_write_project_source_file() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_write_project_source_file",
                "arguments": json.dumps(
                    {
                        "path": "src/App.tsx",
                        "contents": "export function App() { return null; }\n",
                        "language": "typescriptreact",
                        "user_visible_plan": "写入项目源码文件。",
                    },
                    ensure_ascii=False,
                ),
            },
        }
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "write_project_source_file"
    assert decision.tool_call.arguments["contents"] == "export function App() { return null; }\n"
    assert decision.user_visible_plan == "写入项目源码文件。"


def test_parse_planner_tool_decision_accepts_delete_project_source_file() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "type": "function",
            "function": {
                "name": "workspace_delete_project_source_file",
                "arguments": json.dumps(
                    {"path": "src/legacy.ts", "user_visible_plan": "删除项目源码文件。"},
                    ensure_ascii=False,
                ),
            },
        }
    ])

    assert decision.kind == "tool_call"
    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "delete_project_source_file"
    assert decision.tool_call.arguments["path"] == "src/legacy.ts"
    assert decision.user_visible_plan == "删除项目源码文件。"


@pytest.mark.asyncio
async def test_execute_workspace_ai_tool_calls_combines_homepage_and_project_source(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    content_tool_names: list[str] = []
    source_tool_names: list[str] = []
    content_item = _content_item(workspace_id=workspace_id, title="Home", model_key="page")
    content_version = _content_version(
        item_id=content_item.id,
        version_number=4,
        fields={"heroHeadline": "Updated enterprise headline", "path": "/"},
    )
    source_manifest = ProjectSourceManifestOut(
        project_id=project_id,
        framework="react_vite",
        source_provider="managed",
        package_manager="pnpm",
        root_directory=".",
        build_command="pnpm build",
        output_directory="dist",
        artifact_strategy="object_storage",
        files=[
            ProjectSourceFileOut(
                path="src/App.tsx",
                role="entry",
                language="typescriptreact",
                contents="export function App() { return null; }\n",
            ),
            ProjectSourceFileOut(
                path="src/index.css",
                role="style",
                language="css",
                contents=".hero { display: grid; }\n",
            ),
        ],
    )
    release = workspace_actions.ReleasePublishOut.model_construct(
        release=SimpleNamespace(id=uuid4(), release_number=8),
        selected_items=1,
        previous_active_release_id=None,
    )

    async def fake_execute_content_item_tool_calls(*, payload, request, user_id, settings, tool_calls):
        content_tool_names.extend(tool_call.tool_name for tool_call in tool_calls)
        return workspace_actions._ContentItemToolCallsResult(
            content_items=[],
            content_version=content_version,
            deleted_item_ids=[],
            mutation_items=[content_item],
            total=1,
        )

    async def fake_execute_project_source_tool_calls(*, payload, user_id, settings, tool_calls):
        source_tool_names.extend(tool_call.tool_name for tool_call in tool_calls)
        return workspace_actions._ProjectSourceToolCallsResult(
            release=release,
            source_manifest=source_manifest,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_execute_content_item_tool_calls",
        fake_execute_content_item_tool_calls,
    )
    monkeypatch.setattr(
        workspace_actions,
        "_execute_project_source_tool_calls",
        fake_execute_project_source_tool_calls,
    )
    tool_calls = [
        workspace_actions.WorkspaceAIPlannerToolCall(
            tool_name="update_homepage",
            arguments={
                "fields": {"heroHeadline": "Updated enterprise headline"},
                "path": "/",
                "publish": True,
            },
        ),
        workspace_actions.WorkspaceAIPlannerToolCall(
            tool_name="write_project_source_file",
            arguments={
                "contents": "export function App() { return null; }\n",
                "language": "typescriptreact",
                "path": "src/App.tsx",
                "publishRelease": True,
                "role": "entry",
            },
        ),
    ]
    decision = _tool_calls_decision(tool_calls)

    response = await workspace_actions._execute_workspace_ai_tool_calls(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="更新首页文案并同步 React 源码",
            mode=AgentConversationMode.BUILD,
        ),
        request=None,
        user_id=user_id,
        settings=Settings(),
        decision=decision,
        tool_calls=tool_calls,
    )

    assert content_tool_names == ["update_homepage"]
    assert source_tool_names == ["write_project_source_file"]
    assert response.action == "update_homepage"
    assert response.content_item == content_item
    assert response.content_version == content_version
    assert response.source_manifest == source_manifest
    assert response.release == release
    assert response.navigation is not None
    assert response.navigation.path == f"/projects/{project_id}/editor"
    assert [tool_call.tool_name for tool_call in response.tool_calls] == [
        "workspace.update_homepage",
        "workspace.write_project_source_file",
    ]
    assert [step.tool_name for step in response.execution_steps if step.tool_name] == [
        "workspace.update_homepage",
        "workspace.write_project_source_file",
    ]
    assert "站点更新" in response.content
    assert "2 个文件" in response.content


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
        "workspace_list_content_models",
        "workspace_update_content_model",
        "workspace_delete_content_model",
        "workspace_list_content_items",
        "workspace_create_content_item",
        "workspace_update_content_item",
        "workspace_update_homepage",
        "workspace_delete_content_item",
        "workspace_list_projects",
        "workspace_open_projects",
        "workspace_read_project_source",
        "workspace_write_project_source_file",
        "workspace_delete_project_source_file",
        "workspace_update_project_source_settings",
        "workspace_update_site_settings",
        "workspace_refine_plan",
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
        "authoringMode",
        "user_visible_plan",
    ]
    assert create_project_schema["function"]["parameters"]["properties"]["authoringMode"]["enum"] == [
        "builder_managed",
        "source_managed",
    ]
    assert create_project_schema["function"]["parameters"]["properties"]["framework"]["enum"] == [
        "react_vite",
        "astro",
    ]
    create_content_item_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_create_content_item"
    )
    assert "fields.path" in create_content_item_schema["function"]["description"]
    assert (
        "route bindings" in create_content_item_schema["function"]["parameters"]["properties"]["fields"]["description"]
    )
    assert create_content_item_schema["function"]["parameters"]["properties"]["publish"]["type"] == "boolean"
    update_content_item_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_update_content_item"
    )
    assert "fields.path" in update_content_item_schema["function"]["description"]
    assert (
        "changing the route"
        in update_content_item_schema["function"]["parameters"]["properties"]["fields"]["description"]
    )
    assert update_content_item_schema["function"]["parameters"]["properties"]["publish"]["type"] == "boolean"
    update_homepage_schema = next(item for item in tools if item["function"]["name"] == "workspace_update_homepage")
    assert "route binding" in update_homepage_schema["function"]["description"]
    assert (
        "for example / or /company"
        in update_homepage_schema["function"]["parameters"]["properties"]["path"]["description"]
    )
    write_source_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_write_project_source_file"
    )
    assert write_source_schema["function"]["parameters"]["properties"]["publishRelease"]["type"] == "boolean"
    delete_source_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_delete_project_source_file"
    )
    assert delete_source_schema["function"]["parameters"]["properties"]["publishRelease"]["type"] == "boolean"
    read_source_schema = next(item for item in tools if item["function"]["name"] == "workspace_read_project_source")
    assert read_source_schema["function"]["parameters"]["properties"]["filePath"]["type"] == "string"
    update_settings_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_update_site_settings"
    )
    update_settings_properties = update_settings_schema["function"]["parameters"]["properties"]
    assert update_settings_properties["googleAnalyticsMeasurementId"]["type"] == "string"
    assert update_settings_properties["robotsDirective"]["type"] == "string"
    assert update_settings_properties["sitemapEnabled"]["type"] == "boolean"
    assert "framework" not in update_settings_properties
    update_source_settings_schema = next(
        item for item in tools if item["function"]["name"] == "workspace_update_project_source_settings"
    )
    update_source_settings_properties = update_source_settings_schema["function"]["parameters"]["properties"]
    assert update_source_settings_properties["framework"]["enum"] == ["react_vite", "astro"]
    assert update_source_settings_properties["sourceProvider"]["enum"] == ["managed", "git"]


def test_create_project_source_settings_default_to_react_vite() -> None:
    args = workspace_actions.WorkspaceCreateProjectArgs(
        name="Enterprise launch",
        description="A conversion-focused enterprise landing site.",
        authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
    )

    settings_patch = workspace_actions._project_core_settings_patch(arguments=args, domain=None)

    assert settings_patch["project_source"]["framework"] == "react_vite"
    assert settings_patch["project_source"]["source_provider"] == "managed"
    assert settings_patch["project_source"]["build_command"] == "pnpm build"


def test_planner_source_settings_tool_routes_to_stable_settings_action() -> None:
    decision = workspace_actions._parse_planner_tool_decision([
        {
            "function": {
                "name": "workspace_update_project_source_settings",
                "arguments": json.dumps({
                    "framework": "astro",
                    "buildCommand": "pnpm build",
                    "user_visible_plan": "切换项目源码框架。",
                }),
            }
        }
    ])

    assert decision.tool_call is not None
    assert decision.tool_call.tool_name == "update_site_settings"
    assert decision.tool_call.provider_tool_name == "workspace_update_project_source_settings"
    assert decision.tool_call.arguments["framework"] == "astro"
    assert decision.user_visible_plan == "切换项目源码框架。"


def test_create_project_source_settings_support_explicit_astro_framework() -> None:
    args = workspace_actions.WorkspaceCreateProjectArgs(
        name="Enterprise launch",
        description="A conversion-focused enterprise landing site.",
        authoring_mode=ProjectAuthoringMode.SOURCE_MANAGED,
        framework="astro",
    )

    settings_patch = workspace_actions._project_core_settings_patch(arguments=args, domain=None)

    assert settings_patch["project_source"] == {
        "framework": "astro",
        "source_provider": "managed",
        "package_manager": "pnpm",
        "root_directory": ".",
        "build_command": "pnpm build",
        "output_directory": "dist",
        "artifact_strategy": "object_storage",
    }
    assert workspace_actions._project_source_framework_label(settings_patch["project_source"]["framework"]) == "Astro"


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
    create_content_item_tool = next(
        item for item in user_content["context"]["tools"] if item["name"] == "workspace_create_content_item"
    )
    assert "fields.path" in create_content_item_tool["description"]
    assert "path" in create_content_item_tool["arguments"]["fields"]
    update_homepage_tool = next(
        item for item in user_content["context"]["tools"] if item["name"] == "workspace_update_homepage"
    )
    assert "route binding" in update_homepage_tool["description"]
    update_settings_tool = next(
        item for item in user_content["context"]["tools"] if item["name"] == "workspace_update_site_settings"
    )
    assert "Google Analytics" in update_settings_tool["description"]
    assert "googleAnalyticsMeasurementId" in update_settings_tool["arguments"]
    assert "robotsDirective" in update_settings_tool["arguments"]
    assert "sitemapEnabled" in update_settings_tool["arguments"]
    assert "framework" not in update_settings_tool["arguments"]
    update_source_settings_tool = next(
        item for item in user_content["context"]["tools"] if item["name"] == "workspace_update_project_source_settings"
    )
    assert "React/Vite or Astro" in update_source_settings_tool["description"]
    assert "framework" in update_source_settings_tool["arguments"]
    assert "buildCommand" in update_source_settings_tool["arguments"]


def test_planner_messages_include_recent_conversation_context() -> None:
    payload = WorkspaceAIActionRequest(
        workspace_id=uuid4(),
        message="再细化一下方案",
        mode=AgentConversationMode.PLAN,
        conversation_context=[
            workspace_actions.WorkspaceAIActionContextMessage(
                role="user",
                content="帮我创建一个企业官网",
            ),
            workspace_actions.WorkspaceAIActionContextMessage(
                role="assistant",
                content="[Workspace action plan]\nGoal: 帮我创建一个企业官网",
            ),
        ],
    )

    messages = workspace_actions._planner_messages(payload)
    user_content = json.loads(messages[1]["content"])

    assert user_content["context"]["conversation_context"] == [
        {"role": "user", "content": "帮我创建一个企业官网"},
        {"role": "assistant", "content": "[Workspace action plan]\nGoal: 帮我创建一个企业官网"},
    ]


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
    bootstrap_call: tuple[UUID, object, UUID, str, str | None] | None = None
    settings_patch_calls: list[tuple[UUID, dict, UUID | None]] = []
    source_write_calls: list[tuple[UUID, str, ProjectSourceFileUpsertIn, UUID]] = []
    request = SimpleNamespace()
    created_project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    content_model = ContentModelMutationOut.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        singular_key="page",
        plural_key="pages",
        name="Page",
        description="Website pages generated and maintained by Arclayer AI.",
        protocol_key="page",
        protocol_version=1,
        system_managed=True,
        system_field_keys=["title", "path"],
        model_kind="collection_type",
        draft_contract_revision=1,
        published_contract_revision=1,
        default_role="page",
        default_posture="page",
        default_surface="structured",
        starter_pack_policy=None,
        surface_policy=None,
        impact=ContentModelImpactOut(),
    )
    reusable_block_model = ContentModelMutationOut.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        singular_key="reusableBlock",
        plural_key="reusableBlocks",
        name="Reusable Block",
        description="Reusable visual block for page sections, layout fragments, and AI-assisted composition.",
        protocol_key=None,
        protocol_version=None,
        system_managed=False,
        system_field_keys=[],
        model_kind="collection_type",
        draft_contract_revision=1,
        published_contract_revision=1,
        default_role="reusable-section",
        default_posture="composition",
        default_surface="canvas",
        starter_pack_policy={"mode": "section"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
        impact=ContentModelImpactOut(),
    )
    content_item = _content_item(workspace_id=workspace_id, title="Home", model_key="page")
    content_version = _content_version(
        item_id=content_item.id,
        version_number=1,
        fields={"title": "SaaS 落地页", "path": "/"},
    )
    release = workspace_actions.ReleasePublishOut.model_construct(
        release=SimpleNamespace(id=uuid4(), release_number=3),
        graph_nodes=1,
        selection_count=1,
        impact=SimpleNamespace(),
    )
    domain = DomainBindingOut.model_validate({
        "bindingId": uuid4(),
        "hostname": "saas-landing.arclayer.localhost",
        "source": "platform",
        "targetType": "project_runtime",
        "workspaceId": workspace_id,
        "projectId": created_project_id,
        "runtimeId": runtime_id,
        "runtimeName": "Production",
        "siteId": site_id,
        "environmentId": None,
        "isPrimary": True,
        "isVerified": True,
        "isActive": True,
        "verificationToken": None,
        "verifiedAtMs": 1_725_000_000_000,
        "certificateStatus": "platform_managed",
        "createdByUserId": user_id,
        "dns": None,
    })
    source_manifest = ProjectSourceManifestOut(
        project_id=created_project_id,
        framework="react_vite",
        source_provider="managed",
        package_manager="pnpm",
        root_directory=".",
        build_command="pnpm build",
        output_directory="dist",
        artifact_strategy="object_storage",
        files=[
            _source_file(".env.example", "config", "dotenv"),
            _source_file(".gitignore", "config", "ignore"),
            _source_file("README.md", "config", "markdown"),
            _source_file("package.json", "config", "json"),
            _source_file("index.html", "entry", "html"),
            _source_file("tsconfig.json", "config", "json"),
            _source_file("tsconfig.app.json", "config", "json"),
            _source_file("tsconfig.node.json", "config", "json"),
            _source_file("vite.config.ts", "config", "typescript"),
            _source_file("src/main.tsx", "entry", "typescriptreact"),
            _source_file("src/vite-env.d.ts", "types", "typescript"),
            _source_file("src/App.tsx", "entry", "typescriptreact", "export function App() { return null; }\n"),
            _source_file("src/index.css", "style", "css"),
            _source_file("src/arclayer/runtime.ts", "runtime", "typescript"),
            _source_file("src/arclayer/site-config.ts", "config", "typescript"),
            _source_file("src/arclayer/content.ts", "content", "typescript"),
        ],
    )

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
            return _project(id=created_project_id, workspace_id=workspace_id, name=payload.name)

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def upsert_source_file(self, *, project_id, path, payload, actor_user_id):
            source_write_calls.append((project_id, path, payload, actor_user_id))
            return ProjectSourceFileOut(
                path=path,
                role=payload.role or "source",
                language=payload.language or "text",
                contents=payload.contents,
            )

        async def get_source_manifest(self, *, project_id):
            assert project_id == created_project_id
            written_files = [
                ProjectSourceFileOut(
                    path=path,
                    role=payload.role or "source",
                    language=payload.language or "text",
                    contents=payload.contents,
                )
                for _, path, payload, _ in source_write_calls
            ]
            return source_manifest.model_copy(update={"files": written_files or source_manifest.files})

    class FakeProjectSettingsService:
        def __init__(self, settings):
            pass

        async def patch_core(self, *, project_id, patch, updated_by):
            settings_patch_calls.append((project_id, patch, updated_by))
            return SimpleNamespace(value=patch)

    class FakeDomainBindingService:
        def __init__(self, settings):
            pass

        async def list_bindings_for_project(self, *, project_id):
            assert project_id == created_project_id
            return [SimpleNamespace(**domain.model_dump())]

        def to_out(self, binding):
            return domain.model_dump(mode="json", by_alias=True)

    async def fake_bootstrap_created_project_content(*, project, request, settings, user_id, arguments, domain):
        nonlocal bootstrap_call
        bootstrap_call = (
            project.id,
            request,
            user_id,
            arguments.name,
            domain.hostname if domain is not None else None,
        )
        return workspace_actions._CreatedProjectContentBootstrap(
            content_model=content_model,
            content_item=content_item,
            content_version=content_version,
            release=release,
            reusable_block_model=reusable_block_model,
        )

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
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    monkeypatch.setattr(workspace_actions, "ProjectSettingsService", FakeProjectSettingsService)
    monkeypatch.setattr(workspace_actions, "DomainBindingService", FakeDomainBindingService)
    monkeypatch.setattr(workspace_actions, "_bootstrap_created_project_content", fake_bootstrap_created_project_content)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_project",
            {
                "name": "SaaS 落地页",
                "description": "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。",
                "authoringMode": "builder_managed",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            message="帮我创建一个 SaaS 落地页",
            mode=AgentConversationMode.BUILD,
        ),
        request=cast(workspace_actions.Request, request),
        user_id=user_id,
        settings=Settings(),
    )

    assert resolved_call == (workspace_id, user_id)
    assert permission_call == ("system:content:manage", user_id, workspace_id)
    assert create_call is not None
    created_workspace_id, payload, actor_user_id = create_call
    assert created_workspace_id == workspace_id
    assert payload.workspace_id == workspace_id
    assert payload.authoring_mode == "builder_managed"
    assert payload.name == "SaaS 落地页"
    assert payload.description == "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。"
    assert payload.slug is None
    assert actor_user_id == user_id
    assert len(settings_patch_calls) == 1
    settings_project_id, settings_patch, settings_actor_id = settings_patch_calls[0]
    assert settings_project_id == created_project_id
    assert settings_actor_id == user_id
    assert settings_patch["site"] == {
        "name": "SaaS 落地页",
        "description": "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。",
        "url": "https://saas-landing.arclayer.localhost",
    }
    assert settings_patch["site_localization"] == {
        "supported_locales": ["zh-CN", "en-US"],
        "default_locale": "zh-CN",
        "fallback_locale": "en-US",
        "locale": "zh-CN",
        "timezone": "Asia/Shanghai",
        "date_format": "YYYY-MM-DD",
    }
    assert settings_patch["seo"]["default_title"] == "SaaS 落地页"
    assert settings_patch["seo"]["default_description"] == "用于展示 SaaS 产品价值、功能亮点与转化入口的落地页项目。"
    assert settings_patch["seo"]["robots_directive"] == "index,follow"
    assert settings_patch["seo"]["sitemap_enabled"] is True
    assert settings_patch["seo"]["title_policy_v1"]["home_mode"] == "siteOnly"
    assert settings_patch["analytics"] == {
        "google_analytics": {
            "enabled": False,
            "measurement_id": None,
        }
    }
    assert settings_patch["project_source"] == {
        "framework": "react_vite",
        "source_provider": "managed",
        "package_manager": "pnpm",
        "root_directory": ".",
        "build_command": "pnpm build",
        "output_directory": "dist",
        "artifact_strategy": "object_storage",
    }
    source_paths = [file.path for file in source_manifest.files]
    assert source_paths == [
        ".env.example",
        ".gitignore",
        "README.md",
        "package.json",
        "index.html",
        "tsconfig.json",
        "tsconfig.app.json",
        "tsconfig.node.json",
        "vite.config.ts",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/App.tsx",
        "src/index.css",
        "src/arclayer/runtime.ts",
        "src/arclayer/site-config.ts",
        "src/arclayer/content.ts",
    ]
    assert source_write_calls == []
    assert bootstrap_call == (
        created_project_id,
        request,
        user_id,
        "SaaS 落地页",
        "saas-landing.arclayer.localhost",
    )
    assert response.data is not None
    assert response.data.action == "create_project"
    assert response.data.kind == "tool_call"
    assert response.data.tool_calls[0].tool_name == "workspace.create_project"
    assert [tool_call.tool_name for tool_call in response.data.tool_calls] == [
        "workspace.create_project",
        "workspace.read_project_source",
        "workspace.create_content_model",
        "workspace.create_content_model",
        "workspace.create_content_item",
        "workspace.create_site_structure",
        "workspace.publish_project_release",
    ]
    source_tool_files = response.data.tool_calls[1].arguments["files"]
    assert len(source_tool_files) == 16
    assert source_tool_files[0] == {"language": "dotenv", "path": ".env.example", "role": "config"}
    assert source_tool_files[-2] == {
        "language": "typescript",
        "path": "src/arclayer/site-config.ts",
        "role": "config",
    }
    assert source_tool_files[-1] == {
        "language": "typescript",
        "path": "src/arclayer/content.ts",
        "role": "content",
    }
    assert response.data.tool_calls[2].arguments == {
        "modelId": str(content_model.id),
        "modelKey": "page",
    }
    assert response.data.tool_calls[3].arguments == {
        "modelId": str(reusable_block_model.id),
        "modelKey": "reusableBlock",
    }
    assert response.data.tool_calls[4].arguments == {
        "itemId": str(content_item.id),
        "modelKey": "page",
    }
    assert response.data.tool_calls[5].arguments == {
        "routePath": "/",
        "hierarchyRootItemId": str(content_item.id),
        "hierarchyNodeCount": 1,
        "componentBindings": [
            {
                "componentKey": "landing.hero",
                "bindingKey": "headline",
                "payload": {"field": "heroHeadline"},
            },
            {
                "componentKey": "landing.hero",
                "bindingKey": "subheading",
                "payload": {"field": "heroSubheading"},
            },
            {
                "componentKey": "landing.hero",
                "bindingKey": "primaryCtaLabel",
                "payload": {"field": "primaryCtaLabel"},
            },
            {
                "componentKey": "landing.sections",
                "bindingKey": "items",
                "payload": {"field": "sections"},
            },
        ],
    }
    assert response.data.tool_calls[6].arguments == {
        "releaseId": str(release.release.id),
        "releaseNumber": 3,
        "selectionCount": 1,
    }
    assert [step.id for step in response.data.execution_steps] == [
        "planner",
        "project",
        "domain",
        "source",
        "content-model",
        "reusable-block-model",
        "content-item",
        "site-structure",
        "release",
        "editor",
    ]
    assert response.data.execution_steps[2].detail == "已登记平台域名，可在网站控制中查看"
    assert response.data.execution_steps[3].detail == "16 个源码文件 · React+Vite"
    assert response.data.execution_steps[3].tool_name == "workspace.read_project_source"
    assert response.data.execution_steps[4].tool_name == "workspace.create_content_model"
    assert response.data.execution_steps[5].detail == "reusableBlock"
    assert response.data.execution_steps[5].tool_name == "workspace.create_content_model"
    assert response.data.execution_steps[6].tool_name == "workspace.create_content_item"
    assert response.data.execution_steps[7].detail == "/ · 4 个组件绑定"
    assert response.data.execution_steps[7].tool_name == "workspace.create_site_structure"
    assert response.data.execution_steps[8].detail == "Release 3"
    assert response.data.execution_steps[8].tool_name == "workspace.publish_project_release"
    assert response.data.project is not None
    assert response.data.content_model == content_model
    assert response.data.content_models == [content_model, reusable_block_model]
    assert response.data.content_item == content_item
    assert response.data.content_version == content_version
    assert response.data.release == release
    assert response.data.domain == domain
    assert response.data.source_manifest is not None
    assert response.data.source_manifest.files == source_manifest.files
    assert "首页内容" in response.data.content
    assert "React+Vite 项目源码文件" in response.data.content
    assert "saas-landing.arclayer.localhost" not in response.data.content
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{response.data.project.id}/editor"


@pytest.mark.asyncio
async def test_bootstrap_created_project_content_syncs_homepage_route_binding(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    tenant_context = SimpleNamespace(organization_id=organization_id)
    project = _project(id=project_id, workspace_id=workspace_id, name="企业官网")
    content_model = ContentModelMutationOut.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        singular_key="page",
        plural_key="pages",
        name="Page",
        description="Website pages generated and maintained by Arclayer AI.",
        protocol_key="page",
        protocol_version=1,
        system_managed=True,
        system_field_keys=["title", "path"],
        model_kind="collection_type",
        draft_contract_revision=1,
        published_contract_revision=1,
        default_role="page",
        default_posture="page",
        default_surface="structured",
        starter_pack_policy=None,
        surface_policy=None,
        impact=ContentModelImpactOut(),
    )
    reusable_block_model = ContentModelMutationOut.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=site_id,
        singular_key="reusableBlock",
        plural_key="reusableBlocks",
        name="Reusable Block",
        description="Reusable visual block for page sections, layout fragments, and AI-assisted composition.",
        protocol_key=None,
        protocol_version=None,
        system_managed=False,
        system_field_keys=[],
        model_kind="collection_type",
        draft_contract_revision=1,
        published_contract_revision=1,
        default_role="reusable-section",
        default_posture="composition",
        default_surface="canvas",
        starter_pack_policy={"mode": "section"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
        impact=ContentModelImpactOut(),
    )
    content_item = _content_item(workspace_id=workspace_id, title="Home", model_key="page")
    draft_version = _content_version(
        item_id=content_item.id,
        version_number=1,
        fields={"title": "企业官网", "path": "/"},
    )
    published_version = _content_version(
        item_id=content_item.id,
        version_number=1,
        fields={"title": "企业官网", "path": "/"},
    )
    release = workspace_actions.ReleasePublishOut.model_construct(
        release=SimpleNamespace(id=uuid4(), release_number=1),
        selected_items=1,
        previous_active_release_id=None,
    )
    model_payloads = []
    item_payloads = []
    draft_payloads = []
    bootstrap_payloads = []
    workflow_payloads = []
    hierarchy_payloads = []
    transition_calls: list[dict[str, object]] = []
    release_calls: list[dict[str, object]] = []

    class FakeRuntimeService:
        def __init__(self, settings):
            pass

        async def get_context_by_project(self, *, project_id, actor_user_id):
            assert project_id == project.id
            assert actor_user_id == user_id
            return SimpleNamespace(
                default_locale="zh-CN",
                runtime_id=runtime_id,
                site_id=site_id,
                tenant_context=tenant_context,
            )

    class FakeEnvironmentsService:
        def __init__(self, resolved_tenant_context):
            assert resolved_tenant_context == tenant_context

        async def resolve_environment_target(self, **kwargs):
            assert kwargs["project_id"] == project.id
            return SimpleNamespace(id=environment_id)

    class FakeModelsService:
        def __init__(self, *, repo, settings):
            pass

        async def create_model(self, **kwargs):
            assert kwargs["workspace_id"] == workspace_id
            assert kwargs["site_id"] == site_id
            assert kwargs["environment_id"] == environment_id
            assert kwargs["actor_user_id"] == user_id
            model_payloads.append(kwargs["payload"])
            return kwargs["payload"]

    class FakeReads:
        async def get_item(self, **kwargs):
            assert kwargs["item_id"] == content_item.id
            return content_item

    class FakeItemsService:
        def __init__(self, *, repo, entity_manager, organization_id):
            assert organization_id == tenant_context.organization_id
            self.reads = FakeReads()

        async def create_item(self, **kwargs):
            item_payloads.append(kwargs["payload"])
            return content_item

        async def save_draft_version(self, **kwargs):
            draft_payloads.append(kwargs["payload"])
            return draft_version

        async def apply_bootstrap_shape(self, **kwargs):
            bootstrap_payloads.append(kwargs["payload"])

        async def patch_workflow(self, **kwargs):
            workflow_payloads.append(kwargs["payload"])

        async def transition_version(self, **kwargs):
            transition_calls.append(kwargs)
            return published_version

    class FakeReleasesService:
        def __init__(self, resolved_tenant_context):
            assert resolved_tenant_context == tenant_context

        async def publish_release_out(self, **kwargs):
            release_calls.append(kwargs)
            return release

    class FakeRoutingService:
        def __init__(self, resolved_tenant_context):
            assert resolved_tenant_context == tenant_context

        async def upsert_hierarchy_node(self, **kwargs):
            hierarchy_payloads.append(kwargs)
            return SimpleNamespace(id=uuid4(), item_id=kwargs["item_id"])

    monkeypatch.setattr(workspace_actions, "_request_lifecycle_dispatcher", lambda request: object())
    monkeypatch.setattr(workspace_actions, "ProjectRuntimeService", FakeRuntimeService)
    monkeypatch.setattr(workspace_actions, "ProjectEnvironmentsService", FakeEnvironmentsService)
    monkeypatch.setattr(
        workspace_actions,
        "resolve_project_tenant_context",
        lambda **kwargs: tenant_context,
    )
    monkeypatch.setattr(workspace_actions, "ProjectContentModelsRepository", lambda tenant_context: object())
    monkeypatch.setattr(workspace_actions, "ProjectContentCanonicalModelsService", FakeModelsService)
    monkeypatch.setattr(workspace_actions, "ProjectContentItemsRepository", lambda tenant_context: object())
    monkeypatch.setattr(workspace_actions, "EntityManager", lambda **kwargs: object())
    monkeypatch.setattr(workspace_actions, "ProjectContentCanonicalItemsService", FakeItemsService)
    monkeypatch.setattr(workspace_actions, "ProjectReleasesService", FakeReleasesService)
    monkeypatch.setattr(workspace_actions, "ProjectContentRoutingService", FakeRoutingService)
    monkeypatch.setattr(
        workspace_actions,
        "to_mutation_out",
        lambda model_result: content_model if model_result.singular_key == "page" else reusable_block_model,
    )

    result = await workspace_actions._bootstrap_created_project_content(
        project=project,
        request=cast(workspace_actions.Request, SimpleNamespace()),
        settings=Settings(),
        user_id=user_id,
        arguments=workspace_actions.WorkspaceCreateProjectArgs(
            name="企业官网",
            description="展示企业服务、案例与转化入口的官网项目。",
            authoring_mode=ProjectAuthoringMode.BUILDER_MANAGED,
        ),
        domain=None,
    )

    assert result.content_model == content_model
    assert result.reusable_block_model == reusable_block_model
    assert result.content_item == content_item
    assert result.content_version == published_version
    assert result.release == release
    assert len(model_payloads) == 2
    assert model_payloads[0].singular_key == "page"
    assert model_payloads[1].singular_key == "reusableBlock"
    assert model_payloads[1].default_role == "reusable-section"
    assert model_payloads[1].routing.mode == "none"
    assert item_payloads[0].model_key == "page"
    assert item_payloads[0].title == "Home"
    assert item_payloads[0].locale == "zh-CN"
    assert draft_payloads[0].fields_snapshot["path"] == "/"
    assert [presentation.kind for presentation in draft_payloads[0].presentations] == [
        "form_data",
        "visual_blueprint",
        "slot_mapping",
        "seo",
    ]
    assert draft_payloads[0].presentations[0].payload == draft_payloads[0].fields_snapshot
    visual_payload = cast(dict[str, Any], draft_payloads[0].presentations[1].payload)
    visual_nodes = cast(dict[str, Any], visual_payload["nodesById"])
    hero_node = cast(dict[str, Any], visual_nodes["hero"])
    slot_payload = cast(dict[str, Any], draft_payloads[0].presentations[2].payload)
    seo_payload = cast(dict[str, Any], draft_payloads[0].presentations[3].payload)
    assert hero_node["type"] == "landing.hero"
    assert slot_payload["bindings"] == [
        {
            "componentKey": "landing.hero",
            "bindingKey": "headline",
            "payload": {"field": "heroHeadline"},
        },
        {
            "componentKey": "landing.hero",
            "bindingKey": "subheading",
            "payload": {"field": "heroSubheading"},
        },
        {
            "componentKey": "landing.hero",
            "bindingKey": "primaryCtaLabel",
            "payload": {"field": "primaryCtaLabel"},
        },
        {
            "componentKey": "landing.sections",
            "bindingKey": "items",
            "payload": {"field": "sections"},
        },
    ]
    assert seo_payload["robotsDirective"] == "index,follow"
    assert bootstrap_payloads[0].preset_key == "page"
    assert workflow_payloads[0].stage == "approved"
    assert hierarchy_payloads[0]["workspace_id"] == workspace_id
    assert hierarchy_payloads[0]["site_id"] == site_id
    assert hierarchy_payloads[0]["item_id"] == content_item.id
    assert hierarchy_payloads[0]["payload"].parent_item_id is None
    assert hierarchy_payloads[0]["payload"].sort_order == 0
    assert transition_calls[0]["target_state"] == workspace_actions.ContentVersionState.PUBLISHED
    assert release_calls[0]["workspace_id"] == workspace_id
    assert release_calls[0]["site_id"] == site_id


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_rejects_mutation_in_plan_mode(monkeypatch) -> None:
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

    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=uuid4(),
                message="搭一个产品官网",
                mode=AgentConversationMode.PLAN,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_rejects_multi_tool_mutation_in_plan_mode(monkeypatch) -> None:
    _install_planner(
        monkeypatch,
        _tool_calls_decision([
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="list_content_items",
                arguments={},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="update_homepage",
                arguments={"fields": {"heroHeadline": "新标题"}},
            ),
        ]),
    )

    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=uuid4(),
                project_id=uuid4(),
                message="先看一下内容，再改首页标题",
                mode=AgentConversationMode.PLAN,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_keeps_clarification_out_of_plan_steps(monkeypatch) -> None:
    _install_planner(
        monkeypatch,
        workspace_actions.WorkspaceAIPlannerDecision(
            kind="clarification",
            confidence=0.86,
            missing_fields=["公司/品牌名称", "所属行业或业务方向"],
            user_visible_plan="需要先明确官网的核心信息。",
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=uuid4(),
            message="帮我创建一个官网",
            mode=AgentConversationMode.PLAN,
        ),
        user_id=uuid4(),
        settings=Settings(),
    )

    assert response.data is not None
    assert response.data.kind == "clarification"
    assert response.data.content == "需要先明确官网的核心信息。"
    assert response.data.execution_steps == []


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_refines_existing_plan(monkeypatch) -> None:
    _install_planner(
        monkeypatch,
        _tool_decision(
            "refine_plan",
            {
                "title": "企业官网细化方案",
                "summary": "继续拆解企业官网的页面结构、实施步骤和风险处理。",
                "steps": ["确认页面范围", "规划内容模块", "拆分上线检查"],
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=uuid4(),
            message="再细化一下方案",
            mode=AgentConversationMode.PLAN,
        ),
        user_id=uuid4(),
        settings=Settings(),
    )

    assert response.data is not None
    assert response.data.kind == "tool_call"
    assert response.data.action == "refine_plan"
    assert response.data.status == "planned"
    assert response.data.content == "继续拆解企业官网的页面结构、实施步骤和风险处理。"
    assert response.data.tool_calls[0].tool_name == "workspace.refine_plan"
    assert [step.title for step in response.data.execution_steps[1:]] == [
        "确认页面范围",
        "规划内容模块",
        "拆分上线检查",
    ]


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
async def test_execute_workspace_ai_action_creates_multiple_content_models(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    created_names: list[str] = []

    async def fake_create_content_model(*, payload, user_id, settings, arguments):
        created_names.append(arguments.name or "")
        key = f"model{len(created_names)}"
        return ContentModelMutationOut.model_construct(
            id=uuid4(),
            workspace_id=payload.workspace_id,
            site_id=uuid4(),
            singular_key=key,
            plural_key=f"{key}s",
            name=arguments.name,
            description=arguments.description,
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            model_kind="collection_type",
            draft_contract_revision=1,
            published_contract_revision=None,
            impact={},
        )

    monkeypatch.setattr(workspace_actions, "_create_content_model", fake_create_content_model)
    _install_planner(
        monkeypatch,
        _tool_calls_decision([
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="create_content_model",
                arguments={
                    "name": "新闻文章",
                    "description": "管理品牌新闻和发布内容。",
                },
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="create_content_model",
                arguments={
                    "name": "案例展示",
                    "description": "管理客户案例和项目成果。",
                },
            ),
        ]),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="帮我创建一批必要的内容模型吧",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert created_names == ["新闻文章", "案例展示"]
    assert response.data is not None
    assert response.data.action == "create_content_model"
    assert response.data.content_model is not None
    assert [model.name for model in response.data.content_models] == ["新闻文章", "案例展示"]
    assert [tool_call.tool_name for tool_call in response.data.tool_calls] == [
        "workspace.create_content_model",
        "workspace.create_content_model",
    ]
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_executes_multiple_content_model_crud_tool_calls(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    update_model_id = uuid4()
    delete_model_id = uuid4()
    operation_log: list[str] = []

    def content_model_item(*, model_id: UUID, name: str) -> ContentModelOut:
        return ContentModelOut.model_construct(
            id=model_id,
            workspace_id=workspace_id,
            site_id=uuid4(),
            singular_key=name.casefold().replace(" ", ""),
            plural_key=f"{name.casefold().replace(' ', '')}s",
            name=name,
            description=f"{name} description",
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            draft_contract_revision=1,
            published_contract_revision=None,
            updated_by_user_id=None,
            updated_by=None,
            updated_at=datetime.now(UTC),
            category="custom",
            model_kind="collection_type",
            capabilities=["queryable"],
            default_editor="form",
        )

    async def fake_list_content_models(*, payload, user_id, settings, arguments):
        operation_log.append(f"list:{arguments.query or '*'}")
        return PageData[ContentModelOut](
            items=[content_model_item(model_id=update_model_id, name="Hero Section")],
            total=1,
            page=1,
            size=10,
            pages=1,
            next=None,
            prev=None,
        )

    async def fake_create_content_model(*, payload, user_id, settings, arguments):
        operation_log.append(f"create:{arguments.name}")
        return ContentModelMutationOut.model_construct(
            id=uuid4(),
            workspace_id=payload.workspace_id,
            site_id=uuid4(),
            singular_key="landingPage",
            plural_key="landingPages",
            name=arguments.name,
            description=arguments.description,
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            model_kind="collection_type",
            draft_contract_revision=1,
            published_contract_revision=None,
            impact={},
        )

    async def fake_update_content_model(*, payload, user_id, settings, arguments):
        operation_log.append(f"update:{arguments.model_id}:{arguments.name}")
        return ContentModelMutationOut.model_construct(
            id=arguments.model_id,
            workspace_id=payload.workspace_id,
            site_id=uuid4(),
            singular_key="heroSection",
            plural_key="heroSections",
            name=arguments.name,
            description=arguments.description,
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            model_kind="component",
            draft_contract_revision=2,
            published_contract_revision=None,
            impact={},
        )

    async def fake_delete_content_model(*, payload, user_id, settings, arguments):
        operation_log.append(f"delete:{arguments.model_id}")

    monkeypatch.setattr(workspace_actions, "_list_content_models", fake_list_content_models)
    monkeypatch.setattr(workspace_actions, "_create_content_model", fake_create_content_model)
    monkeypatch.setattr(workspace_actions, "_update_content_model", fake_update_content_model)
    monkeypatch.setattr(workspace_actions, "_delete_content_model", fake_delete_content_model)
    _install_planner(
        monkeypatch,
        _tool_calls_decision([
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="list_content_models",
                arguments={"query": "landing"},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="create_content_model",
                arguments={"name": "Landing Page", "description": "Website landing pages."},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="update_content_model",
                arguments={
                    "modelId": str(update_model_id),
                    "name": "Hero Section",
                    "description": "Reusable homepage hero section.",
                },
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="delete_content_model",
                arguments={"modelId": str(delete_model_id)},
            ),
        ]),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="先看模型，再创建页面模型、更新 Hero、删除旧模型",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert operation_log == [
        "list:landing",
        "create:Landing Page",
        f"update:{update_model_id}:Hero Section",
        f"delete:{delete_model_id}",
        "list:*",
    ]
    assert response.data is not None
    assert response.data.action == "list_content_models"
    assert [tool_call.tool_name for tool_call in response.data.tool_calls] == [
        "workspace.list_content_models",
        "workspace.create_content_model",
        "workspace.update_content_model",
        "workspace.delete_content_model",
    ]
    assert [model.name for model in response.data.content_models] == ["Landing Page", "Hero Section"]
    assert response.data.deleted_content_model_id == delete_model_id
    assert [model.name for model in response.data.content_model_items] == ["Hero Section"]
    assert response.data.total == 1
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_lists_content_models(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    model_id = uuid4()
    list_call: tuple[WorkspaceAIActionRequest, str | None] | None = None
    model = ContentModelOut.model_construct(
        id=model_id,
        workspace_id=workspace_id,
        site_id=uuid4(),
        singular_key="article",
        plural_key="articles",
        name="Article",
        description="Editorial articles",
        protocol_key=None,
        protocol_version=1,
        system_managed=False,
        system_field_keys=[],
        draft_contract_revision=1,
        published_contract_revision=None,
        updated_by_user_id=None,
        updated_by=None,
        updated_at=datetime.now(UTC),
        category="custom",
        model_kind="collection_type",
        capabilities=["queryable"],
        default_editor="form",
    )

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_list_content_models(*, payload, user_id, settings, arguments):
        nonlocal list_call
        list_call = (payload, arguments.query)
        return PageData[ContentModelOut](
            items=[model],
            total=1,
            page=1,
            size=10,
            pages=1,
            next=None,
            prev=None,
        )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_list_content_models", fake_list_content_models)
    _install_planner(monkeypatch, _tool_decision("list_content_models", {"query": "article"}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="读取内容模型",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert list_call is not None
    assert list_call[0].project_id == project_id
    assert list_call[1] == "article"
    assert response.data is not None
    assert response.data.action == "list_content_models"
    assert response.data.content_model_items == [model]
    assert response.data.total == 1
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_updates_content_model(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    model_id = uuid4()
    update_call: tuple[UUID, str | None] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_update_content_model(*, payload, user_id, settings, arguments):
        nonlocal update_call
        update_call = (arguments.model_id, arguments.name)
        return ContentModelMutationOut.model_construct(
            id=arguments.model_id,
            workspace_id=payload.workspace_id,
            site_id=uuid4(),
            singular_key="article",
            plural_key="articles",
            name=arguments.name,
            description=arguments.description,
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            model_kind="collection_type",
            draft_contract_revision=2,
            published_contract_revision=None,
            impact={},
        )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_update_content_model", fake_update_content_model)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "update_content_model",
            {"modelId": str(model_id), "name": "Article", "description": "Editorial articles"},
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="更新内容模型名称",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert update_call == (model_id, "Article")
    assert response.data is not None
    assert response.data.action == "update_content_model"
    assert response.data.content_model is not None
    assert response.data.content_model.id == model_id
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models/edit?modelId={model_id}"


@pytest.mark.asyncio
async def test_update_content_model_metadata_uses_impact_preview_token(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    model_id = uuid4()
    calls: list[str] = []

    class FakeModelService:
        async def preview_model_update(self, **kwargs):
            calls.append(f"preview:{kwargs['payload'].name}:{kwargs['payload'].impact_preview_token}")
            return SimpleNamespace(preview_token="signed-preview-token")

        async def update_model(self, **kwargs):
            calls.append(f"update:{kwargs['payload'].name}:{kwargs['payload'].impact_preview_token}")
            return SimpleNamespace(
                record=SimpleNamespace(
                    id=model_id,
                    workspace_id=workspace_id,
                    site_id=site_id,
                    singular_key="caseStudy",
                    plural_key="caseStudies",
                    name=kwargs["payload"].name,
                    description=kwargs["payload"].description,
                    protocol_key=None,
                    protocol_version=1,
                    is_system_managed=False,
                    system_field_keys=[],
                    model_kind="collection_type",
                    draft_contract_revision=2,
                    published_contract_revision=None,
                    default_role=None,
                    default_posture=None,
                    default_surface=None,
                    starter_pack_policy=None,
                    surface_policy=None,
                ),
                impact=ContentModelImpactOut(),
            )

    async def fake_resolve_content_model_action_context(**kwargs):
        return SimpleNamespace(workspace_id=workspace_id), FakeModelService(), site_id, None

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_model_action_context",
        fake_resolve_content_model_action_context,
    )

    result = await workspace_actions._update_content_model(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=uuid4(),
            message="更新模型",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        arguments=workspace_actions.WorkspaceUpdateContentModelArgs(
            modelId=model_id,
            name="Case Study",
            description="Customer proof pages.",
        ),
    )

    assert calls == ["preview:Case Study:None", "update:Case Study:signed-preview-token"]
    assert result.id == model_id
    assert result.name == "Case Study"


@pytest.mark.asyncio
async def test_update_content_model_applies_field_mutations_in_order(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    model_id = uuid4()
    calls: list[str] = []

    def model_out(revision: int) -> ContentModelOut:
        return ContentModelOut.model_construct(
            id=model_id,
            workspace_id=workspace_id,
            site_id=site_id,
            singular_key="caseStudy",
            plural_key="caseStudies",
            name="Case Study",
            description="Customer proof pages.",
            protocol_key=None,
            protocol_version=1,
            system_managed=False,
            system_field_keys=[],
            draft_contract_revision=revision,
            published_contract_revision=None,
            updated_by_user_id=user_id,
            updated_by=None,
            updated_at=datetime.now(UTC),
            category="site_builder",
            model_kind="collection_type",
            capabilities=["queryable"],
            default_editor="form",
        )

    class FakeModelService:
        async def add_model_field(self, **kwargs):
            payload = kwargs["payload"]
            calls.append(f"add:{payload.key}:{payload.label}:{payload.scalar}:{payload.required}")
            return model_out(2)

        async def update_model_field(self, **kwargs):
            payload = kwargs["payload"]
            calls.append(f"update:{kwargs['field_key']}:{payload.label}:{payload.required}:{payload.config}")
            return model_out(3)

        async def delete_model_field(self, **kwargs):
            calls.append(f"delete:{kwargs['field_key']}")
            return model_out(4)

        async def reorder_model_fields(self, **kwargs):
            calls.append(f"reorder:{','.join(kwargs['field_keys'])}")
            return model_out(5)

    async def fake_resolve_content_model_action_context(**kwargs):
        return SimpleNamespace(workspace_id=workspace_id), FakeModelService(), site_id, None

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_model_action_context",
        fake_resolve_content_model_action_context,
    )

    result = await workspace_actions._update_content_model(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=uuid4(),
            message="给模型添加字段",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        arguments=workspace_actions.WorkspaceUpdateContentModelArgs(
            modelId=model_id,
            fieldMutations=[
                {
                    "action": "add",
                    "key": "headline",
                    "label": "Headline",
                    "scalar": "text",
                    "required": True,
                },
                {
                    "action": "update",
                    "key": "headline",
                    "label": "Hero headline",
                    "required": False,
                    "config": {"unique": False},
                },
                {"action": "delete", "key": "legacyHeadline"},
            ],
            fieldOrder=["headline"],
        ),
    )

    assert calls == [
        "add:headline:Headline:text:True",
        "update:headline:Hero headline:False:{'unique': False}",
        "delete:legacyHeadline",
        "reorder:headline",
    ]
    assert result.id == model_id
    assert result.draft_contract_revision == 5


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_deletes_content_model(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    model_id = uuid4()
    delete_call: UUID | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_delete_content_model(*, payload, user_id, settings, arguments):
        nonlocal delete_call
        delete_call = arguments.model_id

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_delete_content_model", fake_delete_content_model)
    _install_planner(monkeypatch, _tool_decision("delete_content_model", {"modelId": str(model_id)}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="删除这个内容模型",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert delete_call == model_id
    assert response.data is not None
    assert response.data.action == "delete_content_model"
    assert response.data.deleted_content_model_id == model_id
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/models"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_lists_content_items(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="首页", model_key="page")
    list_call: str | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_list_content_items(*, payload, user_id, settings, arguments):
        nonlocal list_call
        list_call = arguments.model_key
        return PageData[ContentItemOut](
            items=[item],
            total=1,
            page=1,
            size=10,
            pages=1,
            next=None,
            prev=None,
        )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_list_content_items", fake_list_content_items)
    _install_planner(monkeypatch, _tool_decision("list_content_items", {"modelKey": "page"}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="读取内容库页面",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert list_call == "page"
    assert response.data is not None
    assert response.data.action == "list_content_items"
    assert response.data.content_item == item
    assert response.data.content_items == [item]
    assert response.data.total == 1
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/library"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_creates_content_item(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="首页", model_key="page")
    version = _content_version(item_id=item.id, version_number=2, fields={"headline": "Hello"})
    create_call: dict[str, object] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_create_content_item(*, payload, user_id, settings, request, arguments):
        nonlocal create_call
        create_call = {
            "model_key": arguments.model_key,
            "title": arguments.title,
            "fields": arguments.fields,
            "request": request,
        }
        return item, version

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(lifecycle_dispatcher=object())))
    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_create_content_item", fake_create_content_item)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "create_content_item",
            {"modelKey": "page", "title": "首页", "fields": {"headline": "Hello"}},
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="创建首页内容",
            mode=AgentConversationMode.BUILD,
        ),
        request=cast(workspace_actions.Request, request),
        user_id=user_id,
        settings=Settings(),
    )

    assert create_call == {
        "model_key": "page",
        "title": "首页",
        "fields": {"headline": "Hello"},
        "request": request,
    }
    assert response.data is not None
    assert response.data.action == "create_content_item"
    assert response.data.content_item == item
    assert response.data.content_version == version
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/library/{item.id}"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_updates_content_item(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="首页", model_key="page")
    version = _content_version(item_id=item.id, version_number=3, fields={"headline": "Updated"})
    update_call: dict[str, object] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_update_content_item(*, payload, user_id, settings, request, arguments):
        nonlocal update_call
        update_call = {
            "item_id": arguments.item_id,
            "fields": arguments.fields,
            "expected_version": arguments.expected_version,
        }
        return item, version

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_update_content_item", fake_update_content_item)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "update_content_item",
            {"itemId": str(item.id), "fields": {"headline": "Updated"}, "expectedVersion": 2},
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="更新首页文案",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert update_call == {
        "item_id": item.id,
        "fields": {"headline": "Updated"},
        "expected_version": 2,
    }
    assert response.data is not None
    assert response.data.action == "update_content_item"
    assert response.data.content_item == item
    assert response.data.content_version == version
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/library/{item.id}"


@pytest.mark.asyncio
async def test_create_content_item_saves_routable_path_in_canonical_draft(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    runtime_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="About", model_key="page")
    version = _content_version(item_id=item.id, version_number=1, fields={"title": "About", "path": "/about"})
    saved_payloads: list[ContentVersionDraftSaveIn] = []

    class FakeReads:
        async def get_item(self, **kwargs):
            return item

    class FakeContentItemService:
        reads = FakeReads()

        async def create_item(self, **kwargs):
            return item

        async def save_draft_version(self, **kwargs):
            saved_payloads.append(kwargs["payload"])
            return version

    async def fake_resolve_content_item_write_context(**kwargs):
        return (
            SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
            FakeContentItemService(),
            site_id,
            environment_id,
            runtime_id,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_item_write_context",
        fake_resolve_content_item_write_context,
    )

    created_item, created_version = await workspace_actions._create_content_item(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="创建关于我们页面",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        request=cast(workspace_actions.Request, SimpleNamespace()),
        arguments=workspace_actions.WorkspaceCreateContentItemArgs.model_validate({
            "modelKey": "page",
            "title": "About",
            "locale": "zh-CN",
            "fields": {"title": "About", "path": "/about"},
        }),
    )

    assert created_item == item
    assert created_version == version
    assert saved_payloads[0].fields_snapshot == {"title": "About", "path": "/about"}
    assert [presentation.kind for presentation in saved_payloads[0].presentations] == [
        "form_data",
        "visual_blueprint",
        "slot_mapping",
        "seo",
    ]
    assert saved_payloads[0].presentations[0].payload == {"title": "About", "path": "/about"}
    visual_payload = cast(dict[str, Any], saved_payloads[0].presentations[1].payload)
    visual_nodes = cast(dict[str, Any], visual_payload["nodesById"])
    hero_node = cast(dict[str, Any], visual_nodes["hero"])
    slot_payload = cast(dict[str, Any], saved_payloads[0].presentations[2].payload)
    bindings = cast(list[dict[str, Any]], slot_payload["bindings"])
    seo_payload = cast(dict[str, Any], saved_payloads[0].presentations[3].payload)
    assert hero_node["type"] == "landing.hero"
    assert bindings[0] == {
        "componentKey": "landing.hero",
        "bindingKey": "headline",
        "payload": {"field": "heroHeadline"},
    }
    assert seo_payload["canonicalUrl"] == "/about"


@pytest.mark.asyncio
async def test_create_content_item_can_publish_initial_draft(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    runtime_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="Hero Block", model_key="reusableBlock")
    draft_version = _content_version(
        item_id=item.id,
        version_number=1,
        fields={"title": "Hero Block", "sectionKey": "hero"},
    )
    published_version = draft_version.model_copy(update={"state": "published"})
    transition_calls: list[dict[str, object]] = []

    class FakeReads:
        async def get_item(self, **kwargs):
            return item

    class FakeContentItemService:
        reads = FakeReads()

        async def create_item(self, **kwargs):
            return item

        async def save_draft_version(self, **kwargs):
            return draft_version

        async def transition_version(self, **kwargs):
            transition_calls.append(kwargs)
            return published_version

    async def fake_resolve_content_item_write_context(**kwargs):
        return (
            SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
            FakeContentItemService(),
            site_id,
            environment_id,
            runtime_id,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_item_write_context",
        fake_resolve_content_item_write_context,
    )

    created_item, created_version = await workspace_actions._create_content_item(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="创建并发布一个 Hero 可复用区块",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        request=cast(workspace_actions.Request, SimpleNamespace()),
        arguments=workspace_actions.WorkspaceCreateContentItemArgs.model_validate({
            "modelKey": "reusableBlock",
            "title": "Hero Block",
            "fields": {"title": "Hero Block", "sectionKey": "hero"},
            "publish": True,
        }),
    )

    assert created_item == item
    assert created_version == published_version
    assert transition_calls[0]["project_id"] == project_id
    assert transition_calls[0]["runtime_id"] == runtime_id
    assert transition_calls[0]["item_id"] == item.id
    assert transition_calls[0]["version_number"] == 1
    assert transition_calls[0]["target_state"] == workspace_actions.ContentVersionState.PUBLISHED


@pytest.mark.asyncio
async def test_update_content_item_saves_routable_path_in_canonical_draft(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    runtime_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="About", model_key="page")
    version = _content_version(item_id=item.id, version_number=2, fields={"title": "About", "path": "/about"})
    saved_payloads: list[ContentVersionDraftSaveIn] = []

    class FakeReads:
        async def get_item(self, **kwargs):
            return item

    class FakeContentItemService:
        reads = FakeReads()

        async def save_draft_version(self, **kwargs):
            saved_payloads.append(kwargs["payload"])
            return version

    async def fake_resolve_content_item_write_context(**kwargs):
        return (
            SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
            FakeContentItemService(),
            site_id,
            environment_id,
            runtime_id,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_item_write_context",
        fake_resolve_content_item_write_context,
    )

    updated_item, updated_version = await workspace_actions._update_content_item(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把关于我们页面路径改为 /about",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        request=cast(workspace_actions.Request, SimpleNamespace()),
        arguments=workspace_actions.WorkspaceUpdateContentItemArgs.model_validate({
            "itemId": item.id,
            "fields": {"title": "About", "path": "/about"},
            "expectedVersion": 1,
        }),
    )

    assert updated_item == item
    assert updated_version == version
    assert saved_payloads[0].expected_version == 1
    assert saved_payloads[0].fields_snapshot == {"title": "About", "path": "/about"}
    assert [presentation.kind for presentation in saved_payloads[0].presentations] == [
        "form_data",
        "visual_blueprint",
        "slot_mapping",
        "seo",
    ]
    assert saved_payloads[0].presentations[0].payload == {"title": "About", "path": "/about"}
    slot_payload = cast(dict[str, Any], saved_payloads[0].presentations[2].payload)
    bindings = cast(list[dict[str, Any]], slot_payload["bindings"])
    assert bindings[3] == {
        "componentKey": "landing.sections",
        "bindingKey": "items",
        "payload": {"field": "sections"},
    }


@pytest.mark.asyncio
async def test_update_content_item_can_publish_saved_draft(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    runtime_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="About", model_key="page")
    draft_version = _content_version(item_id=item.id, version_number=2, fields={"title": "About", "path": "/about"})
    published_version = draft_version.model_copy(update={"state": "published"})
    transition_calls: list[dict[str, object]] = []

    class FakeReads:
        async def get_item(self, **kwargs):
            return item

    class FakeContentItemService:
        reads = FakeReads()

        async def save_draft_version(self, **kwargs):
            return draft_version

        async def transition_version(self, **kwargs):
            transition_calls.append(kwargs)
            return published_version

    async def fake_resolve_content_item_write_context(**kwargs):
        return (
            SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
            FakeContentItemService(),
            site_id,
            environment_id,
            runtime_id,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_item_write_context",
        fake_resolve_content_item_write_context,
    )

    updated_item, updated_version = await workspace_actions._update_content_item(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把关于我们页面发布",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        request=cast(workspace_actions.Request, SimpleNamespace()),
        arguments=workspace_actions.WorkspaceUpdateContentItemArgs.model_validate({
            "itemId": item.id,
            "fields": {"title": "About", "path": "/about"},
            "expectedVersion": 1,
            "publish": True,
        }),
    )

    assert updated_item == item
    assert updated_version == published_version
    assert transition_calls[0]["project_id"] == project_id
    assert transition_calls[0]["runtime_id"] == runtime_id
    assert transition_calls[0]["item_id"] == item.id
    assert transition_calls[0]["version_number"] == 2
    assert transition_calls[0]["target_state"] == workspace_actions.ContentVersionState.PUBLISHED


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_updates_homepage_without_item_id(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    item = _content_item(workspace_id=workspace_id, title="首页", model_key="page")
    version = _content_version(item_id=item.id, version_number=4, fields={"heroHeadline": "Updated"})
    update_call: dict[str, object] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_update_homepage(*, payload, user_id, settings, request, arguments):
        nonlocal update_call
        update_call = {
            "model_key": arguments.model_key,
            "title": arguments.title,
            "path": arguments.path,
            "fields": arguments.fields,
            "publish": arguments.publish,
            "request": request,
        }
        return item, version

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(lifecycle_dispatcher=object())))
    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_update_homepage", fake_update_homepage)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "update_homepage",
            {
                "modelKey": "page",
                "title": "首页",
                "path": "/",
                "fields": {"heroHeadline": "Updated"},
                "publish": True,
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把首页 Hero 改成 Updated 并发布",
            mode=AgentConversationMode.BUILD,
        ),
        request=cast(workspace_actions.Request, request),
        user_id=user_id,
        settings=Settings(),
    )

    assert update_call == {
        "model_key": "page",
        "title": "首页",
        "path": "/",
        "fields": {"heroHeadline": "Updated"},
        "publish": True,
        "request": request,
    }
    assert response.data is not None
    assert response.data.action == "update_homepage"
    assert response.data.content_item == item
    assert response.data.content_version == version
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/editor"


@pytest.mark.asyncio
async def test_update_homepage_saves_path_in_canonical_draft(monkeypatch) -> None:
    workspace_id = uuid4()
    project_id = uuid4()
    user_id = uuid4()
    site_id = uuid4()
    environment_id = uuid4()
    runtime_id = uuid4()
    homepage = _content_item(workspace_id=workspace_id, title="Home", model_key="page")
    current_version = _content_version(
        item_id=homepage.id,
        version_number=1,
        fields={"heroHeadline": "Old", "path": "/", "sections": [{"kind": "hero"}]},
    )
    saved_version = _content_version(
        item_id=homepage.id,
        version_number=2,
        fields={"heroHeadline": "New", "path": "/company", "sections": [{"kind": "hero"}]},
    )
    saved_payloads: list[ContentVersionDraftSaveIn] = []

    class FakeReads:
        async def list_items_paginated(self, **kwargs):
            return PageData[ContentItemOut](
                items=[homepage],
                total=1,
                page=1,
                size=200,
                pages=1,
                next=None,
                prev=None,
            )

        async def get_version(self, **kwargs):
            return current_version

        async def get_item(self, **kwargs):
            return homepage

    class FakeContentItemService:
        reads = FakeReads()

        async def save_draft_version(self, **kwargs):
            saved_payloads.append(kwargs["payload"])
            return saved_version

    async def fake_resolve_content_item_write_context(**kwargs):
        return (
            SimpleNamespace(workspace_id=workspace_id, project_id=project_id),
            FakeContentItemService(),
            site_id,
            environment_id,
            runtime_id,
        )

    monkeypatch.setattr(
        workspace_actions,
        "_resolve_content_item_write_context",
        fake_resolve_content_item_write_context,
    )

    item, version = await workspace_actions._update_homepage(
        payload=WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把首页路径改为 /company",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
        request=cast(workspace_actions.Request, SimpleNamespace()),
        arguments=workspace_actions.WorkspaceUpdateHomepageArgs(
            path="/company",
            fields={"heroHeadline": "New"},
        ),
    )

    assert item == homepage
    assert version == saved_version
    assert len(saved_payloads) == 1
    assert saved_payloads[0].expected_version == 1
    assert saved_payloads[0].fields_snapshot == {
        "heroHeadline": "New",
        "path": "/company",
        "sections": [{"kind": "hero"}],
    }
    assert [presentation.kind for presentation in saved_payloads[0].presentations] == [
        "form_data",
        "visual_blueprint",
        "slot_mapping",
        "seo",
    ]
    assert saved_payloads[0].presentations[0].payload == saved_payloads[0].fields_snapshot
    visual_payload = cast(dict[str, Any], saved_payloads[0].presentations[1].payload)
    visual_nodes = cast(dict[str, Any], visual_payload["nodesById"])
    hero_node = cast(dict[str, Any], visual_nodes["hero"])
    hero_props = cast(dict[str, Any], hero_node["props"])
    seo_payload = cast(dict[str, Any], saved_payloads[0].presentations[3].payload)
    assert hero_props["headline"] == "New"
    assert seo_payload["canonicalUrl"] == "/company"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_deletes_content_item(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    item_id = uuid4()
    delete_call: UUID | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_delete_content_item(*, payload, user_id, settings, request, arguments):
        nonlocal delete_call
        delete_call = arguments.item_id

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "_delete_content_item", fake_delete_content_item)
    _install_planner(monkeypatch, _tool_decision("delete_content_item", {"itemId": str(item_id)}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="删除这个内容条目",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert delete_call == item_id
    assert response.data is not None
    assert response.data.action == "delete_content_item"
    assert response.data.deleted_content_item_id == item_id
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/library"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_executes_multiple_content_item_crud_tool_calls(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    delete_item_id = uuid4()
    created_item = _content_item(workspace_id=workspace_id, title="Hero", model_key="page")
    updated_item = _content_item(workspace_id=workspace_id, title="首页", model_key="page")
    created_version = _content_version(item_id=created_item.id, version_number=2, fields={"headline": "Hello"})
    updated_version = _content_version(item_id=updated_item.id, version_number=3, fields={"headline": "Updated"})
    operation_log: list[str] = []

    async def fake_list_content_items(*, payload, user_id, settings, arguments):
        operation_log.append(f"list:{arguments.model_key or '*'}")
        return PageData[ContentItemOut](
            items=[updated_item],
            total=1,
            page=1,
            size=10,
            pages=1,
            next=None,
            prev=None,
        )

    async def fake_create_content_item(*, payload, user_id, settings, request, arguments):
        operation_log.append(f"create:{arguments.model_key}:{arguments.title}:{request is not None}")
        return created_item, created_version

    async def fake_update_content_item(*, payload, user_id, settings, request, arguments):
        operation_log.append(f"update:{arguments.item_id}:{arguments.fields['headline']}:{request is not None}")
        return updated_item, updated_version

    async def fake_delete_content_item(*, payload, user_id, settings, request, arguments):
        operation_log.append(f"delete:{arguments.item_id}:{request is not None}")

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(lifecycle_dispatcher=object())))
    monkeypatch.setattr(workspace_actions, "_list_content_items", fake_list_content_items)
    monkeypatch.setattr(workspace_actions, "_create_content_item", fake_create_content_item)
    monkeypatch.setattr(workspace_actions, "_update_content_item", fake_update_content_item)
    monkeypatch.setattr(workspace_actions, "_delete_content_item", fake_delete_content_item)
    _install_planner(
        monkeypatch,
        _tool_calls_decision([
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="list_content_items",
                arguments={"modelKey": "page"},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="create_content_item",
                arguments={"modelKey": "page", "title": "Hero", "fields": {"headline": "Hello"}},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="update_content_item",
                arguments={"itemId": str(updated_item.id), "fields": {"headline": "Updated"}},
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="delete_content_item",
                arguments={"itemId": str(delete_item_id)},
            ),
        ]),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="先看内容，再创建 Hero、更新首页并删除旧内容",
            mode=AgentConversationMode.BUILD,
        ),
        request=cast(workspace_actions.Request, request),
        user_id=user_id,
        settings=Settings(),
    )

    assert operation_log == [
        "list:page",
        "create:page:Hero:True",
        f"update:{updated_item.id}:Updated:True",
        f"delete:{delete_item_id}:True",
        "list:*",
    ]
    assert response.data is not None
    assert response.data.action == "list_content_items"
    assert [tool_call.tool_name for tool_call in response.data.tool_calls] == [
        "workspace.list_content_items",
        "workspace.create_content_item",
        "workspace.update_content_item",
        "workspace.delete_content_item",
    ]
    assert response.data.content_item == updated_item
    assert response.data.content_items == [updated_item]
    assert response.data.content_version == updated_version
    assert response.data.deleted_content_item_id == delete_item_id
    assert response.data.total == 1
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/content/library"


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
async def test_execute_workspace_ai_action_reads_project_source_manifest(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_call: tuple[str, UUID, UUID] | None = None
    manifest = ProjectSourceManifestOut(
        project_id=project_id,
        framework="react_vite",
        source_provider="managed",
        package_manager="pnpm",
        root_directory=".",
        build_command="pnpm build",
        output_directory="dist",
        artifact_strategy="object_storage",
        files=[
            ProjectSourceFileOut(
                path="src/App.tsx",
                role="entry",
                language="typescriptreact",
                contents="export function App() { return null; }\n",
            )
        ],
    )

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.project_id)

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def get_source_manifest(self, *, project_id):
            assert project_id == manifest.project_id
            return manifest

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    _install_planner(monkeypatch, _tool_decision("read_project_source", {}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="读取这个项目的源码结构",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_call == ("project:settings:read", user_id, project_id)
    assert response.data is not None
    assert response.data.action == "read_project_source"
    assert response.data.source_manifest == manifest
    assert response.data.tool_calls[0].tool_name == "workspace.read_project_source"
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/editor"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_reads_project_source_file(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    expected_project_id = project_id
    source_file = ProjectSourceFileOut(
        path="src/App.tsx",
        role="entry",
        language="typescriptreact",
        contents="export function App() { return <main>Launch</main>; }\n",
    )

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        assert permission == "project:settings:read"
        assert ctx.project_id == project_id

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def get_source_file(self, *, project_id, path):
            assert project_id == expected_project_id
            assert path == "src/App.tsx"
            return source_file

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    _install_planner(monkeypatch, _tool_decision("read_project_source", {"filePath": "src/App.tsx"}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="读取 src/App.tsx",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert response.data is not None
    assert response.data.action == "read_project_source"
    assert response.data.source_file == source_file
    assert response.data.source_manifest is None
    assert response.data.tool_calls[0].arguments["file_path"] == "src/App.tsx"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_updates_site_settings(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_call: tuple[str, UUID, UUID] | None = None
    patch_call: tuple[UUID, dict, UUID | None] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.project_id)

    class FakeProjectSettingsService:
        def __init__(self, settings):
            pass

        async def patch_core(self, *, project_id, patch, updated_by):
            nonlocal patch_call
            patch_call = (project_id, patch, updated_by)
            return workspace_actions.ProjectSettingsDetail(
                namespace="core",
                value=patch,
                secrets={},
                updated_at=None,
            )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSettingsService", FakeProjectSettingsService)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "update_site_settings",
            {
                "siteName": "ArcLayer 企业站",
                "siteDescription": "用于展示企业服务和案例的官网。",
                "defaultTitle": "ArcLayer 企业站",
                "robotsDirective": "index,follow",
                "sitemapEnabled": True,
                "googleAnalyticsMeasurementId": "G-1234567890",
                "framework": "react_vite",
                "buildCommand": "pnpm build",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把这个项目的网站配置改成企业站并配置 GA",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_call == ("project:settings:manage", user_id, project_id)
    assert patch_call == (
        project_id,
        {
            "site": {
                "name": "ArcLayer 企业站",
                "description": "用于展示企业服务和案例的官网。",
            },
            "seo": {
                "default_title": "ArcLayer 企业站",
                "robots_directive": "index,follow",
                "sitemap_enabled": True,
            },
            "project_source": {
                "framework": "react_vite",
                "build_command": "pnpm build",
            },
            "analytics": {
                "google_analytics": {
                    "measurement_id": "G-1234567890",
                    "enabled": True,
                },
            },
        },
        user_id,
    )
    assert response.data is not None
    assert response.data.action == "update_site_settings"
    assert response.data.site_settings is not None
    assert response.data.tool_calls[0].tool_name == "workspace.update_site_settings"
    assert response.data.tool_calls[0].arguments["googleAnalyticsMeasurementId"] == "G-1234567890"
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/settings/general"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_updates_project_source_settings(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_call: tuple[str, UUID, UUID] | None = None
    patch_call: tuple[UUID, dict, UUID | None] | None = None

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.project_id)

    class FakeProjectSettingsService:
        def __init__(self, settings):
            pass

        async def patch_core(self, *, project_id, patch, updated_by):
            nonlocal patch_call
            patch_call = (project_id, patch, updated_by)
            return workspace_actions.ProjectSettingsDetail(
                namespace="core",
                value=patch,
                secrets={},
                updated_at=None,
            )

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSettingsService", FakeProjectSettingsService)
    _install_planner(
        monkeypatch,
        workspace_actions._parse_planner_tool_decision([
            {
                "function": {
                    "name": "workspace_update_project_source_settings",
                    "arguments": json.dumps({
                        "framework": "astro",
                        "sourceProvider": "git",
                        "buildCommand": "pnpm astro build",
                        "user_visible_plan": "切换项目源码配置。",
                    }),
                }
            }
        ]),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把项目源码配置切换到 Astro 和 Git",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_call == ("project:settings:manage", user_id, project_id)
    assert patch_call == (
        project_id,
        {
            "project_source": {
                "framework": "astro",
                "source_provider": "git",
                "build_command": "pnpm astro build",
            }
        },
        user_id,
    )
    assert response.data is not None
    assert response.data.action == "update_site_settings"
    assert response.data.tool_calls[0].tool_name == "workspace.update_project_source_settings"
    assert response.data.execution_steps[1].title == "执行项目源码配置更新"
    assert response.data.execution_steps[1].tool_name == "workspace.update_project_source_settings"
    assert response.data.execution_steps[2].title == "更新项目源码配置并生成项目配置入口"
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/settings/general"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_writes_project_source_file(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_call: tuple[str, UUID, UUID] | None = None
    upsert_call: dict[str, object] | None = None
    source_file = ProjectSourceFileOut(
        path="src/App.tsx",
        role="entry",
        language="typescriptreact",
        contents="export function App() { return null; }\n",
    )

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.project_id)

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def upsert_source_file(self, *, project_id, path, payload, actor_user_id):
            nonlocal upsert_call
            upsert_call = {
                "project_id": project_id,
                "path": path,
                "payload": payload,
                "actor_user_id": actor_user_id,
            }
            return source_file

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "write_project_source_file",
            {
                "path": "src/App.tsx",
                "contents": "export function App() { return null; }\n",
                "language": "typescriptreact",
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="把 App 写成空组件",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_call == ("project:settings:manage", user_id, project_id)
    assert upsert_call is not None
    assert upsert_call["project_id"] == project_id
    assert upsert_call["path"] == "src/App.tsx"
    assert upsert_call["actor_user_id"] == user_id
    payload = cast(workspace_actions.ProjectSourceFileUpsertIn, upsert_call["payload"])
    assert payload.contents == "export function App() { return null; }\n"
    assert payload.language == "typescriptreact"
    assert response.data is not None
    assert response.data.action == "write_project_source_file"
    assert response.data.source_file == source_file
    assert response.data.tool_calls[0].tool_name == "workspace.write_project_source_file"
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/editor"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_writes_project_source_file_and_publishes_release(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    runtime_id = uuid4()
    site_id = uuid4()
    permission_calls: list[tuple[str, UUID, UUID]] = []
    tenant_context = object()
    release = workspace_actions.ReleasePublishOut.model_construct(
        release=SimpleNamespace(id=uuid4(), release_number=9),
        job=None,
        graph_nodes=1,
        selection_count=1,
        impact=SimpleNamespace(),
    )
    publish_calls: list[dict[str, object]] = []
    source_file = ProjectSourceFileOut(
        path="src/App.tsx",
        role="entry",
        language="typescriptreact",
        contents="export function App() { return <main>Published</main>; }\n",
    )

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        permission_calls.append((permission, user_id, ctx.project_id))

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def upsert_source_file(self, *, project_id, path, payload, actor_user_id):
            return source_file

    class FakeRuntimeService:
        def __init__(self, settings):
            pass

        async def get_context_by_project(self, *, project_id, actor_user_id):
            return SimpleNamespace(
                runtime_id=runtime_id,
                site_id=site_id,
                workspace_id=workspace_id,
            )

    class FakeProjectReleasesService:
        def __init__(self, resolved_tenant_context):
            assert resolved_tenant_context == tenant_context

        async def publish_release_out(self, **kwargs):
            publish_calls.append(kwargs)
            return release

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    monkeypatch.setattr(workspace_actions, "ProjectRuntimeService", FakeRuntimeService)
    monkeypatch.setattr(
        workspace_actions,
        "resolve_project_tenant_context",
        lambda **kwargs: tenant_context,
    )
    monkeypatch.setattr(workspace_actions, "ProjectReleasesService", FakeProjectReleasesService)
    _install_planner(
        monkeypatch,
        _tool_decision(
            "write_project_source_file",
            {
                "path": "src/App.tsx",
                "contents": "export function App() { return <main>Published</main>; }\n",
                "language": "typescriptreact",
                "publishRelease": True,
            },
        ),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="更新 App 并发布",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_calls == [
        ("project:settings:manage", user_id, project_id),
        ("project:release:publish", user_id, project_id),
    ]
    assert publish_calls == [
        {
            "workspace_id": workspace_id,
            "site_id": site_id,
            "actor_user_id": user_id,
        }
    ]
    assert response.data is not None
    assert response.data.action == "write_project_source_file"
    assert response.data.source_file == source_file
    assert response.data.release == release
    assert "发布" in response.data.content


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_deletes_project_source_file(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_call: tuple[str, UUID, UUID] | None = None
    delete_call: dict[str, object] | None = None
    deleted = ProjectSourceFileDeleteOut(project_id=project_id, path="src/legacy.ts", deleted=True)

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        nonlocal permission_call
        permission_call = (permission, user_id, ctx.project_id)

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def delete_source_file(self, *, project_id, path, actor_user_id):
            nonlocal delete_call
            delete_call = {
                "project_id": project_id,
                "path": path,
                "actor_user_id": actor_user_id,
            }
            return deleted

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    _install_planner(monkeypatch, _tool_decision("delete_project_source_file", {"path": "src/legacy.ts"}))

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="删除旧源码文件",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_call == ("project:settings:manage", user_id, project_id)
    assert delete_call == {
        "project_id": project_id,
        "path": "src/legacy.ts",
        "actor_user_id": user_id,
    }
    assert response.data is not None
    assert response.data.action == "delete_project_source_file"
    assert response.data.source_file_delete == deleted
    assert response.data.tool_calls[0].tool_name == "workspace.delete_project_source_file"
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/editor"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_executes_multiple_project_source_tool_calls(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()
    user_id = uuid4()
    project_id = uuid4()
    permission_calls: list[tuple[str, UUID, UUID]] = []
    source_files: dict[str, ProjectSourceFileOut] = {
        "src/legacy.ts": ProjectSourceFileOut(
            path="src/legacy.ts",
            role="source",
            language="typescript",
            contents="export const legacy = true;\n",
        )
    }
    upsert_calls: list[tuple[UUID, str, ProjectSourceFileUpsertIn, UUID]] = []
    delete_calls: list[tuple[UUID, str, UUID]] = []

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    async def fake_get_project_context(*, project_id, user_id):
        return SimpleNamespace(project_id=project_id, workspace_id=workspace_id)

    async def fake_ensure_project_permission_granted(permission, *, user_id, ctx, error_code):
        permission_calls.append((permission, user_id, ctx.project_id))

    class FakeProjectSourceService:
        def __init__(self, settings):
            pass

        async def get_source_manifest(self, *, project_id):
            return ProjectSourceManifestOut(
                project_id=project_id,
                framework="react_vite",
                source_provider="managed",
                package_manager="pnpm",
                root_directory=".",
                build_command="pnpm build",
                output_directory="dist",
                artifact_strategy="object_storage",
                files=list(source_files.values()),
            )

        async def upsert_source_file(self, *, project_id, path, payload, actor_user_id):
            upsert_calls.append((project_id, path, payload, actor_user_id))
            source_file = ProjectSourceFileOut(
                path=path,
                role=payload.role or "source",
                language=payload.language or "text",
                contents=payload.contents,
            )
            source_files[path] = source_file
            return source_file

        async def delete_source_file(self, *, project_id, path, actor_user_id):
            delete_calls.append((project_id, path, actor_user_id))
            source_files.pop(path, None)
            return ProjectSourceFileDeleteOut(project_id=project_id, path=path, deleted=True)

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    monkeypatch.setattr(workspace_actions, "get_project_context", fake_get_project_context)
    monkeypatch.setattr(
        workspace_actions,
        "ensure_project_permission_granted",
        fake_ensure_project_permission_granted,
    )
    monkeypatch.setattr(workspace_actions, "ProjectSourceService", FakeProjectSourceService)
    _install_planner(
        monkeypatch,
        _tool_calls_decision([
            workspace_actions.WorkspaceAIPlannerToolCall(tool_name="read_project_source", arguments={}),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="write_project_source_file",
                arguments={
                    "path": "src/App.tsx",
                    "contents": "export function App() { return <main />; }\n",
                    "language": "typescriptreact",
                    "role": "entry",
                },
            ),
            workspace_actions.WorkspaceAIPlannerToolCall(
                tool_name="delete_project_source_file",
                arguments={"path": "src/legacy.ts"},
            ),
        ]),
    )

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            project_id=project_id,
            message="读取源码，更新 App，然后删除旧文件",
            mode=AgentConversationMode.BUILD,
        ),
        user_id=user_id,
        settings=Settings(),
    )

    assert permission_calls == [
        ("project:settings:read", user_id, project_id),
        ("project:settings:manage", user_id, project_id),
        ("project:settings:manage", user_id, project_id),
        ("project:settings:read", user_id, project_id),
    ]
    assert [(project_id, path, actor_id) for project_id, path, _, actor_id in upsert_calls] == [
        (project_id, "src/App.tsx", user_id)
    ]
    assert delete_calls == [(project_id, "src/legacy.ts", user_id)]
    assert response.data is not None
    assert response.data.action == "read_project_source"
    assert [tool_call.tool_name for tool_call in response.data.tool_calls] == [
        "workspace.read_project_source",
        "workspace.write_project_source_file",
        "workspace.delete_project_source_file",
    ]
    assert response.data.source_manifest is not None
    assert {file.path for file in response.data.source_manifest.files} == {"src/App.tsx"}
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{project_id}/editor"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_requires_project_for_source_read(monkeypatch) -> None:
    workspace_id = uuid4()
    organization_id = uuid4()

    async def fake_resolve_workspace_context_by_id(*, workspace_id, user_id):
        return _workspace_context(workspace_id=workspace_id, organization_id=organization_id)

    monkeypatch.setattr(
        workspace_actions,
        "resolve_workspace_context_by_id",
        fake_resolve_workspace_context_by_id,
    )
    _install_planner(monkeypatch, _tool_decision("read_project_source", {}))

    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=workspace_id,
                message="读取项目源码",
                mode=AgentConversationMode.BUILD,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PROJECT_REQUIRED"


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


def _content_item(*, workspace_id: UUID, title: str, model_key: str) -> ContentItemOut:
    now = datetime.now(tz=UTC)
    return ContentItemOut.model_construct(
        id=uuid4(),
        workspace_id=workspace_id,
        site_id=uuid4(),
        model_id=uuid4(),
        model_key=model_key,
        slug=title.casefold().replace(" ", "-"),
        title=title,
        summary=None,
        status="draft",
        visibility="public",
        locale="zh-CN",
        translation_group_id=None,
        draft_version=1,
        published_version=None,
        updated_at=now,
    )


def _content_version(*, item_id: UUID, version_number: int, fields: JsonObject) -> ContentVersionOut:
    return ContentVersionOut.model_construct(
        item_id=item_id,
        version_number=version_number,
        state="draft",
        created_at=datetime.now(tz=UTC),
        created_by_user_id=None,
        last_transition_by_user_id=None,
        fields_snapshot=fields,
        presentations=[],
        change_summary=None,
    )
