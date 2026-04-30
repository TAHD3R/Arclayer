from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from src.config import get_settings
from src.models.workspaces.workspace import Workspace
from src.modules.organization.workspaces.service import OrganizationWorkspaceService


class _FakeWorkspace:
    def __init__(self) -> None:
        self.id = uuid4()
        self.slug = "founder-team"
        self.name = "Founder Team"
        self.description = None
        self.icon_mode = "initials"
        self.icon_color = "#337ea9"
        self.icon_glyph = None
        self.icon_emoji = None
        self.icon_url = None
        self.archived_at = None
        self.archived_by_user_id = None
        self.created_at = datetime.now(UTC)


def test_build_workspace_out_allows_missing_project(monkeypatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = OrganizationWorkspaceService(settings)

    workspace = _FakeWorkspace()
    organization_id = uuid4()

    out = service._build_workspace_out(
        organization_id=organization_id,
        workspace=cast(Workspace, workspace),
        member_count=1,
        members_preview=[],
        enterable=True,
        project_id=None,
    )

    assert out.workspace_id == workspace.id
    assert out.organization_id == organization_id
    assert out.project_id is None
    assert out.project is None
