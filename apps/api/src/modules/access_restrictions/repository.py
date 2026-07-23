from __future__ import annotations

from collections.abc import Iterable, Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.system.access_restriction import (
    AccessRestrictionCommandRecord,
    AccessRestrictionEntityType,
    AccessRestrictionRecord,
    AccessRestrictionState,
    AccessRestrictionType,
)


class AccessRestrictionRepository(TortoiseORMRepository[AccessRestrictionRecord]):
    def __init__(self) -> None:
        super().__init__(AccessRestrictionRecord)

    async def get_current(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_id: UUID,
        restriction_type: AccessRestrictionType,
        conn: BaseDBAsyncClient | None = None,
        for_update: bool = False,
    ) -> AccessRestrictionRecord | None:
        query = AccessRestrictionRecord.filter(
            entity_type=entity_type,
            entity_id=entity_id,
            restriction_type=restriction_type,
        )
        if conn is not None:
            query = query.using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def list_current(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_ids: Iterable[UUID],
        restriction_types: Sequence[AccessRestrictionType] | None = None,
        active_only: bool = False,
    ) -> list[AccessRestrictionRecord]:
        ids = list(set(entity_ids))
        if not ids:
            return []
        query = AccessRestrictionRecord.filter(entity_type=entity_type, entity_id__in=ids)
        if active_only:
            query = query.filter(state=AccessRestrictionState.ACTIVE)
        if restriction_types is not None:
            query = query.filter(restriction_type__in=list(restriction_types))
        return await query.order_by("effective_at", "id").all()

    async def get_command(
        self,
        *,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
    ) -> AccessRestrictionCommandRecord | None:
        return await AccessRestrictionCommandRecord.filter(idempotency_key=idempotency_key).using_db(conn).first()

    async def create_restriction(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> AccessRestrictionRecord:
        return await AccessRestrictionRecord.create(using_db=conn, **values)

    async def save_restriction(
        self,
        *,
        record: AccessRestrictionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        await record.save(using_db=conn, update_fields=(*update_fields, "updated_at"))

    async def create_command(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> AccessRestrictionCommandRecord:
        return await AccessRestrictionCommandRecord.create(using_db=conn, **values)
