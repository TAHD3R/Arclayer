from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.config import get_settings
from src.modules.projects.settings.service import ProjectSettingsService
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_PROJECT


class _FakeSettingRecord:
    def __init__(self, value: dict | None) -> None:
        self.value = value
        self.updated_at = datetime.now(UTC)
        self.updated_by = None

    async def save(self, *, update_fields: list[str]) -> None:
        assert update_fields == ["value", "updated_by", "updated_at"]
        self.updated_at = datetime.now(UTC)


class _FakeConn:
    pass


@pytest.mark.asyncio
async def test_project_settings_service_get_core_detail_returns_project_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = ProjectSettingsService(settings)

    record = _FakeSettingRecord({"site": {"name": "Arclayer"}})

    async def fake_get_or_none(**kwargs):
        assert kwargs["scope_id"]
        return record

    monkeypatch.setattr(
        "src.modules.projects.settings.service.SettingRecord.get_or_none",
        fake_get_or_none,
    )

    detail = await service.get_core_detail(project_id=uuid4())

    assert detail.namespace == "core"
    site_settings = cast(JsonObject, detail.value["site"])
    assert site_settings["name"] == "Arclayer"


@pytest.mark.asyncio
async def test_project_settings_service_patch_core_creates_project_scoped_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    settings = get_settings()
    service = ProjectSettingsService(settings)
    project_id = uuid4()
    updated_by = uuid4()
    tx_conn = _FakeConn()
    captured: dict[str, object] = {}

    async def fake_get_or_none(**kwargs):
        assert kwargs["using_db"] is tx_conn
        return None

    async def fake_create(**kwargs):
        assert kwargs["using_db"] is tx_conn
        captured["create"] = kwargs
        return _FakeSettingRecord(kwargs["value"])

    @asynccontextmanager
    async def fake_tx(*, conn=None):
        assert conn is None
        yield tx_conn

    async def fake_write_settings_activity_event(**kwargs):
        assert kwargs["conn"] is tx_conn
        captured["activity"] = kwargs

    monkeypatch.setattr(service, "tx", fake_tx)
    monkeypatch.setattr(service, "_write_settings_activity_event", fake_write_settings_activity_event)
    monkeypatch.setattr(
        "src.modules.projects.settings.service.SettingRecord.get_or_none",
        fake_get_or_none,
    )
    monkeypatch.setattr(
        "src.modules.projects.settings.service.SettingRecord.create",
        fake_create,
    )
    monkeypatch.setattr(
        "src.modules.projects.settings.service.validate_config_schema",
        lambda *args, **kwargs: None,
    )

    detail = await service.patch_core(
        project_id=project_id,
        patch={"site": {"name": "Arclayer"}},
        updated_by=updated_by,
    )

    assert detail.namespace == "core"
    assert detail.value == {"site": {"name": "Arclayer"}}
    assert captured["create"] == {
        "scope_type": SCOPE_TYPE_PROJECT,
        "scope_id": project_id,
        "namespace": CORE_SETTINGS_NAMESPACE,
        "value": {"site": {"name": "Arclayer"}},
        "updated_by": updated_by,
        "using_db": tx_conn,
    }
    assert captured["activity"] == {
        "project_id": project_id,
        "actor_user_id": updated_by,
        "changed_paths": ["site.name"],
        "contains_sensitive_values": False,
        "conn": tx_conn,
    }
