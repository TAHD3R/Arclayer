from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonValue
from src.common.types.public_uuid import PublicUUID
from src.modules.sites.runtime.schema import ResolveWarningV1, SiteFlattenedSectionOut, SiteRouteResolveOut

DeliveryPerspective = Literal["published", "preview"]
DeliveryPageOut = SiteRouteResolveOut


class DeliveryMenuOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., description="Menu key.")
    items: list[dict[str, Any]] = Field(default_factory=list, description="Menu items.")


class DeliveryStyleOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    effective: dict[str, Any] | None = Field(default=None, description="Effective site style payload.")


class DeliverySectionDocumentOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    layout: dict[str, JsonValue] | None = Field(default=None, description="Optional section/root layout payload.")
    sections: list[SiteFlattenedSectionOut] = Field(
        default_factory=list,
        description="Flattened nested section instances in render order.",
    )


class DeliverySectionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: PublicUUID = Field(..., description="Section item id.")
    alias: str = Field(..., min_length=1, description="Reusable section alias / section_key.")
    title: str | None = Field(default=None, description="Section title.")
    revision: int = Field(..., ge=1, description="Resolved revision number.")
    revision_state: Literal["draft", "published"] = Field(
        ...,
        alias="revisionState",
        description="Resolved revision state.",
    )
    draft_revision: int = Field(..., alias="draftRevision", ge=0, description="Current draft revision pointer.")
    published_revision: int | None = Field(
        default=None,
        alias="publishedRevision",
        ge=0,
        description="Current published revision pointer.",
    )
    document: DeliverySectionDocumentOut = Field(..., description="Flattened section delivery document.")
    warnings: list[ResolveWarningV1] | None = Field(default=None, description="Structured delivery warnings.")


class DeliveryGlobalSetItemOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    id: str = Field(..., min_length=1, description="Global set item id.")
    name: str = Field(..., min_length=1, description="Global set item display name.")
    key: str = Field(..., min_length=1, description="Global set logical key.")
    payload: dict[str, Any] | None = Field(default=None, description="Stored binding payload.")
    section_alias: str | None = Field(default=None, alias="sectionAlias", description="Bound reusable section alias.")
    section: DeliverySectionOut | None = Field(default=None, description="Resolved reusable section document.")


class DeliveryGlobalSetOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str = Field(..., min_length=1, description="Resolved global set key.")
    items: list[DeliveryGlobalSetItemOut] = Field(default_factory=list, description="Resolved global set items.")
