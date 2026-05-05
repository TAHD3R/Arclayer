from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict

from src.common.constants.events import (
    SYSTEM_FEATURE_FLAGS_UPDATED,
    SYSTEM_MAIL_UPDATED,
    SYSTEM_STORAGE_UPDATED,
)
from src.config import get_settings
from src.core.events import EventBus
from src.core.exceptions import init_exception_handlers
from src.models.analytics.audit_event import AuditEvent
from src.models.system.setting import SettingRecord
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.router import router as system_router
from src.modules.system.settings.events import service as settings_events_module
from src.modules.system.settings.service import SettingsService
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.integration


async def test_system_settings_patch_writes_sanitized_activity_and_rolls_back(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings
    settings = get_settings()
    service = SettingsService(settings, event_bus=EventBus())
    actor_user_id = uuid4()

    app = FastAPI()
    init_exception_handlers(app, settings)
    app.include_router(system_router, prefix="/api/v1/system")

    class DummyUser(BaseModel):
        model_config = ConfigDict(extra="forbid", frozen=True)

        id: UUID
        is_super_admin: bool = True

    async def _super_admin_override() -> DummyUser:
        return DummyUser(id=actor_user_id)

    app.dependency_overrides[require_super_admin] = _super_admin_override
    app.dependency_overrides[get_current_user] = _super_admin_override

    async with asgi_client(app) as client:
        detail = await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"mail": {"enabled": True, "password": "raw-secret-password"}},
            updated_by=actor_user_id,
        )
        detail_mail = detail.value["mail"]
        assert isinstance(detail_mail, dict)
        assert detail_mail["password"] is None

        record = await SettingRecord.get(
            scope_type=SCOPE_TYPE_SYSTEM,
            scope_id=SYSTEM_SCOPE_ID,
            namespace=CORE_SETTINGS_NAMESPACE,
        )
        record_mail = record.value["mail"]
        assert isinstance(record_mail, dict)
        assert record_mail["enabled"] is True

        event = await AuditEvent.filter(event_name=SYSTEM_MAIL_UPDATED, actor_user_id=actor_user_id).first()
        assert event is not None
        assert event.properties["contains_sensitive_values"] is True
        assert "mail.password" in event.properties["paths"]
        assert "raw-secret-password" not in str(event.properties)

        mail_activity_res = await client.get("/api/v1/system/activity?eventName=system.mail.updated&page=1&size=10")
        assert mail_activity_res.status_code == 200, mail_activity_res.text
        mail_activity_items = mail_activity_res.json()["data"]["items"]
        assert mail_activity_items[0]["eventName"] == SYSTEM_MAIL_UPDATED
        assert mail_activity_items[0]["organizationId"] is None
        assert mail_activity_items[0]["workspaceId"] is None
        assert mail_activity_items[0]["properties"]["contains_sensitive_values"] is True
        assert "raw-secret-password" not in str(mail_activity_items[0]["properties"])

        storage_detail = await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "local-main"}},
            updated_by=actor_user_id,
        )
        storage_value = storage_detail.value["storage"]
        assert isinstance(storage_value, dict)
        assert storage_value["default_profile_key"] == "local-main"

        storage_event = await AuditEvent.filter(
            event_name=SYSTEM_STORAGE_UPDATED,
            actor_user_id=actor_user_id,
        ).first()
        assert storage_event is not None
        assert storage_event.properties["paths"] == ["storage.default_profile_key"]

        storage_activity_res = await client.get(
            "/api/v1/system/activity?eventName=system.storage.updated&page=1&size=10"
        )
        assert storage_activity_res.status_code == 200, storage_activity_res.text
        storage_activity_items = storage_activity_res.json()["data"]["items"]
        assert storage_activity_items[0]["eventName"] == SYSTEM_STORAGE_UPDATED
        assert storage_activity_items[0]["properties"]["paths"] == ["storage.default_profile_key"]

        feature_flags_detail = await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"auth": {"public_register_enabled": True}},
            updated_by=actor_user_id,
        )
        auth_value = feature_flags_detail.value["auth"]
        assert isinstance(auth_value, dict)
        assert auth_value["public_register_enabled"] is True

        feature_flags_event = await AuditEvent.filter(
            event_name=SYSTEM_FEATURE_FLAGS_UPDATED,
            actor_user_id=actor_user_id,
        ).first()
        assert feature_flags_event is not None
        assert feature_flags_event.properties["paths"] == ["auth.public_register_enabled"]
        assert "public_register_enabled': True" not in str(feature_flags_event.properties)

        feature_flags_activity_res = await client.get(
            "/api/v1/system/activity?eventName=system.settings.feature_flags.updated&page=1&size=10"
        )
        assert feature_flags_activity_res.status_code == 200, feature_flags_activity_res.text
        feature_flags_activity_items = feature_flags_activity_res.json()["data"]["items"]
        assert feature_flags_activity_items[0]["eventName"] == SYSTEM_FEATURE_FLAGS_UPDATED
        assert feature_flags_activity_items[0]["properties"]["paths"] == ["auth.public_register_enabled"]
        assert feature_flags_activity_items[0]["organizationId"] is None
        assert feature_flags_activity_items[0]["workspaceId"] is None

    original_write_required_activity_event = settings_events_module.write_required_activity_event

    async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name in {SYSTEM_FEATURE_FLAGS_UPDATED, SYSTEM_MAIL_UPDATED, SYSTEM_STORAGE_UPDATED}:
            raise RuntimeError(f"forced activity write failure: {payload.event_name}")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.system.settings.events.service.write_required_activity_event",
        _failing_write_required_activity_event,
    )

    mail_event_count_before = await AuditEvent.filter(event_name=SYSTEM_MAIL_UPDATED).count()
    with pytest.raises(RuntimeError, match="forced activity write failure: system.mail.updated"):
        await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"mail": {"enabled": False}},
            updated_by=actor_user_id,
        )
    assert await AuditEvent.filter(event_name=SYSTEM_MAIL_UPDATED).count() == mail_event_count_before

    storage_event_count_before = await AuditEvent.filter(event_name=SYSTEM_STORAGE_UPDATED).count()
    with pytest.raises(RuntimeError, match="forced activity write failure: system.storage.updated"):
        await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"storage": {"default_profile_key": "local-secondary"}},
            updated_by=actor_user_id,
        )

    rolled_back_record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert rolled_back_record.value["storage"]["default_profile_key"] == "local-main"
    assert await AuditEvent.filter(event_name=SYSTEM_STORAGE_UPDATED).count() == storage_event_count_before

    feature_flags_event_count_before = await AuditEvent.filter(event_name=SYSTEM_FEATURE_FLAGS_UPDATED).count()
    with pytest.raises(RuntimeError, match="forced activity write failure: system.settings.feature_flags.updated"):
        await service.patch_namespace(
            CORE_SETTINGS_NAMESPACE,
            patch={"auth": {"public_register_enabled": False}},
            updated_by=actor_user_id,
        )

    feature_flags_rolled_back_record = await SettingRecord.get(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
    )
    assert feature_flags_rolled_back_record.value["auth"]["public_register_enabled"] is True
    assert await AuditEvent.filter(event_name=SYSTEM_FEATURE_FLAGS_UPDATED).count() == feature_flags_event_count_before
