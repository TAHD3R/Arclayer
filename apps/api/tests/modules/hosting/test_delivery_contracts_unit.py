from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.hosting.delivery_contracts import (
    HostingDeliveryTarget,
    HostingDeliveryTargetResult,
    HostingRestorationTarget,
)


def test_delivery_contracts_are_frozen_equal_and_json_serializable() -> None:
    site_id = uuid4()
    runtime_id = uuid4()
    release_id = uuid4()
    target = HostingDeliveryTarget(
        site_id=site_id,
        runtime_id=runtime_id,
        preserved_release_id=release_id,
    )
    result = HostingDeliveryTargetResult(
        target=target,
        succeeded=False,
        operation_identity="hosting-restoration:1",
        verification_evidence="delivery:pending",
        failure_code="HOSTING_DELIVERY_CACHE_INVALIDATION_FAILED",
        failure_message="cache unavailable",
    )
    restoration = HostingRestorationTarget(target=target, operation_identity="hosting-restoration:1")

    assert target == HostingDeliveryTarget(
        site_id=site_id,
        runtime_id=runtime_id,
        preserved_release_id=release_id,
    )
    assert restoration.target == target
    assert result.model_dump(mode="json") == {
        "target": {
            "site_id": str(site_id),
            "runtime_id": str(runtime_id),
            "preserved_release_id": str(release_id),
        },
        "succeeded": False,
        "operation_identity": "hosting-restoration:1",
        "verification_evidence": "delivery:pending",
        "failure_code": "HOSTING_DELIVERY_CACHE_INVALIDATION_FAILED",
        "failure_message": "cache unavailable",
    }

    with pytest.raises(ValidationError, match="frozen_instance"):
        target.runtime_id = uuid4()


def test_delivery_contracts_reject_undeclared_fields() -> None:
    with pytest.raises(ValidationError, match="extra_forbidden"):
        HostingDeliveryTarget.model_validate({
            "site_id": uuid4(),
            "runtime_id": uuid4(),
            "preserved_release_id": None,
            "workspace_id": uuid4(),
        })
