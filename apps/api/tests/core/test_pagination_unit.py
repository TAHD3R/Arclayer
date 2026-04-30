from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any, TypeVar, cast

import pytest
from pydantic import ValidationError
from tortoise.queryset import QuerySet

from src.common.schemas import BaseSchema
from src.core.http.pagination import PageParams, paginate_items, paginate_queryset

T = TypeVar("T")


class _Obj(BaseSchema):
    value: int


class _ObjOut(BaseSchema):
    value: int


class FakeQuerySet[T]:
    """
    Minimal awaitable queryset-like object for unit testing paginate_queryset().

    We mimic the bits we use:
    - await qs.count()
    - await qs.limit(...).offset(...)
    """

    def __init__(self, items: list[T]) -> None:
        self._items = list(items)
        self._limit: int | None = None
        self._offset: int = 0

    async def count(self) -> int:
        return len(self._items)

    def limit(self, value: int) -> FakeQuerySet[T]:
        self._limit = int(value)
        return self

    def offset(self, value: int) -> FakeQuerySet[T]:
        self._offset = int(value)
        return self

    def _slice(self) -> list[T]:
        start = max(self._offset, 0)
        if self._limit is None:
            return self._items[start:]
        return self._items[start : start + max(self._limit, 0)]

    def __await__(self) -> Iterator[list[T]]:
        async def _run() -> list[T]:
            return self._slice()

        return _run().__await__()

    # Keep the object iterable too, which helps debugging.
    def __iter__(self) -> Iterable[T]:
        return iter(self._slice())


def test_page_params_offset_limit() -> None:
    params = PageParams(page=1, size=20)
    assert params.offset == 0
    assert params.limit == 20

    params = PageParams(page=3, size=10)
    assert params.offset == 20
    assert params.limit == 10


def test_page_params_validation() -> None:
    with pytest.raises(ValidationError):
        PageParams(page=0, size=20)
    with pytest.raises(ValidationError):
        PageParams(page=1, size=0)


@pytest.mark.asyncio
async def test_paginate_queryset_empty() -> None:
    qs: Any = FakeQuerySet[_Obj]([])
    page = await paginate_queryset(cast(QuerySet[Any], qs), params=PageParams(page=1, size=10), out_schema=_ObjOut)
    assert page.total == 0
    assert page.pages == 0
    assert page.items == []
    assert page.next is None
    assert page.prev is None


@pytest.mark.asyncio
async def test_paginate_queryset_first_page_next() -> None:
    items = [_Obj(value=i) for i in range(1, 6)]  # 5 items
    qs: Any = FakeQuerySet[_Obj](items)
    page = await paginate_queryset(cast(QuerySet[Any], qs), params=PageParams(page=1, size=2), out_schema=_ObjOut)
    assert page.total == 5
    assert page.pages == 3
    assert [x.value for x in page.items] == [1, 2]
    assert page.next == 2
    assert page.prev is None


@pytest.mark.asyncio
async def test_paginate_queryset_last_page_prev() -> None:
    items = [_Obj(value=i) for i in range(1, 6)]  # 5 items
    qs: Any = FakeQuerySet[_Obj](items)
    page = await paginate_queryset(cast(QuerySet[Any], qs), params=PageParams(page=3, size=2), out_schema=_ObjOut)
    assert page.total == 5
    assert page.pages == 3
    assert [x.value for x in page.items] == [5]
    assert page.next is None
    assert page.prev == 2


@pytest.mark.asyncio
async def test_paginate_queryset_out_of_range_page() -> None:
    items = [_Obj(value=i) for i in range(1, 6)]  # 5 items => pages=3 with size=2
    qs: Any = FakeQuerySet[_Obj](items)
    page = await paginate_queryset(cast(QuerySet[Any], qs), params=PageParams(page=10, size=2), out_schema=_ObjOut)
    assert page.total == 5
    assert page.pages == 3
    assert page.items == []
    assert page.next is None
    # For out-of-range pages, prev points to the last available page for convenience.
    assert page.prev == 3


def test_paginate_items_in_memory() -> None:
    items = list(range(1, 6))  # 5 items
    page = paginate_items(items, params=PageParams(page=2, size=2))
    assert page.total == 5
    assert page.pages == 3
    assert list(page.items) == [3, 4]
    assert page.next == 3
    assert page.prev == 1
