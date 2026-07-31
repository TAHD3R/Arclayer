from __future__ import annotations

from uuid import UUID

from src.common.utils.ids import uuid7
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.workspaces.ownership_transfer import WorkspaceOwnershipTransfer
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.commerce.free_workspace_allowance import (
    FreeWorkspaceAllowanceAuthority,
    build_free_workspace_allowance_authority,
)
from src.modules.workspaces.ownership_repository import WorkspaceOwnershipRepository
from src.modules.workspaces.schema import WorkspaceOwnershipTransferOut, WorkspaceOwnershipTransferRequest


class WorkspaceOwnershipService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: WorkspaceOwnershipRepository | None = None,
        free_allowance: FreeWorkspaceAllowanceAuthority | None = None,
    ) -> None:
        super().__init__(settings)
        self._repository = repository or WorkspaceOwnershipRepository()
        self._free_allowance = free_allowance or build_free_workspace_allowance_authority()

    @staticmethod
    def _out(transfer: WorkspaceOwnershipTransfer) -> WorkspaceOwnershipTransferOut:
        return WorkspaceOwnershipTransferOut(
            workspace_id=transfer.workspace_id,
            previous_owner_user_id=transfer.previous_owner_user_id,
            next_owner_user_id=transfer.next_owner_user_id,
            correlation_id=transfer.correlation_id,
        )

    async def transfer(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        payload: WorkspaceOwnershipTransferRequest,
        idempotency_key: str,
    ) -> WorkspaceOwnershipTransferOut:
        key = str(idempotency_key or "").strip()
        if not key:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="IDEMPOTENCY_KEY_REQUIRED")
        next_owner_user_id = UUID(str(payload.next_owner_user_id))

        async with self.tx() as conn:
            workspace = await self._repository.lock_workspace(workspace_id=workspace_id, conn=conn)
            if workspace is None:
                raise NotFound(message=t("errors", "NOT_FOUND"), error="NOT_FOUND")
            replay = await self._repository.get_transfer_by_idempotency_key(
                workspace_id=workspace_id,
                idempotency_key=key,
                conn=conn,
            )
            if replay is not None:
                if replay.initiated_by_user_id != actor_user_id or replay.next_owner_user_id != next_owner_user_id:
                    raise Conflict(message=t("errors", "BAD_REQUEST"), error="IDEMPOTENCY_KEY_CONFLICT")
                return self._out(replay)

            previous_owner_user_id = UUID(str(workspace.owner_user_id))
            if previous_owner_user_id != actor_user_id:
                raise Forbidden(message=t("errors", "PERMISSION_DENIED"), error="WORKSPACE_OWNER_REQUIRED")
            if next_owner_user_id == previous_owner_user_id:
                raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_OWNER_ALREADY_ASSIGNED")
            if not await self._repository.has_active_membership(
                workspace_id=workspace_id,
                user_id=next_owner_user_id,
                conn=conn,
            ):
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_OWNER_ACTIVE_MEMBER_REQUIRED")

            is_free_plan = await self._repository.is_bound_to_free_plan(workspace_id=workspace_id, conn=conn)
            if is_free_plan is None:
                raise Conflict(message=t("errors", "BAD_REQUEST"), error="WORKSPACE_SUBSCRIPTION_REQUIRED")
            if is_free_plan:
                await self._free_allowance.assert_eligible(
                    prospective_owner_user_id=next_owner_user_id,
                    excluding_workspace_id=workspace_id,
                    conn=conn,
                )

            correlation_id = uuid7()
            await self._repository.save_owner(
                workspace=workspace,
                owner_user_id=next_owner_user_id,
                conn=conn,
            )
            await self._repository.rebind_project_ownership(
                workspace_id=workspace_id,
                next_owner_user_id=next_owner_user_id,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            transfer = await self._repository.create_transfer(
                workspace_id=workspace_id,
                previous_owner_user_id=previous_owner_user_id,
                next_owner_user_id=next_owner_user_id,
                initiated_by_user_id=actor_user_id,
                idempotency_key=key,
                correlation_id=correlation_id,
                conn=conn,
            )
            await write_required_activity_event(
                settings=self.settings,
                conn=conn,
                payload=ActivityAuditPayload(
                    event_name="workspace.ownership.transferred",
                    actor_user_id=actor_user_id,
                    subject_user_id=next_owner_user_id,
                    organization_id=workspace.organization_id,
                    workspace_id=workspace_id,
                    entity_type="workspace_ownership_transfer",
                    entity_id=transfer.id,
                    properties={
                        "previousOwnerUserId": str(previous_owner_user_id),
                        "nextOwnerUserId": str(next_owner_user_id),
                        "idempotencyKey": key,
                        "correlationId": str(correlation_id),
                    },
                ),
            )
        return self._out(transfer)
