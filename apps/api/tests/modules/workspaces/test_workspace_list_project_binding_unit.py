from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from src.models.organization.org_membership import OrgRole
from src.models.workspaces.workspace import Workspace
from src.modules.workspaces.service import (
    _build_guest_workspace_list,
    _build_member_workspace_list,
    _MemberWorkspaceListArgs,
)


class _FakeWorkspace:
    def __init__(self) -> None:
        self.id = uuid4()
        self.organization_id = uuid4()
        self.name = "Workspace Name"
        self.kind = "team"
        self.description = None
        self.icon_mode = "initials"
        self.icon_color = "#337ea9"
        self.icon_glyph = None
        self.icon_emoji = None
        self.icon_url = None
        self.created_at = datetime.now(UTC)
        self.created_by_user_id = uuid4()


def test_build_guest_workspace_list_defaults_project_id_to_none() -> None:
    workspace = _FakeWorkspace()

    items = _build_guest_workspace_list(workspaces=[cast(Workspace, workspace)])

    assert len(items) == 1
    assert items[0].workspace_id == workspace.id
    assert items[0].project_id is None


def test_build_member_workspace_list_defaults_project_id_to_none() -> None:
    user_id = uuid4()
    workspace = _FakeWorkspace()
    workspace.created_by_user_id = user_id

    items = _build_member_workspace_list(
        cast(
            _MemberWorkspaceListArgs,
            {
                "org_order": [workspace.organization_id],
                "org_roles": {workspace.organization_id: OrgRole.OWNER},
                "membership_by_workspace_id": {},
                "membership_workspaces_by_org": {},
                "owner_workspaces_by_org": {workspace.organization_id: [cast(Workspace, workspace)]},
                "user_id": user_id,
            },
        )
    )

    assert len(items) == 1
    assert items[0].workspace_id == workspace.id
    assert items[0].project_id is None
