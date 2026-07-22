from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from src.common.constants.events import SYSTEM_STORAGE_UPDATED
from src.config import Settings
from src.core.events import Event, EventBus
from src.core.exceptions import BadRequest
from src.models.storage.storage_profile import StorageProfile
from src.modules.system.settings import service as settings_service_module
from src.modules.system.settings.repository import SettingsRepository
from src.modules.system.settings.service import SettingsService
from src.platform.storage.profile_route_repository import StorageProfileRouteRepository
from src.platform.storage.profile_route_service import StorageProfileRouteInvariantError, StorageProfileRouteService
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE


class _FakeConnection:
    pass


@dataclass(slots=True)
class _Harness:
    service: SettingsService
    events: list[str]
    domain_events: list[Event]
    saved_values: list[dict[str, Any]]
    audit_calls: list[dict[str, Any]]


def _profile(*, is_active: bool = True, is_tombstoned: bool = False) -> StorageProfile:
    return cast(
        StorageProfile,
        SimpleNamespace(
            is_active=is_active,
            is_default=False,
            tombstoned_at=datetime.now(UTC) if is_tombstoned else None,
        ),
    )


def _build_harness(
    monkeypatch: pytest.MonkeyPatch,
    *,
    profile: StorageProfile | None,
    settings: Settings | None = None,
    current: dict[str, Any] | None = None,
    audit_error: Exception | None = None,
    route_error: Exception | None = None,
) -> _Harness:
    events: list[str] = []
    domain_events: list[Event] = []
    saved_values: list[dict[str, Any]] = []
    audit_calls: list[dict[str, Any]] = []
    connection = _FakeConnection()
    current_record = SimpleNamespace(value=current or {}, updated_at=datetime.now(UTC))

    async def lock_setting(namespace: str, *, conn: object):
        assert namespace == CORE_SETTINGS_NAMESPACE
        assert conn is connection
        events.append("setting.lock")
        return current_record

    async def upsert(**kwargs):
        assert kwargs["conn"] is connection
        events.append("setting.save")
        saved_values.append(kwargs)
        return SimpleNamespace(updated_at=datetime.now(UTC))

    settings_repository = cast(
        SettingsRepository,
        SimpleNamespace(
            get_by_namespace_for_update=lock_setting,
            upsert=upsert,
        ),
    )

    async def lock_profile(**kwargs):
        assert kwargs["conn"] is connection
        events.append("profile.lock")
        return profile

    profile_repository = cast(
        StorageProfileRouteRepository,
        SimpleNamespace(get_profile_by_key_for_update=lock_profile),
    )

    async def materialize_by_key(*, profile_key: str):
        events.append("profile.materialize")
        return SimpleNamespace(profile_key=profile_key)

    async def materialize_locked_profile(**kwargs):
        assert kwargs["conn"] is connection
        assert kwargs["profile"] is profile
        events.append("profile.route")
        if route_error is not None:
            raise route_error
        return SimpleNamespace(profile_id=uuid4())

    profile_route_service = cast(
        StorageProfileRouteService,
        SimpleNamespace(
            materialize_by_key=materialize_by_key,
            materialize_locked_profile=materialize_locked_profile,
        ),
    )

    async def publish_event(event: Event) -> None:
        domain_events.append(event)

    event_bus = cast(EventBus, SimpleNamespace(publish=publish_event))
    service = SettingsService(
        settings or Settings(),
        event_bus=event_bus,
        repository=settings_repository,
        profile_repository=profile_repository,
        profile_route_service=profile_route_service,
    )

    @asynccontextmanager
    async def transaction(*, conn=None):
        assert conn is None
        events.append("tx.enter")
        try:
            yield connection
        except BaseException:
            events.append("tx.rollback")
            raise
        events.append("tx.commit")

    async def emit_settings_updated(**kwargs):
        assert kwargs["conn"] is connection
        events.append("audit")
        audit_calls.append(kwargs)
        if audit_error is not None:
            raise audit_error
        return SYSTEM_STORAGE_UPDATED, {
            "namespace": CORE_SETTINGS_NAMESPACE,
            "paths": ["storage.default_profile_key"],
            "contains_sensitive_values": False,
        }

    monkeypatch.setattr(service, "tx", transaction)
    monkeypatch.setattr(service, "_emit_settings_updated", emit_settings_updated)
    monkeypatch.setattr(
        settings_service_module,
        "invalidate_core_settings_cache",
        lambda: events.append("cache.invalidate"),
    )
    return _Harness(
        service=service,
        events=events,
        domain_events=domain_events,
        saved_values=saved_values,
        audit_calls=audit_calls,
    )


