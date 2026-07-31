from __future__ import annotations

import hashlib
import json
from typing import Any, cast

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.exceptions import Conflict
from src.core.i18n import t
from src.models.commerce.feature_access import FeatureAccessConvergenceOutboxRecord
from src.modules.commerce.feature_access.contracts import FeatureAccessConvergenceResult


class TortoiseFeatureAccessConvergenceOutbox:
    """Append immutable convergence facts through the caller's transaction."""

    async def append_feature_access_convergence(
        self,
        *,
        result: FeatureAccessConvergenceResult,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload = feature_access_convergence_payload(result)
        fingerprint = feature_access_convergence_fingerprint(payload)
        existing = await (
            FeatureAccessConvergenceOutboxRecord
            .filter(convergence_id=result.convergence_id)
            .using_db(conn)
            .select_for_update()
            .first()
        )
        if existing is not None:
            if existing.fingerprint == fingerprint and cast(dict[str, Any], existing.payload) == payload:
                return
            raise _outbox_conflict(result)
        await FeatureAccessConvergenceOutboxRecord.create(
            using_db=conn,
            convergence_id=result.convergence_id,
            workspace_id=result.workspace_id,
            fingerprint=fingerprint,
            payload=payload,
            effective_at=result.effective_at,
        )


def feature_access_convergence_payload(result: FeatureAccessConvergenceResult) -> dict[str, Any]:
    return result.model_dump(mode="json", by_alias=True)


def feature_access_convergence_fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _outbox_conflict(result: FeatureAccessConvergenceResult) -> Conflict:
    return Conflict(
        message=t("errors", "BAD_REQUEST"),
        error="FEATURE_ACCESS_CONVERGENCE_OUTBOX_CONFLICT",
        meta={
            "convergenceId": str(result.convergence_id),
            "workspaceId": str(result.workspace_id),
        },
    )
