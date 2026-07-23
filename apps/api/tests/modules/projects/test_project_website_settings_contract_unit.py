from __future__ import annotations

from dataclasses import dataclass
from typing import cast
from uuid import uuid4

import pytest
from pydantic import ValidationError
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.models.system.setting import SettingRecord
from src.modules.projects.settings.website_projection import (
    DISCOVERY_SETTINGS_PROJECTION,
    IDENTITY_SETTINGS_PROJECTION,
    LOCALIZATION_SETTINGS_PROJECTION,
)
from src.modules.projects.settings.website_repository import ProjectWebsiteSettingsRepository
from src.modules.projects.settings.website_schema import (
    WebsiteLocalizationSettings,
    WebsiteTitlePolicy,
)


@dataclass
class _FakeRecord:
    value: JsonObject | None


class _FakeConn:
    pass


def test_website_settings_schemas_enforce_owned_invariants() -> None:
    with pytest.raises(ValidationError, match="at least one token"):
        WebsiteTitlePolicy.model_validate({"parts": [{"kind": "literal", "value": "Arclayer"}]})

    with pytest.raises(ValidationError, match="default locale must be supported"):
        WebsiteLocalizationSettings(
            supported_locales=["en-US"],
            default_locale="zh-CN",
            fallback_locale="en-US",
            timezone="Asia/Shanghai",
            use_browser_timezone=True,
            date_format="YYYY-MM-DD",
            use_relative_datetime=True,
        )


def test_website_settings_projections_have_canonical_defaults_and_independent_etags() -> None:
    identity = IDENTITY_SETTINGS_PROJECTION.from_core({})
    discovery = DISCOVERY_SETTINGS_PROJECTION.from_core({})
    localization = LOCALIZATION_SETTINGS_PROJECTION.from_core({})
    etags = {
        IDENTITY_SETTINGS_PROJECTION.etag(identity),
        DISCOVERY_SETTINGS_PROJECTION.etag(discovery),
        LOCALIZATION_SETTINGS_PROJECTION.etag(localization),
    }

    assert identity.name == "Arclayer"
    assert discovery.robots_directive == "index,follow"
    assert localization.supported_locales == ["zh-CN", "en-US"]
    assert len(etags) == 3
    assert all(etag.startswith('"') and etag.endswith('"') for etag in etags)


@pytest.mark.asyncio
async def test_repository_materializes_and_locks_canonical_core_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    conn = _FakeConn()
    record = _FakeRecord(None)
    captured: dict[str, object] = {}

    class _FakeQuery:
        def using_db(self, using_conn):
            captured["using_db"] = using_conn
            return self

        def select_for_update(self):
            captured["select_for_update"] = True
            return self

        async def first(self):
            return record

    async def fake_bulk_create(objects, **kwargs):
        captured["bulk_create"] = objects
        captured["bulk_create_kwargs"] = kwargs

    def fake_filter(**kwargs):
        captured["filter"] = kwargs
        return _FakeQuery()

    monkeypatch.setattr(SettingRecord, "bulk_create", fake_bulk_create)
    monkeypatch.setattr(SettingRecord, "filter", fake_filter)

    result = await ProjectWebsiteSettingsRepository().get_core_for_update(
        project_id=project_id,
        conn=cast(BaseDBAsyncClient, conn),
    )

    candidates = cast(list[SettingRecord], captured["bulk_create"])
    assert len(candidates) == 1
    assert candidates[0].scope_type == "project"
    assert candidates[0].scope_id == project_id
    assert candidates[0].namespace == "core"
    assert captured["bulk_create_kwargs"] == {
        "ignore_conflicts": True,
        "using_db": conn,
    }
    assert captured["filter"] == {
        "scope_type": "project",
        "scope_id": project_id,
        "namespace": "core",
    }
    assert captured["using_db"] is conn
    assert captured["select_for_update"] is True
    assert result is record
