from __future__ import annotations

import json
import re
from typing import Any, Literal, cast
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, Request, status
from pydantic import ConfigDict, Field, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.config import Settings, get_settings
from src.core.entity_manager.manager import EntityManager
from src.core.exceptions import APIError, BadRequest, Forbidden, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.http.response import ApiResponse, ResponseModel
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.llm.runtime import LLMRequestContext, LLMRuntime, LLMRuntimeError
from src.models.agents.conversation import AgentConversationMode
from src.models.content._enums import ContentVersionState
from src.models.projects._enums import ProjectAuthoringMode
from src.models.projects.environment import ProjectEnvironmentKey
from src.modules.auth.http.service import get_current_user_id
from src.modules.commerce.dunning.command_policy import (
    RestrictedRecoveryCommandPolicy,
    build_restricted_recovery_command_policy,
    workspace_ai_action_effects,
)
from src.modules.domains.schema import DomainBindingOut
from src.modules.domains.service import DomainBindingService
from src.modules.projects.content.contracts.schema import (
    ContentItemOut,
    ContentModelDefinitionContract,
    ContentModelFieldContract,
    ContentModelFieldPatchContract,
    ContentModelImpactOut,
    ContentModelOut,
    ContentModelViewContract,
    ContentRoutingContract,
    ContentVersionOut,
    ContentWorkflowContract,
    FieldScalarType,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import (
    ContentItemBootstrapShapeIn,
    ContentItemCreateIn,
    ContentItemWorkflowPatchIn,
    ContentPresentationIn,
    ContentVersionDraftSaveIn,
)
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.models.canonical_service import (
    ContentModelDefinitionPatchContract,
    ProjectContentCanonicalModelsService,
)
from src.modules.projects.content.models.repository import ProjectContentModelsRepository
from src.modules.projects.content.models.router_helpers import ContentModelMutationOut, to_mutation_out
from src.modules.projects.content.routing.schema import HierarchyNodeUpsertIn
from src.modules.projects.content.routing.service import ProjectContentRoutingService
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.projects.http.router_helpers import ensure_project_permission_granted
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.http.service import get_project_context
from src.modules.projects.releases.schema import ReleasePublishOut
from src.modules.projects.releases.service import ProjectReleasesService
from src.modules.projects.runtime.service import ProjectRuntimeService
from src.modules.projects.schema import ProjectCreateRequest, ProjectListItemOut
from src.modules.projects.service import build_project_service
from src.modules.projects.settings.schema import ProjectSettingsDetail
from src.modules.projects.settings.service import ProjectSettingsService
from src.modules.projects.source.schema import (
    ProjectSourceFileDeleteOut,
    ProjectSourceFileOut,
    ProjectSourceFileRole,
    ProjectSourceFileUpsertIn,
    ProjectSourceManifestOut,
)
from src.modules.projects.source.service import ProjectSourceService
from src.modules.tenancy.router_helpers import resolve_project_tenant_context
from src.modules.workspaces.authz.http.service import ensure_workspace_permission_granted
from src.modules.workspaces.http.service import require_workspace_manage_access, resolve_workspace_context_by_id

WorkspaceAIActionKind = Literal[
    "create_project",
    "create_content_model",
    "list_content_models",
    "update_content_model",
    "delete_content_model",
    "list_content_items",
    "create_content_item",
    "update_content_item",
    "update_homepage",
    "delete_content_item",
    "list_projects",
    "open_projects",
    "read_project_source",
    "write_project_source_file",
    "delete_project_source_file",
    "update_site_settings",
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
    "workspace_list_content_models": "list_content_models",
    "workspace_update_content_model": "update_content_model",
    "workspace_delete_content_model": "delete_content_model",
    "workspace_list_content_items": "list_content_items",
    "workspace_create_content_item": "create_content_item",
    "workspace_update_content_item": "update_content_item",
    "workspace_update_homepage": "update_homepage",
    "workspace_delete_content_item": "delete_content_item",
    "workspace_list_projects": "list_projects",
    "workspace_open_projects": "open_projects",
    "workspace_read_project_source": "read_project_source",
    "workspace_write_project_source_file": "write_project_source_file",
    "workspace_delete_project_source_file": "delete_project_source_file",
    "workspace_update_project_source_settings": "update_site_settings",
    "workspace_update_site_settings": "update_site_settings",
    "workspace_refine_plan": "refine_plan",
}
_PROJECT_SOURCE_TOOL_ACTIONS: frozenset[WorkspaceAIActionKind] = frozenset({
    "read_project_source",
    "write_project_source_file",
    "delete_project_source_file",
})
_PROJECT_SOURCE_SETTINGS_FIELDS = frozenset({
    "artifact_strategy",
    "build_command",
    "framework",
    "output_directory",
    "package_manager",
    "root_directory",
    "source_provider",
})
_PROJECT_SOURCE_SETTINGS_ARGUMENT_FIELDS = frozenset({
    "artifactStrategy",
    "artifact_strategy",
    "buildCommand",
    "build_command",
    "framework",
    "outputDirectory",
    "output_directory",
    "packageManager",
    "package_manager",
    "rootDirectory",
    "root_directory",
    "sourceProvider",
    "source_provider",
})
_CONTENT_MODEL_TOOL_ACTIONS: frozenset[WorkspaceAIActionKind] = frozenset({
    "create_content_model",
    "list_content_models",
    "update_content_model",
    "delete_content_model",
})
_CONTENT_ITEM_TOOL_ACTIONS: frozenset[WorkspaceAIActionKind] = frozenset({
    "create_content_item",
    "list_content_items",
    "update_content_item",
    "update_homepage",
    "delete_content_item",
})
_DEFAULT_PROJECT_TITLE_POLICY: dict[str, Any] = {
    "parts": [
        {"kind": "token", "value": "pageTitle"},
        {"kind": "literal", "value": " - "},
        {"kind": "token", "value": "siteName"},
    ],
    "home_mode": "siteOnly",
    "dedupe": True,
}


class _ContentModelToolCallsResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    content_model_items: list[ContentModelOut]
    deleted_model_ids: list[UUID]
    mutation_models: list[ContentModelMutationOut]
    total: int


class _ContentItemToolCallsResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    content_items: list[ContentItemOut]
    content_version: ContentVersionOut | None
    deleted_item_ids: list[UUID]
    mutation_items: list[ContentItemOut]
    total: int


class _CreatedProjectContentBootstrap(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    content_model: ContentModelMutationOut
    content_item: ContentItemOut
    content_version: ContentVersionOut | None
    release: ReleasePublishOut
    reusable_block_model: ContentModelMutationOut


class _ProjectSourceToolCallsResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    release: ReleasePublishOut | None
    source_manifest: ProjectSourceManifestOut


class _SiteUpdateToolCallsResult(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    content: _ContentItemToolCallsResult
    source: _ProjectSourceToolCallsResult


class WorkspaceAIPlannerToolCall(BaseSchema):
    model_config = ConfigDict(
        str_strip_whitespace=False,
        validate_assignment=True,
    )

    tool_name: WorkspaceAIActionKind = Field(..., description="Workspace tool selected by the planner.")
    arguments: JsonObject = Field(default_factory=dict, description="Structured tool arguments.")
    provider_tool_name: str | None = Field(
        default=None,
        description="Original provider tool name before mapping to the stable workspace action.",
    )


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
    authoring_mode: ProjectAuthoringMode = Field(
        ...,
        description="Use builder_managed for visual AI website creation; use source_managed only for explicit source-owned projects.",
    )
    framework: Literal["react_vite", "astro"] | None = Field(
        default=None,
        description="Optional source framework. Defaults to react_vite unless the user explicitly requests Astro.",
    )


class WorkspaceCreateContentModelArgs(BaseSchema):
    name: str | None = Field(default=None, max_length=128, description="Content model display name.")
    description: str | None = Field(default=None, max_length=500, description="Content model purpose summary.")


class WorkspaceListContentModelsArgs(BaseSchema):
    query: str | None = Field(default=None, max_length=128, description="Optional model search query.")


class WorkspaceContentModelFieldMutationArgs(BaseSchema):
    action: Literal["add", "update", "delete"] = Field(..., description="Field mutation action.")
    key: str = Field(..., min_length=1, max_length=64, description="Stable field key.")
    label: str | None = Field(default=None, min_length=1, max_length=128, description="Field label.")
    scalar: FieldScalarType | None = Field(default=None, description="Field scalar type.")
    required: bool | None = Field(default=None, description="Whether the field is required.")
    config: JsonObject | None = Field(default=None, description="Optional field configuration payload.")


class WorkspaceUpdateContentModelArgs(BaseSchema):
    model_id: PublicUUID = Field(..., alias="modelId", description="Content model id to update.")
    name: str | None = Field(default=None, min_length=1, max_length=128, description="New display name.")
    description: str | None = Field(default=None, max_length=500, description="New model description.")
    field_mutations: list[WorkspaceContentModelFieldMutationArgs] = Field(
        default_factory=list,
        alias="fieldMutations",
        description="Optional ordered field mutations. Supports add, update, and delete.",
    )
    field_order: list[str] | None = Field(
        default=None,
        alias="fieldOrder",
        description="Optional complete field key order after field mutations are applied.",
    )


class WorkspaceDeleteContentModelArgs(BaseSchema):
    model_id: PublicUUID = Field(..., alias="modelId", description="Content model id to delete.")


class WorkspaceListContentItemsArgs(BaseSchema):
    model_key: str | None = Field(
        default=None,
        alias="modelKey",
        max_length=64,
        description="Optional content model key filter.",
    )


class WorkspaceCreateContentItemArgs(BaseSchema):
    model_key: str = Field(..., alias="modelKey", min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=256)
    locale: str = Field(default="zh-CN", min_length=2, max_length=16)
    fields: JsonObject = Field(default_factory=dict, description="Optional initial structured field values.")
    publish: bool = Field(default=False, description="Publish the saved initial draft version when true.")
    change_summary: str | None = Field(
        default=None,
        alias="changeSummary",
        max_length=512,
        description="Optional draft change summary when fields are supplied.",
    )


class WorkspaceUpdateContentItemArgs(BaseSchema):
    item_id: PublicUUID = Field(..., alias="itemId", description="Content item id to update.")
    fields: JsonObject = Field(default_factory=dict, description="Structured field values for the new draft version.")
    expected_version: int | None = Field(default=None, alias="expectedVersion", ge=0)
    change_summary: str | None = Field(default=None, alias="changeSummary", max_length=512)
    publish: bool = Field(default=False, description="Publish the saved draft version when true.")


class WorkspaceUpdateHomepageArgs(BaseSchema):
    model_key: str | None = Field(default=None, alias="modelKey", max_length=64)
    title: str | None = Field(default=None, min_length=1, max_length=256)
    path: str | None = Field(default=None, min_length=1, max_length=256)
    fields: JsonObject = Field(default_factory=dict, description="Structured homepage field changes.")
    expected_version: int | None = Field(default=None, alias="expectedVersion", ge=0)
    change_summary: str | None = Field(default=None, alias="changeSummary", max_length=512)
    publish: bool = Field(default=False, description="Publish the saved draft version when true.")


class WorkspaceDeleteContentItemArgs(BaseSchema):
    item_id: PublicUUID = Field(..., alias="itemId", description="Content item id to delete.")


class WorkspaceListProjectsArgs(BaseSchema):
    query: str | None = Field(default=None, max_length=128, description="Optional project search query.")


class WorkspaceOpenProjectsArgs(BaseSchema):
    pass


class WorkspaceReadProjectSourceArgs(BaseSchema):
    file_path: str | None = Field(
        default=None,
        alias="filePath",
        min_length=1,
        max_length=1024,
        description="Optional project-relative source file path to read instead of the full manifest.",
    )


class WorkspaceWriteProjectSourceFileArgs(BaseSchema):
    model_config = ConfigDict(
        str_strip_whitespace=False,
        validate_assignment=True,
    )

    path: str = Field(..., min_length=1, max_length=1024, description="Project-relative source file path.")
    contents: str = Field(..., description="UTF-8 source file contents.")
    role: ProjectSourceFileRole | None = Field(default=None, description="Optional source file role override.")
    language: str | None = Field(default=None, max_length=64, description="Optional editor language id override.")
    publish_release: bool = Field(
        default=False,
        alias="publishRelease",
        description="Publish a new project release after writing this source file.",
    )


class WorkspaceDeleteProjectSourceFileArgs(BaseSchema):
    path: str = Field(..., min_length=1, max_length=1024, description="Project-relative source file path.")
    publish_release: bool = Field(
        default=False,
        alias="publishRelease",
        description="Publish a new project release after deleting this source file.",
    )


class WorkspaceUpdateSiteSettingsArgs(BaseSchema):
    site_name: str | None = Field(default=None, alias="siteName", min_length=1, max_length=128)
    site_description: str | None = Field(default=None, alias="siteDescription", max_length=500)
    site_url: str | None = Field(default=None, alias="siteUrl", max_length=2048)
    logo_url: str | None = Field(default=None, alias="logoUrl", max_length=2048)
    logo_asset_id: str | None = Field(default=None, alias="logoAssetId", max_length=128)
    favicon_url: str | None = Field(default=None, alias="faviconUrl", max_length=2048)
    favicon_asset_id: str | None = Field(default=None, alias="faviconAssetId", max_length=128)
    contact_email: str | None = Field(default=None, alias="contactEmail", max_length=320)
    default_title: str | None = Field(default=None, alias="defaultTitle", max_length=160)
    default_description: str | None = Field(default=None, alias="defaultDescription", max_length=500)
    og_image_url: str | None = Field(default=None, alias="ogImageUrl", max_length=2048)
    og_image_asset_id: str | None = Field(default=None, alias="ogImageAssetId", max_length=128)
    robots_directive: str | None = Field(default=None, alias="robotsDirective", max_length=128)
    sitemap_enabled: bool | None = Field(default=None, alias="sitemapEnabled")
    google_analytics_enabled: bool | None = Field(default=None, alias="googleAnalyticsEnabled")
    google_analytics_measurement_id: str | None = Field(
        default=None,
        alias="googleAnalyticsMeasurementId",
        max_length=64,
    )
    supported_locales: list[str] | None = Field(default=None, alias="supportedLocales", max_length=20)
    default_locale: str | None = Field(default=None, alias="defaultLocale", min_length=2, max_length=16)
    fallback_locale: str | None = Field(default=None, alias="fallbackLocale", min_length=2, max_length=16)
    timezone: str | None = Field(default=None, max_length=64)
    framework: Literal["react_vite", "astro"] | None = None
    source_provider: Literal["managed", "git"] | None = Field(default=None, alias="sourceProvider")
    package_manager: Literal["pnpm", "npm"] | None = Field(default=None, alias="packageManager")
    root_directory: str | None = Field(default=None, alias="rootDirectory", min_length=1, max_length=256)
    build_command: str | None = Field(default=None, alias="buildCommand", min_length=1, max_length=256)
    output_directory: str | None = Field(default=None, alias="outputDirectory", min_length=1, max_length=256)
    artifact_strategy: Literal["object_storage", "container_image"] | None = Field(
        default=None,
        alias="artifactStrategy",
    )


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
    content_model_items: list[ContentModelOut] = Field(
        default_factory=list,
        description="Readable content models returned by content model read actions.",
    )
    deleted_content_model_id: PublicUUID | None = Field(
        default=None,
        description="Deleted content model id returned by delete actions.",
    )
    content_item: ContentItemOut | None = Field(default=None, description="Primary content item returned by actions.")
    content_items: list[ContentItemOut] = Field(
        default_factory=list,
        description="Readable content items returned by content item read actions.",
    )
    content_version: ContentVersionOut | None = Field(
        default=None,
        description="Draft content version returned by content item write actions.",
    )
    deleted_content_item_id: PublicUUID | None = Field(
        default=None,
        description="Deleted content item id returned by delete actions.",
    )
    domain: DomainBindingOut | None = Field(
        default=None,
        description="Primary or preview-ready project domain binding returned by project actions.",
    )
    projects: list[ProjectListItemOut] = Field(default_factory=list, description="Project search results.")
    source_manifest: ProjectSourceManifestOut | None = Field(
        default=None,
        description="Readable project source manifest returned by project source actions.",
    )
    source_file: ProjectSourceFileOut | None = Field(
        default=None,
        description="Project source file returned by source read or write actions.",
    )
    source_file_delete: ProjectSourceFileDeleteOut | None = Field(
        default=None,
        description="Project source file deletion result returned by source delete actions.",
    )
    release: ReleasePublishOut | None = Field(
        default=None,
        description="Project release returned when an action explicitly publishes after a mutation.",
    )
    site_settings: ProjectSettingsDetail | None = Field(
        default=None,
        alias="siteSettings",
        description="Project core settings returned after an AI site settings update.",
    )
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
                    project_id=payload.project_id,
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
    request: Request,
    user_id: UUID = Depends(get_current_user_id),
    settings: Settings = Depends(get_settings),
) -> ResponseModel[WorkspaceAIActionResponse]:
    return await _execute_workspace_ai_action_impl(
        payload=payload,
        request=request,
        user_id=user_id,
        settings=settings,
        commercial_policy=build_restricted_recovery_command_policy(),
    )


async def _execute_workspace_ai_action_impl(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None = None,
    commercial_policy: RestrictedRecoveryCommandPolicy,
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
                request=request,
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
        _raise_plan_mode_read_only()

    await _authorize_workspace_ai_tool_calls(
        workspace_id=payload.workspace_id,
        tool_calls=tool_calls,
        policy=commercial_policy,
    )

    ctx = await resolve_workspace_context_by_id(workspace_id=payload.workspace_id, user_id=user_id)
    if ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    service = build_project_service(settings)
    if action == "create_project":
        args = _validate_tool_arguments(WorkspaceCreateProjectArgs, tool_call.arguments)
        ctx = await require_workspace_manage_access(ctx)
        await ensure_workspace_permission_granted("system:content:manage", user_id=user_id, ctx=ctx)
        project = await service.create_project(
            workspace_id=ctx.workspace_id,
            payload=_project_create_request(payload, args),
            actor_user_id=user_id,
        )
        domain = await _project_preview_domain(settings=settings, project_id=project.id)
        await ProjectSettingsService(settings).patch_core(
            project_id=project.id,
            patch=_project_core_settings_patch(arguments=args, domain=domain),
            updated_by=user_id,
        )
        content_bootstrap = await _bootstrap_created_project_content(
            project=project,
            request=request,
            settings=settings,
            user_id=user_id,
            arguments=args,
            domain=domain,
        )
        source_manifest = await ProjectSourceService(settings).get_source_manifest(project_id=project.id)
        return ApiResponse.success(
            data=_created_project_response(
                project,
                payload.message,
                decision,
                args,
                source_manifest,
                domain,
                content_bootstrap,
            )
        )

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

    if action == "list_content_models":
        args = _validate_tool_arguments(WorkspaceListContentModelsArgs, tool_call.arguments)
        page = await _list_content_models(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        return ApiResponse.success(
            data=_content_model_list_response(list(page.items), page.total, payload, decision, args)
        )

    if action == "update_content_model":
        args = _validate_tool_arguments(WorkspaceUpdateContentModelArgs, tool_call.arguments)
        content_model = await _update_content_model(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        return ApiResponse.success(data=_updated_content_model_response(content_model, payload, decision, args))

    if action == "delete_content_model":
        args = _validate_tool_arguments(WorkspaceDeleteContentModelArgs, tool_call.arguments)
        await _delete_content_model(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        return ApiResponse.success(data=_deleted_content_model_response(args.model_id, payload, decision, args))

    if action == "list_content_items":
        args = _validate_tool_arguments(WorkspaceListContentItemsArgs, tool_call.arguments)
        page = await _list_content_items(payload=payload, user_id=user_id, settings=settings, arguments=args)
        return ApiResponse.success(
            data=_content_item_list_response(list(page.items), page.total, payload, decision, args)
        )

    if action == "create_content_item":
        args = _validate_tool_arguments(WorkspaceCreateContentItemArgs, tool_call.arguments)
        content_item, content_version = await _create_content_item(
            payload=payload,
            user_id=user_id,
            settings=settings,
            request=request,
            arguments=args,
        )
        return ApiResponse.success(
            data=_created_content_item_response(content_item, content_version, payload, decision, args)
        )

    if action == "update_content_item":
        args = _validate_tool_arguments(WorkspaceUpdateContentItemArgs, tool_call.arguments)
        content_item, content_version = await _update_content_item(
            payload=payload,
            user_id=user_id,
            settings=settings,
            request=request,
            arguments=args,
        )
        return ApiResponse.success(
            data=_updated_content_item_response(content_item, content_version, payload, decision, args)
        )

    if action == "update_homepage":
        args = _validate_tool_arguments(WorkspaceUpdateHomepageArgs, tool_call.arguments)
        content_item, content_version = await _update_homepage(
            payload=payload,
            user_id=user_id,
            settings=settings,
            request=request,
            arguments=args,
        )
        return ApiResponse.success(
            data=_updated_homepage_response(content_item, content_version, payload, decision, args)
        )

    if action == "delete_content_item":
        args = _validate_tool_arguments(WorkspaceDeleteContentItemArgs, tool_call.arguments)
        await _delete_content_item(
            payload=payload,
            user_id=user_id,
            settings=settings,
            request=request,
            arguments=args,
        )
        return ApiResponse.success(data=_deleted_content_item_response(args.item_id, payload, decision, args))

    if action == "read_project_source":
        args = _validate_tool_arguments(WorkspaceReadProjectSourceArgs, tool_call.arguments)
        if args.file_path:
            source_file = await _read_project_source_file(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=args,
            )
            return ApiResponse.success(data=_read_project_source_response(None, source_file, payload, decision, args))
        source_manifest = await _read_project_source_manifest(payload=payload, user_id=user_id, settings=settings)
        return ApiResponse.success(data=_read_project_source_response(source_manifest, None, payload, decision, args))

    if action == "write_project_source_file":
        args = _validate_tool_arguments(WorkspaceWriteProjectSourceFileArgs, tool_call.arguments)
        source_file = await _write_project_source_file(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        release = (
            await _publish_project_source_release(payload=payload, user_id=user_id, settings=settings)
            if args.publish_release
            else None
        )
        return ApiResponse.success(
            data=_write_project_source_file_response(source_file, release, payload, decision, args)
        )

    if action == "delete_project_source_file":
        args = _validate_tool_arguments(WorkspaceDeleteProjectSourceFileArgs, tool_call.arguments)
        source_file_delete = await _delete_project_source_file(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        release = (
            await _publish_project_source_release(payload=payload, user_id=user_id, settings=settings)
            if args.publish_release
            else None
        )
        return ApiResponse.success(
            data=_delete_project_source_file_response(source_file_delete, release, payload, decision, args)
        )

    if action == "update_site_settings":
        args = _validate_tool_arguments(WorkspaceUpdateSiteSettingsArgs, tool_call.arguments)
        site_settings = await _update_site_settings(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=args,
        )
        return ApiResponse.success(data=_updated_site_settings_response(site_settings, payload, decision, args))

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
    request: Request | None,
    user_id: UUID,
    settings: Settings,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    if _conversation_mode_value(payload.mode) == AgentConversationMode.PLAN.value and any(
        _is_mutating_action(tool_call.tool_name) for tool_call in tool_calls
    ):
        _raise_plan_mode_read_only()

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

    if all(tool_call.tool_name in _CONTENT_MODEL_TOOL_ACTIONS for tool_call in tool_calls):
        result = await _execute_content_model_tool_calls(
            payload=payload,
            user_id=user_id,
            settings=settings,
            tool_calls=tool_calls,
        )
        return _content_model_tool_calls_response(result, payload, decision, tool_calls)

    if _is_site_update_tool_call_group(tool_calls):
        result = await _execute_site_update_tool_calls(
            payload=payload,
            request=request,
            user_id=user_id,
            settings=settings,
            tool_calls=tool_calls,
        )
        return _site_update_tool_calls_response(result, payload, decision, tool_calls)

    if all(tool_call.tool_name in _CONTENT_ITEM_TOOL_ACTIONS for tool_call in tool_calls):
        result = await _execute_content_item_tool_calls(
            payload=payload,
            request=request,
            user_id=user_id,
            settings=settings,
            tool_calls=tool_calls,
        )
        return _content_item_tool_calls_response(result, payload, decision, tool_calls)

    if all(tool_call.tool_name in _PROJECT_SOURCE_TOOL_ACTIONS for tool_call in tool_calls):
        result = await _execute_project_source_tool_calls(
            payload=payload,
            user_id=user_id,
            settings=settings,
            tool_calls=tool_calls,
        )
        return _project_source_tool_calls_response(result, payload, decision, tool_calls)

    raise BadRequest(
        "Workspace action planner produced multiple tool calls for an unsupported action group",
        error="AI_WORKSPACE_ACTION_PLAN_INVALID",
    )


async def _authorize_workspace_ai_tool_calls(
    *,
    workspace_id: UUID,
    tool_calls: list[WorkspaceAIPlannerToolCall],
    policy: RestrictedRecoveryCommandPolicy,
) -> None:
    effects = workspace_ai_action_effects(actions=(tool_call.tool_name for tool_call in tool_calls))
    await policy.authorize(workspace_id=workspace_id, effects=effects)


def _is_site_update_tool_call_group(tool_calls: list[WorkspaceAIPlannerToolCall]) -> bool:
    has_content_item_call = any(tool_call.tool_name in _CONTENT_ITEM_TOOL_ACTIONS for tool_call in tool_calls)
    has_project_source_call = any(tool_call.tool_name in _PROJECT_SOURCE_TOOL_ACTIONS for tool_call in tool_calls)
    return (
        has_content_item_call
        and has_project_source_call
        and all(
            tool_call.tool_name in _CONTENT_ITEM_TOOL_ACTIONS or tool_call.tool_name in _PROJECT_SOURCE_TOOL_ACTIONS
            for tool_call in tool_calls
        )
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
    return action in {
        "create_project",
        "create_content_model",
        "update_content_model",
        "delete_content_model",
        "create_content_item",
        "update_content_item",
        "update_homepage",
        "delete_content_item",
        "write_project_source_file",
        "delete_project_source_file",
        "update_site_settings",
    }


def _raise_plan_mode_read_only() -> None:
    raise BadRequest(
        "Plan mode cannot execute mutating workspace actions",
        error="AI_WORKSPACE_ACTION_PLAN_MODE_READ_ONLY",
    )


def _workspace_tool_label(action: WorkspaceAIActionKind) -> str:
    labels: dict[WorkspaceAIActionKind, str] = {
        "create_project": "项目创建",
        "create_content_model": "内容模型创建",
        "list_content_models": "内容模型读取",
        "update_content_model": "内容模型更新",
        "delete_content_model": "内容模型删除",
        "list_content_items": "内容读取",
        "create_content_item": "内容创建",
        "update_content_item": "内容更新",
        "update_homepage": "首页更新",
        "delete_content_item": "内容删除",
        "list_projects": "项目检索",
        "open_projects": "项目列表导航",
        "read_project_source": "项目源码读取",
        "write_project_source_file": "项目源码写入",
        "delete_project_source_file": "项目源码删除",
        "update_site_settings": "网站配置更新",
        "refine_plan": "方案细化",
    }
    return labels[action]


def _is_project_source_settings_tool_call(tool_call: WorkspaceAIPlannerToolCall) -> bool:
    if tool_call.provider_tool_name == "workspace_update_project_source_settings":
        return True
    if tool_call.tool_name != "update_site_settings":
        return False
    fields = set(tool_call.arguments)
    return bool(fields) and fields.issubset(_PROJECT_SOURCE_SETTINGS_ARGUMENT_FIELDS)


def _workspace_tool_label_for_call(tool_call: WorkspaceAIPlannerToolCall) -> str:
    if _is_project_source_settings_tool_call(tool_call):
        return "项目源码配置更新"
    return _workspace_tool_label(tool_call.tool_name)


def _workspace_tool_name_for_call(tool_call: WorkspaceAIPlannerToolCall) -> str:
    if _is_project_source_settings_tool_call(tool_call):
        return "workspace.update_project_source_settings"
    return f"workspace.{tool_call.tool_name}"


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
        authoring_mode=arguments.authoring_mode,
        name=arguments.name,
        slug=None,
        description=arguments.description,
    )


async def _project_preview_domain(*, settings: Settings, project_id: UUID) -> DomainBindingOut | None:
    service = DomainBindingService(settings)
    bindings = await service.list_bindings_for_project(project_id=project_id)
    selected = (
        next(
            (binding for binding in bindings if binding.is_primary and binding.is_verified and binding.is_active), None
        )
        or next((binding for binding in bindings if binding.is_verified and binding.is_active), None)
        or next((binding for binding in bindings if binding.is_active), None)
        or (bindings[0] if bindings else None)
    )
    if selected is None:
        return None
    return DomainBindingOut.model_validate(service.to_out(selected))


def _project_core_settings_patch(
    *,
    arguments: WorkspaceCreateProjectArgs,
    domain: DomainBindingOut | None,
) -> dict[str, Any]:
    site: dict[str, Any] = {
        "name": arguments.name,
        "description": arguments.description,
    }
    if domain is not None:
        site["url"] = f"https://{domain.hostname}"

    return {
        "site": site,
        "site_localization": {
            "supported_locales": ["zh-CN", "en-US"],
            "default_locale": "zh-CN",
            "fallback_locale": "en-US",
            "locale": "zh-CN",
            "timezone": "Asia/Shanghai",
            "date_format": "YYYY-MM-DD",
        },
        "seo": {
            "default_title": arguments.name,
            "default_description": arguments.description,
            "robots_directive": "index,follow",
            "sitemap_enabled": True,
            "title_policy_v1": _DEFAULT_PROJECT_TITLE_POLICY,
        },
        "analytics": {
            "google_analytics": {
                "enabled": False,
                "measurement_id": None,
            },
        },
        "project_source": {
            "framework": arguments.framework or "react_vite",
            "source_provider": "managed",
            "package_manager": "pnpm",
            "root_directory": ".",
            "build_command": "pnpm build",
            "output_directory": "dist",
            "artifact_strategy": "object_storage",
        },
    }


def _created_project_page_model_contract() -> ContentModelDefinitionContract:
    return ContentModelDefinitionContract(
        singular_key="page",
        plural_key="pages",
        name="Page",
        description="Route-owned pages for the website editor, preview, SEO, and releases.",
        category="site_builder",
        model_kind="collection_type",
        default_editor="visual",
        capabilities=[
            "versioned",
            "queryable",
            "routable",
            "treeable",
            "visual_editable",
            "has_slots",
            "publishable",
            "seo_managed",
        ],
        default_role="page",
        default_posture="page",
        default_surface="canvas",
        fields=[
            ContentModelFieldContract(key="heroHeadline", label="Hero headline", scalar="text"),
            ContentModelFieldContract(key="heroSubheading", label="Hero subheading", scalar="long_text"),
            ContentModelFieldContract(key="primaryCtaLabel", label="Primary CTA label", scalar="text"),
            ContentModelFieldContract(key="sections", label="Sections", scalar="json"),
        ],
        relations=[],
        routing=ContentRoutingContract(mode="localized", slug_field="path"),
        workflow=ContentWorkflowContract(states=["draft", "published"], initial_state="draft"),
        views=[
            ContentModelViewContract(
                key="pages",
                label="Pages",
                type="table",
                config={"columns": ["title", "path"]},
            )
        ],
        presentation={"allowedKinds": ["form_data", "wireframe", "visual_blueprint", "slot_mapping", "seo"]},
        seo={"titleField": "title"},
        starter_pack_policy={"mode": "page"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
    )


def _created_project_reusable_block_model_contract() -> ContentModelDefinitionContract:
    return ContentModelDefinitionContract(
        singular_key="reusableBlock",
        plural_key="reusableBlocks",
        name="Reusable Block",
        description="Reusable visual block for page sections, layout fragments, and AI-assisted composition.",
        category="site_builder",
        model_kind="collection_type",
        default_editor="visual",
        capabilities=[
            "versioned",
            "queryable",
            "visual_editable",
            "has_slots",
            "publishable",
            "localizable",
        ],
        default_role="reusable-section",
        default_posture="composition",
        default_surface="canvas",
        fields=[
            ContentModelFieldContract(key="title", label="Title", scalar="text", required=True),
            ContentModelFieldContract(key="sectionKey", label="Section key", scalar="text", required=True),
            ContentModelFieldContract(key="propsDefaults", label="Props defaults", scalar="json"),
        ],
        relations=[],
        routing=ContentRoutingContract(mode="none"),
        workflow=ContentWorkflowContract(states=["draft", "published"], initial_state="draft"),
        views=[
            ContentModelViewContract(
                key="blocks",
                label="Reusable blocks",
                type="table",
                config={"columns": ["title", "sectionKey"]},
            )
        ],
        presentation={"allowedKinds": ["form_data", "wireframe", "visual_blueprint", "slot_mapping"]},
        starter_pack_policy={"mode": "section"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
    )


def _created_project_home_fields(
    *,
    arguments: WorkspaceCreateProjectArgs,
    domain: DomainBindingOut | None,
) -> JsonObject:
    preview_url = f"https://{domain.hostname}" if domain is not None else None
    return {
        "title": arguments.name,
        "path": "/",
        "heroHeadline": arguments.name,
        "heroSubheading": arguments.description,
        "primaryCtaLabel": "Start exploring",
        "canonicalUrl": preview_url,
        "sections": [
            {
                "key": "brand-ready",
                "title": "Brand ready",
                "body": "Website config, SEO defaults, analytics, and source are connected from creation.",
            },
            {
                "key": "editable-source",
                "title": "Editable source",
                "body": "AI tools and the Management SDK can update managed source and structured content.",
            },
            {
                "key": "deployable",
                "title": "Deployable",
                "body": "The project is prepared for object-storage artifacts from a React + Vite build.",
            },
        ],
    }


def _read_string_field(fields: JsonObject, key: str) -> str | None:
    value = fields.get(key)
    return value.strip() if isinstance(value, str) and value.strip() else None


def _site_builder_page_presentations(fields: JsonObject) -> list[ContentPresentationIn]:
    title = _read_string_field(fields, "title") or _read_string_field(fields, "heroHeadline") or "Untitled page"
    path = _read_string_field(fields, "path") or "/"
    hero_headline = _read_string_field(fields, "heroHeadline") or title
    hero_subheading = _read_string_field(fields, "heroSubheading")
    primary_cta_label = _read_string_field(fields, "primaryCtaLabel")
    canonical_url = _read_string_field(fields, "canonicalUrl") or path
    sections = fields.get("sections") if isinstance(fields.get("sections"), list) else []
    return [
        ContentPresentationIn(
            kind="visual_blueprint",
            payload={
                "rootId": "home_page",
                "nodesById": {
                    "home_page": {
                        "id": "home_page",
                        "type": "page_root",
                        "children": ["hero", "sections"],
                    },
                    "hero": {
                        "id": "hero",
                        "type": "landing.hero",
                        "props": {
                            "headline": hero_headline,
                            "subheading": hero_subheading,
                            "primaryCtaLabel": primary_cta_label,
                        },
                    },
                    "sections": {
                        "id": "sections",
                        "type": "landing.sections",
                        "props": {"items": sections},
                    },
                },
            },
        ),
        ContentPresentationIn(
            kind="slot_mapping",
            payload={
                "bindings": [
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
            },
        ),
        ContentPresentationIn(
            kind="seo",
            payload={
                "metaTitle": title,
                "metaDescription": hero_subheading,
                "canonicalUrl": canonical_url,
                "robotsDirective": "index,follow",
            },
        ),
    ]


def _content_fields_draft_payload(
    *,
    fields: JsonObject,
    change_summary: str | None,
    expected_version: int | None = None,
    include_site_builder_presentations: bool = False,
) -> ContentVersionDraftSaveIn:
    presentations = [ContentPresentationIn(kind="form_data", payload=fields)]
    if include_site_builder_presentations:
        presentations.extend(_site_builder_page_presentations(fields))
    return ContentVersionDraftSaveIn(
        expected_version=expected_version,
        change_summary=change_summary,
        fields_snapshot=fields,
        presentations=presentations,
    )


async def _bootstrap_created_project_content(
    *,
    project: ProjectListItemOut,
    request: Request | None,
    settings: Settings,
    user_id: UUID,
    arguments: WorkspaceCreateProjectArgs,
    domain: DomainBindingOut | None,
) -> _CreatedProjectContentBootstrap:
    lifecycle_dispatcher = _request_lifecycle_dispatcher(request)
    runtime_ctx = await ProjectRuntimeService(settings).get_context_by_project(
        project_id=project.id,
        actor_user_id=user_id,
    )
    environment = await ProjectEnvironmentsService(runtime_ctx.tenant_context).resolve_environment_target(
        project_id=project.id,
        target=None,
        default_key=ProjectEnvironmentKey.PRODUCTION,
    )
    tenant_context = resolve_project_tenant_context(project_id=project.id, runtime_id=runtime_ctx.runtime_id)
    models_service = ProjectContentCanonicalModelsService(
        repo=ProjectContentModelsRepository(tenant_context),
        settings=settings,
    )
    page_model_result = await models_service.create_model(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        environment_id=environment.id,
        actor_user_id=user_id,
        payload=_created_project_page_model_contract(),
    )
    reusable_block_model_result = await models_service.create_model(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        environment_id=environment.id,
        actor_user_id=user_id,
        payload=_created_project_reusable_block_model_contract(),
    )
    repo = ProjectContentItemsRepository(tenant_context)
    items_service = ProjectContentCanonicalItemsService(
        repo=repo,
        entity_manager=EntityManager(items_repo=repo, lifecycle=lifecycle_dispatcher),
        organization_id=runtime_ctx.tenant_context.organization_id,
    )
    content_item = await items_service.create_item(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        project_id=project.id,
        runtime_id=runtime_ctx.runtime_id,
        environment_id=environment.id,
        actor_user_id=user_id,
        payload=ContentItemCreateIn(
            model_key="page",
            title="Home",
            locale=runtime_ctx.default_locale,
        ),
    )
    content_version = await items_service.save_draft_version(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        environment_id=environment.id,
        item_id=content_item.id,
        actor_user_id=user_id,
        payload=_content_fields_draft_payload(
            change_summary="Initial AI-generated home page content.",
            fields=_created_project_home_fields(arguments=arguments, domain=domain),
            include_site_builder_presentations=True,
        ),
    )
    await items_service.apply_bootstrap_shape(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        project_id=project.id,
        runtime_id=runtime_ctx.runtime_id,
        environment_id=environment.id,
        item_id=content_item.id,
        actor_user_id=user_id,
        payload=ContentItemBootstrapShapeIn(
            preset_key="page",
            preset_state="selected",
            capability_pack_ids=[
                "publishable",
                "routable",
                "treeable",
                "visual_editable",
                "has_slots",
                "seo_managed",
            ],
        ),
    )
    await items_service.patch_workflow(
        project_id=project.id,
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        runtime_id=runtime_ctx.runtime_id,
        environment_id=environment.id,
        item_id=content_item.id,
        actor_user_id=user_id,
        payload=ContentItemWorkflowPatchIn(
            stage="approved",
            summary="Initial AI-generated home page approved for publishing.",
        ),
    )
    await ProjectContentRoutingService(tenant_context).upsert_hierarchy_node(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        item_id=content_item.id,
        payload=HierarchyNodeUpsertIn(parent_item_id=None, sort_order=0),
    )
    content_version = await items_service.transition_version(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        project_id=project.id,
        runtime_id=runtime_ctx.runtime_id,
        environment_id=environment.id,
        item_id=content_item.id,
        version_number=content_version.version_number,
        target_state=ContentVersionState.PUBLISHED,
        actor_user_id=user_id,
    )
    release = await ProjectReleasesService(tenant_context).publish_release_out(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        actor_user_id=user_id,
    )
    refreshed_item = await items_service.reads.get_item(
        workspace_id=project.workspace_id,
        site_id=runtime_ctx.site_id,
        environment_id=environment.id,
        item_id=content_item.id,
    )
    return _CreatedProjectContentBootstrap(
        content_model=to_mutation_out(page_model_result),
        content_item=refreshed_item,
        content_version=content_version,
        release=release,
        reusable_block_model=to_mutation_out(reusable_block_model_result),
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


async def _list_content_models(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceListContentModelsArgs,
) -> PageData[ContentModelOut]:
    project_ctx, service, site_id, environment_id = await _resolve_content_model_action_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        permission="project:content:read",
        missing_target_message="A target project is required to list content models",
    )
    return await service.list_models_paginated(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        params=PageParams(page=1, size=10),
        q=arguments.query,
        ordering="name",
        category=None,
        model_kind=None,
        system_managed=None,
    )


async def _update_content_model(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceUpdateContentModelArgs,
) -> ContentModelMutationOut:
    has_metadata_update = arguments.name is not None or arguments.description is not None
    if not has_metadata_update and not arguments.field_mutations and arguments.field_order is None:
        raise BadRequest(
            "A content model update requires at least one changed field",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
        )
    project_ctx, service, site_id, environment_id = await _resolve_content_model_action_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        permission="project:content:manage",
        missing_target_message="A target project is required to update a content model",
    )
    content_model: ContentModelMutationOut | None = None
    if has_metadata_update:
        content_model = await _update_content_model_metadata(
            service=service,
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            user_id=user_id,
            arguments=arguments,
        )

    for mutation in arguments.field_mutations:
        content_model = await _apply_content_model_field_mutation(
            service=service,
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            user_id=user_id,
            model_id=arguments.model_id,
            mutation=mutation,
        )

    if arguments.field_order is not None:
        updated = await service.reorder_model_fields(
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=arguments.model_id,
            actor_user_id=user_id,
            field_keys=arguments.field_order,
        )
        if updated is None:
            raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
        content_model = _content_model_out_to_mutation_out(updated)

    if content_model is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return content_model


async def _update_content_model_metadata(
    *,
    service: ProjectContentCanonicalModelsService,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID | None,
    user_id: UUID,
    arguments: WorkspaceUpdateContentModelArgs,
) -> ContentModelMutationOut:
    patch = ContentModelDefinitionPatchContract(
        name=arguments.name,
        description=arguments.description,
    )
    preview = await service.preview_model_update(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        model_id=arguments.model_id,
        payload=patch,
    )
    if preview is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    patch_with_preview = ContentModelDefinitionPatchContract(
        **patch.model_dump(mode="json", exclude_unset=True),
        impact_preview_token=preview.preview_token,
    )
    record = await service.update_model(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        model_id=arguments.model_id,
        actor_user_id=user_id,
        payload=patch_with_preview,
    )
    if record is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return to_mutation_out(record)


async def _apply_content_model_field_mutation(
    *,
    service: ProjectContentCanonicalModelsService,
    workspace_id: UUID,
    site_id: UUID,
    environment_id: UUID | None,
    user_id: UUID,
    model_id: UUID,
    mutation: WorkspaceContentModelFieldMutationArgs,
) -> ContentModelMutationOut:
    if mutation.action == "add":
        if mutation.label is None or mutation.scalar is None:
            raise BadRequest(
                "Adding a content model field requires label and scalar",
                error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
            )
        updated = await service.add_model_field(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=model_id,
            actor_user_id=user_id,
            payload=ContentModelFieldContract(
                key=mutation.key,
                label=mutation.label,
                scalar=mutation.scalar,
                required=bool(mutation.required),
                config=mutation.config if "config" in mutation.model_fields_set else None,
            ),
        )
    elif mutation.action == "update":
        if not {"label", "scalar", "required", "config"} & mutation.model_fields_set:
            raise BadRequest(
                "Updating a content model field requires at least one field property",
                error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
            )
        updated = await service.update_model_field(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=model_id,
            field_key=mutation.key,
            actor_user_id=user_id,
            payload=ContentModelFieldPatchContract(**{
                name: getattr(mutation, name)
                for name in ("label", "scalar", "required", "config")
                if name in mutation.model_fields_set
            }),
        )
    else:
        updated = await service.delete_model_field(
            workspace_id=workspace_id,
            site_id=site_id,
            environment_id=environment_id,
            model_id=model_id,
            actor_user_id=user_id,
            field_key=mutation.key,
        )
    if updated is None:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")
    return _content_model_out_to_mutation_out(updated)


def _content_model_out_to_mutation_out(content_model: ContentModelOut) -> ContentModelMutationOut:
    return ContentModelMutationOut(
        id=UUID(str(content_model.id)),
        workspace_id=UUID(str(content_model.workspace_id)),
        site_id=UUID(str(content_model.site_id)),
        singular_key=content_model.singular_key,
        plural_key=content_model.plural_key,
        name=content_model.name,
        description=content_model.description,
        protocol_key=content_model.protocol_key,
        protocol_version=content_model.protocol_version,
        system_managed=content_model.system_managed,
        system_field_keys=content_model.system_field_keys,
        model_kind=content_model.model_kind,
        draft_contract_revision=content_model.draft_contract_revision,
        published_contract_revision=content_model.published_contract_revision,
        default_role=content_model.default_role,
        default_posture=content_model.default_posture,
        default_surface=content_model.default_surface,
        starter_pack_policy=content_model.starter_pack_policy,
        surface_policy=content_model.surface_policy,
        impact=ContentModelImpactOut(),
    )


async def _delete_content_model(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceDeleteContentModelArgs,
) -> None:
    project_ctx, service, site_id, environment_id = await _resolve_content_model_action_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        permission="project:content:manage",
        missing_target_message="A target project is required to delete a content model",
    )
    deleted = await service.delete_model(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        model_id=arguments.model_id,
        actor_user_id=user_id,
    )
    if not deleted:
        raise NotFound("Content model not found", error="CONTENT_MODEL_NOT_FOUND")


async def _execute_content_model_tool_calls(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> _ContentModelToolCallsResult:
    mutation_models: list[ContentModelMutationOut] = []
    deleted_model_ids: list[UUID] = []
    latest_items: list[ContentModelOut] = []
    latest_total = 0
    mutation_version = 0
    list_version = -1

    for tool_call in tool_calls:
        if tool_call.tool_name == "create_content_model":
            mutation_models.append(
                await _create_content_model(
                    payload=payload,
                    user_id=user_id,
                    settings=settings,
                    arguments=_validate_tool_arguments(WorkspaceCreateContentModelArgs, tool_call.arguments),
                )
            )
            mutation_version += 1
            continue

        if tool_call.tool_name == "list_content_models":
            page = await _list_content_models(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=_validate_tool_arguments(WorkspaceListContentModelsArgs, tool_call.arguments),
            )
            latest_items = list(page.items)
            latest_total = page.total
            list_version = mutation_version
            continue

        if tool_call.tool_name == "update_content_model":
            mutation_models.append(
                await _update_content_model(
                    payload=payload,
                    user_id=user_id,
                    settings=settings,
                    arguments=_validate_tool_arguments(WorkspaceUpdateContentModelArgs, tool_call.arguments),
                )
            )
            mutation_version += 1
            continue

        if tool_call.tool_name == "delete_content_model":
            args = _validate_tool_arguments(WorkspaceDeleteContentModelArgs, tool_call.arguments)
            await _delete_content_model(payload=payload, user_id=user_id, settings=settings, arguments=args)
            deleted_model_ids.append(args.model_id)
            mutation_version += 1
            continue

        raise BadRequest(
            "Workspace action planner produced an unsupported content model tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    if list_version != mutation_version:
        page = await _list_content_models(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=WorkspaceListContentModelsArgs(),
        )
        latest_items = list(page.items)
        latest_total = page.total

    return _ContentModelToolCallsResult(
        content_model_items=latest_items,
        deleted_model_ids=deleted_model_ids,
        mutation_models=mutation_models,
        total=latest_total,
    )


async def _resolve_content_model_action_context(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    permission: str,
    missing_target_message: str,
) -> tuple[ProjectRequestContext, ProjectContentCanonicalModelsService, UUID, UUID]:
    if payload.project_id is None:
        raise BadRequest(missing_target_message, error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED")

    project_ctx = await get_project_context(project_id=payload.project_id, user_id=user_id)
    if project_ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    await ensure_project_permission_granted(
        permission,
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
    return project_ctx, service, runtime_ctx.site_id, environment.id


async def _list_content_items(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceListContentItemsArgs,
) -> PageData[ContentItemOut]:
    project_ctx, reads, site_id, environment_id = await _resolve_content_item_read_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        permission="project:content:read",
        missing_target_message="A target project is required to list content items",
    )
    return await reads.list_items_paginated(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        params=PageParams(page=1, size=10),
        model_key=arguments.model_key,
    )


async def _create_content_item(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None,
    arguments: WorkspaceCreateContentItemArgs,
) -> tuple[ContentItemOut, ContentVersionOut | None]:
    if arguments.publish and not arguments.fields:
        raise BadRequest(
            "Publishing a new content item requires initial fields for the first draft version",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
        )
    project_ctx, service, site_id, environment_id, runtime_id = await _resolve_content_item_write_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        request=request,
        permission="project:content:manage",
        missing_target_message="A target project is required to create a content item",
    )
    content_item = await service.create_item(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        project_id=project_ctx.project_id,
        runtime_id=runtime_id,
        environment_id=environment_id,
        actor_user_id=user_id,
        payload=ContentItemCreateIn(
            model_key=arguments.model_key,
            title=arguments.title,
            locale=arguments.locale,
        ),
    )
    if not arguments.fields:
        return content_item, None

    content_version = await service.save_draft_version(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=content_item.id,
        actor_user_id=user_id,
        payload=_content_fields_draft_payload(
            change_summary=arguments.change_summary,
            fields=arguments.fields,
            include_site_builder_presentations=arguments.model_key == "page" or "path" in arguments.fields,
        ),
    )
    if arguments.publish:
        content_version = await service.transition_version(
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            project_id=project_ctx.project_id,
            runtime_id=runtime_id,
            environment_id=environment_id,
            item_id=content_item.id,
            version_number=content_version.version_number,
            target_state=ContentVersionState.PUBLISHED,
            actor_user_id=user_id,
        )
    refreshed = await service.reads.get_item(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=content_item.id,
    )
    return refreshed, content_version


async def _update_content_item(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None,
    arguments: WorkspaceUpdateContentItemArgs,
) -> tuple[ContentItemOut, ContentVersionOut]:
    if not arguments.fields:
        raise BadRequest(
            "A content item update requires fields for the new draft version",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
        )
    project_ctx, service, site_id, environment_id, runtime_id = await _resolve_content_item_write_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        request=request,
        permission="project:content:manage",
        missing_target_message="A target project is required to update a content item",
    )
    content_version = await service.save_draft_version(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=arguments.item_id,
        actor_user_id=user_id,
        payload=_content_fields_draft_payload(
            expected_version=arguments.expected_version,
            change_summary=arguments.change_summary,
            fields=arguments.fields,
            include_site_builder_presentations="path" in arguments.fields,
        ),
    )
    if arguments.publish:
        content_version = await service.transition_version(
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            project_id=project_ctx.project_id,
            runtime_id=runtime_id,
            environment_id=environment_id,
            item_id=arguments.item_id,
            version_number=content_version.version_number,
            target_state=ContentVersionState.PUBLISHED,
            actor_user_id=user_id,
        )
    content_item = await service.reads.get_item(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=arguments.item_id,
    )
    return content_item, content_version


def _is_homepage_item(item: ContentItemOut) -> bool:
    return (
        item.model_key == "page"
        or item.role == "page"
        or item.resolved_role == "page"
        or item.resolved_posture == "page"
    )


def _select_homepage_item(items: list[ContentItemOut]) -> ContentItemOut | None:
    pages = [item for item in items if _is_homepage_item(item)]
    if not pages:
        return None
    return (
        next((item for item in pages if item.slug in {"home", "homepage"}), None)
        or next((item for item in pages if (item.title or "").strip().casefold() == "home"), None)
        or next((item for item in pages if item.published_version is not None), None)
        or pages[0]
    )


def _content_item_version_number(item: ContentItemOut) -> int | None:
    if item.draft_version is not None and item.draft_version > 0:
        return item.draft_version
    return item.published_version


async def _update_homepage(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None,
    arguments: WorkspaceUpdateHomepageArgs,
) -> tuple[ContentItemOut, ContentVersionOut]:
    if not arguments.fields and arguments.title is None and arguments.path is None:
        raise BadRequest(
            "A homepage update requires fields, title, or path changes",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
        )

    project_ctx, service, site_id, environment_id, runtime_id = await _resolve_content_item_write_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        request=request,
        permission="project:content:manage",
        missing_target_message="A target project is required to update the homepage",
    )
    page = await service.reads.list_items_paginated(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        params=PageParams(page=1, size=200),
        model_key=arguments.model_key or "page",
    )
    homepage = _select_homepage_item(list(page.items))
    if homepage is None:
        raise NotFound("Homepage content item not found", error="AI_WORKSPACE_ACTION_HOMEPAGE_REQUIRED")

    version_number = _content_item_version_number(homepage)
    if version_number is None:
        raise NotFound("Homepage content version not found", error="AI_WORKSPACE_ACTION_HOMEPAGE_VERSION_REQUIRED")

    current_version = await service.reads.get_version(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=homepage.id,
        version_number=version_number,
    )
    fields: JsonObject = {**current_version.fields_snapshot, **arguments.fields}
    if arguments.title is not None:
        fields["title"] = arguments.title
    if arguments.path is not None:
        fields["path"] = arguments.path

    content_version = await service.save_draft_version(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=homepage.id,
        actor_user_id=user_id,
        payload=_content_fields_draft_payload(
            expected_version=(
                arguments.expected_version if arguments.expected_version is not None else current_version.version_number
            ),
            change_summary=arguments.change_summary or "AI-updated homepage content.",
            fields=fields,
            include_site_builder_presentations=True,
        ),
    )
    if arguments.publish:
        content_version = await service.transition_version(
            workspace_id=project_ctx.workspace_id,
            site_id=site_id,
            project_id=project_ctx.project_id,
            runtime_id=runtime_id,
            environment_id=environment_id,
            item_id=homepage.id,
            version_number=content_version.version_number,
            target_state=ContentVersionState.PUBLISHED,
            actor_user_id=user_id,
        )

    content_item = await service.reads.get_item(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=homepage.id,
    )
    return content_item, content_version


async def _delete_content_item(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None,
    arguments: WorkspaceDeleteContentItemArgs,
) -> None:
    project_ctx, service, site_id, environment_id, _runtime_id = await _resolve_content_item_write_context(
        payload=payload,
        user_id=user_id,
        settings=settings,
        request=request,
        permission="project:content:manage",
        missing_target_message="A target project is required to delete a content item",
    )
    await service.delete_item(
        workspace_id=project_ctx.workspace_id,
        site_id=site_id,
        environment_id=environment_id,
        item_id=arguments.item_id,
        actor_user_id=user_id,
    )


async def _execute_content_item_tool_calls(
    *,
    payload: WorkspaceAIActionRequest,
    request: Request | None,
    user_id: UUID,
    settings: Settings,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> _ContentItemToolCallsResult:
    mutation_items: list[ContentItemOut] = []
    deleted_item_ids: list[UUID] = []
    latest_items: list[ContentItemOut] = []
    latest_total = 0
    latest_version: ContentVersionOut | None = None
    mutation_version = 0
    list_version = -1

    for tool_call in tool_calls:
        if tool_call.tool_name == "create_content_item":
            item, version = await _create_content_item(
                payload=payload,
                user_id=user_id,
                settings=settings,
                request=request,
                arguments=_validate_tool_arguments(WorkspaceCreateContentItemArgs, tool_call.arguments),
            )
            mutation_items.append(item)
            latest_version = version or latest_version
            mutation_version += 1
            continue

        if tool_call.tool_name == "list_content_items":
            page = await _list_content_items(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=_validate_tool_arguments(WorkspaceListContentItemsArgs, tool_call.arguments),
            )
            latest_items = list(page.items)
            latest_total = page.total
            list_version = mutation_version
            continue

        if tool_call.tool_name == "update_content_item":
            item, version = await _update_content_item(
                payload=payload,
                user_id=user_id,
                settings=settings,
                request=request,
                arguments=_validate_tool_arguments(WorkspaceUpdateContentItemArgs, tool_call.arguments),
            )
            mutation_items.append(item)
            latest_version = version
            mutation_version += 1
            continue

        if tool_call.tool_name == "update_homepage":
            item, version = await _update_homepage(
                payload=payload,
                user_id=user_id,
                settings=settings,
                request=request,
                arguments=_validate_tool_arguments(WorkspaceUpdateHomepageArgs, tool_call.arguments),
            )
            mutation_items.append(item)
            latest_version = version
            mutation_version += 1
            continue

        if tool_call.tool_name == "delete_content_item":
            args = _validate_tool_arguments(WorkspaceDeleteContentItemArgs, tool_call.arguments)
            await _delete_content_item(
                payload=payload, user_id=user_id, settings=settings, request=request, arguments=args
            )
            deleted_item_ids.append(args.item_id)
            mutation_version += 1
            continue

        raise BadRequest(
            "Workspace action planner produced an unsupported content item tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    if list_version != mutation_version:
        page = await _list_content_items(
            payload=payload,
            user_id=user_id,
            settings=settings,
            arguments=WorkspaceListContentItemsArgs(),
        )
        latest_items = list(page.items)
        latest_total = page.total

    return _ContentItemToolCallsResult(
        content_items=latest_items,
        content_version=latest_version,
        deleted_item_ids=deleted_item_ids,
        mutation_items=mutation_items,
        total=latest_total,
    )


async def _resolve_content_item_read_context(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    permission: str,
    missing_target_message: str,
) -> tuple[ProjectRequestContext, ProjectContentCanonicalItemReadService, UUID, UUID]:
    if payload.project_id is None:
        raise BadRequest(missing_target_message, error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED")

    project_ctx = await get_project_context(project_id=payload.project_id, user_id=user_id)
    if project_ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    await ensure_project_permission_granted(
        permission,
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
    return (
        project_ctx,
        ProjectContentCanonicalItemReadService(
            repo=ProjectContentItemsRepository(
                resolve_project_tenant_context(project_id=project_ctx.project_id, runtime_id=runtime_ctx.runtime_id)
            )
        ),
        runtime_ctx.site_id,
        environment.id,
    )


async def _resolve_content_item_write_context(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    request: Request | None,
    permission: str,
    missing_target_message: str,
) -> tuple[ProjectRequestContext, ProjectContentCanonicalItemsService, UUID, UUID, UUID]:
    if payload.project_id is None:
        raise BadRequest(missing_target_message, error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED")

    project_ctx = await get_project_context(project_id=payload.project_id, user_id=user_id)
    if project_ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    await ensure_project_permission_granted(
        permission,
        user_id=user_id,
        ctx=project_ctx,
        error_code="PERMISSION_DENIED",
    )
    lifecycle_dispatcher = _request_lifecycle_dispatcher(request)
    runtime_ctx = await ProjectRuntimeService(settings).get_context_by_project(
        project_id=project_ctx.project_id,
        actor_user_id=user_id,
    )
    environment = await ProjectEnvironmentsService(runtime_ctx.tenant_context).resolve_environment_target(
        project_id=project_ctx.project_id,
        target=None,
        default_key=ProjectEnvironmentKey.PRODUCTION,
    )
    repo = ProjectContentItemsRepository(
        resolve_project_tenant_context(project_id=project_ctx.project_id, runtime_id=runtime_ctx.runtime_id)
    )
    return (
        project_ctx,
        ProjectContentCanonicalItemsService(
            repo=repo,
            entity_manager=EntityManager(items_repo=repo, lifecycle=lifecycle_dispatcher),
            organization_id=project_ctx.organization_id,
        ),
        runtime_ctx.site_id,
        environment.id,
        runtime_ctx.runtime_id,
    )


def _request_lifecycle_dispatcher(request: Request | None) -> LifecycleDispatcher:
    dispatcher = getattr(getattr(getattr(request, "app", None), "state", None), "lifecycle_dispatcher", None)
    if dispatcher is None:
        raise APIError(
            "Workspace content item writes require the application lifecycle dispatcher",
            error="AI_WORKSPACE_ACTION_LIFECYCLE_DISPATCHER_UNAVAILABLE",
            status_code=503,
        )
    return cast(LifecycleDispatcher, dispatcher)


async def _read_project_source_manifest(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
) -> ProjectSourceManifestOut:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:settings:read",
        missing_target_message="A target project is required to read project source",
    )
    return await ProjectSourceService(settings).get_source_manifest(project_id=project_ctx.project_id)


async def _read_project_source_file(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceReadProjectSourceArgs,
) -> ProjectSourceFileOut:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:settings:read",
        missing_target_message="A target project is required to read project source",
    )
    if not arguments.file_path:
        raise BadRequest(
            "Project source file path is required",
            error="PROJECT_SOURCE_FILE_PATH_INVALID",
        )
    return await ProjectSourceService(settings).get_source_file(
        project_id=project_ctx.project_id,
        path=arguments.file_path,
    )


async def _write_project_source_file(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceWriteProjectSourceFileArgs,
) -> ProjectSourceFileOut:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:settings:manage",
        missing_target_message="A target project is required to write project source",
    )
    return await ProjectSourceService(settings).upsert_source_file(
        project_id=project_ctx.project_id,
        path=arguments.path,
        payload=ProjectSourceFileUpsertIn(
            role=arguments.role,
            language=arguments.language,
            contents=arguments.contents,
        ),
        actor_user_id=user_id,
    )


async def _delete_project_source_file(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceDeleteProjectSourceFileArgs,
) -> ProjectSourceFileDeleteOut:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:settings:manage",
        missing_target_message="A target project is required to delete project source",
    )
    return await ProjectSourceService(settings).delete_source_file(
        project_id=project_ctx.project_id,
        path=arguments.path,
        actor_user_id=user_id,
    )


def _patch_section(data: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    return {setting_key: data[arg_key] for arg_key, setting_key in mapping.items() if arg_key in data}


def _site_settings_patch(arguments: WorkspaceUpdateSiteSettingsArgs) -> dict[str, Any]:
    data = arguments.model_dump(exclude_unset=True)
    patch: dict[str, Any] = {}

    site = _patch_section(
        data,
        {
            "site_name": "name",
            "site_description": "description",
            "site_url": "url",
            "logo_url": "logo_url",
            "logo_asset_id": "logo_asset_id",
            "favicon_url": "favicon_url",
            "favicon_asset_id": "favicon_asset_id",
            "contact_email": "contact_email",
        },
    )
    if site:
        patch["site"] = site

    seo = _patch_section(
        data,
        {
            "default_title": "default_title",
            "default_description": "default_description",
            "og_image_url": "og_image_url",
            "og_image_asset_id": "og_image_asset_id",
            "robots_directive": "robots_directive",
            "sitemap_enabled": "sitemap_enabled",
        },
    )
    if seo:
        patch["seo"] = seo

    localization = _patch_section(
        data,
        {
            "supported_locales": "supported_locales",
            "default_locale": "default_locale",
            "fallback_locale": "fallback_locale",
            "timezone": "timezone",
        },
    )
    if localization:
        patch["site_localization"] = localization

    source = _patch_section(
        data,
        {
            "framework": "framework",
            "source_provider": "source_provider",
            "package_manager": "package_manager",
            "root_directory": "root_directory",
            "build_command": "build_command",
            "output_directory": "output_directory",
            "artifact_strategy": "artifact_strategy",
        },
    )
    if source:
        patch["project_source"] = source

    analytics = _patch_section(
        data,
        {
            "google_analytics_enabled": "enabled",
            "google_analytics_measurement_id": "measurement_id",
        },
    )
    if "google_analytics_measurement_id" in data and "google_analytics_enabled" not in data:
        analytics["enabled"] = data["google_analytics_measurement_id"] is not None
    if analytics:
        patch["analytics"] = {"google_analytics": analytics}

    if not patch:
        raise BadRequest(
            "At least one site settings field is required",
            error="AI_WORKSPACE_ACTION_ARGUMENTS_INVALID",
        )
    return patch


async def _update_site_settings(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    arguments: WorkspaceUpdateSiteSettingsArgs,
) -> ProjectSettingsDetail:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:settings:manage",
        missing_target_message="A target project is required to update site settings",
    )
    return await ProjectSettingsService(settings).patch_core(
        project_id=project_ctx.project_id,
        patch=_site_settings_patch(arguments),
        updated_by=user_id,
    )


async def _publish_project_source_release(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
) -> ReleasePublishOut:
    project_ctx = await _resolve_project_source_action_context(
        payload=payload,
        user_id=user_id,
        permission="project:release:publish",
        missing_target_message="A target project is required to publish a project release",
    )
    runtime_ctx = await ProjectRuntimeService(settings).get_context_by_project(
        project_id=project_ctx.project_id,
        actor_user_id=user_id,
    )
    return await ProjectReleasesService(
        resolve_project_tenant_context(project_id=project_ctx.project_id, runtime_id=runtime_ctx.runtime_id)
    ).publish_release_out(
        workspace_id=runtime_ctx.workspace_id,
        site_id=runtime_ctx.site_id,
        actor_user_id=user_id,
    )


async def _execute_project_source_tool_calls(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    settings: Settings,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> _ProjectSourceToolCallsResult:
    source_manifest: ProjectSourceManifestOut | None = None
    publish_release = False
    for tool_call in tool_calls:
        if tool_call.tool_name == "read_project_source":
            source_manifest = await _read_project_source_manifest(payload=payload, user_id=user_id, settings=settings)
            continue
        if tool_call.tool_name == "write_project_source_file":
            args = _validate_tool_arguments(WorkspaceWriteProjectSourceFileArgs, tool_call.arguments)
            await _write_project_source_file(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=args,
            )
            publish_release = publish_release or args.publish_release
            source_manifest = None
            continue
        if tool_call.tool_name == "delete_project_source_file":
            args = _validate_tool_arguments(WorkspaceDeleteProjectSourceFileArgs, tool_call.arguments)
            await _delete_project_source_file(
                payload=payload,
                user_id=user_id,
                settings=settings,
                arguments=args,
            )
            publish_release = publish_release or args.publish_release
            source_manifest = None
            continue

        raise BadRequest(
            "Workspace action planner produced an unsupported project source tool call",
            error="AI_WORKSPACE_ACTION_PLAN_INVALID",
        )

    manifest = (
        source_manifest
        if source_manifest is not None
        else await _read_project_source_manifest(payload=payload, user_id=user_id, settings=settings)
    )
    release = (
        await _publish_project_source_release(payload=payload, user_id=user_id, settings=settings)
        if publish_release
        else None
    )
    return _ProjectSourceToolCallsResult(source_manifest=manifest, release=release)


async def _execute_site_update_tool_calls(
    *,
    payload: WorkspaceAIActionRequest,
    request: Request | None,
    user_id: UUID,
    settings: Settings,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> _SiteUpdateToolCallsResult:
    content_tool_calls = [tool_call for tool_call in tool_calls if tool_call.tool_name in _CONTENT_ITEM_TOOL_ACTIONS]
    source_tool_calls = [tool_call for tool_call in tool_calls if tool_call.tool_name in _PROJECT_SOURCE_TOOL_ACTIONS]
    content_result = await _execute_content_item_tool_calls(
        payload=payload,
        request=request,
        user_id=user_id,
        settings=settings,
        tool_calls=content_tool_calls,
    )
    source_result = await _execute_project_source_tool_calls(
        payload=payload,
        user_id=user_id,
        settings=settings,
        tool_calls=source_tool_calls,
    )
    return _SiteUpdateToolCallsResult(content=content_result, source=source_result)


async def _resolve_project_source_action_context(
    *,
    payload: WorkspaceAIActionRequest,
    user_id: UUID,
    permission: str,
    missing_target_message: str,
) -> ProjectRequestContext:
    if payload.project_id is None:
        raise BadRequest(missing_target_message, error="AI_WORKSPACE_ACTION_PROJECT_REQUIRED")

    project_ctx = await get_project_context(project_id=payload.project_id, user_id=user_id)
    if project_ctx.workspace_id != payload.workspace_id:
        raise Forbidden("Workspace access denied", error="WORKSPACE_ACCESS_DENIED")

    await ensure_project_permission_granted(
        permission,
        user_id=user_id,
        ctx=project_ctx,
        error_code="PERMISSION_DENIED",
    )
    return project_ctx


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


def _project_source_framework_label(framework: str) -> str:
    return "Astro" if framework == "astro" else "React+Vite"


def _created_project_response(
    project: ProjectListItemOut,
    message: str,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceCreateProjectArgs,
    source_manifest: ProjectSourceManifestOut,
    domain: DomainBindingOut | None,
    content_bootstrap: _CreatedProjectContentBootstrap,
) -> WorkspaceAIActionResponse:
    site_structure_arguments = _created_project_site_structure_arguments(content_bootstrap)
    framework_label = _project_source_framework_label(source_manifest.framework)
    if _is_chinese(message):
        content = (
            f"已在当前工作区创建项目“{project.name}”，并生成 {len(source_manifest.files)} 个 {framework_label} 项目源码文件、"
            "页面模型、可复用区块模型和首页内容。你可以进入编辑器查看站点预览、内容和源码。"
        )
        label = "打开编辑器"
    else:
        content = (
            f'Created "{project.name}" in this workspace with {len(source_manifest.files)} {framework_label} source files, '
            "a page model, a reusable block model, and home page content."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="create_project",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_created_project_completed_steps(
            decision=decision,
            source_manifest=source_manifest,
            domain=domain,
            content_bootstrap=content_bootstrap,
            site_structure_arguments=site_structure_arguments,
        ),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_project",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.read_project_source",
                status="completed",
                arguments=cast(
                    JsonObject,
                    {
                        "files": [
                            {"path": file.path, "role": file.role, "language": file.language}
                            for file in source_manifest.files
                        ],
                    },
                ),
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_content_model",
                status="completed",
                arguments=cast(
                    JsonObject,
                    {
                        "modelId": str(content_bootstrap.content_model.id),
                        "modelKey": content_bootstrap.content_model.singular_key,
                    },
                ),
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_content_model",
                status="completed",
                arguments=cast(
                    JsonObject,
                    {
                        "modelId": str(content_bootstrap.reusable_block_model.id),
                        "modelKey": content_bootstrap.reusable_block_model.singular_key,
                    },
                ),
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_content_item",
                status="completed",
                arguments=cast(
                    JsonObject,
                    {
                        "itemId": str(content_bootstrap.content_item.id),
                        "modelKey": content_bootstrap.content_item.model_key,
                    },
                ),
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_site_structure",
                status="completed",
                arguments=site_structure_arguments,
            ),
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.publish_project_release",
                status="completed",
                arguments=_created_project_release_tool_arguments(content_bootstrap.release),
            ),
        ],
        project=project,
        content_model=content_bootstrap.content_model,
        content_models=[content_bootstrap.content_model, content_bootstrap.reusable_block_model],
        content_item=content_bootstrap.content_item,
        content_version=content_bootstrap.content_version,
        domain=domain,
        release=content_bootstrap.release,
        source_manifest=source_manifest,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{project.id}/editor"),
    )


def _created_project_release_tool_arguments(release: ReleasePublishOut) -> JsonObject:
    release_record = release.release
    selection_count = getattr(release, "selection_count", None)
    if not isinstance(selection_count, int):
        selection_count = getattr(release, "selected_items", None)
    return {
        "releaseId": str(release_record.id),
        "releaseNumber": release_record.release_number,
        "selectionCount": selection_count if isinstance(selection_count, int) else None,
    }


def _created_project_site_structure_arguments(content_bootstrap: _CreatedProjectContentBootstrap) -> JsonObject:
    fields = content_bootstrap.content_version.fields_snapshot if content_bootstrap.content_version is not None else {}
    route_path = _read_string_field(fields, "path") or "/"
    bindings: list[JsonObject] = []
    for presentation in _site_builder_page_presentations(fields):
        if presentation.kind != "slot_mapping" or presentation.payload is None:
            continue
        raw_bindings = presentation.payload.get("bindings")
        if not isinstance(raw_bindings, list):
            continue
        for binding in raw_bindings:
            if not isinstance(binding, dict):
                continue
            component_key = binding.get("componentKey")
            binding_key = binding.get("bindingKey")
            if not isinstance(component_key, str) or not isinstance(binding_key, str):
                continue
            item: JsonObject = {
                "componentKey": component_key,
                "bindingKey": binding_key,
            }
            payload = binding.get("payload")
            if isinstance(payload, dict):
                item["payload"] = payload
            bindings.append(item)
    return {
        "routePath": route_path,
        "hierarchyRootItemId": str(content_bootstrap.content_item.id),
        "hierarchyNodeCount": 1,
        "componentBindings": bindings,
    }


def _created_project_completed_steps(
    *,
    decision: WorkspaceAIPlannerDecision,
    source_manifest: ProjectSourceManifestOut,
    domain: DomainBindingOut | None,
    content_bootstrap: _CreatedProjectContentBootstrap,
    site_structure_arguments: JsonObject,
) -> list[WorkspaceAIActionExecutionStep]:
    domain_detail = "已登记平台域名，可在网站控制中查看" if domain is not None else "未登记项目域名"
    route_path = site_structure_arguments.get("routePath")
    bindings = site_structure_arguments.get("componentBindings")
    component_binding_count = len(bindings) if isinstance(bindings, list) else 0
    site_structure_detail = (
        f"{route_path} · {component_binding_count} 个组件绑定"
        if isinstance(route_path, str) and route_path
        else f"{component_binding_count} 个组件绑定"
    )
    return [
        WorkspaceAIActionExecutionStep(
            id="planner",
            title="理解指令并选择工作区工具",
            status="completed",
            detail=decision.user_visible_plan or None,
        ),
        WorkspaceAIActionExecutionStep(
            id="project",
            title="创建项目容器",
            status="completed",
            tool_name="workspace.create_project",
        ),
        WorkspaceAIActionExecutionStep(
            id="domain",
            title="登记项目域名",
            status="completed",
            detail=domain_detail,
        ),
        WorkspaceAIActionExecutionStep(
            id="source",
            title="生成可读项目源码",
            status="completed",
            detail=f"{len(source_manifest.files)} 个源码文件 · {_project_source_framework_label(source_manifest.framework)}",
            tool_name="workspace.read_project_source",
        ),
        WorkspaceAIActionExecutionStep(
            id="content-model",
            title="创建页面内容模型",
            status="completed",
            detail=content_bootstrap.content_model.singular_key,
            tool_name="workspace.create_content_model",
        ),
        WorkspaceAIActionExecutionStep(
            id="reusable-block-model",
            title="创建可复用区块模型",
            status="completed",
            detail=content_bootstrap.reusable_block_model.singular_key,
            tool_name="workspace.create_content_model",
        ),
        WorkspaceAIActionExecutionStep(
            id="content-item",
            title="创建首页内容",
            status="completed",
            detail=str(content_bootstrap.content_item.id),
            tool_name="workspace.create_content_item",
        ),
        WorkspaceAIActionExecutionStep(
            id="site-structure",
            title="同步路由、页面树和组件绑定",
            status="completed",
            detail=site_structure_detail,
            tool_name="workspace.create_site_structure",
        ),
        WorkspaceAIActionExecutionStep(
            id="release",
            title="发布首个项目版本",
            status="completed",
            detail=f"Release {content_bootstrap.release.release.release_number}",
            tool_name="workspace.publish_project_release",
        ),
        WorkspaceAIActionExecutionStep(
            id="editor",
            title="生成编辑器入口",
            status="completed",
        ),
    ]


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


def _content_model_list_response(
    content_models: list[ContentModelOut],
    total: int,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceListContentModelsArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已读取目标项目的内容模型，共找到 {total} 个。" if content_models else "目标项目还没有可用的内容模型。"
        )
        label = "查看内容模型"
    else:
        content = (
            f"Read {len(content_models)} content models from the target project."
            if content_models
            else "The target project does not have content models yet."
        )
        label = "View content models"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="list_content_models",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "读取内容模型列表"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.list_content_models",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        content_model_items=content_models,
        total=total,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/models"),
    )


def _updated_content_model_response(
    content_model: ContentModelMutationOut,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceUpdateContentModelArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = f"已更新内容模型“{content_model.name}”。你可以进入模型编辑器继续调整字段、关系和工作流。"
        label = "编辑内容模型"
    else:
        content = f'Updated the content model "{content_model.name}".'
        label = "Edit content model"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="update_content_model",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "更新内容模型并生成编辑入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.update_content_model",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        content_model=content_model,
        content_models=[content_model],
        navigation=WorkspaceAIActionNavigation(
            label=label,
            path=f"/projects/{payload.project_id}/content/models/edit?modelId={content_model.id}",
        ),
    )


def _deleted_content_model_response(
    model_id: UUID,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceDeleteContentModelArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = "已删除目标内容模型。你可以进入内容模型列表确认当前项目结构。"
        label = "查看内容模型"
    else:
        content = "Deleted the target content model. Open content models to inspect the current project structure."
        label = "View content models"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="delete_content_model",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "删除内容模型并刷新结构入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.delete_content_model",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        deleted_content_model_id=model_id,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/models"),
    )


def _content_model_tool_calls_response(
    result: _ContentModelToolCallsResult,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已执行 {len(tool_calls)} 个内容模型操作，当前项目共有 {result.total} 个内容模型。"
            "你可以进入内容模型继续调整站点结构。"
        )
        label = "查看内容模型"
    else:
        content = (
            f"Executed {len(tool_calls)} content model operations. The project now has {result.total} content models."
        )
        label = "View content models"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=tool_calls[0].tool_name,
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps_for_tool_calls(tool_calls, "同步内容模型并刷新站点结构入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="completed",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
        content_model=result.mutation_models[0] if result.mutation_models else None,
        content_models=result.mutation_models,
        content_model_items=result.content_model_items,
        deleted_content_model_id=result.deleted_model_ids[-1] if result.deleted_model_ids else None,
        total=result.total,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/models"),
    )


def _content_item_list_response(
    content_items: list[ContentItemOut],
    total: int,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceListContentItemsArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已读取目标项目的内容条目，共找到 {total} 个。" if content_items else "目标项目还没有可用的内容条目。"
        )
        label = "查看内容库"
    else:
        content = (
            f"Read {len(content_items)} content items from the target project."
            if content_items
            else "The target project does not have content items yet."
        )
        label = "View content library"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="list_content_items",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "读取内容条目列表"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.list_content_items",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        content_item=content_items[0] if content_items else None,
        content_items=content_items,
        total=total,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/library"),
    )


def _created_content_item_response(
    content_item: ContentItemOut,
    content_version: ContentVersionOut | None,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceCreateContentItemArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已创建并发布内容条目“{content_item.title or content_item.slug}”。"
            if arguments.publish
            else f"已创建内容条目“{content_item.title or content_item.slug}”。你可以进入内容库继续编辑和发布。"
        )
        label = "编辑内容"
    else:
        content = (
            f'Created and published the content item "{content_item.title or content_item.slug}".'
            if arguments.publish
            else f'Created the content item "{content_item.title or content_item.slug}".'
        )
        label = "Edit content"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="create_content_item",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "创建内容条目并生成编辑入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.create_content_item",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        content_item=content_item,
        content_items=[content_item],
        content_version=content_version,
        navigation=WorkspaceAIActionNavigation(
            label=label,
            path=f"/projects/{payload.project_id}/content/library/{content_item.id}",
        ),
    )


def _updated_content_item_response(
    content_item: ContentItemOut,
    content_version: ContentVersionOut,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceUpdateContentItemArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已保存并发布内容条目“{content_item.title or content_item.slug}”。"
            if arguments.publish
            else f"已保存内容条目“{content_item.title or content_item.slug}”的新草稿版本。"
        )
        label = "查看内容"
    else:
        content = (
            f'Saved and published "{content_item.title or content_item.slug}".'
            if arguments.publish
            else f'Saved a new draft version for "{content_item.title or content_item.slug}".'
        )
        label = "View content"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="update_content_item",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "保存内容草稿并生成编辑入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.update_content_item",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        content_item=content_item,
        content_items=[content_item],
        content_version=content_version,
        navigation=WorkspaceAIActionNavigation(
            label=label,
            path=f"/projects/{payload.project_id}/content/library/{content_item.id}",
        ),
    )


def _updated_homepage_response(
    content_item: ContentItemOut,
    content_version: ContentVersionOut,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceUpdateHomepageArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = f"已更新首页内容“{content_item.title or content_item.slug}”。你可以进入编辑器查看站点预览。"
        label = "打开编辑器"
    else:
        content = f'Updated the homepage content "{content_item.title or content_item.slug}".'
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="update_homepage",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "保存首页草稿并刷新编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.update_homepage",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        content_item=content_item,
        content_items=[content_item],
        content_version=content_version,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
    )


def _deleted_content_item_response(
    item_id: UUID,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceDeleteContentItemArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = "已删除目标内容条目。你可以进入内容库确认当前内容结构。"
        label = "查看内容库"
    else:
        content = "Deleted the target content item. Open the content library to inspect the current content structure."
        label = "View content library"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="delete_content_item",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "删除内容条目并刷新内容入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.delete_content_item",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json", by_alias=True)),
            )
        ],
        deleted_content_item_id=item_id,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/library"),
    )


def _content_item_tool_calls_response(
    result: _ContentItemToolCallsResult,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = f"已执行 {len(tool_calls)} 个内容操作，当前项目共有 {result.total} 个内容条目。你可以进入内容库继续编辑、预览和发布。"
        label = "查看内容库"
    else:
        content = (
            f"Executed {len(tool_calls)} content item operations. "
            f"The target project now has {result.total} content items."
        )
        label = "View content library"
    primary_item = (
        result.mutation_items[-1]
        if result.mutation_items
        else result.content_items[0]
        if result.content_items
        else None
    )
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=tool_calls[0].tool_name,
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps_for_tool_calls(tool_calls, "同步内容条目并刷新内容库入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="completed",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
        content_item=primary_item,
        content_items=result.content_items,
        content_version=result.content_version,
        deleted_content_item_id=result.deleted_item_ids[-1] if result.deleted_item_ids else None,
        total=result.total,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/content/library"),
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


def _read_project_source_response(
    source_manifest: ProjectSourceManifestOut | None,
    source_file: ProjectSourceFileOut | None,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceReadProjectSourceArgs,
) -> WorkspaceAIActionResponse:
    source_summary = (
        f"`{source_file.path}`"
        if source_file is not None
        else f"{len(source_manifest.files)} 个文件"
        if source_manifest is not None
        else "0 个文件"
    )
    if _is_chinese(payload.message):
        content = f"已读取目标项目源码：{source_summary}。你可以进入编辑器查看预览和源码。"
        label = "打开编辑器"
    else:
        content = (
            f"Read the target project source file `{source_file.path}`."
            if source_file is not None
            else f"Read the target project's source manifest with {len(source_manifest.files) if source_manifest else 0} files."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="read_project_source",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "读取项目源码结构并生成编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.read_project_source",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        source_manifest=source_manifest,
        source_file=source_file,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
    )


def _write_project_source_file_response(
    source_file: ProjectSourceFileOut,
    release: ReleasePublishOut | None,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceWriteProjectSourceFileArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已写入项目源码文件 `{source_file.path}` 并发布新版本。你可以进入编辑器查看更新后的源码和预览。"
            if release is not None
            else f"已写入项目源码文件 `{source_file.path}`。你可以进入编辑器查看更新后的源码和预览。"
        )
        label = "打开编辑器"
    else:
        content = (
            f"Wrote `{source_file.path}` and published a new release. Open the editor to inspect the update."
            if release is not None
            else f"Wrote the project source file `{source_file.path}`. Open the editor to inspect the update."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="write_project_source_file",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "写入项目源码文件并生成编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.write_project_source_file",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        source_file=source_file,
        release=release,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
    )


def _delete_project_source_file_response(
    source_file_delete: ProjectSourceFileDeleteOut,
    release: ReleasePublishOut | None,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceDeleteProjectSourceFileArgs,
) -> WorkspaceAIActionResponse:
    if _is_chinese(payload.message):
        content = (
            f"已删除项目源码文件 `{source_file_delete.path}` 并发布新版本。你可以进入编辑器查看当前源码结构。"
            if release is not None
            else f"已删除项目源码文件 `{source_file_delete.path}`。你可以进入编辑器查看当前源码结构。"
        )
        label = "打开编辑器"
    else:
        content = (
            f"Deleted `{source_file_delete.path}` and published a new release. Open the editor to inspect the source tree."
            if release is not None
            else f"Deleted the project source file `{source_file_delete.path}`. Open the editor to inspect the source tree."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="delete_project_source_file",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, "删除项目源码文件并生成编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name="workspace.delete_project_source_file",
                status="completed",
                arguments=cast(JsonObject, arguments.model_dump(mode="json")),
            )
        ],
        source_file_delete=source_file_delete,
        release=release,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
    )


def _updated_site_settings_response(
    site_settings: ProjectSettingsDetail,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    arguments: WorkspaceUpdateSiteSettingsArgs,
) -> WorkspaceAIActionResponse:
    updated_fields = set(arguments.model_dump(exclude_unset=True))
    updates_source_settings = bool(updated_fields & _PROJECT_SOURCE_SETTINGS_FIELDS)
    updates_public_site_settings = bool(updated_fields - _PROJECT_SOURCE_SETTINGS_FIELDS)
    if _is_chinese(payload.message):
        if updates_source_settings and not updates_public_site_settings:
            content = "已更新目标项目的项目源码配置。你可以进入项目配置页面查看框架、源码提供方和构建设置。"
            label = "打开项目配置"
        elif updates_source_settings:
            content = "已更新目标项目的网站配置和项目源码配置。你可以进入项目配置页面查看源码构建设置。"
            label = "打开项目配置"
        else:
            content = "已更新目标项目的网站配置。你可以进入网站配置页面查看品牌、SEO、分析和本地化设置。"
            label = "打开网站配置"
    else:
        if updates_source_settings and not updates_public_site_settings:
            content = "Updated the target project's source and build settings."
            label = "Open project settings"
        elif updates_source_settings:
            content = "Updated the target project's website settings and source settings."
            label = "Open project settings"
        else:
            content = "Updated the target project's website settings."
            label = "Open website config"
    navigation_path = (
        f"/projects/{payload.project_id}/settings/general"
        if updates_source_settings
        else f"/projects/{payload.project_id}/website/config"
    )
    execution_result_title = (
        "更新项目源码配置并生成项目配置入口"
        if updates_source_settings and not updates_public_site_settings
        else "更新网站配置并生成配置入口"
    )
    tool_name = (
        "workspace.update_project_source_settings"
        if updates_source_settings and not updates_public_site_settings
        else "workspace.update_site_settings"
    )
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action="update_site_settings",
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps(decision, execution_result_title),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=tool_name,
                status="completed",
                arguments=cast(
                    JsonObject,
                    arguments.model_dump(mode="json", by_alias=True, exclude_unset=True),
                ),
            )
        ],
        site_settings=site_settings,
        navigation=WorkspaceAIActionNavigation(label=label, path=navigation_path),
    )


