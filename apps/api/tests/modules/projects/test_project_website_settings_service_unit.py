from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from src.common.types.json_types import JsonObject
from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.system.setting import SettingRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.projects.settings.website_repository import ProjectWebsiteSettingsRepository
from src.modules.projects.settings.website_service import (
    PROJECT_WEBSITE_DISCOVERY_UPDATED_EVENT,
    PROJECT_WEBSITE_IDENTITY_UPDATED_EVENT,
    PROJECT_WEBSITE_LOCALIZATION_UPDATED_EVENT,
    PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH,
    PROJECT_WEBSITE_SETTINGS_INVALID,
    ProjectWebsiteSettingsService,
)


@dataclass
class _FakeRecord:
    value: JsonObject | None


class _FakeConn:
    pass


class _FakeRepository:
    def __init__(self, value: JsonObject | None) -> None:
        self.record = _FakeRecord(value)
        self.locked = False
        self.saved: list[dict[str, Any]] = []

    async def get_core(self, *, project_id: UUID) -> SettingRecord | None:
        assert project_id
        return cast(SettingRecord, self.record)

    async def get_core_for_update(self, *, project_id: UUID, conn) -> SettingRecord:
        assert project_id
        assert isinstance(conn, _FakeConn)
        self.locked = True
        return cast(SettingRecord, self.record)

    async def save_core(
        self,
        *,
        record: SettingRecord,
        value: JsonObject,
        updated_by: UUID,
        conn,
    ) -> SettingRecord:
        assert record is cast(SettingRecord, self.record)
        assert isinstance(conn, _FakeConn)
        self.record.value = value
        self.saved.append({"value": value, "updated_by": updated_by})
        return record


def _build_service(
    monkeypatch: pytest.MonkeyPatch,
    repository: _FakeRepository,
) -> tuple[ProjectWebsiteSettingsService, _FakeConn]:
    monkeypatch.setenv("AUTH__JWT_SECRET", "test-secret")
    service = ProjectWebsiteSettingsService(
        get_settings(),
        repository=cast(ProjectWebsiteSettingsRepository, repository),
    )
    tx_conn = _FakeConn()

    @asynccontextmanager
    async def fake_tx(*, conn=None):
        assert conn is None
        yield cast(Any, tx_conn)

    monkeypatch.setattr(service, "tx", fake_tx)
    return service, tx_conn


def _capture_activity(monkeypatch: pytest.MonkeyPatch) -> list[tuple[ActivityAuditPayload, object]]:
    captured: list[tuple[ActivityAuditPayload, object]] = []

    async def fake_write_required_activity_event(*, settings, payload, conn=None):
        assert settings
        captured.append((payload, conn))
        return object()

    monkeypatch.setattr(
        "src.modules.projects.settings.website_service.write_required_activity_event",
        fake_write_required_activity_event,
    )
    return captured


@pytest.mark.asyncio
async def test_replace_identity_preserves_other_authorities_and_writes_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    actor_user_id = uuid4()
    repository = _FakeRepository({
        "site": {
            "name": "Old name",
            "url": "https://legacy.example.com",
            "logo_url": "/logo.svg",
        },
        "seo": {"sitemap_enabled": False},
        "project_source": {"framework": "astro"},
    })
    service, conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project_id)
    replacement = current.value.model_copy(update={"name": "New name"})

    result = await service.replace_identity(
        project_id=project_id,
        replacement=replacement,
        expected_etag=current.etag,
        actor_user_id=actor_user_id,
    )

    assert repository.locked is True
    assert result.value.name == "New name"
    assert result.etag != current.etag
    assert repository.record.value == {
        "site": {
            "name": "New name",
            "url": "https://legacy.example.com",
            "logo_url": "/logo.svg",
        },
        "seo": {"sitemap_enabled": False},
        "project_source": {"framework": "astro"},
    }
    assert repository.saved == [{"value": repository.record.value, "updated_by": actor_user_id}]
    assert len(captured) == 1
    payload, activity_conn = captured[0]
    assert activity_conn is conn
    assert payload.event_name == PROJECT_WEBSITE_IDENTITY_UPDATED_EVENT
    assert payload.project_id == project_id
    assert payload.properties["facade"] == "identity"
    assert payload.properties["paths"] == ["site.name"]
    assert payload.properties["previous_etag"] == current.etag
    assert payload.properties["etag"] == result.etag


