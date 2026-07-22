from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.constants.events import SYSTEM_STORAGE_UPDATED
from src.config import get_settings
from src.core.events import EventBus
from src.core.exceptions import BadRequest
from src.models.analytics.audit_event import AuditEvent
from src.models.storage.storage_profile import StorageProfile, StorageProfileConfigSource
from src.models.system.setting import SettingRecord
from src.modules.system.settings.events import service as settings_events_module
from src.modules.system.settings.service import SettingsService
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.runtime import get_effective_settings
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration
LOCK_PROBE_TIMEOUT_SECONDS = 5.0


async def _create_profile(
    profile_key: str,
    *,
    is_active: bool = True,
    tombstoned_at: datetime | None = None,
    provider: str = "local",
    config: dict[str, object] | None = None,
) -> StorageProfile:
    return await StorageProfile.create(
        profile_key=profile_key,
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        provider=provider,
        config_source=StorageProfileConfigSource.DATABASE,
        display_name=profile_key,
        config=config or {},
        secret_ref={},
        is_active=is_active,
        is_default=False,
        tombstoned_at=tombstoned_at,
    )


async def test_default_profile_control_accepts_active_database_profile_and_rejects_unavailable_targets(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    service = SettingsService(settings, event_bus=EventBus())
    actor_user_id = uuid4()
    await _create_profile("active-profile")
    await _create_profile("inactive-profile", is_active=False)
    await _create_profile("tombstoned-profile", tombstoned_at=datetime.now(UTC))
    await _create_profile("invalid-route-profile", provider="aws_s3")

    detail = await service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": "active-profile"}},
        updated_by=actor_user_id,
    )

    assert detail.value["storage"] == {"default_profile_key": "active-profile"}
    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert record.value["storage"] == {"default_profile_key": "active-profile"}
    audit_count = await AuditEvent.filter(actor_user_id=actor_user_id).count()

    for unavailable_key in (
        "missing-profile",
        "inactive-profile",
        "tombstoned-profile",
        "invalid-route-profile",
    ):
        with pytest.raises(BadRequest) as raised:
            await service.patch_namespace(
                CORE_SETTINGS_NAMESPACE,
                patch={
                    "site": {"name": "must-roll-back"},
                    "storage": {"default_profile_key": unavailable_key},
                },
                updated_by=actor_user_id,
            )
        assert raised.value.error == "STORAGE_PROFILE_DEFAULT_UNAVAILABLE"

    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert record.value["storage"] == {"default_profile_key": "active-profile"}
    assert "site" not in record.value
    assert await AuditEvent.filter(actor_user_id=actor_user_id).count() == audit_count


async def test_required_storage_audit_failure_rolls_back_setting_write(
    prepared_db,
    integration_valkey_settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    service = SettingsService(settings, event_bus=EventBus())
    actor_user_id = uuid4()
    await _create_profile("primary-profile")
    await _create_profile("replacement-profile")
    await service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": "primary-profile"}},
        updated_by=actor_user_id,
    )
    event_count = await AuditEvent.filter(
        event_name=SYSTEM_STORAGE_UPDATED,
        actor_user_id=actor_user_id,
    ).count()

    async def fail_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        raise RuntimeError(f"forced activity write failure: {payload.event_name}")

    monkeypatch.setattr(
        settings_events_module,
        "write_required_activity_event",
        fail_required_activity_event,
    )

    with pytest.raises(RuntimeError, match="forced activity write failure: system.storage.updated"):
        await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "replacement-profile"}},
            updated_by=actor_user_id,
        )

    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert record.value["storage"] == {"default_profile_key": "primary-profile"}
    assert (
        await AuditEvent.filter(
            event_name=SYSTEM_STORAGE_UPDATED,
            actor_user_id=actor_user_id,
        ).count()
        == event_count
    )


@pytest.mark.parametrize("submitted", [None, "   "])
async def test_empty_default_profile_selection_uses_validated_deployment_fallback(
    prepared_db,
    integration_valkey_settings,
    submitted: str | None,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    base_settings = get_settings()
    settings = base_settings.model_copy(
        update={
            "storage": base_settings.storage.model_copy(
                update={"default_profile_key": "fallback-profile"},
            )
        }
    )
    await _create_profile("fallback-profile")
    service = SettingsService(settings, event_bus=EventBus())

    detail = await service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": submitted}},
        updated_by=uuid4(),
    )

    assert detail.value["storage"] == {"default_profile_key": None}
    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert record.value["storage"] == {"default_profile_key": None}
    effective = await get_effective_settings(settings)
    assert effective.storage.default_profile_key == "fallback-profile"


