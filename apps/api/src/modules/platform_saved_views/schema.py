from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonValue


class PlatformSavedViewFilter(BaseSchema):
    """One typed filter condition from a domain-owned list contract."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str = Field(..., min_length=1, max_length=128)
    value: JsonValue


class PlatformSavedViewOrdering(BaseSchema):
    """One trusted ordering choice; arbitrary query expressions are forbidden."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str = Field(..., min_length=1, max_length=128)
    direction: Literal["asc", "desc"]


class PlatformSavedViewDraft(BaseSchema):
    """Persistable presentation intent, excluding transient table state."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str = Field(..., min_length=1, max_length=128)
    filter_schema_revision: str = Field(..., min_length=1, max_length=64)
    column_schema_revision: str = Field(..., min_length=1, max_length=64)
    filters: tuple[PlatformSavedViewFilter, ...]
    ordering: PlatformSavedViewOrdering
    visible_columns: tuple[str, ...] = Field(..., min_length=1, max_length=32)
    column_order: tuple[str, ...] = Field(..., min_length=1, max_length=32)
    density: Literal["compact", "comfortable", "spacious"]


class PlatformSavedViewCreateCommand(PlatformSavedViewDraft):
    model_config = ConfigDict(frozen=True, extra="forbid")


class PlatformSavedViewUpdateCommand(PlatformSavedViewDraft):
    model_config = ConfigDict(frozen=True, extra="forbid")

    expected_revision: int = Field(..., ge=1)


class PlatformSavedViewDeleteCommand(BaseSchema):
    model_config = ConfigDict(frozen=True, extra="forbid")

    expected_revision: int = Field(..., ge=1)


class PlatformSavedViewOut(BaseOut, TimestampMixin):
    """Actor-private saved-view record returned only to its owner."""

    model_config = BaseOut.model_config | ConfigDict(frozen=True)

    capability_id: str
    name: str
    filter_schema_revision: str
    column_schema_revision: str
    filters: tuple[PlatformSavedViewFilter, ...]
    ordering: PlatformSavedViewOrdering
    visible_columns: tuple[str, ...]
    column_order: tuple[str, ...]
    density: Literal["compact", "comfortable", "spacious"]
    revision: int = Field(..., ge=1)


class PlatformSavedViewOmission(BaseSchema):
    """One stored condition excluded from the effective current read contract."""

    model_config = ConfigDict(frozen=True)

    kind: Literal["capability", "column", "column_schema", "density", "filter", "filter_schema", "ordering"]
    code: str
    reason: Literal["invalid", "unauthorized", "unavailable"]


class PlatformSavedViewEffectiveOut(BaseSchema):
    """The current validated presentation intent; never a stored result snapshot."""

    model_config = ConfigDict(frozen=True)

    filter_schema_revision: str
    column_schema_revision: str
    filters: tuple[PlatformSavedViewFilter, ...]
    ordering: PlatformSavedViewOrdering | None
    visible_columns: tuple[str, ...]
    column_order: tuple[str, ...]
    density: Literal["compact", "comfortable", "spacious"] | None


class PlatformSavedViewReadOut(BaseSchema):
    """Stored record plus the explicit, non-persisted current applicability evaluation."""

    model_config = ConfigDict(frozen=True)

    view: PlatformSavedViewOut
    applicable: bool
    omissions: tuple[PlatformSavedViewOmission, ...]
    effective: PlatformSavedViewEffectiveOut | None
