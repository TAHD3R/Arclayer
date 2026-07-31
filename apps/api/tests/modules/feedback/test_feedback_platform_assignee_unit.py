from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.modules.feedback.service import _is_platform_assignee_eligible


class _PlatformIdentityRepository:
    def __init__(self, *, instance_owner: bool, active_operator: bool) -> None:
        self.instance_owner = instance_owner
        self.active_operator = active_operator

    async def is_instance_owner(self, **_kwargs: object) -> bool:
        return self.instance_owner

    async def get_active_operator_by_user_id(self, **_kwargs: object):
        return SimpleNamespace() if self.active_operator else None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("instance_owner", "active_operator", "eligible"),
    [
        (True, False, True),
        (False, True, True),
        (False, False, False),
    ],
)
async def test_feedback_assignee_eligibility_uses_platform_identity(
    instance_owner: bool,
    active_operator: bool,
    eligible: bool,
) -> None:
    repository = _PlatformIdentityRepository(
        instance_owner=instance_owner,
        active_operator=active_operator,
    )

    assert (
        await _is_platform_assignee_eligible(
            user_id=uuid4(),
            repository=repository,  # type: ignore[arg-type]
            conn=SimpleNamespace(),  # type: ignore[arg-type]
        )
        is eligible
    )
