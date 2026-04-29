from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class PageInfo:
    page: int
    page_size: int
    total: int
    total_pages: int


@dataclass(frozen=True, slots=True)
class PaginatedResult:
    items: list[Any]
    page_info: PageInfo


def page_from_params(page: int, page_size: int, total: int) -> PageInfo:
    import math

    return PageInfo(
        page=page,
        page_size=page_size,
        total=total,
        total_pages=max(1, math.ceil(total / max(page_size, 1))),
    )
