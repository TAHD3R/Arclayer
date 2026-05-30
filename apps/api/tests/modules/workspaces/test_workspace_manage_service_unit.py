from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from src.config import get_settings
from src.modules.workspaces.schema import WorkspaceManageCreateRequest
from src.modules.workspaces.service import WorkspaceService


async def test_manage_workspace_create_accepts_string_template_from_base_schema(monkeypatch) -> None:
    settings = get_settings()
    service = WorkspaceService(settings)
    organization_id = uuid4()
    workspace_id = uuid4()
    owner_id = uuid4()
    captured: dict[str, object] = {}

    async def _ensure_org(*, user_id, organization_name):  # type: ignore[no-untyped-def]
        captured["organization_name"] = organization_name
        return SimpleNamespace(id=organization_id)

    async def _create_workspace(*, organization_id, user_id, org_role, payload):  # type: ignore[no-untyped-def]
        captured["template"] = payload.template
        captured["payload"] = payload
        return SimpleNamespace(
            id=workspace_id,
            workspace_id=workspace_id,
            project_id=None,
            name="Managed Workspace",
            kind="team",
            description="Managed description",
            icon_mode="initials",
            icon_color="#337ea9",
            icon_glyph=None,
            icon_emoji=None,
            icon_url=None,
            is_archived=False,
            archived_at=None,
            archived_by_user_id=None,
            member_count=0,
            members_preview=[],
            created_at=datetime.now(UTC),
            enterable=True,
            project=None,
        )

    monkeypatch.setattr(service, "_ensure_onboarding_team_organization", _ensure_org)
    monkeypatch.setattr(service.organization_workspace_service, "create_workspace", _create_workspace)
    payload = WorkspaceManageCreateRequest.model_validate(
        {
            "name": "Managed Workspace",
            "description": "Managed description",
            "template": "blank",
        }
    )
    assert isinstance(payload.template, str)

    created = await service.create_manage_workspace(user_id=owner_id, payload=payload)

    assert captured["template"] == "blank"
    assert created.name == "Managed Workspace"
