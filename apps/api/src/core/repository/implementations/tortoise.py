from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.queryset import QuerySet

from src.core.repository.base import AbstractRepository


class TortoiseORMRepository[T](AbstractRepository[T]):
    """Tortoise ORM implementation of AbstractRepository.

    Wraps Tortoise model query methods behind the repository interface,
    keeping service layers decoupled from ORM specifics.
    """

    def __init__(self, model_cls: Any) -> None:
        self._model: Any = model_cls

    async def find_one(self, *, id: UUID) -> T | None:
        return await self._model.filter(id=id).first()  # type: ignore[attr-defined]

    async def find_many(
        self,
        *,
        filters: dict | None = None,
        limit: int = 25,
        offset: int = 0,
        order_by: list[str] | None = None,
    ) -> list[T]:
        qs: QuerySet = self._model.all()  # type: ignore[attr-defined]
        if filters:
            qs = qs.filter(**filters)
        if order_by:
            qs = qs.order_by(*order_by)
        qs = qs.limit(limit).offset(offset)
        return await qs  # type: ignore[return-value]

    async def create(self, *, data: dict) -> T:
        return await self._model.create(**data)  # type: ignore[attr-defined]

    async def update(self, *, id: UUID, data: dict) -> T:
        record = await self._model.filter(id=id).first()  # type: ignore[attr-defined]
        if record is None:
            raise ValueError(f"{self._model.__name__} not found: {id}")
        for key, value in data.items():
            setattr(record, key, value)
        await record.save()  # type: ignore[attr-defined]
        return record

    async def delete(self, *, id: UUID) -> bool:
        count = await self._model.filter(id=id).delete()  # type: ignore[attr-defined]
        return count > 0

    async def count(self, *, filters: dict | None = None) -> int:
        qs = self._model.all()  # type: ignore[attr-defined]
        if filters:
            qs = qs.filter(**filters)
        return await qs.count()
