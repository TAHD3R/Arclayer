from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import WorkspaceIconMode
from src.modules.projects.settings.general_identity_repository import ProjectGeneralIdentityRepository
from src.modules.projects.settings.general_identity_schema import ProjectGeneralIdentity


@dataclass
class _FakeProject:
    id: UUID
    workspace_id: UUID
    name: str = "Arclayer"
    description: str | None = None
    icon_mode: str = "initials"
    icon_color: str = "#337ea9"
    icon_glyph: str | None = None
    icon_emoji: str | None = None
    icon_url: str | None = None


class _FakeConn:
    pass


def test_project_general_identity_normalizes_and_freezes_owned_values() -> None:
    identity = ProjectGeneralIdentity(
        name="  Studio  ",
        description="   ",
        icon_mode=WorkspaceIconMode.GLYPH,
        icon_color="#3A7",
        icon_glyph="layout-dashboard",
    )

    assert identity.name == "Studio"
    assert identity.description is None
    assert identity.icon_color == "#33aa77"
    with pytest.raises(ValidationError, match="frozen"):
        identity.name = "Changed"


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"iconMode": "glyph"}, "requires its active value"),
        ({"iconMode": "initials", "iconEmoji": "✨"}, "inactive icon values must be null"),
        ({"iconColor": "blue"}, "six-digit hex color"),
    ],
)
def test_project_general_identity_rejects_incoherent_icon_contract(
    payload: dict[str, object],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        ProjectGeneralIdentity.model_validate({"name": "Arclayer", **payload})


@pytest.mark.asyncio
async def test_repository_locks_project_identity_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    conn = _FakeConn()
    project = _FakeProject(id=project_id, workspace_id=uuid4())
    captured: dict[str, object] = {}

    class _FakeQuery:
        def using_db(self, using_conn):
            captured["using_db"] = using_conn
            return self

        def select_for_update(self):
            captured["select_for_update"] = True
            return self

        async def first(self):
            return project

    def fake_filter(**kwargs):
        captured["filter"] = kwargs
        return _FakeQuery()

    monkeypatch.setattr(ProjectRecord, "filter", fake_filter)

    result = await ProjectGeneralIdentityRepository().get_identity_for_update(
        project_id=project_id,
        conn=cast(BaseDBAsyncClient, conn),
    )

    assert result is project
    assert captured == {
        "filter": {"id": project_id},
        "using_db": conn,
        "select_for_update": True,
    }


@pytest.mark.asyncio
async def test_repository_updates_only_requested_identity_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    conn = _FakeConn()
    captured: dict[str, Any] = {}

    class _FakeQuery:
        def using_db(self, using_conn):
            captured["using_db"] = using_conn
            return self

        async def update(self, **values):
            captured["values"] = values
            return 1

    def fake_filter(**kwargs):
        captured["filter"] = kwargs
        return _FakeQuery()

    monkeypatch.setattr(ProjectRecord, "filter", fake_filter)

    await ProjectGeneralIdentityRepository().save_identity(
        project_id=project_id,
        values={"name": "New name", "description": None},
        conn=cast(BaseDBAsyncClient, conn),
    )

    assert captured["filter"] == {"id": project_id}
    assert captured["using_db"] is conn
    assert captured["values"]["name"] == "New name"
    assert captured["values"]["description"] is None
    assert set(captured["values"]) == {"name", "description", "updated_at"}
