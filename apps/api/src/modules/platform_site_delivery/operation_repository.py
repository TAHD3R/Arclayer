from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict, NotFound
from src.models.hosting.commercial_access import (
    HostingDeliveryOperation,
    HostingDeliveryOperationAction,
    HostingDeliveryOperationState,
    HostingDeliveryOperationTargetType,
    HostingDeliveryOperationVerificationState,
)


class HostingDeliveryOperationRepository:
    """Persist and replay source-bound Hosting recovery commands."""

    async def start(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        action: HostingDeliveryOperationAction,
        actor_user_id: UUID,
        idempotency_key: str,
        source_revision: datetime,
        before_state: str,
    ) -> tuple[HostingDeliveryOperation, bool]:
        try:
            async with in_transaction() as conn:
                existing = await self._find_locked(
                    actor_user_id=actor_user_id,
                    idempotency_key=idempotency_key,
                    conn=conn,
                )
                if existing is not None:
                    self._require_exact_replay(
                        operation=existing,
                        target_type=target_type,
                        target_id=target_id,
                        action=action,
                        source_revision=source_revision,
                    )
                    return existing, True
                return (
                    await HostingDeliveryOperation.create(
                        target_type=target_type,
                        target_id=target_id,
                        action=action,
                        actor_user_id=actor_user_id,
                        idempotency_key=idempotency_key,
                        source_revision=source_revision,
                        before_state=before_state,
                        state=HostingDeliveryOperationState.RUNNING,
                        verification_state=HostingDeliveryOperationVerificationState.PENDING,
                        using_db=conn,
                    ),
                    False,
                )
        except IntegrityError:
            replay = await self.find_replay(
                target_type=target_type,
                target_id=target_id,
                action=action,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                source_revision=source_revision,
            )
            if replay is None:
                raise
            return replay

    async def find_replay(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        action: HostingDeliveryOperationAction,
        actor_user_id: UUID,
        idempotency_key: str,
        source_revision: datetime,
    ) -> tuple[HostingDeliveryOperation, bool] | None:
        operation = await HostingDeliveryOperation.get_or_none(
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
        )
        if operation is None:
            return None
        self._require_exact_replay(
            operation=operation,
            target_type=target_type,
            target_id=target_id,
            action=action,
            source_revision=source_revision,
        )
        return operation, True

    async def complete(
        self,
        *,
        operation_id: UUID,
        state: HostingDeliveryOperationState,
        verification_state: HostingDeliveryOperationVerificationState,
        resulting_state: str,
        source_operation_identity: str | None,
        result_reference_id: UUID | None,
        failed_target_count: int,
        evidence: JsonObject,
    ) -> HostingDeliveryOperation:
        async with in_transaction() as conn:
            operation = await self._locked(operation_id=operation_id, conn=conn)
            if operation.state is not HostingDeliveryOperationState.RUNNING:
                return operation
            operation.state = state
            operation.verification_state = verification_state
            operation.resulting_state = resulting_state
            operation.source_operation_identity = source_operation_identity
            operation.result_reference_id = result_reference_id
            operation.failed_target_count = failed_target_count
            operation.evidence = evidence
            operation.completed_at = datetime.now(UTC)
            await operation.save(using_db=conn)
            return operation

    async def mark_outcome_unknown(
        self,
        *,
        operation_id: UUID,
        failure_code: str,
        failure_message: str,
        evidence: JsonObject,
    ) -> HostingDeliveryOperation:
        async with in_transaction() as conn:
            operation = await self._locked(operation_id=operation_id, conn=conn)
            if operation.state is not HostingDeliveryOperationState.RUNNING:
                return operation
            operation.state = HostingDeliveryOperationState.OUTCOME_UNKNOWN
            operation.failure_code = failure_code
            operation.failure_message = failure_message
            operation.evidence = evidence
            operation.completed_at = datetime.now(UTC)
            await operation.save(using_db=conn)
            return operation

    async def list_for_target(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        limit: int,
    ) -> tuple[HostingDeliveryOperation, ...]:
        records = await (
            HostingDeliveryOperation.filter(target_type=target_type, target_id=target_id)
            .order_by("-created_at", "-id")
            .limit(limit)
        )
        return tuple(records)

    async def list_page_for_target(
        self,
        *,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        offset: int,
        limit: int,
    ) -> tuple[tuple[HostingDeliveryOperation, ...], int]:
        query = HostingDeliveryOperation.filter(target_type=target_type, target_id=target_id).order_by(
            "-created_at", "-id"
        )
        total = int(await query.count())
        records = await query.offset(offset).limit(limit)
        return tuple(records), total

    async def get(self, *, operation_id: UUID) -> HostingDeliveryOperation:
        operation = await HostingDeliveryOperation.get_or_none(id=operation_id)
        if operation is None:
            raise NotFound(error="HOSTING_DELIVERY_OPERATION_NOT_FOUND")
        return operation

    @staticmethod
    async def _locked(*, operation_id: UUID, conn) -> HostingDeliveryOperation:
        operation = await (
            HostingDeliveryOperation.filter(id=operation_id).using_db(conn).select_for_update().first()
        )
        if operation is None:
            raise NotFound(error="HOSTING_DELIVERY_OPERATION_NOT_FOUND")
        return operation

    @staticmethod
    async def _find_locked(*, actor_user_id: UUID, idempotency_key: str, conn) -> HostingDeliveryOperation | None:
        return await (
            HostingDeliveryOperation.filter(
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    def _require_exact_replay(
        *,
        operation: HostingDeliveryOperation,
        target_type: HostingDeliveryOperationTargetType,
        target_id: UUID,
        action: HostingDeliveryOperationAction,
        source_revision: datetime,
    ) -> None:
        if (
            operation.target_type is not target_type
            or operation.target_id != target_id
            or operation.action is not action
            or operation.source_revision != source_revision
        ):
            raise Conflict(error="HOSTING_DELIVERY_OPERATION_IDEMPOTENCY_KEY_REUSED")
