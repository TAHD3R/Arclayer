from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.modules.commerce.entitlement_schema import SITE_GENERATION_ENTITLEMENT, EntitlementDecision
from src.modules.commerce.workspace_entitlement_authority import (
    WorkspaceBillingInitializer,
    WorkspaceEntitlementAuthority,
    WorkspaceEntitlementChecker,
)


@pytest.mark.asyncio
async def test_authority_materializes_billing_before_checking_entitlement() -> None:
    workspace_id = uuid4()
    call_order: list[str] = []
    decision = EntitlementDecision(
        workspace_id=workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
        granted=True,
        reason="granted",
    )
    ensure_workspace_billing = AsyncMock(side_effect=lambda **_kwargs: call_order.append("billing"))
    require_entitlement = AsyncMock(side_effect=lambda **_kwargs: call_order.append("entitlement") or decision)
    billing = cast(
        WorkspaceBillingInitializer,
        SimpleNamespace(ensure_workspace_billing=ensure_workspace_billing),
    )
    entitlements = cast(
        WorkspaceEntitlementChecker,
        SimpleNamespace(require=require_entitlement),
    )
    authority = WorkspaceEntitlementAuthority(billing=billing, entitlements=entitlements)

    result = await authority.require(
        workspace_id=workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
    )

    assert result is decision
    assert call_order == ["billing", "entitlement"]
    ensure_workspace_billing.assert_awaited_once_with(workspace_id=workspace_id)
    require_entitlement.assert_awaited_once_with(
        workspace_id=workspace_id,
        entitlement=SITE_GENERATION_ENTITLEMENT,
    )