def _project_source_tool_calls_response(
    result: _ProjectSourceToolCallsResult,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    source_manifest = result.source_manifest
    if _is_chinese(payload.message):
        content = (
            f"已执行 {len(tool_calls)} 个项目源码操作并发布新版本，当前源码结构共 {len(source_manifest.files)} 个文件。你可以进入编辑器查看源码和预览。"
            if result.release is not None
            else f"已执行 {len(tool_calls)} 个项目源码操作，当前源码结构共 {len(source_manifest.files)} 个文件。你可以进入编辑器查看源码和预览。"
        )
        label = "打开编辑器"
    else:
        content = (
            f"Executed {len(tool_calls)} project source operations"
            f"{' and published a new release' if result.release is not None else ''}. "
            f"The source manifest now contains {len(source_manifest.files)} files."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=tool_calls[0].tool_name,
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps_for_tool_calls(tool_calls, "同步项目源码并生成编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="completed",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
        source_manifest=source_manifest,
        release=result.release,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
    )


def _site_update_tool_calls_response(
    result: _SiteUpdateToolCallsResult,
    payload: WorkspaceAIActionRequest,
    decision: WorkspaceAIPlannerDecision,
    tool_calls: list[WorkspaceAIPlannerToolCall],
) -> WorkspaceAIActionResponse:
    source_manifest = result.source.source_manifest
    primary_item = (
        result.content.mutation_items[-1]
        if result.content.mutation_items
        else result.content.content_items[0]
        if result.content.content_items
        else None
    )
    if _is_chinese(payload.message):
        release_hint = "并发布新版本，" if result.source.release is not None else ""
        content = (
            f"已执行 {len(tool_calls)} 个站点更新操作，{release_hint}当前源码结构共 "
            f"{len(source_manifest.files)} 个文件。你可以进入编辑器查看站点预览、内容和源码。"
        )
        label = "打开编辑器"
    else:
        content = (
            f"Executed {len(tool_calls)} site update operations"
            f"{' and published a new release' if result.source.release is not None else ''}. "
            f"The source manifest now contains {len(source_manifest.files)} files."
        )
        label = "Open editor"
    return WorkspaceAIActionResponse(
        kind="tool_call",
        action=tool_calls[0].tool_name,
        content=content,
        plan=decision.user_visible_plan,
        execution_steps=_completed_steps_for_tool_calls(tool_calls, "同步站点内容、源码和编辑器入口"),
        tool_calls=[
            WorkspaceAIActionToolCallOut(
                tool_name=f"workspace.{tool_call.tool_name}",
                status="completed",
                arguments=tool_call.arguments,
            )
            for tool_call in tool_calls
        ],
        content_item=primary_item,
        content_items=result.content.content_items,
        content_version=result.content.content_version,
        deleted_content_item_id=(result.content.deleted_item_ids[-1] if result.content.deleted_item_ids else None),
        source_manifest=source_manifest,
        release=result.source.release,
        total=result.content.total,
        navigation=WorkspaceAIActionNavigation(label=label, path=f"/projects/{payload.project_id}/editor"),
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


def _completed_steps(
    decision: WorkspaceAIPlannerDecision, final_step_title: str
) -> list[WorkspaceAIActionExecutionStep]:
    tool_name = _workspace_tool_name_for_call(decision.tool_call) if decision.tool_call else None
    tool_label = _workspace_tool_label_for_call(decision.tool_call) if decision.tool_call else "工作区工具"
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
                title=f"执行{_workspace_tool_label_for_call(tool_call)}",
                status="completed",
                tool_name=_workspace_tool_name_for_call(tool_call),
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
                "authoringMode": "builder_managed for visual AI website creation; source_managed only when source ownership is explicit.",
                "framework": "Optional source framework. Use astro only when the user explicitly requests Astro; otherwise omit it so React + Vite remains the default.",
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
            "name": "workspace_list_content_models",
            "description": "List content models inside an existing target project. Requires project_id from context.",
            "arguments": {
                "query": "Optional model search text, or null for all recent models.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_update_content_model",
            "description": "Update a content model's display name, description, or fields inside an existing target project. Requires project_id and a modelId. Use fieldMutations for field add/update/delete and fieldOrder for full field ordering.",
            "arguments": {
                "modelId": "Existing content model id.",
                "name": "Optional new display name.",
                "description": "Optional new model description.",
                "fieldMutations": "Optional ordered field mutations. Each item has action add/update/delete, key, and for add label + scalar. Optional scalar values: text, long_text, number, boolean, date_time, json.",
                "fieldOrder": "Optional complete field key order after field mutations are applied.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_delete_content_model",
            "description": "Delete a content model inside an existing target project. Requires project_id and a modelId.",
            "arguments": {
                "modelId": "Existing content model id.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_list_content_items",
            "description": "List content items inside an existing target project. Requires project_id from context.",
            "arguments": {
                "modelKey": "Optional content model key filter, or null for all content items.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_create_content_item",
            "description": "Create a content item inside an existing target project. Requires project_id and a modelKey. For website pages use modelKey page and include fields.path with the route path such as /about; routable page paths are synchronized to route bindings. Set publish true only when fields are supplied and the first draft should go live.",
            "arguments": {
                "modelKey": "Existing content model singular key.",
                "title": "Content item title.",
                "locale": "Locale code, default zh-CN for Chinese requests.",
                "fields": "Optional structured field values for the first draft. For page content, include path, heroHeadline, heroSubheading, primaryCtaLabel, and sections when relevant.",
                "publish": "Whether to publish the saved first draft version.",
                "changeSummary": "Optional draft change summary.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_update_content_item",
            "description": "Save a new draft version for a content item. Requires project_id, itemId, and complete fields. When updating a routable page path, put the new route in fields.path so the route binding is synchronized. Set publish true when the saved version should go live.",
            "arguments": {
                "itemId": "Existing content item id.",
                "fields": "Structured field values for the new draft version. For page content, include path when changing the route.",
                "expectedVersion": "Optional optimistic draft version pointer.",
                "changeSummary": "Optional draft change summary.",
                "publish": "Whether to publish the saved draft version.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_update_homepage",
            "description": "Update the target project's homepage content without requiring an itemId. Use this for requests that change the site's homepage hero, route, CTA, or sections; the path argument updates the homepage route binding.",
            "arguments": {
                "modelKey": "Optional page model key, default page.",
                "title": "Optional homepage title.",
                "path": "Optional homepage route path, for example / or /company.",
                "fields": "Structured homepage field changes, such as heroHeadline, heroSubheading, primaryCtaLabel, or sections.",
                "expectedVersion": "Optional optimistic draft version pointer.",
                "changeSummary": "Optional draft change summary.",
                "publish": "Whether to publish the saved homepage version.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_delete_content_item",
            "description": "Delete a content item inside an existing target project. Requires project_id and an itemId.",
            "arguments": {
                "itemId": "Existing content item id.",
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
            "name": "workspace_read_project_source",
            "description": "Read the target project's source manifest, or read one project source file when filePath is supplied. Requires project_id from context.",
            "arguments": {
                "filePath": "Optional project-relative file path, for example src/App.tsx. Use this before editing a specific file.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_write_project_source_file",
            "description": "Create or replace one source file in the target project's managed source tree. Requires project_id from context. Set publishRelease true only when the user explicitly asks to publish the source change.",
            "arguments": {
                "path": "Project-relative file path, for example src/App.tsx.",
                "contents": "Complete UTF-8 file contents to persist.",
                "role": "Optional file role override such as source, entry, config, runtime, content, style, or types.",
                "language": "Optional editor language id such as typescriptreact, typescript, css, json, or astro.",
                "publishRelease": "Whether to publish a new project release after writing the source file.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_delete_project_source_file",
            "description": "Delete one source file from the target project's managed source tree. Requires project_id from context. Set publishRelease true only when the user explicitly asks to publish the source change.",
            "arguments": {
                "path": "Project-relative file path, for example src/App.tsx.",
                "publishRelease": "Whether to publish a new project release after deleting the source file.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_update_site_settings",
            "description": "Update public website configuration for the target project. Use this for brand identity, site URL, SEO defaults, social preview image, Google Analytics, or localization.",
            "arguments": {
                "siteName": "Optional site display name.",
                "siteDescription": "Optional site description.",
                "siteUrl": "Optional canonical site URL.",
                "logoUrl": "Optional logo URL.",
                "logoAssetId": "Optional logo asset id.",
                "faviconUrl": "Optional favicon URL.",
                "faviconAssetId": "Optional favicon asset id.",
                "contactEmail": "Optional contact email.",
                "defaultTitle": "Optional SEO default title.",
                "defaultDescription": "Optional SEO default description.",
                "ogImageUrl": "Optional social preview image URL.",
                "ogImageAssetId": "Optional social preview image asset id.",
                "robotsDirective": "Optional site-wide robots directive, for example index,follow or noindex,nofollow.",
                "sitemapEnabled": "Optional flag for exposing published public routes through sitemap.xml.",
                "googleAnalyticsEnabled": "Optional Google Analytics enabled flag.",
                "googleAnalyticsMeasurementId": "Optional Google Analytics measurement id, for example G-XXXXXXXXXX.",
                "supportedLocales": "Optional list of supported locale codes.",
                "defaultLocale": "Optional default locale code.",
                "fallbackLocale": "Optional fallback locale code.",
                "timezone": "Optional site timezone.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
        },
        {
            "name": "workspace_update_project_source_settings",
            "description": "Update project source and build configuration for the target project. Use this for React/Vite or Astro framework selection, source provider, package manager, build command, output directory, or artifact strategy.",
            "arguments": {
                "framework": "Optional project framework: react_vite or astro.",
                "sourceProvider": "Optional source provider: managed or git.",
                "packageManager": "Optional package manager: pnpm or npm.",
                "rootDirectory": "Optional source root directory.",
                "buildCommand": "Optional build command.",
                "outputDirectory": "Optional build output directory.",
                "artifactStrategy": "Optional artifact strategy: object_storage or container_image.",
                "user_visible_plan": "Concise plan shown to the user.",
            },
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
                    "authoringMode": {
                        "type": "string",
                        "enum": ["builder_managed", "source_managed"],
                        "description": "Explicit composition authority. Use builder_managed unless source ownership is requested.",
                    },
                    "framework": {
                        "type": "string",
                        "enum": ["react_vite", "astro"],
                        "description": "Optional source framework. Omit unless the user explicitly asks for Astro.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["name", "description", "authoringMode", "user_visible_plan"],
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
                name="workspace_list_content_models",
                description="List content models inside the target project.",
                properties={
                    "query": {"type": "string", "description": "Optional content model search text."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_update_content_model",
                description="Update a content model's display name, description, or fields inside the target project. Use fieldMutations for add/update/delete and fieldOrder for complete ordering.",
                properties={
                    "modelId": {"type": "string", "description": "Existing content model id."},
                    "name": {"type": "string", "description": "Optional new display name."},
                    "description": {"type": "string", "description": "Optional new model description."},
                    "fieldMutations": {
                        "type": "array",
                        "description": "Optional ordered field mutations for this model.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "enum": ["add", "update", "delete"],
                                    "description": "Field mutation action.",
                                },
                                "key": {"type": "string", "description": "Stable field key."},
                                "label": {"type": "string", "description": "Field label for add/update."},
                                "scalar": {
                                    "type": "string",
                                    "enum": ["text", "long_text", "number", "boolean", "date_time", "json"],
                                    "description": "Field scalar for add/update.",
                                },
                                "required": {"type": "boolean", "description": "Whether the field is required."},
                                "config": {"type": "object", "description": "Optional field configuration."},
                            },
                            "required": ["action", "key"],
                        },
                    },
                    "fieldOrder": {
                        "type": "array",
                        "description": "Optional complete field key order after mutations.",
                        "items": {"type": "string"},
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["modelId", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_delete_content_model",
                description="Delete a content model inside the target project.",
                properties={
                    "modelId": {"type": "string", "description": "Existing content model id."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["modelId", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_list_content_items",
                description="List content items inside the target project.",
                properties={
                    "modelKey": {"type": "string", "description": "Optional content model key filter."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_create_content_item",
                description="Create a content item inside the target project. For website pages use modelKey page and include fields.path; routable page paths are synchronized to route bindings. Set publish true only when initial fields are supplied.",
                properties={
                    "modelKey": {"type": "string", "description": "Existing content model singular key."},
                    "title": {"type": "string", "description": "Content item title."},
                    "locale": {"type": "string", "description": "Locale code."},
                    "fields": {
                        "type": "object",
                        "additionalProperties": True,
                        "description": "Optional structured field values for the first draft. For page content, include path with the route path such as /about; routable paths update route bindings.",
                    },
                    "publish": {
                        "type": "boolean",
                        "description": "Publish the saved first draft version when true.",
                    },
                    "changeSummary": {"type": "string", "description": "Optional draft change summary."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["modelKey", "title", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_update_content_item",
                description="Save a new draft version for an existing content item. For routable pages, include fields.path when changing the route so the route binding is synchronized. Set publish true when the saved version should go live.",
                properties={
                    "itemId": {"type": "string", "description": "Existing content item id."},
                    "fields": {
                        "type": "object",
                        "additionalProperties": True,
                        "description": "Structured field values for the new draft version. For page content, include path when changing the route.",
                    },
                    "expectedVersion": {"type": "integer", "description": "Optional optimistic draft version."},
                    "changeSummary": {"type": "string", "description": "Optional draft change summary."},
                    "publish": {"type": "boolean", "description": "Publish the saved draft when true."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["itemId", "fields", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_update_homepage",
                description="Update the target project's homepage content without requiring an item id; the path argument synchronizes the homepage route binding.",
                properties={
                    "modelKey": {"type": "string", "description": "Optional page model singular key."},
                    "title": {"type": "string", "description": "Optional homepage title."},
                    "path": {
                        "type": "string",
                        "description": "Optional homepage route path, for example / or /company.",
                    },
                    "fields": {
                        "type": "object",
                        "additionalProperties": True,
                        "description": "Structured homepage field changes.",
                    },
                    "expectedVersion": {"type": "integer", "description": "Optional optimistic draft version."},
                    "changeSummary": {"type": "string", "description": "Optional draft change summary."},
                    "publish": {"type": "boolean", "description": "Publish the saved draft when true."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_delete_content_item",
                description="Delete a content item inside the target project.",
                properties={
                    "itemId": {"type": "string", "description": "Existing content item id."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["itemId", "user_visible_plan"],
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
                name="workspace_read_project_source",
                description="Read the target project's source manifest, or read one source file when filePath is supplied, without changing anything.",
                properties={
                    "filePath": {
                        "type": "string",
                        "description": "Optional project-relative source file path to read before a targeted edit, for example src/App.tsx.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_write_project_source_file",
                description="Create or replace one file in the target project's managed source tree. Set publishRelease true only when the user explicitly asks to publish the source change.",
                properties={
                    "path": {"type": "string", "description": "Project-relative source file path."},
                    "contents": {"type": "string", "description": "Complete UTF-8 source file contents."},
                    "role": {
                        "type": "string",
                        "description": "Optional file role override.",
                        "enum": ["config", "entry", "runtime", "content", "style", "types", "source"],
                    },
                    "language": {"type": "string", "description": "Optional editor language id override."},
                    "publishRelease": {
                        "type": "boolean",
                        "description": "Publish a new project release after writing this source file.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["path", "contents", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_delete_project_source_file",
                description="Delete one file from the target project's managed source tree. Set publishRelease true only when the user explicitly asks to publish the source change.",
                properties={
                    "path": {"type": "string", "description": "Project-relative source file path."},
                    "publishRelease": {
                        "type": "boolean",
                        "description": "Publish a new project release after deleting this source file.",
                    },
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["path", "user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_update_site_settings",
                description="Update target project public website configuration: brand, canonical URL, SEO defaults, social preview, Google Analytics, or localization.",
                properties={
                    "siteName": {"type": "string", "description": "Optional site display name."},
                    "siteDescription": {"type": "string", "description": "Optional site description."},
                    "siteUrl": {"type": "string", "description": "Optional canonical site URL."},
                    "logoUrl": {"type": "string", "description": "Optional logo URL."},
                    "logoAssetId": {"type": "string", "description": "Optional logo asset id."},
                    "faviconUrl": {"type": "string", "description": "Optional favicon URL."},
                    "faviconAssetId": {"type": "string", "description": "Optional favicon asset id."},
                    "contactEmail": {"type": "string", "description": "Optional contact email."},
                    "defaultTitle": {"type": "string", "description": "Optional SEO default title."},
                    "defaultDescription": {"type": "string", "description": "Optional SEO default description."},
                    "ogImageUrl": {"type": "string", "description": "Optional social preview image URL."},
                    "ogImageAssetId": {"type": "string", "description": "Optional social preview image asset id."},
                    "robotsDirective": {
                        "type": "string",
                        "description": "Optional site-wide robots directive, for example index,follow or noindex,nofollow.",
                    },
                    "sitemapEnabled": {
                        "type": "boolean",
                        "description": "Optional flag for exposing published public routes through sitemap.xml.",
                    },
                    "googleAnalyticsEnabled": {
                        "type": "boolean",
                        "description": "Optional Google Analytics enabled flag.",
                    },
                    "googleAnalyticsMeasurementId": {
                        "type": "string",
                        "description": "Optional Google Analytics measurement id, for example G-XXXXXXXXXX.",
                    },
                    "supportedLocales": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of supported locale codes.",
                    },
                    "defaultLocale": {"type": "string", "description": "Optional default locale code."},
                    "fallbackLocale": {"type": "string", "description": "Optional fallback locale code."},
                    "timezone": {"type": "string", "description": "Optional site timezone."},
                    "user_visible_plan": {"type": "string", "description": "Concise plan shown to the user."},
                },
                required=["user_visible_plan"],
            ),
            _planner_function_tool(
                name="workspace_update_project_source_settings",
                description="Update target project source and build configuration: React/Vite or Astro framework selection, source provider, package manager, build command, output directory, or artifact strategy.",
                properties={
                    "framework": {
                        "type": "string",
                        "description": "Optional project framework. Use astro only when the user explicitly asks for Astro.",
                        "enum": ["react_vite", "astro"],
                    },
                    "sourceProvider": {
                        "type": "string",
                        "description": "Optional source provider.",
                        "enum": ["managed", "git"],
                    },
                    "packageManager": {
                        "type": "string",
                        "description": "Optional package manager.",
                        "enum": ["pnpm", "npm"],
                    },
                    "rootDirectory": {"type": "string", "description": "Optional source root directory."},
                    "buildCommand": {"type": "string", "description": "Optional build command."},
                    "outputDirectory": {"type": "string", "description": "Optional build output directory."},
                    "artifactStrategy": {
                        "type": "string",
                        "description": "Optional artifact strategy.",
                        "enum": ["object_storage", "container_image"],
                    },
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
        provider_tool_name=tool_name,
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