async def test_environment_default_is_materialized_and_revalidated_as_real_profile_identity(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    service = SettingsService(settings, event_bus=EventBus())

    detail = await service.patch_namespace(
        CORE_SETTINGS_NAMESPACE,
        patch={"storage": {"default_profile_key": "env-default"}},
        updated_by=uuid4(),
    )

    assert detail.value["storage"] == {"default_profile_key": "env-default"}
    profile = await StorageProfile.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        profile_key="env-default",
    )
    assert profile.id != UUID(int=0)
    assert profile.config_source == StorageProfileConfigSource.ENVIRONMENT
    assert profile.tombstoned_at is None
    assert profile.is_active is True


async def test_invalid_environment_default_route_returns_stable_unavailable_error(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    base_settings = get_settings()
    settings = base_settings.model_copy(
        update={
            "storage": base_settings.storage.model_copy(
                update={"provider": "s3", "s3_bucket": None},
            )
        }
    )
    actor_user_id = uuid4()

    with pytest.raises(BadRequest) as raised:
        await SettingsService(settings, event_bus=EventBus()).patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "env-default"}},
            updated_by=actor_user_id,
        )

    assert raised.value.error == "STORAGE_PROFILE_DEFAULT_UNAVAILABLE"
    assert not await SettingRecord.filter(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    ).exists()
    assert not await AuditEvent.filter(actor_user_id=actor_user_id).exists()
    assert not await StorageProfile.filter(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        profile_key="env-default",
    ).exists()


async def test_concurrent_namespace_patches_read_current_value_after_setting_lock(
    prepared_db,
    integration_valkey_settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    first_service = SettingsService(settings, event_bus=EventBus())
    second_service = SettingsService(settings, event_bus=EventBus())
    first_locked = asyncio.Event()
    release_first = asyncio.Event()
    second_attempted = asyncio.Event()
    backend_pids: dict[str, int] = {}
    original_first_lock = first_service.repo.get_by_namespace_for_update
    original_second_lock = second_service.repo.get_by_namespace_for_update

    async def hold_first_lock(namespace: str, *, conn: BaseDBAsyncClient):
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        backend_pids["first"] = int(rows[0]["pid"])
        record = await original_first_lock(namespace, conn=conn)
        first_locked.set()
        await release_first.wait()
        return record

    async def observe_second_lock_attempt(namespace: str, *, conn: BaseDBAsyncClient):
        rows = await conn.execute_query_dict("SELECT pg_backend_pid() AS pid")
        backend_pids["second"] = int(rows[0]["pid"])
        second_attempted.set()
        return await original_second_lock(namespace, conn=conn)

    monkeypatch.setattr(first_service.repo, "get_by_namespace_for_update", hold_first_lock)
    monkeypatch.setattr(second_service.repo, "get_by_namespace_for_update", observe_second_lock_attempt)

    first_patch = asyncio.create_task(
        first_service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"site": {"name": "First writer"}},
            updated_by=uuid4(),
        )
    )
    await asyncio.wait_for(first_locked.wait(), timeout=5)
    second_patch = asyncio.create_task(
        second_service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"domains": {"base_domain": "example.test"}},
            updated_by=uuid4(),
        )
    )
    try:
        await asyncio.wait_for(second_attempted.wait(), timeout=5)
        assert backend_pids["first"] != backend_pids["second"]
        await _wait_for_postgres_lock_wait(backend_pid=backend_pids["second"])
        assert second_patch.done() is False
    finally:
        release_first.set()

    await asyncio.gather(first_patch, second_patch)
    record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert record.value["site"] == {"name": "First writer"}
    assert record.value["domains"] == {"base_domain": "example.test"}


async def _wait_for_postgres_lock_wait(*, backend_pid: int) -> None:
    attempts = int(LOCK_PROBE_TIMEOUT_SECONDS / 0.01)
    for _ in range(attempts):
        async with in_transaction() as conn:
            rows = await conn.execute_query_dict(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [backend_pid],
            )
        if rows and rows[0].get("wait_event_type") == "Lock":
            return
        await asyncio.sleep(0.01)
    raise AssertionError(f"PostgreSQL backend {backend_pid} never entered a lock wait")
