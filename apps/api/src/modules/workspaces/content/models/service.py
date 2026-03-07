from __future__ import annotations

from typing import TYPE_CHECKING, Any, cast, get_args
from uuid import UUID

from apps.api.src.core.http.pagination import PageData, PageParams, paginate_items
from apps.api.src.modules.workspaces.content.contracts.schema import (
    ContentDefaultEditor,
    ContentModelCapability,
    ContentModelCategory,
    ContentModelOut,
)

if TYPE_CHECKING:
    from apps.api.src.modules.workspaces.content.repository import WorkspaceContentRepository


_SITE_BUILDER_KINDS = {"page", "template", "menu", "component", "block"}
_CONTENT_LIBRARY_KINDS = {"post", "view"}
_MODEL_CATEGORY_VALUES = frozenset(get_args(ContentModelCategory))
_MODEL_CAPABILITY_VALUES = frozenset(get_args(ContentModelCapability))
_DEFAULT_EDITOR_VALUES = frozenset(get_args(ContentDefaultEditor))


class _TypeRecordView:
    id: UUID | str
    workspace_id: UUID | str
    site_id: UUID | str
    code: str
    name: str
    kind: str
    field_schema: dict[str, object] | None
    editor_schema: dict[str, object] | None
    workflow_policy: dict[str, object] | None


def _model_category(kind: str) -> ContentModelCategory:
    if kind in _SITE_BUILDER_KINDS:
        return "site_builder"
    if kind in _CONTENT_LIBRARY_KINDS:
        return "content_library"
    if kind == "custom":
        return "custom"
    return "system"


def _read_contract(editor_schema: object) -> dict[str, Any] | None:
    if isinstance(editor_schema, dict):
        return cast(dict[str, Any], editor_schema)
    return None


def _read_contract_value(contract: dict[str, Any] | None, *keys: str) -> Any | None:
    if contract is None:
        return None
    for key in keys:
        if key in contract:
            return contract[key]
    return None


def _read_contract_text(contract: dict[str, Any] | None, *keys: str) -> str | None:
    value = _read_contract_value(contract, *keys)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Invalid content model contract text value")
    text = value.strip()
    return text or None


def _read_contract_dict(contract: dict[str, Any] | None, *keys: str) -> dict[str, Any] | None:
    value = _read_contract_value(contract, *keys)
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Invalid content model contract object value")
    return cast(dict[str, Any], value)


def _read_contract_category(kind: str, contract: dict[str, Any] | None) -> ContentModelCategory:
    value = _read_contract_value(contract, "category")
    if value is None:
        return _model_category(kind)
    if not isinstance(value, str) or value not in _MODEL_CATEGORY_VALUES:
        raise ValueError("Invalid content model contract category")
    return cast(ContentModelCategory, value)


def _model_capabilities(kind: str) -> list[ContentModelCapability]:
    if kind == "page":
        return [
            "versioned",
            "routable",
            "treeable",
            "visual_editable",
            "has_slots",
            "has_relations",
            "localizable",
            "publishable",
            "seo_managed",
        ]
    if kind == "post":
        return [
            "versioned",
            "routable",
            "rich_text_editable",
            "has_relations",
            "localizable",
            "publishable",
            "seo_managed",
        ]
    if kind in {"template", "component", "block"}:
        return ["versioned", "visual_editable", "has_slots", "has_relations", "publishable"]
    if kind == "menu":
        return ["versioned", "has_relations", "publishable"]
    if kind == "view":
        return ["queryable", "has_relations"]
    return ["versioned", "has_relations", "localizable", "publishable"]


def _read_contract_capabilities(
    kind: str,
    contract: dict[str, Any] | None,
) -> list[ContentModelCapability]:
    value = _read_contract_value(contract, "capabilities")
    if value is None:
        return _model_capabilities(kind)
    if not isinstance(value, list):
        raise ValueError("Invalid content model contract capabilities")

    capabilities: list[ContentModelCapability] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str) or item not in _MODEL_CAPABILITY_VALUES:
            raise ValueError("Invalid content model contract capability item")
        if item in seen:
            continue
        seen.add(item)
        capabilities.append(cast(ContentModelCapability, item))
    return capabilities


def _default_editor(capabilities: list[ContentModelCapability]) -> ContentDefaultEditor:
    if "visual_editable" in capabilities:
        return "visual"
    if "rich_text_editable" in capabilities:
        return "rich_text"
    if "queryable" in capabilities:
        return "table"
    return "form"


def _read_contract_default_editor(
    capabilities: list[ContentModelCapability],
    contract: dict[str, Any] | None,
) -> ContentDefaultEditor:
    value = _read_contract_value(contract, "defaultEditor", "default_editor")
    if value is None:
        return _default_editor(capabilities)
    if not isinstance(value, str) or value not in _DEFAULT_EDITOR_VALUES:
        raise ValueError("Invalid content model contract default editor")
    return cast(ContentDefaultEditor, value)


def _fallback_routing_schema(capabilities: list[ContentModelCapability]) -> dict[str, Any] | None:
    if "routable" not in capabilities:
        return None
    return {"mode": "static_or_dynamic"}


def _fallback_presentation_schema(capabilities: list[ContentModelCapability]) -> dict[str, Any] | None:
    allowed: list[str] = []
    if "visual_editable" in capabilities:
        allowed.append("visual_blueprint")
    if "rich_text_editable" in capabilities:
        allowed.append("rich_text_document")
    if "queryable" in capabilities:
        allowed.append("query_definition")
    if "has_slots" in capabilities:
        allowed.append("slot_mapping")
    if "seo_managed" in capabilities:
        allowed.append("seo")
    if not allowed:
        return None
    return {"allowed": allowed}


def _fallback_view_schema(capabilities: list[ContentModelCapability]) -> dict[str, Any] | None:
    if "queryable" not in capabilities:
        return None
    return {"defaultView": "table"}


def to_content_model_out(record: object) -> ContentModelOut:
    view = cast(_TypeRecordView, record)
    kind = str(view.kind)
    contract = _read_contract(view.editor_schema)
    capabilities = _read_contract_capabilities(kind, contract)
    routing_schema = _read_contract_dict(contract, "routingSchema", "routing_schema") or _fallback_routing_schema(
        capabilities
    )
    presentation_schema = _read_contract_dict(
        contract,
        "presentationSchema",
        "presentation_schema",
    ) or _fallback_presentation_schema(capabilities)
    view_schema = _read_contract_dict(contract, "viewSchema", "view_schema") or _fallback_view_schema(capabilities)
    return ContentModelOut(
        id=UUID(str(view.id)),
        workspace_id=UUID(str(view.workspace_id)),
        site_id=UUID(str(view.site_id)),
        key=str(view.code),
        name=str(view.name),
        description=_read_contract_text(contract, "description"),
        category=_read_contract_category(kind, contract),
        capabilities=capabilities,
        default_editor=_read_contract_default_editor(capabilities, contract),
        field_schema=view.field_schema,
        relation_schema=_read_contract_dict(contract, "relationSchema", "relation_schema"),
        routing_schema=routing_schema,
        presentation_schema=presentation_schema,
        workflow_policy=view.workflow_policy,
        view_schema=view_schema,
    )


class WorkspaceContentModelsMixin:
    if TYPE_CHECKING:
        repo: WorkspaceContentRepository

    async def list_models_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[ContentModelOut]:
        records = await self.repo.list_types(workspace_id=workspace_id, site_id=site_id)
        rows = [to_content_model_out(record) for record in records]
        return paginate_items(rows, params=params)
