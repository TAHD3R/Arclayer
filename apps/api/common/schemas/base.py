"""
Base schema definitions.

This module provides the base Pydantic models and common mixins used across the project.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """Project-wide base schema (camelCase output + strict-ish defaults)."""

    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class IdMixin(BaseSchema):
    """Mixin that provides an `id` field."""

    id: UUID = Field(..., description="ID")


class TimestampMixin(BaseSchema):
    """Mixin that provides created/updated timestamps."""

    created_at: datetime = Field(..., description="Created at.")
    updated_at: datetime = Field(..., description="Updated at.")


class BaseOut(IdMixin, BaseSchema):
    """Base output schema with `id` and ORM (from_attributes) support."""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )


class BulkOperationSchema(BaseSchema):
    """Bulk operation request schema."""

    ids: list[UUID] = Field(..., min_length=1, description="Target object ID list.")


class BulkOperationResponseSchema(BaseSchema):
    """Bulk operation response schema."""

    total_count: int = Field(..., ge=0, description="Total items.")
    success_count: int = Field(..., ge=0, description="Succeeded items.")
    failed_count: int = Field(..., ge=0, description="Failed items.")
    failed_items: list[UUID | str] | None = Field(
        default_factory=list,
        description="Failed items (IDs or other identifiable references such as codes).",
    )
