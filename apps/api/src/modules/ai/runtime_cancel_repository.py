from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.runtime_v1 import (
    AgentApprovalStatusV1,
    AgentApprovalV1Record,
    AgentMessagePartV1Record,
    AgentMessageV1Record,
    AgentRunStatusV1,
    AgentRunV1Record,
    AgentThreadV1Record,
)
from src.models.ai.ai_budget_reservation import AIBudgetReservation, ReservationStatus
from src.modules.ai.runtime_approval_protocol_schema import (
    ApprovalOptionV1,
    ApprovalRiskV1,
    ApprovalV1,
)
from src.modules.ai.runtime_repository_errors import AgentRuntimePersistenceError


class AgentRunCancellationState(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    run_id: UUID
    job_id: UUID | None
    workspace_id: UUID
    thread_id: UUID
    owner_user_id: UUID
    status: AgentRunStatusV1
    correlation_id: str
    last_sequence: int
    last_cursor: str
    running_part_ids: tuple[str, ...]
    reservation_statuses: tuple[ReservationStatus, ...]
    pending_approval: ApprovalV1 | None = None
    pending_approval_part_id: str | None = None

    @property
    def terminal(self) -> bool:
        return self.status in {
            AgentRunStatusV1.COMPLETED,
            AgentRunStatusV1.CANCELLED,
            AgentRunStatusV1.FAILED,
        }

    @property
    def can_cancel_immediately(self) -> bool:
        return (
            self.status
            in {
                AgentRunStatusV1.CREATED,
                AgentRunStatusV1.QUEUED,
                AgentRunStatusV1.INTERRUPTED,
            }
            and (self.status == AgentRunStatusV1.INTERRUPTED or not self.running_part_ids)
            and ReservationStatus.RESERVED not in self.reservation_statuses
        )


class AgentRunCancellationRepository(TortoiseORMRepository[AgentRunV1Record]):
    def __init__(self) -> None:
        super().__init__(AgentRunV1Record)

    async def get_owned_state_for_update(
        self,
        *,
        workspace_id: UUID,
        owner_user_id: UUID,
        run_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunCancellationState:
        run = await (
            AgentRunV1Record
            .filter(
                id=run_id,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if run is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        thread = await (
            AgentThreadV1Record
            .filter(
                id=run.thread_id,
                workspace_id=workspace_id,
                owner_user_id=owner_user_id,
                deleted_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if thread is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_NOT_FOUND")
        if run.last_sequence < 1 or run.last_cursor is None:
            raise AgentRuntimePersistenceError("AGENT_RUN_HEAD_INCOMPLETE")
        message_ids = await AgentMessageV1Record.filter(run_id=run.id).using_db(conn).values_list("id", flat=True)
        running_parts = await (
            AgentMessagePartV1Record
            .filter(message_id__in=message_ids, status__in=("running", "requires_action"))
            .using_db(conn)
            .order_by("created_at", "id")
            .all()
        )
        reservations = await (
            AIBudgetReservation.filter(agent_run_id=run.id).using_db(conn).order_by("created_at", "id").all()
        )
        pending_approvals = await (
            AgentApprovalV1Record
            .filter(run_id=run.id, status=AgentApprovalStatusV1.PENDING)
            .using_db(conn)
            .select_for_update()
            .order_by("requested_at", "id")
            .all()
        )
        if len(pending_approvals) > 1:
            raise AgentRuntimePersistenceError("AGENT_APPROVAL_CONTRACT_MISMATCH")
        return AgentRunCancellationState(
            run_id=run.id,
            job_id=run.job_id,
            workspace_id=run.workspace_id,
            thread_id=run.thread_id,
            owner_user_id=run.owner_user_id,
            status=AgentRunStatusV1(run.status),
            correlation_id=run.correlation_id,
            last_sequence=run.last_sequence,
            last_cursor=run.last_cursor,
            running_part_ids=tuple(str(part.id) for part in running_parts),
            reservation_statuses=tuple(ReservationStatus(item.status) for item in reservations),
            pending_approval=self._approval_projection(pending_approvals[0]) if pending_approvals else None,
            pending_approval_part_id=str(pending_approvals[0].message_part_id) if pending_approvals else None,
        )

    @staticmethod
    def _approval_projection(record: AgentApprovalV1Record) -> ApprovalV1:
        return ApprovalV1(
            approval_id=record.approval_id,
            approval_version=record.approval_version,
            tool_call_id=record.tool_call_id,
            checkpoint_id=record.checkpoint_id,
            status=cast(
                Literal["pending", "approved", "rejected", "cancelled", "expired"],
                str(record.status),
            ),
            requested_at=record.requested_at,
            expires_at=record.expires_at,
            policy_version=record.policy_version,
            risk=ApprovalRiskV1.model_validate(record.risk),
            options=tuple(ApprovalOptionV1.model_validate(option) for option in record.options),
        )
