from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import Settings
from src.models.system.notification import NotificationCategory
from src.modules.workspaces.team import service as module
from src.modules.workspaces.team.service import WorkspaceTeamService


@pytest.mark.asyncio
async def test_workspace_team_notification_write_failure_is_not_swallowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_notification_write(**_kwargs: object) -> object:
        raise RuntimeError("notification write failed")

    monkeypatch.setattr(module, "create_notification_record", fail_notification_write)
    service = WorkspaceTeamService(Settings())

    with pytest.raises(RuntimeError, match="notification write failed"):
        await service._create_notification_record(
            workspace_id=uuid4(),
            recipient_user_id=uuid4(),
            actor_user_id=uuid4(),
            category=NotificationCategory.TEAM,
            title="Role updated",
            body="Your role changed.",
            target_to="/settings/team/members",
            event_name="workspace.member.roles.updated",
            dedupe_key="workspace.member.roles.updated:test",
        )
