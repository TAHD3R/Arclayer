from __future__ import annotations

from typing import Any, TypedDict, TypeVar, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.models import Model
from tortoise.queryset import QuerySet

from src.core.repository.base import AbstractRepository

_QueryT = TypeVar("_QueryT")
_ModelT = TypeVar("_ModelT", bound=Model)


class TortoiseORMRepository[T](AbstractRepository[T]):
    """Tortoise ORM implementation of AbstractRepository.

    Wraps Tortoise model query methods behind the repository interface,
    keeping service layers decoupled from ORM specifics.
    """

    def __init__(self, model_cls: Any | None = None, **_kwargs: Any) -> None:
        self._model: Any = model_cls

    class _UsingDbKwargs(TypedDict, total=False):
        using_db: BaseDBAsyncClient

    def _using_db_kwargs(self, conn: BaseDBAsyncClient | None) -> _UsingDbKwargs:
        if conn is None:
            return {}
        return {"using_db": conn}

    def using_db(self, qs: _QueryT, conn: BaseDBAsyncClient | None) -> _QueryT:
        if conn is None:
            return qs
        return cast(_QueryT, cast(Any, qs).using_db(conn))

    async def get_record_by_id(
        self,
        model: type[_ModelT],
        obj_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> _ModelT | None:
        qs = model.filter(id=obj_id)
        return await self.using_db(qs, conn).first()

    async def find_one(self, *, id: UUID) -> T | None:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.find_one requires model_cls.")
        return await self._model.filter(id=id).first()  # type: ignore[attr-defined]

    async def find_many(
        self,
        *,
        filters: dict | None = None,
        limit: int = 25,
        offset: int = 0,
        order_by: list[str] | None = None,
    ) -> list[T]:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.find_many requires model_cls.")
        qs: QuerySet = self._model.all()  # type: ignore[attr-defined]
        if filters:
            qs = qs.filter(**filters)
        if order_by:
            qs = qs.order_by(*order_by)
        qs = qs.limit(limit).offset(offset)
        return await qs  # type: ignore[return-value]

    async def create(self, *, data: dict) -> T:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.create requires model_cls.")
        return await self._model.create(**data)  # type: ignore[attr-defined]

    async def create_record(
        self,
        model: type[_ModelT],
        *,
        conn: BaseDBAsyncClient | None = None,
        **data: Any,
    ) -> _ModelT:
        if conn is None:
            return await model.create(**data)
        return await model.create(using_db=conn, **data)

    async def update(self, *, id: UUID, data: dict) -> T:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.update requires model_cls.")
        record = await self._model.filter(id=id).first()  # type: ignore[attr-defined]
        if record is None:
            raise ValueError(f"{self._model.__name__} not found: {id}")
        for key, value in data.items():
            setattr(record, key, value)
        await record.save()  # type: ignore[attr-defined]
        return record

    async def update_fields(
        self,
        instance: _ModelT,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> _ModelT:
        if not fields:
            return instance
        for key, value in fields.items():
            setattr(instance, key, value)
        if conn is None:
            await instance.save(update_fields=list(fields.keys()))
        else:
            await instance.save(update_fields=list(fields.keys()), using_db=conn)
        return instance

    async def delete(self, *, id: UUID) -> bool:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.delete requires model_cls.")
        count = await self._model.filter(id=id).delete()  # type: ignore[attr-defined]
        return count > 0

    async def delete_by_id(
        self,
        model: type[_ModelT],
        obj_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        qs = model.filter(id=obj_id)
        return await self.using_db(qs, conn).delete()

    async def count(self, *, filters: dict | None = None) -> int:
        if self._model is None:
            raise NotImplementedError("TortoiseORMRepository.count requires model_cls.")
        qs = self._model.all()  # type: ignore[attr-defined]
        if filters:
            qs = qs.filter(**filters)
        return await qs.count()
