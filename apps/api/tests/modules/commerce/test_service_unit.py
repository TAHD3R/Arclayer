from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from unittest.mock import patch
from uuid import uuid4

from src.models.commerce.billing import (
    BillingCycle,
    SubscriptionChangeRequestStatus,
    WorkspaceSubscriptionChangeRequest,
)
from src.modules.commerce.service import _change_request_out


def test_change_request_output_includes_localized_plan_name() -> None:
    now = datetime(2026, 7, 12, tzinfo=UTC)
    row = cast(
        WorkspaceSubscriptionChangeRequest,
        SimpleNamespace(
            id=uuid4(),
            workspace_id=uuid4(),
            requested_by_user_id=uuid4(),
            requested_plan=SimpleNamespace(
                code="premium",
                name="Premium",
                name_i18n_key="PLAN_PREMIUM_NAME",
            ),
            billing_cycle=BillingCycle.YEARLY,
            reason=None,
            status=SubscriptionChangeRequestStatus.PENDING,
            reviewed_by_user_id=None,
            reviewed_at=None,
            review_note=None,
            created_at=now,
            updated_at=now,
        ),
    )

    with patch("src.modules.commerce.service.t", return_value="高级版") as translate:
        output = _change_request_out(row)

    assert output.plan_code == "premium"
    assert output.plan_name == "高级版"
    translate.assert_called_once_with("commerce", "PLAN_PREMIUM_NAME")
