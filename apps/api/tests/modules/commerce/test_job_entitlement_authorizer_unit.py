from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.core.exceptions import Forbidden, ServiceUnavailable
from src.modules.commerce.entitlement_schema import SITE_GENERATION_ENTITLEMENT
from src.modules.commerce.entitlement_service import (
    COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
    COMMERCE_ENTITLEMENT_REQUIRED,
)
from src.modules.commerce.job_entitlement_authorizer import WorkspaceCommerceJobEntitlementAuthorizer
from src.modules.jobs.execution_errors import PermanentJobExecutionError, TransientJobExecutionError


@pytest.mark.asyncio
async def test_authorizer_translates_revoked_entitlement_to_permanent_job_evidence() -> None:
    workspace_id = uuid4()
    checker = AsyncMock()
    checker.require.side_effect = Forbidden(
        "Workspace plan does not grant the required entitlement",
        error=COMMERCE_ENTITLEMENT_REQUIRED,
        meta={
            "entitlement": SITE_GENERATION_ENTITLEMENT,
            "reason": "feature_excluded",
            "planCode": "free",
        },
    )
    authorizer = WorkspaceCommerceJobEntitlementAuthorizer(checker)

    with pytest.raises(PermanentJobExecutionError) as captured:
        await authorizer.authorize(
            workspace_id=workspace_id,
            entitlement=SITE_GENERATION_ENTITLEMENT,
        )

    assert captured.value.code == COMMERCE_ENTITLEMENT_REQUIRED
    assert captured.value.metadata == {
        "entitlement": SITE_GENERATION_ENTITLEMENT,
        "reason": "feature_excluded",
        "planCode": "free",
    }


@pytest.mark.asyncio
async def test_authorizer_translates_invalid_configuration_to_transient_job_evidence() -> None:
    checker = AsyncMock()
    checker.require.side_effect = ServiceUnavailable(
        "Commerce entitlement configuration is invalid",
        error=COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
        meta={"reason": "plan_feature_invalid"},
    )
    authorizer = WorkspaceCommerceJobEntitlementAuthorizer(checker)

    with pytest.raises(TransientJobExecutionError) as captured:
        await authorizer.authorize(
            workspace_id=uuid4(),
            entitlement=SITE_GENERATION_ENTITLEMENT,
        )

    assert captured.value.code == COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID
    assert captured.value.metadata == {"reason": "plan_feature_invalid"}


@pytest.mark.asyncio
async def test_authorizer_does_not_reclassify_unrelated_forbidden_errors() -> None:
    unexpected = Forbidden("Permission denied", error="PROJECT_PERMISSION_DENIED")
    checker = AsyncMock()
    checker.require.side_effect = unexpected
    authorizer = WorkspaceCommerceJobEntitlementAuthorizer(checker)

    with pytest.raises(Forbidden) as captured:
        await authorizer.authorize(
            workspace_id=uuid4(),
            entitlement=SITE_GENERATION_ENTITLEMENT,
        )

    assert captured.value is unexpected
