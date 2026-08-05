from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.models.commerce.billing import ResourceLimitKind
from src.modules.commerce.member_credit_schema import (
    MemberCreditConfigurationMutationOut,
    MemberCreditDefaultLimitWrite,
    MemberCreditLimitOut,
    MemberCreditOverrideWrite,
)


def test_member_credit_write_schemas_accept_limited_and_unlimited_shapes() -> None:
    limited = MemberCreditDefaultLimitWrite(
        limit_kind=ResourceLimitKind.LIMITED,
        limit_credits=250,
        expected_revision=1,
        idempotency_key="default-limited",
    )
    unlimited = MemberCreditOverrideWrite(
        action="set",
        limit_kind=ResourceLimitKind.UNLIMITED,
        limit_credits=None,
        expected_revision=2,
        idempotency_key="member-unlimited",
    )

    assert limited.limit_kind == "limited"
    assert limited.limit_credits == 250
    assert unlimited.limit_kind == "unlimited"
    assert unlimited.limit_credits is None


@pytest.mark.parametrize(
    ("limit_kind", "limit_credits"),
    [
        (ResourceLimitKind.LIMITED, None),
        (ResourceLimitKind.LIMITED, 0),
        (ResourceLimitKind.LIMITED, -1),
        (ResourceLimitKind.UNLIMITED, 1),
    ],
)
def test_member_credit_default_limit_rejects_invalid_shapes(
    limit_kind: ResourceLimitKind,
    limit_credits: int | None,
) -> None:
    with pytest.raises(ValidationError):
        MemberCreditDefaultLimitWrite(
            limit_kind=limit_kind,
            limit_credits=limit_credits,
            expected_revision=1,
            idempotency_key="invalid-default",
        )


def test_member_credit_override_clear_is_distinct_from_explicit_unlimited() -> None:
    clear = MemberCreditOverrideWrite(
        action="clear",
        expected_revision=3,
        idempotency_key="clear-member",
    )

    assert clear.limit_kind is None
    assert clear.limit_credits is None
    with pytest.raises(ValidationError):
        MemberCreditOverrideWrite(
            action="clear",
            limit_kind=ResourceLimitKind.UNLIMITED,
            expected_revision=3,
            idempotency_key="invalid-clear",
        )


def test_member_credit_receipt_output_rejects_malformed_limit_snapshot() -> None:
    workspace_id = uuid4()
    with pytest.raises(ValidationError):
        MemberCreditConfigurationMutationOut.model_validate({
            "workspaceId": workspace_id,
            "membershipId": None,
            "defaultLimit": MemberCreditLimitOut(
                limit_kind=ResourceLimitKind.LIMITED,
                limit_credits=10,
            ).model_dump(mode="json"),
            "overrideLimit": None,
            "effectiveLimit": {"limitKind": "limited", "limitCredits": None},
            "configurationRevision": 2,
        })
