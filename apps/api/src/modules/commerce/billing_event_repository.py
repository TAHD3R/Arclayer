from __future__ import annotations

from datetime import datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.connectors.inbox import ConnectorEventInbox, ConnectorEventInboxStatus


class BillingEventInboxRepository(TortoiseORMRepository[ConnectorEventInbox]):
    """Persistence boundary for encrypted billing Connector events."""

    def __init__(self) -> None:
        super().__init__(ConnectorEventInbox)

    async def get_by_identity(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        conn: BaseDBAsyncClient,
        for_update: bool = False,
    ) -> ConnectorEventInbox | None:
        query = ConnectorEventInbox.filter(
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
            provider_event_id=provider_event_id,
        )
        if for_update:
            query = query.select_for_update()
        return await self.using_db(query, conn).first()

    async def create_inbox(
        self,
        *,
        provider: str,
        provider_mode: str,
        provider_account_id: str,
        provider_event_id: str,
        connector_key: str,
        connector_version: str,
        event_type: str,
        signature_timestamp: datetime,
        payload_sha256: str,
        encrypted_payload: str,
        retention_deadline: datetime,
        conn: BaseDBAsyncClient,
    ) -> ConnectorEventInbox:
        return await self.create_record(
            ConnectorEventInbox,
            provider=provider,
            provider_mode=provider_mode,
            provider_account_id=provider_account_id,
            provider_event_id=provider_event_id,
            connector_key=connector_key,
            connector_version=connector_version,
            event_type=event_type,
            signature_timestamp=signature_timestamp,
            payload_sha256=payload_sha256,
            encrypted_payload=encrypted_payload,
            retention_deadline=retention_deadline,
            conn=conn,
        )

    async def attach_job(
        self,
        *,
        inbox: ConnectorEventInbox,
        job_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ConnectorEventInbox:
        return await self.update_fields(inbox, fields={"job_id": job_id}, conn=conn)

    async def get_by_id(
        self,
        *,
        inbox_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> ConnectorEventInbox | None:
        return await self.get_record_by_id(ConnectorEventInbox, inbox_id, conn=conn)

    async def get_by_id_for_update(
        self,
        *,
        inbox_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> ConnectorEventInbox | None:
        return await ConnectorEventInbox.filter(id=inbox_id).using_db(conn).select_for_update().first()

    async def prepare_reconciliation(
        self,
        *,
        inbox: ConnectorEventInbox,
        conn: BaseDBAsyncClient,
    ) -> ConnectorEventInbox:
        return await self.update_fields(
            inbox,
            fields={
                "status": ConnectorEventInboxStatus.RECEIVED,
                "last_error_code": None,
                "last_error_message": None,
            },
            conn=conn,
        )

    async def begin_processing(self, *, inbox_id: UUID) -> ConnectorEventInbox | None:
        from tortoise.transactions import in_transaction

        async with in_transaction() as conn:
            query = ConnectorEventInbox.filter(id=inbox_id).select_for_update()
            inbox = await self.using_db(query, conn).first()
            if inbox is None or inbox.status == ConnectorEventInboxStatus.PROCESSED:
                return inbox
            return await self.update_fields(
                inbox,
                fields={
                    "status": ConnectorEventInboxStatus.PROCESSING,
                    "processing_attempts": inbox.processing_attempts + 1,
                    "last_error_code": None,
                    "last_error_message": None,
                },
                conn=conn,
            )

    async def mark_processed(
        self,
        *,
        inbox_id: UUID,
        processed_at: datetime,
        result_reference: JsonObject,
    ) -> ConnectorEventInbox | None:
        from tortoise.transactions import in_transaction

        async with in_transaction() as conn:
            query = ConnectorEventInbox.filter(id=inbox_id).select_for_update()
            inbox = await self.using_db(query, conn).first()
            if inbox is None:
                return None
            return await self.update_fields(
                inbox,
                fields={
                    "status": ConnectorEventInboxStatus.PROCESSED,
                    "processed_at": processed_at,
                    "result_reference": result_reference,
                    "last_error_code": None,
                    "last_error_message": None,
                },
                conn=conn,
            )

    async def record_failure(
        self,
        *,
        inbox_id: UUID,
        error_code: str,
        safe_message: str,
        is_terminal: bool,
    ) -> None:
        await ConnectorEventInbox.filter(id=inbox_id).update(
            status=(ConnectorEventInboxStatus.FAILED if is_terminal else ConnectorEventInboxStatus.RECEIVED),
            last_error_code=error_code,
            last_error_message=safe_message,
        )
