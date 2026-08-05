from __future__ import annotations

import hashlib
import json
from typing import cast
from uuid import UUID

from pydantic import ValidationError

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict
from src.core.services import BaseService, ServiceContractError
from src.models.commerce.billing import ResourceLimitKind
from src.models.commerce.credit_allocation import (
    MemberCreditCommandOperation,
    MemberCreditCommandScopeKind,
    WorkspaceMemberCreditCommandReceipt,
    WorkspaceMemberCreditLimitOverride,
    WorkspaceMemberCreditPolicy,
)
from src.modules.commerce.member_credit_repository import MemberCreditConfigurationRepository
from src.modules.commerce.member_credit_schema import (
    MemberCreditConfigurationMutationOut,
    MemberCreditDefaultLimitWrite,
    MemberCreditLimitOut,
    MemberCreditOverrideWrite,
)


class MemberCreditConfigurationService(BaseService):
    def __init__(self, settings: Settings, *, repository: MemberCreditConfigurationRepository) -> None:
        super().__init__(settings)
        self._repository = repository

    async def set_default_limit(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        command: MemberCreditDefaultLimitWrite,
    ) -> MemberCreditConfigurationMutationOut:
        operation = MemberCreditCommandOperation.SET_DEFAULT
        fingerprint = _fingerprint(operation, actor_user_id, None, command)
        key_hash = _key_hash(workspace_id, command.idempotency_key)
        async with self.tx() as conn:
            await self._repository.lock_workspace_and_actor(workspace_id, actor_user_id, conn)
            policy = await self._repository.lock_policy(workspace_id, conn)
            replay = await self._replay(
                workspace_id=workspace_id,
                membership_id=None,
                operation=operation,
                key_hash=key_hash,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay is not None:
                return replay
            _require_revision(policy.revision, command.expected_revision)
            before = _result(workspace_id, policy, None, membership_id=None)
            await self._repository.save_default_policy(
                policy=policy,
                limit_kind=ResourceLimitKind(command.limit_kind),
                limit_credits=command.limit_credits,
                revision=int(policy.revision) + 1,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            result = _result(workspace_id, policy, None, membership_id=None)
            await self._record_outcome(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                membership_id=None,
                operation=operation,
                expected_revision=command.expected_revision,
                key_hash=key_hash,
                fingerprint=fingerprint,
                before=before,
                result=result,
                conn=conn,
            )
            return result

    async def set_member_override(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        actor_user_id: UUID,
        command: MemberCreditOverrideWrite,
    ) -> MemberCreditConfigurationMutationOut:
        operation = _override_operation(command)
        fingerprint = _fingerprint(operation, actor_user_id, membership_id, command)
        key_hash = _key_hash(workspace_id, command.idempotency_key)
        async with self.tx() as conn:
            await self._repository.lock_workspace_and_actor(workspace_id, actor_user_id, conn)
            await self._repository.lock_target_membership(workspace_id, membership_id, conn)
            policy = await self._repository.lock_policy(workspace_id, conn)
            override = await self._repository.lock_override(workspace_id, membership_id, conn)
            replay = await self._replay(
                workspace_id=workspace_id,
                membership_id=membership_id,
                operation=operation,
                key_hash=key_hash,
                fingerprint=fingerprint,
                conn=conn,
            )
            if replay is not None:
                return replay
            _require_revision(policy.revision, command.expected_revision)
            before = _result(workspace_id, policy, override, membership_id=membership_id)
            revision = int(policy.revision) + 1
            override = await self._apply_override(
                workspace_id=workspace_id,
                membership_id=membership_id,
                actor_user_id=actor_user_id,
                command=command,
                revision=revision,
                override=override,
                conn=conn,
            )
            await self._repository.save_policy_revision(
                policy=policy,
                revision=revision,
                actor_user_id=actor_user_id,
                conn=conn,
            )
            result = _result(workspace_id, policy, override, membership_id=membership_id)
            await self._record_outcome(
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                membership_id=membership_id,
                operation=operation,
                expected_revision=command.expected_revision,
                key_hash=key_hash,
                fingerprint=fingerprint,
                before=before,
                result=result,
                conn=conn,
            )
            return result

    async def _apply_override(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        actor_user_id: UUID,
        command: MemberCreditOverrideWrite,
        revision: int,
        override: WorkspaceMemberCreditLimitOverride | None,
        conn,
    ) -> WorkspaceMemberCreditLimitOverride | None:
        if command.action == "clear":
            await self._repository.clear_override(override=override, conn=conn)
            return None
        if command.limit_kind is None:
            raise ServiceContractError("Set member Credit override is missing limit_kind after validation")
        return await self._repository.upsert_override(
            override=override,
            workspace_id=workspace_id,
            membership_id=membership_id,
            limit_kind=ResourceLimitKind(command.limit_kind),
            limit_credits=command.limit_credits,
            revision=revision,
            actor_user_id=actor_user_id,
            conn=conn,
        )

    async def _replay(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID | None,
        operation: MemberCreditCommandOperation,
        key_hash: str,
        fingerprint: str,
        conn,
    ) -> MemberCreditConfigurationMutationOut | None:
        receipt = await self._repository.lock_receipt(workspace_id, key_hash, conn)
        if receipt is None:
            return None
        if receipt.request_fingerprint != fingerprint or str(receipt.operation) != operation.value:
            raise Conflict(error="WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT")
        _validate_receipt_scope(receipt, membership_id)
        result = _validate_receipt_snapshot(receipt)
        if result.workspace_id != workspace_id or result.membership_id != membership_id:
            raise ServiceContractError("Member Credit receipt metadata does not match its stored snapshot")
        return result.model_copy(update={"replayed": True})

    async def _record_outcome(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        membership_id: UUID | None,
        operation: MemberCreditCommandOperation,
        expected_revision: int,
        key_hash: str,
        fingerprint: str,
        before: MemberCreditConfigurationMutationOut,
        result: MemberCreditConfigurationMutationOut,
        conn,
    ) -> None:
        await self._repository.record_outcome(
            settings=self.settings,
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            membership_id=membership_id,
            scope_kind=(
                MemberCreditCommandScopeKind.DEFAULT if membership_id is None else MemberCreditCommandScopeKind.OVERRIDE
            ),
            operation=operation,
            expected_revision=expected_revision,
            idempotency_key_hash=key_hash,
            request_fingerprint=fingerprint,
            before_snapshot=cast(JsonObject, before.model_dump(mode="json", exclude={"replayed"})),
            result_snapshot=cast(JsonObject, result.model_dump(mode="json")),
            result_revision=result.configuration_revision,
            conn=conn,
        )


def _override_operation(command: MemberCreditOverrideWrite) -> MemberCreditCommandOperation:
    if command.action == "clear":
        return MemberCreditCommandOperation.CLEAR_OVERRIDE
    return MemberCreditCommandOperation.SET_OVERRIDE


def _validate_receipt_scope(receipt: WorkspaceMemberCreditCommandReceipt, membership_id: UUID | None) -> None:
    expected_scope = (
        MemberCreditCommandScopeKind.DEFAULT if membership_id is None else MemberCreditCommandScopeKind.OVERRIDE
    )
    if str(receipt.scope_kind) != expected_scope.value or receipt.membership_id != membership_id:
        raise ServiceContractError("Member Credit receipt scope does not match its command result")


def _validate_receipt_snapshot(
    receipt: WorkspaceMemberCreditCommandReceipt,
) -> MemberCreditConfigurationMutationOut:
    try:
        result = MemberCreditConfigurationMutationOut.model_validate(receipt.result_snapshot)
    except ValidationError as exc:
        raise ServiceContractError("Member Credit receipt snapshot violates the output contract") from exc
    if int(receipt.result_revision) != result.configuration_revision:
        raise ServiceContractError("Member Credit receipt revision does not match its stored snapshot")
    return result


def _require_revision(current: int, expected: int) -> None:
    if current != expected:
        raise Conflict(error="WORKSPACE_MEMBER_CREDIT_REVISION_STALE")


def _result(
    workspace_id: UUID,
    policy: WorkspaceMemberCreditPolicy,
    override: WorkspaceMemberCreditLimitOverride | None,
    *,
    membership_id: UUID | None,
) -> MemberCreditConfigurationMutationOut:
    default_limit = MemberCreditLimitOut(
        limit_kind=policy.default_limit_kind,
        limit_credits=policy.default_limit_credits,
    )
    override_limit = None
    if override is not None:
        override_limit = MemberCreditLimitOut(limit_kind=override.limit_kind, limit_credits=override.limit_credits)
    return MemberCreditConfigurationMutationOut(
        workspace_id=workspace_id,
        membership_id=membership_id,
        default_limit=default_limit,
        override_limit=override_limit,
        effective_limit=override_limit or default_limit,
        configuration_revision=int(policy.revision),
    )


def _fingerprint(
    operation: MemberCreditCommandOperation,
    actor_user_id: UUID,
    membership_id: UUID | None,
    command: MemberCreditDefaultLimitWrite | MemberCreditOverrideWrite,
) -> str:
    payload = command.model_dump(mode="json", exclude={"idempotency_key"})
    payload.update({
        "operation": operation.value,
        "actorUserId": str(actor_user_id),
        "membershipId": None if membership_id is None else str(membership_id),
    })
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _key_hash(workspace_id: UUID, command_key: str) -> str:
    return hashlib.sha256(f"{workspace_id}:member-credit:{command_key.strip()}".encode()).hexdigest()
