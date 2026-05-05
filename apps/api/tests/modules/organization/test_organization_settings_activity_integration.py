from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.org_membership import OrgRole
from src.models.organization.organization import Organization
from src.models.system.setting import SettingRecord
from src.modules.auth.repository import UserRepository
from src.modules.auth.tokens.service import hash_password
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.settings import service as org_settings_service_module
from src.modules.organization.settings.schema import OrganizationLocalizationPatch, OrganizationSettingsCorePatch
from src.modules.organization.settings.service import ORGANIZATION_SETTINGS_UPDATED_EVENT, OrganizationSettingsService
from src.settings.scopes import SCOPE_TYPE_ORG

pytestmark = pytest.mark.integration


async def test_organization_settings_activity_readback_and_rollback(db_schema, monkeypatch) -> None:
    _ = db_schema
    settings = get_settings()
    service = OrganizationSettingsService(settings)
    org_repo = OrganizationRepository()
    user_repo = UserRepository()

    org = await org_repo.create_organization(slug=f"org_{uuid4().hex}", name="Org Settings")
    owner = await user_repo.create_user(
        username=f"owner_{uuid4().hex[:8]}",
        email=f"owner_{uuid4().hex[:8]}@example.com",
        display_name="Owner",
        password_hash=hash_password("owner_pass_123", settings.auth),
    )

    await service.patch_core(
        organization_id=org.id,
        updated_by=owner.id,
        patch=OrganizationSettingsCorePatch(
            organization_name="Updated Org Settings",
            organization_localization=OrganizationLocalizationPatch(locale="en-US", timezone="UTC"),
            default_role_code=OrgRole.ADMIN.value,
        ),
    )

    event = await AuditEvent.filter(
        event_name=ORGANIZATION_SETTINGS_UPDATED_EVENT,
        organization_id=org.id,
        actor_user_id=owner.id,
        entity_type="organization",
        entity_id=org.id,
    ).first()
    assert event is not None
    assert event.properties["paths"] == [
        "organization_name",
        "organization_localization",
        "default_role_code",
    ]
    assert event.properties["contains_sensitive_values"] is False
    assert "Updated Org Settings" not in str(event.properties)
    assert "en-US" not in str(event.properties)

    original_write_required_activity_event = org_settings_service_module.write_required_activity_event

    async def _failing_write_required_activity_event(*, settings, payload, conn=None):  # type: ignore[no-untyped-def]
        if payload.event_name == ORGANIZATION_SETTINGS_UPDATED_EVENT:
            raise RuntimeError("forced activity write failure: organization.settings.updated")
        return await original_write_required_activity_event(settings=settings, payload=payload, conn=conn)

    monkeypatch.setattr(
        "src.modules.organization.settings.service.write_required_activity_event",
        _failing_write_required_activity_event,
    )

    event_count_before = await AuditEvent.filter(event_name=ORGANIZATION_SETTINGS_UPDATED_EVENT).count()
    with pytest.raises(RuntimeError, match="forced activity write failure: organization.settings.updated"):
        await service.patch_core(
            organization_id=org.id,
            updated_by=owner.id,
            patch=OrganizationSettingsCorePatch(
                organization_name="Rolled Back Org",
                organization_localization=OrganizationLocalizationPatch(locale="zh-CN", timezone="Asia/Shanghai"),
                default_role_code=OrgRole.MEMBER.value,
            ),
        )

    refetched_org = await Organization.get(id=org.id)
    refetched_setting = await SettingRecord.get(
        scope_type=SCOPE_TYPE_ORG,
        scope_id=org.id,
        namespace="core",
    )
    assert await AuditEvent.filter(event_name=ORGANIZATION_SETTINGS_UPDATED_EVENT).count() == event_count_before
    assert refetched_org.name == "Updated Org Settings"
    assert refetched_setting.value["default_role_code"] == OrgRole.ADMIN.value
    localization = refetched_setting.value["organization_localization"]
    assert isinstance(localization, dict)
    assert localization["locale"] == "en-US"