@pytest.mark.parametrize(
    "profile",
    [
        None,
        _profile(is_active=False),
        _profile(is_tombstoned=True),
    ],
    ids=["missing", "inactive", "tombstoned"],
)
async def test_default_profile_patch_rejects_unavailable_targets_before_setting_lock(
    monkeypatch: pytest.MonkeyPatch,
    profile: StorageProfile | None,
) -> None:
    harness = _build_harness(monkeypatch, profile=profile)

    with pytest.raises(BadRequest) as raised:
        await harness.service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "unavailable-profile"}},
            updated_by=uuid4(),
        )

    assert raised.value.error == "STORAGE_PROFILE_DEFAULT_UNAVAILABLE"
    assert harness.events == ["tx.enter", "profile.lock", "tx.rollback"]
    assert harness.saved_values == []
    assert harness.audit_calls == []


async def test_default_profile_patch_locks_profile_before_setting_and_saves_canonical_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = _build_harness(
        monkeypatch,
        profile=_profile(),
        current={"site": {"name": "Arclayer"}},
    )

    detail = await harness.service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": "  PRIMARY-STORAGE  "}},
        updated_by=uuid4(),
    )

    assert detail.value["storage"] == {"default_profile_key": "primary-storage"}
    assert harness.saved_values[0]["value"] == {
        "site": {"name": "Arclayer"},
        "storage": {"default_profile_key": "primary-storage"},
    }
    assert harness.audit_calls[0]["patch"] == {
        "storage": {"default_profile_key": "primary-storage"},
    }
    assert [(event.name, event.payload) for event in harness.domain_events] == [
        (
            SYSTEM_STORAGE_UPDATED,
            {
                "namespace": CORE_SETTINGS_NAMESPACE,
                "paths": ["storage.default_profile_key"],
                "contains_sensitive_values": False,
            },
        )
    ]
    assert harness.events == [
        "tx.enter",
        "profile.lock",
        "profile.route",
        "setting.lock",
        "setting.save",
        "audit",
        "tx.commit",
        "cache.invalidate",
    ]


async def test_environment_default_materializes_before_transaction_and_is_relocked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = _build_harness(monkeypatch, profile=_profile())

    await harness.service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": "env-default"}},
        updated_by=uuid4(),
    )

    assert harness.events == [
        "profile.materialize",
        "tx.enter",
        "profile.lock",
        "profile.route",
        "setting.lock",
        "setting.save",
        "audit",
        "tx.commit",
        "cache.invalidate",
    ]


@pytest.mark.parametrize("submitted", [None, "   "])
async def test_empty_default_profile_patch_persists_null_and_validates_deployment_fallback(
    monkeypatch: pytest.MonkeyPatch,
    submitted: str | None,
) -> None:
    base_settings = Settings()
    settings = base_settings.model_copy(
        update={
            "storage": base_settings.storage.model_copy(
                update={"default_profile_key": "fallback-profile"},
            )
        }
    )
    harness = _build_harness(monkeypatch, profile=_profile(), settings=settings)

    detail = await harness.service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": submitted}},
        updated_by=uuid4(),
    )

    assert detail.value["storage"] == {"default_profile_key": None}
    assert harness.saved_values[0]["value"] == {
        "storage": {"default_profile_key": None},
    }
    assert harness.audit_calls[0]["patch"] == {
        "storage": {"default_profile_key": None},
    }
    assert harness.events[:4] == ["tx.enter", "profile.lock", "profile.route", "setting.lock"]


async def test_audit_failure_rolls_back_transaction_and_does_not_invalidate_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = _build_harness(
        monkeypatch,
        profile=_profile(),
        audit_error=RuntimeError("forced audit failure"),
    )

    with pytest.raises(RuntimeError, match="forced audit failure"):
        await harness.service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "primary-storage"}},
            updated_by=uuid4(),
        )

    assert harness.events == [
        "tx.enter",
        "profile.lock",
        "profile.route",
        "setting.lock",
        "setting.save",
        "audit",
        "tx.rollback",
    ]
    assert "cache.invalidate" not in harness.events


async def test_persisted_route_invariant_fails_closed_without_setting_write(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = _build_harness(
        monkeypatch,
        profile=_profile(),
        route_error=StorageProfileRouteInvariantError("corrupt persisted route"),
    )

    with pytest.raises(StorageProfileRouteInvariantError, match="corrupt persisted route"):
        await harness.service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "primary-storage"}},
            updated_by=uuid4(),
        )

    assert harness.events == [
        "tx.enter",
        "profile.lock",
        "profile.route",
        "tx.rollback",
    ]
    assert harness.saved_values == []
    assert harness.audit_calls == []
