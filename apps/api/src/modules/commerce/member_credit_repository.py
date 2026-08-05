from __future__ import annotations

from typing import Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Forbidden, NotFound
from src.models.commerce.billing import ResourceLimitKind
from src.models.commerce.credit_allocation import (
    MemberCreditCommandOperation,
    MemberCreditCommandScopeKind,
    WorkspaceMemberCreditCommandReceipt,
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
)
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event


class MemberCreditConfigurationRepository(Protocol):
    async def lock_workspace_and_actor(
        self, workspace_id: UUID, actor_user_id: UUID, conn: BaseDBAsyncClient
    ) -> None: ...

    async def lock_target_membership(
        self, workspace_id: UUID, membership_id: UUID, conn: BaseDBAsyncClient
    ) -> None: ...

    async def lock_policy(self, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceMemberCreditPolicy: ...

    async def lock_override(
        self, workspace_id: UUID, membership_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceMemberCreditLimitOverride | None: ...

    async def lock_receipt(
        self, workspace_id: UUID, idempotency_key_hash: str, conn: BaseDBAsyncClient
    ) -> WorkspaceMemberCreditCommandReceipt | None: ...

    async def save_default_policy(
        self,
        *,
        policy: WorkspaceMemberCreditPolicy,
        limit_kind: ResourceLimitKind,
        limit_credits: int | None,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def save_policy_revision(
        self,
        *,
        policy: WorkspaceMemberCreditPolicy,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def upsert_override(
        self,
        *,
        override: WorkspaceMemberCreditLimitOverride | None,
        workspace_id: UUID,
        membership_id: UUID,
        limit_kind: ResourceLimitKind,
        limit_credits: int | None,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceMemberCreditLimitOverride: ...

    async def clear_override(
        self, *, override: WorkspaceMemberCreditLimitOverride | None, conn: BaseDBAsyncClient
    ) -> None: ...

    async def record_outcome(
        self,
        *,
        settings: Settings,
        workspace_id: UUID,
        actor_user_id: UUID,
        membership_id: UUID | None,
        scope_kind: MemberCreditCommandScopeKind,
        operation: MemberCreditCommandOperation,
        expected_revision: int,
        idempotency_key_hash: str,
        request_fingerprint: str,
        before_snapshot: JsonObject,
        result_snapshot: JsonObject,
        result_revision: int,
        conn: BaseDBAsyncClient,
    ) -> None: ...


class TortoiseMemberCreditConfigurationRepository:
    async def lock_workspace_and_actor(self, workspace_id: UUID, actor_user_id: UUID, conn: BaseDBAsyncClient) -> None:
        workspace = await (
            Workspace
            .filter(
                id=workspace_id,
                is_active=True,
                archived_at=None,
                deleted_at=None,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if workspace is None:
            raise NotFound(error="WORKSPACE_NOT_FOUND")
        actor = await (
            WorkspaceMembership
            .filter(
                workspace_id=workspace_id,
                user_id=actor_user_id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if actor is None:
            raise Forbidden(error="WORKSPACE_MEMBERSHIP_REQUIRED")

    async def lock_target_membership(self, workspace_id: UUID, membership_id: UUID, conn: BaseDBAsyncClient) -> None:
        membership = await (
            WorkspaceMembership
            .filter(
                id=membership_id,
                workspace_id=workspace_id,
                status=WorkspaceMembershipStatus.ACTIVE,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if membership is None:
            raise NotFound(error="WORKSPACE_MEMBER_NOT_FOUND")

    async def lock_policy(self, workspace_id: UUID, conn: BaseDBAsyncClient) -> WorkspaceMemberCreditPolicy:
        policy = await (
            WorkspaceMemberCreditPolicy.filter(workspace_id=workspace_id).using_db(conn).select_for_update().first()
        )
        if policy is not None:
            return policy
        return await WorkspaceMemberCreditPolicy.create(
            workspace_id=workspace_id,
            default_limit_kind=ResourceLimitKind.UNLIMITED,
            default_limit_credits=None,
            revision=1,
            updated_by_user_id=None,
            using_db=conn,
        )

    async def lock_override(
        self, workspace_id: UUID, membership_id: UUID, conn: BaseDBAsyncClient
    ) -> WorkspaceMemberCreditLimitOverride | None:
        return await (
            WorkspaceMemberCreditLimitOverride
            .filter(
                workspace_id=workspace_id,
                membership_id=membership_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def lock_receipt(
        self, workspace_id: UUID, idempotency_key_hash: str, conn: BaseDBAsyncClient
    ) -> WorkspaceMemberCreditCommandReceipt | None:
        return await (
            WorkspaceMemberCreditCommandReceipt
            .filter(
                workspace_id=workspace_id,
                idempotency_key_hash=idempotency_key_hash,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    async def save_default_policy(
        self,
        *,
        policy: WorkspaceMemberCreditPolicy,
        limit_kind: ResourceLimitKind,
        limit_credits: int | None,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        policy.default_limit_kind = limit_kind
        policy.default_limit_credits = limit_credits
        policy.revision = revision
        policy.updated_by_user_id = actor_user_id
        await policy.save(
            using_db=conn,
            update_fields=[
                "default_limit_kind",
                "default_limit_credits",
                "revision",
                "updated_by_user_id",
                "updated_at",
            ],
        )

    async def save_policy_revision(
        self,
        *,
        policy: WorkspaceMemberCreditPolicy,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> None:
        policy.revision = revision
        policy.updated_by_user_id = actor_user_id
        await policy.save(using_db=conn, update_fields=["revision", "updated_by_user_id", "updated_at"])

    async def upsert_override(
        self,
        *,
        override: WorkspaceMemberCreditLimitOverride | None,
        workspace_id: UUID,
        membership_id: UUID,
        limit_kind: ResourceLimitKind,
        limit_credits: int | None,
        revision: int,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> WorkspaceMemberCreditLimitOverride:
        if override is None:
            return await WorkspaceMemberCreditLimitOverride.create(
                workspace_id=workspace_id,
                membership_id=membership_id,
                limit_kind=limit_kind,
                limit_credits=limit_credits,
                revision=revision,
                updated_by_user_id=actor_user_id,
                using_db=conn,
            )
        override.limit_kind = limit_kind
        override.limit_credits = limit_credits
        override.revision = revision
        override.updated_by_user_id = actor_user_id
        await override.save(
            using_db=conn,
            update_fields=[
                "limit_kind",
                "limit_credits",
                "revision",
                "updated_by_user_id",
                "updated_at",
            ],
        )
        return override

    async def clear_override(
        self, *, override: WorkspaceMemberCreditLimitOverride | None, conn: BaseDBAsyncClient
    ) -> None:
        if override is not None:
            await override.delete(using_db=conn)

    async def record_outcome(
        self,
        *,
        settings: Settings,
        workspace_id: UUID,
        actor_user_id: UUID,
        membership_id: UUID | None,
        scope_kind: MemberCreditCommandScopeKind,
        operation: MemberCreditCommandOperation,
        expected_revision: int,
        idempotency_key_hash: str,
        request_fingerprint: str,
        before_snapshot: JsonObject,
        result_snapshot: JsonObject,
        result_revision: int,
        conn: BaseDBAsyncClient,
    ) -> None:
        audit_event = await write_required_activity_event(
            settings=settings,
            payload=ActivityAuditPayload(
                event_name=f"commerce.member_credit.{operation.value}",
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                entity_type="workspace_member_credit_configuration",
                entity_id=membership_id or workspace_id,
                properties={
                    "operation": operation.value,
                    "scope_kind": scope_kind.value,
                    "membership_id": str(membership_id) if membership_id is not None else None,
                    "expected_revision": expected_revision,
                    "configuration_revision": result_revision,
                    "idempotency_key_hash": idempotency_key_hash,
                    "request_fingerprint": request_fingerprint,
                    "before": before_snapshot,
                    "after": result_snapshot,
                },
            ),
            conn=conn,
        )
        await WorkspaceMemberCreditCommandReceipt.create(
            workspace_id=workspace_id,
            scope_kind=scope_kind,
            membership_id=membership_id,
            idempotency_key_hash=idempotency_key_hash,
            request_fingerprint=request_fingerprint,
            operation=operation,
            result_revision=result_revision,
            result_snapshot=result_snapshot,
            audit_event_id=audit_event.id,
            using_db=conn,
        )
