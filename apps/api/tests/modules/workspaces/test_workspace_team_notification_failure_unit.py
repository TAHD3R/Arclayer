from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.models.system.notification import NotificationCategory
from src.modules.system.admin.notifications.schema import NotificationWorkspaceSettingsTarget
from src.models.workspaces.workspace import WorkspaceMembershipStatus
from src.modules.workspaces.team import service as module
from src.modules.workspaces.team.service import WorkspaceTeamService


@pytest.mark.asyncio
async def test_workspace_team_notification_write_failure_is_not_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_notification_write(**_kwargs: object) -> object:
        raise RuntimeError("notification write failed")

    monkeypatch.setattr(module, "create_notification_record", fail_notification_write)
    service = WorkspaceTeamService(
        Settings(),
        role_management_reader=cast(Any, SimpleNamespace()),
        feature_access_release_participant=cast(Any, SimpleNamespace()),
    )

    with pytest.raises(RuntimeError, match="notification write failed"):
        await service._create_notification_record(
            workspace_id=uuid4(),
            recipient_user_id=uuid4(),
            actor_user_id=uuid4(),
            category=NotificationCategory.TEAM,
            title="Role updated",
            body="Your role changed.",
            target=NotificationWorkspaceSettingsTarget(destination="people", section="members-table"),
            event_name="workspace.member.roles.updated",
            dedupe_key="workspace.member.roles.updated:test",
        )


@pytest.mark.asyncio
async def test_disabling_member_aborts_transaction_when_feature_access_release_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace_id = uuid4()
    membership_id = uuid4()
    member_user_id = uuid4()
    actor_user_id = uuid4()
    transaction_connection = cast(BaseDBAsyncClient, object())
    membership = SimpleNamespace(
        id=membership_id,
        user_id=member_user_id,
        status=WorkspaceMembershipStatus.ACTIVE,
        updated_at=datetime(2026, 7, 31, tzinfo=UTC),
        workspace=SimpleNamespace(owner_user_id=uuid4()),
        save=AsyncMock(),
    )
    participant = SimpleNamespace(
        release_for_membership_end=AsyncMock(side_effect=RuntimeError("feature access release failed")),
    )
    service = WorkspaceTeamService(
        Settings(),
        role_management_reader=cast(Any, SimpleNamespace()),
        feature_access_release_participant=cast(Any, participant),
    )
    service.repo = cast(Any, SimpleNamespace(get_membership=AsyncMock(return_value=membership)))
    activity_writer = AsyncMock()
    monkeypatch.setattr(service, "_write_activity_event", activity_writer)
    transaction_errors: list[Exception] = []

    @asynccontextmanager
    async def tx(*, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        _ = conn
        try:
            yield transaction_connection
        except Exception as exc:
            transaction_errors.append(exc)
            raise

    monkeypatch.setattr(service, "tx", tx)

    with pytest.raises(RuntimeError, match="feature access release failed"):
        await service.set_member_status(
            organization_id=uuid4(),
            workspace_id=workspace_id,
            membership_id=membership_id,
            enabled=False,
            acting_user_id=actor_user_id,
        )

    participant.release_for_membership_end.assert_awaited_once_with(
        workspace_id=workspace_id,
        membership_id=membership_id,
        lifecycle_idempotency_key=(f"workspace-membership:{membership_id}:disable:{membership.updated_at.isoformat()}"),
        conn=transaction_connection,
    )
    assert transaction_errors[0].args == ("feature access release failed",)
    assert membership.status == WorkspaceMembershipStatus.ACTIVE
    membership.save.assert_not_awaited()
    activity_writer.assert_not_awaited()
