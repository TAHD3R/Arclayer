from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.commerce.billing import (
    FeatureAccessAllocationScope,
    FeatureAccessAssignment,
    FeatureAccessCommandReceipt,
)
from src.modules.commerce.convergence.schema import FeatureAccessConvergenceCommand
from src.modules.commerce.feature_access.contracts import (
    FeatureAccessConvergenceResult,
    FeatureAccessConvergenceScopeResult,
)

CONVERGENCE_OPERATION = "convergence"


async def load_convergence_replay(
    *,
    command: FeatureAccessConvergenceCommand,
    scopes_by_key: dict[str, FeatureAccessAllocationScope],
    fingerprint: str,
    conn: BaseDBAsyncClient,
) -> FeatureAccessConvergenceResult | None:
    receipts = []
    for key in sorted(scopes_by_key):
        scope = scopes_by_key[key]
        receipt = await FeatureAccessCommandReceipt.get_or_none(
            idempotency_key_hash=convergence_receipt_key(scope.id, command.idempotency_key),
            using_db=conn,
        )
        receipts.append((key, receipt))
    if all(receipt is None for _, receipt in receipts):
        return None
    if any(receipt is None for _, receipt in receipts):
        raise ValueError("partial convergence receipt set")
    results = []
    for key, receipt in receipts:
        assert receipt is not None
        if receipt.operation != CONVERGENCE_OPERATION or receipt.fingerprint != fingerprint:
            raise KeyError("convergence idempotency conflict")
        result = FeatureAccessConvergenceScopeResult.model_validate(receipt.result_snapshot)
        if result.entitlement_key != key or result.result_revision != receipt.result_revision:
            raise ValueError("invalid convergence receipt")
        results.append(result)
    replay = convergence_result(command, tuple(results), replayed=True)
    if set(replay.reviewed_assignment_ids) != set(command.reviewed_assignment_ids) or set(
        replay.retained_assignment_ids
    ) != set(command.retained_assignment_ids):
        raise ValueError("convergence receipt does not match reviewed command")
    return replay


async def write_convergence_receipts(
    *,
    command: FeatureAccessConvergenceCommand,
    assignments_by_key: dict[str, list[FeatureAccessAssignment]],
    scopes_by_key: dict[str, FeatureAccessAllocationScope],
    fingerprint: str,
    conn: BaseDBAsyncClient,
) -> tuple[FeatureAccessConvergenceScopeResult, ...]:
    expected = {item.entitlement_key: item.revision for item in command.expected_scope_revisions}
    retained = set(command.retained_assignment_ids)
    results = []
    for key in sorted(scopes_by_key):
        scope = scopes_by_key[key]
        reviewed_ids = _sorted_uuids(UUID(str(item.id)) for item in assignments_by_key[key])
        retained_ids = tuple(item for item in reviewed_ids if item in retained)
        ended_ids = tuple(item for item in reviewed_ids if item not in retained)
        if ended_ids:
            scope.revision += 1
            await scope.save(update_fields=["revision", "updated_at"], using_db=conn)
        result = FeatureAccessConvergenceScopeResult(
            entitlement_key=key,
            expected_revision=expected[key],
            result_revision=scope.revision,
            reviewed_assignment_ids=reviewed_ids,
            retained_assignment_ids=retained_ids,
            ended_assignment_ids=ended_ids,
        )
        await FeatureAccessCommandReceipt.create(
            using_db=conn,
            scope_id=scope.id,
            idempotency_key_hash=convergence_receipt_key(scope.id, command.idempotency_key),
            fingerprint=fingerprint,
            operation=CONVERGENCE_OPERATION,
            result_revision=result.result_revision,
            result_snapshot=result.model_dump(mode="json"),
        )
        results.append(result)
    return tuple(results)


def convergence_result(
    command: FeatureAccessConvergenceCommand,
    scopes: tuple[FeatureAccessConvergenceScopeResult, ...],
    *,
    replayed: bool,
) -> FeatureAccessConvergenceResult:
    return FeatureAccessConvergenceResult(
        convergence_id=command.convergence_id,
        workspace_id=command.workspace_id,
        target_revision_id=command.target_revision_id,
        effective_at=command.effective_at,
        reviewed_assignment_ids=_sorted_uuids(item for scope in scopes for item in scope.reviewed_assignment_ids),
        retained_assignment_ids=_sorted_uuids(item for scope in scopes for item in scope.retained_assignment_ids),
        ended_assignment_ids=_sorted_uuids(item for scope in scopes for item in scope.ended_assignment_ids),
        scopes=scopes,
        replayed=replayed,
    )


def convergence_fingerprint(command: FeatureAccessConvergenceCommand) -> str:
    payload = command.model_dump(mode="json", by_alias=True, exclude={"idempotency_key"})
    payload["reviewedAssignmentIds"] = sorted(str(value) for value in command.reviewed_assignment_ids)
    payload["retainedAssignmentIds"] = sorted(str(value) for value in command.retained_assignment_ids)
    payload["expectedScopeRevisions"] = sorted(
        (item.model_dump(mode="json", by_alias=True) for item in command.expected_scope_revisions),
        key=lambda item: item["entitlementKey"],
    )
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def convergence_receipt_key(scope_id: UUID, idempotency_key: str) -> str:
    return hashlib.sha256(f"{scope_id}:convergence:{idempotency_key}".encode()).hexdigest()


def _sorted_uuids(values: Iterable[UUID]) -> tuple[UUID, ...]:
    return cast(tuple[UUID, ...], tuple(sorted(values, key=str)))
