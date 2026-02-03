from __future__ import annotations

from typing import Any
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.models import Model
from tortoise.queryset import QuerySet

from apps.api.core.logging import get_logger


class BaseRepository:
    def __init__(self) -> None:
        self.logger = get_logger(self.__class__.__module__)

    def _using_db_kwargs(self, conn: BaseDBAsyncClient | None) -> dict[str, BaseDBAsyncClient]:
        if conn is None:
            return {}
        return {"using_db": conn}

    def using_db(self, qs: QuerySet, conn: BaseDBAsyncClient | None) -> QuerySet:
        if conn is None:
            return qs
        return qs.using_db(conn)

    async def get_record_by_id(
        self,
        model: type[Model],
        obj_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> Model | None:
        qs = model.filter(id=obj_id)
        return await self.using_db(qs, conn).first()

    async def create(self, model: type[Model], *, conn: BaseDBAsyncClient | None = None, **data: Any) -> Model:
        if conn is None:
            return await model.create(**data)
        return await model.create(using_db=conn, **data)

    async def update_fields(
        self,
        instance: Model,
        *,
        fields: dict[str, Any],
        conn: BaseDBAsyncClient | None = None,
    ) -> Model:
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
        model: type[Model],
        obj_id: UUID,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> int:
        qs = model.filter(id=obj_id)
        return await self.using_db(qs, conn).delete()