@pytest.mark.asyncio
async def test_replace_rejects_stale_etag_without_save_or_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _FakeRepository({"site": {"name": "Arclayer"}})
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project_id)
    replacement = current.value.model_copy(update={"name": "Other"})

    with pytest.raises(Conflict) as exc_info:
        await service.replace_identity(
            project_id=project_id,
            replacement=replacement,
            expected_etag='"stale"',
            actor_user_id=uuid4(),
        )

    assert exc_info.value.error == PROJECT_WEBSITE_SETTINGS_ETAG_MISMATCH
    assert exc_info.value.meta == {"facade": "identity", "currentEtag": current.etag}
    assert repository.saved == []
    assert captured == []


@pytest.mark.asyncio
async def test_semantic_noop_does_not_save_or_emit_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _FakeRepository({"site": {"name": "Arclayer"}})
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_identity(project_id=project_id)

    result = await service.replace_identity(
        project_id=project_id,
        replacement=current.value,
        expected_etag=current.etag,
        actor_user_id=uuid4(),
    )

    assert result == current
    assert repository.locked is True
    assert repository.saved == []
    assert captured == []


@pytest.mark.asyncio
async def test_discovery_update_keeps_identity_etag_stable_and_migrates_owned_legacy_alias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _FakeRepository({
        "site": {"name": "Arclayer", "favicon_url": "/old.ico"},
        "seo": {"open_graph_image_url": "/legacy-og.png"},
    })
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    identity_before = await service.get_identity(project_id=project_id)
    discovery = await service.get_discovery(project_id=project_id)
    replacement = discovery.value.model_copy(update={"favicon_url": "/new.svg", "open_graph_image_url": "/new-og.png"})

    result = await service.replace_discovery(
        project_id=project_id,
        replacement=replacement,
        expected_etag=discovery.etag,
        actor_user_id=uuid4(),
    )
    identity_after = await service.get_identity(project_id=project_id)

    assert result.value.open_graph_image_url == "/new-og.png"
    assert identity_after.etag == identity_before.etag
    assert repository.record.value == {
        "site": {"name": "Arclayer", "favicon_url": "/new.svg"},
        "seo": {
            "open_graph_image_url": None,
            "og_image_url": "/new-og.png",
        },
    }
    payload, _conn = captured[0]
    assert payload.event_name == PROJECT_WEBSITE_DISCOVERY_UPDATED_EVENT
    assert payload.properties["paths"] == [
        "seo.og_image_url",
        "seo.open_graph_image_url",
        "site.favicon_url",
    ]


@pytest.mark.asyncio
async def test_localization_update_mirrors_default_locale_and_records_agent_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    repository = _FakeRepository({
        "site_localization": {
            "supported_locales": ["zh-CN", "en-US"],
            "default_locale": "zh-CN",
            "locale": "zh-CN",
            "fallback_locale": "en-US",
        },
        "project_source": {"framework": "react_vite"},
    })
    service, _conn = _build_service(monkeypatch, repository)
    captured = _capture_activity(monkeypatch)
    current = await service.get_localization(project_id=project_id)
    replacement = current.value.model_copy(update={"default_locale": "en-US"})

    result = await service.replace_localization(
        project_id=project_id,
        replacement=replacement,
        expected_etag=current.etag,
        actor_user_id=uuid4(),
        source="agent",
    )

    stored = repository.record.value
    assert stored is not None
    localization = cast(JsonObject, stored["site_localization"])
    assert result.value.default_locale == "en-US"
    assert localization["default_locale"] == "en-US"
    assert localization["locale"] == "en-US"
    assert stored["project_source"] == {"framework": "react_vite"}
    payload, _conn = captured[0]
    assert payload.event_name == PROJECT_WEBSITE_LOCALIZATION_UPDATED_EVENT
    assert payload.source == "agent"
    assert payload.properties["paths"] == [
        "site_localization.default_locale",
        "site_localization.locale",
    ]


@pytest.mark.asyncio
async def test_invalid_stored_identity_surfaces_stable_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _conn = _build_service(monkeypatch, _FakeRepository({"site": {"name": None}}))

    with pytest.raises(Conflict) as exc_info:
        await service.get_identity(project_id=uuid4())

    assert exc_info.value.error == PROJECT_WEBSITE_SETTINGS_INVALID
