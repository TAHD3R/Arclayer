from __future__ import annotations

from collections.abc import Sequence
from math import ceil
from typing import Any, TypeVar

from fastapi import Depends, Query
from pydantic import Field
from tortoise.queryset import QuerySet

from src.common.schemas import BaseSchema

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


class PageParams(BaseSchema):
    """
    Pagination request parameters.

    Notes:
    - This model is used as an internal dependency object (not a response schema).
    - Validation is duplicated with the FastAPI Query constraints to keep service/repository
      code safe when PageParams is constructed outside request handling (e.g. tests).
    """

    page: int = Field(default=1, ge=1, description="Page number (1-based).")
    size: int = Field(default=20, ge=1, le=200, description="Page size.")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size

    @property
    def limit(self) -> int:
        return self.size


def get_page_params(
    page: int = Query(1, ge=1, description="Page number (1-based)."),
    size: int = Query(20, gt=0, le=200, description="Page size."),
) -> PageParams:
    # Keep params as a small validated object, so service/repository signatures remain explicit
    # and we can construct the same object in tests without depending on FastAPI.
    return PageParams(page=page, size=size)


DependsPagination = Depends(get_page_params)


def paginate_items[T](items: Sequence[T], *, params: PageParams) -> PageData[T]:
    """
    In-memory pagination helper for small lists.

    Use cases:
    - data already loaded/aggregated from multiple sources
    - endpoints where DB pagination is not available or not worth the complexity

    Notes:
    - This is still deterministic and matches paginate_queryset() semantics.
    - Prefer paginate_queryset() for DB-backed lists to avoid loading everything into memory.
    """

    total = int(len(items))
    pages = ceil(total / params.size) if params.size else 0

    if total == 0 or params.page > pages:
        out_items: list[T] = []
    else:
        start = params.offset
        end = start + params.limit
        out_items = list(items[start:end])

    next_page: int | None = None
    prev_page: int | None = None
    if pages > 0:
        if params.page < pages:
            next_page = params.page + 1
        if params.page > 1:
            prev_page = min(params.page - 1, pages)

    return PageData[T](
        items=out_items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=next_page,
        prev=prev_page,
    )


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
