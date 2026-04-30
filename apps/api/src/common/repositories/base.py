from __future__ import annotations

from typing import Any, TypedDict, TypeVar, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.models import Model

from src.core.logging import get_logger

_QueryT = TypeVar("_QueryT")
_ModelT = TypeVar("_ModelT", bound=Model)


class BaseRepository:
    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__module__)

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

    async def create(
        self,
        model: type[_ModelT],
        *,
        conn: BaseDBAsyncClient | None = None,
        **data: Any,
    ) -> _ModelT:
        if conn is None:
            return await model.create(**data)
        return await model.create(using_db=conn, **data)

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

    async def delete_by_id(
        self,
        model: type[_ModelT],
        obj_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        qs = model.filter(id=obj_id)
        return await self.using_db(qs, conn).delete()
