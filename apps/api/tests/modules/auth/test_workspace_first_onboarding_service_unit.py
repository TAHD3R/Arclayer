from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import Settings
from src.modules.auth.onboarding import service as onboarding_module
from src.modules.auth.onboarding.service import WorkspaceFirstOnboardingService


class _SettingRecord:
    def __init__(self, value: dict[str, object]) -> None:
        self.value = value
        self.updated_by = None
        self.saved_with: dict[str, object] | None = None

    async def save(self, **kwargs: object) -> None:
        self.saved_with = kwargs


class _SettingQuery:
    def __init__(self, record: _SettingRecord | None) -> None:
        self.record = record
        self.connection = None
        self.locked = False

    def using_db(self, connection: object) -> _SettingQuery:
        self.connection = connection
        return self

    def select_for_update(self) -> _SettingQuery:
        self.locked = True
        return self

    async def first(self) -> _SettingRecord | None:
        return self.record


@pytest.mark.asyncio
async def test_invitation_workspace_completes_pending_onboarding_in_same_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    workspace_id = uuid4()
    connection = object()
    record = _SettingRecord({"status": "pending_workspace", "workspace_id": None})
    query = _SettingQuery(record)
    monkeypatch.setattr(
        onboarding_module.SettingRecord,
        "filter",
        lambda **_filters: query,
    )

    changed = await WorkspaceFirstOnboardingService(Settings(app_env="test")).complete_existing_workspace_if_pending(
        user_id=user_id,
        workspace_id=workspace_id,
        conn=connection,
    )

    assert changed is True
    assert query.connection is connection
    assert query.locked is True
    assert record.value["status"] == "completed"
    assert record.value["workspace_id"] == str(workspace_id)
    assert record.updated_by == user_id
    assert record.saved_with == {
        "using_db": connection,
        "update_fields": ["value", "updated_by", "updated_at"],
    }


@pytest.mark.asyncio
async def test_invitation_workspace_preserves_completed_onboarding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid4()
    workspace_id = uuid4()
    record = _SettingRecord({"status": "completed", "workspace_id": str(workspace_id)})
    query = _SettingQuery(record)
    monkeypatch.setattr(
        onboarding_module.SettingRecord,
        "filter",
        lambda **_filters: query,
    )

    changed = await WorkspaceFirstOnboardingService(Settings(app_env="test")).complete_existing_workspace_if_pending(
        user_id=user_id,
        workspace_id=workspace_id,
        conn=object(),
    )

    assert changed is False
    assert record.saved_with is None
