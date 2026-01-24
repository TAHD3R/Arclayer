from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from math import ceil
from typing import Any, TypeVar

from fastapi import Depends, Query
from pydantic import Field
from tortoise.queryset import QuerySet

from apps.api.common.schemas import BaseSchema

T = TypeVar("T")


class PageData[T](BaseSchema):
    """
    Project-wide pagination response shape.

    - Menus/actions aside, most admin list APIs can use this directly.
    - Uses camelCase output via BaseSchema.
    """

    items: Sequence[T] = Field(default_factory=list, description="Current page items.")
    total: int = Field(..., ge=0, description="Total item count.")
    page: int = Field(..., ge=1, description="Current page number (1-based).")
    size: int = Field(..., ge=1, description="Page size.")
    pages: int = Field(..., ge=0, description="Total pages.")
    next: int | None = Field(default=None, description="Next page number.")
    prev: int | None = Field(default=None, description="Previous page number.")


@dataclass(frozen=True, slots=True)
class PageParams:
    page: int = 1
    size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        return self.size


def get_page_params(
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, gt=0, le=200, description="每页数量"),
) -> PageParams:
    # Keep params as a pure object (not coupled to FastAPI inside a BaseModel),
    # which makes service/repository signatures cleaner and easier to test.
    return PageParams(page=page, size=size)


DependsPagination = Depends(get_page_params)


async def paginate_queryset[T](
    queryset: QuerySet[Any],
    *,
    params: PageParams,
    out_schema: type[T],
) -> PageData[T]:
    """
    Offset pagination for Tortoise QuerySet.

    - Does not depend on external pagination libraries.
    - Keeps behavior explicit and easy to reason about.
    """

    total = int(await queryset.count())
    pages = ceil(total / params.size) if params.size else 0

    # Out-of-range pages return empty items (no implicit clamping).
    if total == 0 or params.page > pages:
        items: list[Any] = []
    else:
        rows = await queryset.limit(params.limit).offset(params.offset)
        # Always validate from attributes because most of our Out schemas are based on ORM models.
        items = [out_schema.model_validate(row, from_attributes=True) for row in rows]  # type: ignore

    next_page: int | None = None
    prev_page: int | None = None
    if pages > 0:
        if params.page < pages:
            next_page = params.page + 1
        if params.page > 1:
            # When page is out of range, prev points to the last available page for convenience.
            prev_page = min(params.page - 1, pages)
    return PageData[T](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=next_page,
        prev=prev_page,
    )
