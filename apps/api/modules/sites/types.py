from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict

from apps.api.common.schemas import BaseSchema
from apps.api.modules.sites.design_document_schema import DesignDocumentV1


class RouteTemplateMatch(BaseSchema):
    model_config = ConfigDict(frozen=True)

    template_id: UUID
    entry_type_id: UUID
    params: dict[str, str]
    template_page_revision_id: UUID | None


class ResolvedEntryDocument(BaseSchema):
    model_config = ConfigDict(frozen=True)

    entry_id: UUID
    draft_rev: int
    published_rev: int
    revision: int
    revision_state: Literal["draft", "published"]
    variant_id: str | None
    document: DesignDocumentV1


class _CompiledRouteTemplate(BaseSchema):
    model_config = ConfigDict(frozen=True)

    template_id: UUID
    entry_type_id: UUID
    template_page_revision_id: UUID | None
    path_pattern: str
    segments: tuple[tuple[str, str], ...]
    specificity: int
    sort_key: tuple[int, int, str]
