from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from src.config import Settings
from src.core.exceptions import BadRequest
from src.models.agents.conversation import AgentConversationMode
from src.models.workspaces.workspace import WorkspaceKind
from src.modules.ai import workspace_actions
from src.modules.ai.workspace_actions import WorkspaceAIActionRequest, execute_workspace_ai_action
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


def test_resolve_workspace_ai_action_detects_project_create_intent() -> None:
    assert workspace_actions.resolve_workspace_ai_action("帮我创建一个随机项目") == "create_project"


def test_resolve_workspace_ai_action_detects_landing_page_create_intent() -> None:
    assert workspace_actions.resolve_workspace_ai_action("帮我创建一个SaaS落地页") == "create_project"
    assert (
        workspace_actions._project_create_request(
            WorkspaceAIActionRequest(workspace_id=uuid4(), message="帮我创建一个SaaS落地页")
        ).name
        == "SaaS 落地页"
    )


def test_project_create_request_generates_domain_description_from_instruction() -> None:
    payload = workspace_actions._project_create_request(
        WorkspaceAIActionRequest(workspace_id=uuid4(), message="帮我创建一个SaaS落地页")
    )

    assert payload.name == "SaaS 落地页"
    assert payload.description is not None
    assert "SaaS 产品落地页" in payload.description


def test_resolve_workspace_ai_action_detects_content_model_create_before_project_create() -> None:
    assert workspace_actions.resolve_workspace_ai_action("帮我的项目创建一个内容模型") == "create_content_model"
    assert workspace_actions.resolve_workspace_ai_action("生成模型") == "create_content_model"


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


def test_resolve_workspace_ai_action_detects_project_list_intent() -> None:
    assert workspace_actions.resolve_workspace_ai_action("查看当前工作区有哪些项目") == "list_projects"


def test_resolve_workspace_ai_action_detects_project_open_intent() -> None:
    assert workspace_actions.resolve_workspace_ai_action("打开项目列表") == "open_projects"


def test_resolve_workspace_ai_action_ignores_generic_chat() -> None:
    assert workspace_actions.resolve_workspace_ai_action("你好，今天状态怎么样？") is None


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

    response = await execute_workspace_ai_action(
        WorkspaceAIActionRequest(
            workspace_id=workspace_id,
            message="帮我创建一个随机项目",
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
    assert payload.slug is None
    assert actor_user_id == user_id
    assert response.data is not None
    assert response.data.action == "create_project"
    assert response.data.project is not None
    assert response.data.navigation is not None
    assert response.data.navigation.path == f"/projects/{response.data.project.id}"


@pytest.mark.asyncio
async def test_execute_workspace_ai_action_rejects_plan_mode_mutations() -> None:
    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=uuid4(),
                message="帮我创建一个随机项目",
                mode=AgentConversationMode.PLAN,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY"


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

    async def fake_create_content_model(*, payload, user_id, settings):
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
async def test_execute_workspace_ai_action_rejects_unsupported_prompt() -> None:
    with pytest.raises(BadRequest) as exc_info:
        await execute_workspace_ai_action(
            WorkspaceAIActionRequest(
                workspace_id=uuid4(),
                message="你好",
                mode=AgentConversationMode.BUILD,
            ),
            user_id=uuid4(),
            settings=Settings(),
        )

    assert exc_info.value.error == "AI_WORKSPACE_ACTION_UNSUPPORTED"


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
