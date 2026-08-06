from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import (
    CommercePlanRevision,
    WorkspaceCreditAccount,
    WorkspaceCreditLedger,
    WorkspaceSubscription,
)
from src.models.commerce.credit_allocation import WorkspaceCreditGrantLot
from src.models.commerce.payments import (
    CommerceCheckoutOutcomeCommand,
    CommerceCheckoutSession,
    CommerceInvoice,
    CommerceTopUpSettlementApplication,
    CommerceTransaction,
)


class TortoiseTopUpSettlementRepository(TortoiseORMRepository[CommerceTopUpSettlementApplication]):
    def __init__(self) -> None:
        super().__init__(CommerceTopUpSettlementApplication)

    async def get_application_by_event(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTopUpSettlementApplication | None:
        return await (
            CommerceTopUpSettlementApplication
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                provider_event_id=provider_event_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_command_by_event(
        self,
        *,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutOutcomeCommand | None:
        return await (
            CommerceCheckoutOutcomeCommand
            .filter(provider_event_id=provider_event_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_checkout_for_update(
        self,
        *,
        checkout_session_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None:
        return await CommerceCheckoutSession.filter(id=checkout_session_id).using_db(conn).select_for_update().first()

    async def get_checkout_by_external_session_for_update(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        external_session_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceCheckoutSession | None:
        return await (
            CommerceCheckoutSession
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                provider_account_id=provider_account_id,
                external_session_id=external_session_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def get_credit_scope(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[WorkspaceSubscription, WorkspaceCreditAccount, CommercePlanRevision]:
        subscription = await (
            WorkspaceSubscription.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if subscription is None:
            raise Conflict(error="WORKSPACE_COMMERCIAL_UNINITIALIZED")
        account = await (
            WorkspaceCreditAccount.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        revision = await CommercePlanRevision.filter(id=subscription.plan_revision_id).using_db(conn).first()
        if (
            account is None
            or revision is None
            or account.subscription_id != subscription.id
            or account.plan_revision_id != subscription.plan_revision_id
        ):
            raise Conflict(error="WORKSPACE_COMMERCIAL_ACCOUNT_INVALID")
        return subscription, account, revision

    async def get_transaction_by_provider_identity(
        self,
        *,
        provider: str,
        provider_mode: str,
        external_transaction_id: str,
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction | None:
        return await (
            CommerceTransaction
            .filter(
                provider=provider,
                provider_mode=provider_mode,
                external_transaction_id=external_transaction_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def create_transaction(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> CommerceTransaction:
        return await CommerceTransaction.create(using_db=conn, **values)

    async def create_invoice(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> CommerceInvoice:
        return await CommerceInvoice.create(using_db=conn, **values)

    async def create_ledger(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditLedger:
        return await WorkspaceCreditLedger.create(using_db=conn, **values)

    async def create_lot(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> WorkspaceCreditGrantLot:
        return await WorkspaceCreditGrantLot.create(using_db=conn, **values)

    async def save_success_state(
        self,
        *,
        checkout: CommerceCheckoutSession,
        command: CommerceCheckoutOutcomeCommand | None,
        account: WorkspaceCreditAccount,
        completed_at: datetime,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        checkout_updated = await (
            CommerceCheckoutSession
            .filter(id=checkout.id, revision=checkout.revision)
            .using_db(conn)
            .update(
                status="completed",
                completed_at=completed_at,
                revision=checkout.revision + 1,
                updated_at=processed_at,
            )
        )
        command_updated = 1
        if command is not None:
            command_updated = await self._save_command_result(
                command=command,
                result_status="completed",
                result_revision=checkout.revision + 1,
                processed_at=processed_at,
                conn=conn,
            )
        account.revision += 1
        await account.save(
            using_db=conn,
            update_fields=["balance_credits", "revision", "updated_at"],
        )
        if checkout_updated != 1 or command_updated != 1:
            raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_REVISION_STALE")

    async def save_non_grant_state(
        self,
        *,
        checkout: CommerceCheckoutSession,
        command: CommerceCheckoutOutcomeCommand | None,
        result_status: str,
        result_revision: int,
        completed_at: datetime | None,
        checkout_changed: bool,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> None:
        checkout_updated = 1
        if checkout_changed:
            checkout_updated = await (
                CommerceCheckoutSession
                .filter(id=checkout.id, revision=checkout.revision)
                .using_db(conn)
                .update(
                    status=result_status,
                    completed_at=completed_at,
                    revision=result_revision,
                    updated_at=processed_at,
                )
            )
        command_updated = 1
        if command is not None:
            command_updated = await self._save_command_result(
                command=command,
                result_status=result_status,
                result_revision=result_revision,
                processed_at=processed_at,
                conn=conn,
            )
        if checkout_updated != 1 or command_updated != 1:
            raise Conflict(error="BILLING_TOP_UP_SETTLEMENT_REVISION_STALE")

    @staticmethod
    async def _save_command_result(
        *,
        command: CommerceCheckoutOutcomeCommand,
        result_status: str,
        result_revision: int,
        processed_at: datetime,
        conn: BaseDBAsyncClient,
    ) -> int:
        return await (
            CommerceCheckoutOutcomeCommand
            .filter(id=command.id, revision=command.revision)
            .using_db(conn)
            .update(
                processed_at=processed_at,
                result_status=result_status,
                result_revision=result_revision,
                revision=command.revision + 1,
                updated_at=processed_at,
            )
        )

    async def create_application(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> CommerceTopUpSettlementApplication:
        return await CommerceTopUpSettlementApplication.create(using_db=conn, **values)

    @staticmethod
    async def database_time(*, conn: BaseDBAsyncClient) -> datetime:
        rows = await conn.execute_query_dict("SELECT clock_timestamp() AS database_time")
        database_time = rows[0].get("database_time") if len(rows) == 1 else None
        if not isinstance(database_time, datetime) or database_time.tzinfo is None:
            raise RuntimeError("PostgreSQL clock_timestamp() must return a timezone-aware datetime")
        return database_time
