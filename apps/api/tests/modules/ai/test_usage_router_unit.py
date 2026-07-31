from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Forbidden
from src.modules.ai import usage_router
from src.modules.workspaces.http.schema import WorkspaceAccessType, WorkspaceContext


async def test_usage_read_access_uses_product_workspace_membership(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()

    async def _resolve_workspace_context_by_id(**kwargs):
        assert kwargs == {"workspace_id": workspace_id, "user_id": user_id}
        return WorkspaceContext(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            access_type=WorkspaceAccessType.MEMBER,
            org_membership_id=uuid4(),
            is_org_owner=False,
            workspace_membership_id=uuid4(),
        )

    monkeypatch.setattr(usage_router, "resolve_workspace_context_by_id", _resolve_workspace_context_by_id)

    resolved = await usage_router.require_workspace_usage_read_access(workspace_id=workspace_id, user_id=user_id)

    assert resolved == workspace_id


async def test_usage_read_access_rejects_context_without_workspace_membership(monkeypatch) -> None:
    workspace_id = uuid4()
    user_id = uuid4()

    async def _resolve_workspace_context_by_id(**_kwargs):
        return WorkspaceContext(
            workspace_id=workspace_id,
            organization_id=uuid4(),
            access_type=WorkspaceAccessType.MEMBER,
            org_membership_id=uuid4(),
            is_org_owner=True,
            workspace_membership_id=None,
        )

    monkeypatch.setattr(usage_router, "resolve_workspace_context_by_id", _resolve_workspace_context_by_id)

    with pytest.raises(Forbidden):
        await usage_router.require_workspace_usage_read_access(workspace_id=workspace_id, user_id=user_id)


async def test_monthly_usage_groups_before_values(monkeypatch) -> None:
    workspace_id = uuid4()
    calls: list[tuple[str, object]] = []
    records = [
        {
            "provider": "openai",
            "model": "gpt-4.1",
            "request_count": 2,
            "prompt_tokens": 120,
            "completion_tokens": 45,
            "cost_micros": 3600,
        },
        {
            "provider": "anthropic",
            "model": "claude-4",
            "request_count": 1,
            "prompt_tokens": 80,
            "completion_tokens": 20,
            "cost_micros": 2400,
        },
    ]

    class FakeValuesQuery:
        def __await__(self):
            async def _resolve():
                return records

            return _resolve().__await__()

    class FakeQuery:
        def annotate(self, **kwargs):
            calls.append(("annotate", tuple(sorted(kwargs))))
            return self

        def group_by(self, *fields):
            calls.append(("group_by", fields))
            return self

        def order_by(self, *fields):
            calls.append(("order_by", fields))
            return self

        def values(self, *fields):
            calls.append(("values", fields))
            return FakeValuesQuery()

    class FakeAIUsageDaily:
        @staticmethod
        def filter(**kwargs):
            calls.append(("filter", kwargs))
            return FakeQuery()

    monkeypatch.setattr(usage_router, "AIUsageDaily", FakeAIUsageDaily)

    response = await usage_router.get_monthly_usage(
        period="2026-06",
        workspace_id=workspace_id,
        settings=Settings(),
    )

    assert [name for name, _payload in calls] == ["filter", "annotate", "group_by", "order_by", "values"]
    assert calls[2] == ("group_by", ("provider", "model"))
    assert calls[4] == (
        "values",
        ("provider", "model", "request_count", "prompt_tokens", "completion_tokens", "cost_micros"),
    )
    assert response.data is not None
    assert response.data.total_requests == 3
    assert response.data.total_cost_micros == 6000
    assert [entry.model for entry in response.data.by_model] == ["gpt-4.1", "claude-4"]
