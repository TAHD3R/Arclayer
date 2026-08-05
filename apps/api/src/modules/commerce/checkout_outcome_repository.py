from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.payments import CommerceCheckoutOutcomeCommand, CommerceCheckoutSession

_OUTCOME_LOCK_NAMESPACE = "arclayer:commerce:checkout-outcome"


class TortoiseCheckoutOutcomeRepository(TortoiseORMRepository[CommerceCheckoutOutcomeCommand]):
    def __init__(self) -> None:
        super().__init__(CommerceCheckoutOutcomeCommand)

    async def lock_idempotency_scope(self, *, idempotency_key: str, conn: BaseDBAsyncClient) -> None:
        await conn.execute_query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
            [f"{_OUTCOME_LOCK_NAMESPACE}:{idempotency_key}"],
        )

    async def get_command_by_idempotency_key(
        self,
        *,
        idempotency_key: str,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> CommerceCheckoutOutcomeCommand | None:
        query = CommerceCheckoutOutcomeCommand.filter(idempotency_key=idempotency_key).using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_command_by_event_id(
        self,
        *,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> CommerceCheckoutOutcomeCommand | None:
        query = CommerceCheckoutOutcomeCommand.filter(provider_event_id=provider_event_id).using_db(conn)
        if for_update:
            query = query.select_for_update()
        return await query.first()

    async def get_checkout_for_update(
        self,
        *,
        checkout_session_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None:
        return await CommerceCheckoutSession.filter(id=checkout_session_id).using_db(conn).select_for_update().first()

    async def create_command(
        self,
        *,
        checkout_session_id: UUID,
        workspace_id: UUID,
        actor_user_id: UUID,
        outcome: str,
        expected_revision: int,
        idempotency_key: str,
        request_fingerprint: str,
        provider_event_id: str,
        event_created_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutOutcomeCommand:
        return await CommerceCheckoutOutcomeCommand.create(
            using_db=conn,
            checkout_session_id=checkout_session_id,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            outcome=outcome,
            expected_revision=expected_revision,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            provider_event_id=provider_event_id,
            event_created_at=event_created_at,
            revision=1,
        )

    async def save_acceptance(
        self,
        *,
        command_id: UUID,
        expected_revision: int,
        inbox_id: UUID,
        job_id: UUID,
        accepted_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> int:
        return (
            await CommerceCheckoutOutcomeCommand
            .filter(
                id=command_id,
                revision=expected_revision,
            )
            .using_db(conn)
            .update(
                accepted_inbox_id=inbox_id,
                accepted_job_id=job_id,
                accepted_at=accepted_at,
                revision=expected_revision + 1,
                updated_at=accepted_at,
            )
        )

    async def save_applied_outcome(
        self,
        *,
        command_id: UUID,
        command_revision: int,
        checkout_session_id: UUID,
        checkout_revision: int,
        result_status: str,
        result_revision: int,
        completed_at: datetime | None,
        processed_at: datetime,
        checkout_changed: bool,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, int]:
        checkout_updated = 0
        if checkout_changed:
            checkout_updated = (
                await CommerceCheckoutSession
                .filter(
                    id=checkout_session_id,
                    revision=checkout_revision,
                )
                .using_db(conn)
                .update(
                    status=result_status,
                    completed_at=completed_at,
                    revision=result_revision,
                    updated_at=processed_at,
                )
            )
        command_updated = (
            await CommerceCheckoutOutcomeCommand
            .filter(
                id=command_id,
                revision=command_revision,
            )
            .using_db(conn)
            .update(
                processed_at=processed_at,
                result_status=result_status,
                result_revision=result_revision,
                revision=command_revision + 1,
                updated_at=processed_at,
            )
        )
        return checkout_updated, command_updated

    @staticmethod
    async def database_time(*, conn: BaseDBAsyncClient) -> datetime:
        rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
        database_time = rows[0].get("database_time") if len(rows) == 1 else None
        if not isinstance(database_time, datetime) or database_time.tzinfo is None:
            raise RuntimeError("PostgreSQL clock_timestamp() must return a timezone-aware datetime")
        return database_time
