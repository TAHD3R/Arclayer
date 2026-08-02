from __future__ import annotations

from typing import cast

from src.common.types.json_types import JsonObject
from src.core.exceptions import Conflict
from src.models.hosting.commercial_access import HostingDeliveryOperation
from src.modules.platform_site_delivery.schema import PlatformDeliveryOperationOut


def present_delivery_operation(
    operation: HostingDeliveryOperation,
    *,
    replayed: bool = False,
) -> PlatformDeliveryOperationOut:
    evidence = operation.evidence
    if not isinstance(evidence, dict):
        raise Conflict(error="HOSTING_DELIVERY_OPERATION_EVIDENCE_INVALID")
    return PlatformDeliveryOperationOut(
        id=operation.id,
        target_type=operation.target_type,
        target_id=operation.target_id,
        action=operation.action,
        state=operation.state,
        verification_state=operation.verification_state,
        before_state=operation.before_state,
        resulting_state=operation.resulting_state,
        source_operation_identity=operation.source_operation_identity,
        result_reference_id=operation.result_reference_id,
        failed_target_count=operation.failed_target_count,
        evidence=cast(JsonObject, evidence),
        failure_code=operation.failure_code,
        failure_message=operation.failure_message,
        created_at=operation.created_at,
        completed_at=operation.completed_at,
        replayed=replayed,
    )
