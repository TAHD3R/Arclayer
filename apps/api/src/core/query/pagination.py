from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PageInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    page: int
    page_size: int
    total: int
    total_pages: int


class PaginatedResult(BaseModel):
    model_config = ConfigDict(frozen=True)
    items: list[object]
    page_info: PageInfo


def page_from_params(page: int, page_size: int, total: int) -> PageInfo:
    import math

    return PageInfo(
        page=page,
        page_size=page_size,
        total=total,
        total_pages=max(1, math.ceil(total / max(page_size, 1))),
    )
