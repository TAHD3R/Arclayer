from __future__ import annotations

from typing import Any, Protocol
from uuid import UUID

from pydantic import ConfigDict, Field, ValidationError

from src.agents.registry import ReadOnlyAgentTool
from src.agents.types import AgentRunContext, AgentToolSpec
from src.common.schemas import BaseSchema
from src.core.exceptions import BadRequest
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t


class ContentItemReadService(Protocol):
    async def list_items_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
        model_key: str | None,
        environment_id: UUID | None = None,
    ) -> PageData[Any]: ...

    async def get_item(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        item_id: UUID,
        environment_id: UUID | None = None,
    ) -> Any: ...


class ContentModelReadService(Protocol):
    async def list_models_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        environment_id: UUID | None,
        params: PageParams,
        q: str | None = None,
        ordering: str | None = None,
        category: str | None = None,
        model_kind: str | None = None,
        system_managed: bool | None = None,
    ) -> PageData[Any]: ...


class ContentListToolInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    model_key: str | None = Field(default=None, min_length=1, max_length=64)
    page: int = Field(default=1, ge=1)
    size: int = Field(default=10, ge=1, le=50)


class ContentTypesToolInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    q: str | None = Field(default=None, min_length=1, max_length=128)
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=50)


class ContentGetToolInput(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    item_id: UUID


def _validate_input[T: BaseSchema](schema: type[T], input_data: dict[str, Any]) -> T:
    try:
        return schema.model_validate(input_data)
    except ValidationError as exc:
        raise BadRequest(
            message=t("errors", "AGENT_TOOL_INPUT_INVALID"),
            error="AGENT_TOOL_INPUT_INVALID",
            details=exc.errors(),
        ) from exc


def _require_site_id(context: AgentRunContext) -> UUID:
    if context.site_id is None:
        raise BadRequest(message=t("errors", "AGENT_CONTEXT_INVALID"), error="AGENT_CONTEXT_INVALID")
    return context.site_id


def _dump(value: Any) -> Any:
    if isinstance(value, BaseSchema):
        return value.model_dump(mode="json", by_alias=True, exclude_none=True)
    if isinstance(value, (list, tuple)):
        return [_dump(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _dump(item) for key, item in value.items()}
    return value


def _compact_item(item: Any) -> dict[str, Any]:
    data = _dump(item)
    return {
        "id": data.get("id"),
        "modelKey": data.get("modelKey"),
        "title": data.get("title"),
        "slug": data.get("slug"),
        "summary": data.get("summary"),
        "status": data.get("status"),
        "visibility": data.get("visibility"),
        "locale": data.get("locale"),
        "updatedAt": data.get("updatedAt"),
    }


def _compact_model(model: Any) -> dict[str, Any]:
    data = _dump(model)
    return {
        "id": data.get("id"),
        "singularKey": data.get("singularKey"),
        "pluralKey": data.get("pluralKey"),
        "name": data.get("name"),
        "description": data.get("description"),
        "category": data.get("category"),
        "modelKind": data.get("modelKind"),
        "systemManaged": data.get("systemManaged"),
        "capabilities": data.get("capabilities", []),
    }


def _page_payload(page: PageData[Any], *, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "items": items,
        "total": page.total,
        "page": page.page,
        "size": page.size,
        "pages": page.pages,
        "next": page.next,
        "prev": page.prev,
    }


class SearchContentTool(ReadOnlyAgentTool):
    def __init__(self, service: ContentItemReadService) -> None:
        self._service = service
        self.spec = AgentToolSpec(
            name="search_content",
            description="List searchable content entries in the current project runtime.",
            required_permission="project:content:read",
            input_schema=ContentListToolInput.model_json_schema(),
        )

    async def run(self, context: AgentRunContext, input_data: dict[str, Any]) -> dict[str, Any]:
        payload = _validate_input(ContentListToolInput, input_data)
        page = await self._service.list_items_paginated(
            workspace_id=context.workspace_id,
            site_id=_require_site_id(context),
            environment_id=context.environment_id,
            params=PageParams(page=payload.page, size=payload.size),
            model_key=payload.model_key,
        )
        return _page_payload(page, items=[_compact_item(item) for item in page.items])


class ListContentTypesTool(ReadOnlyAgentTool):
    def __init__(self, service: ContentModelReadService) -> None:
        self._service = service
        self.spec = AgentToolSpec(
            name="list_content_types",
            description="List content model definitions in the current project runtime.",
            required_permission="project:content:models:read",
            input_schema=ContentTypesToolInput.model_json_schema(),
        )

    async def run(self, context: AgentRunContext, input_data: dict[str, Any]) -> dict[str, Any]:
        payload = _validate_input(ContentTypesToolInput, input_data)
        page = await self._service.list_models_paginated(
            workspace_id=context.workspace_id,
            site_id=_require_site_id(context),
            environment_id=context.environment_id,
            params=PageParams(page=payload.page, size=payload.size),
            q=payload.q,
        )
        return _page_payload(page, items=[_compact_model(model) for model in page.items])


class GetContentTool(ReadOnlyAgentTool):
    def __init__(self, service: ContentItemReadService) -> None:
        self._service = service
        self.spec = AgentToolSpec(
            name="get_content",
            description="Read one content entry from the current project runtime.",
            required_permission="project:content:read",
            input_schema=ContentGetToolInput.model_json_schema(),
        )

    async def run(self, context: AgentRunContext, input_data: dict[str, Any]) -> dict[str, Any]:
        payload = _validate_input(ContentGetToolInput, input_data)
        item = await self._service.get_item(
            workspace_id=context.workspace_id,
            site_id=_require_site_id(context),
            environment_id=context.environment_id,
            item_id=payload.item_id,
        )
        return {"item": _dump(item)}


class AnalyzeContentTool(ReadOnlyAgentTool):
    def __init__(self, service: ContentItemReadService) -> None:
        self._service = service
        self.spec = AgentToolSpec(
            name="analyze_content",
            description="Build deterministic read-only diagnostics for one content entry.",
            required_permission="project:content:read",
            input_schema=ContentGetToolInput.model_json_schema(),
        )

    async def run(self, context: AgentRunContext, input_data: dict[str, Any]) -> dict[str, Any]:
        payload = _validate_input(ContentGetToolInput, input_data)
        item = await self._service.get_item(
            workspace_id=context.workspace_id,
            site_id=_require_site_id(context),
            environment_id=context.environment_id,
            item_id=payload.item_id,
        )
        data = _dump(item)
        return {
            "itemId": data.get("id"),
            "modelKey": data.get("modelKey"),
            "hasTitle": bool(data.get("title")),
            "hasSummary": bool(data.get("summary")),
            "status": data.get("status"),
            "visibility": data.get("visibility"),
            "locale": data.get("locale"),
            "translationLocales": (data.get("translationStatus") or {}).get("locales", []),
            "workflowStage": data.get("workflowStage"),
            "publishReady": (data.get("publishReadiness") or {}).get("ready"),
        }


def build_read_only_content_tools(
    *,
    item_reads: ContentItemReadService,
    model_reads: ContentModelReadService,
) -> tuple[ReadOnlyAgentTool, ...]:
    return (
        SearchContentTool(item_reads),
        ListContentTypesTool(model_reads),
        GetContentTool(item_reads),
        AnalyzeContentTool(item_reads),
    )
