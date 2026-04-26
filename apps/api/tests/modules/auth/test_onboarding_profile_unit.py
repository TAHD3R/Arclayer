from __future__ import annotations

from typing import cast
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError


class _FakeSettingRecord:
    def __init__(self, value: dict[str, object] | None = None, updated_by: UUID | None = None) -> None:
        self.value = value
        self.updated_by = updated_by
        self.saved_update_fields: list[str] | None = None

    async def save(self, *, update_fields: list[str]) -> None:
        self.saved_update_fields = update_fields


@pytest.mark.asyncio
async def test_onboarding_profile_returns_defaults_when_record_missing(monkeypatch) -> None:
    from src.config import get_settings
    from src.modules.auth import onboarding_profile
    from src.modules.auth.onboarding_profile import OnboardingProfileService

    async def fake_get_or_none(**_kwargs):
        return None

    monkeypatch.setattr(onboarding_profile.SettingRecord, "get_or_none", fake_get_or_none, raising=True)

    out = await OnboardingProfileService(get_settings()).get_profile(user_id=uuid4())

    assert out.job_role is None
    assert out.company_size is None
    assert out.subscribed_product_updates is True
    assert out.heard_about_us is None


@pytest.mark.asyncio
async def test_onboarding_profile_patch_creates_user_scoped_setting(monkeypatch) -> None:
    from src.config import get_settings
    from src.modules.auth import onboarding_profile
    from src.modules.auth.onboarding_profile import (
        ONBOARDING_PROFILE_NAMESPACE,
        OnboardingProfileService,
    )
    from src.modules.auth.schema import OnboardingProfilePatchRequest
    from src.settings.scopes import SCOPE_TYPE_USER

    created: dict[str, object] = {}
    user_id = uuid4()

    async def fake_get_or_none(**_kwargs):
        return None

    async def fake_create(**kwargs):
        created.update(kwargs)
        return _FakeSettingRecord(value=kwargs["value"], updated_by=kwargs["updated_by"])

    monkeypatch.setattr(onboarding_profile.SettingRecord, "get_or_none", fake_get_or_none, raising=True)
    monkeypatch.setattr(onboarding_profile.SettingRecord, "create", fake_create, raising=True)

    out = await OnboardingProfileService(get_settings()).patch_profile(
        user_id=user_id,
        payload=OnboardingProfilePatchRequest(
            job_role="content_manager",
            company_size="11_50",
            subscribed_product_updates=True,
        ),
    )

    assert created["scope_type"] == SCOPE_TYPE_USER
    assert created["scope_id"] == user_id
    assert created["namespace"] == ONBOARDING_PROFILE_NAMESPACE
    assert created["updated_by"] == user_id
    created_value = cast(dict[str, object], created["value"])
    assert created_value["job_role"] == "content_manager"
    assert created_value["company_size"] == "11_50"
    assert created_value["subscribed_product_updates"] is True
    assert out.job_role == "content_manager"
    assert out.company_size == "11_50"
    assert out.subscribed_product_updates is True


@pytest.mark.asyncio
async def test_onboarding_profile_patch_preserves_omitted_fields(monkeypatch) -> None:
    from src.config import get_settings
    from src.modules.auth import onboarding_profile
    from src.modules.auth.onboarding_profile import OnboardingProfileService
    from src.modules.auth.schema import OnboardingProfilePatchRequest

    record = _FakeSettingRecord(
        value={
            "job_role": "content_manager",
            "company_size": "2_10",
            "subscribed_product_updates": False,
            "heard_about_us": "search",
            "updated_at": "2026-04-26T00:00:00+00:00",
        }
    )

    async def fake_get_or_none(**_kwargs):
        return record

    monkeypatch.setattr(onboarding_profile.SettingRecord, "get_or_none", fake_get_or_none, raising=True)

    user_id = uuid4()
    out = await OnboardingProfileService(get_settings()).patch_profile(
        user_id=user_id,
        payload=OnboardingProfilePatchRequest(heard_about_us="referral"),
    )

    assert record.value is not None
    assert record.value["job_role"] == "content_manager"
    assert record.value["company_size"] == "2_10"
    assert record.value["subscribed_product_updates"] is False
    assert record.value["heard_about_us"] == "referral"
    assert record.updated_by == user_id
    assert record.saved_update_fields == ["value", "updated_by", "updated_at"]
    assert out.job_role == "content_manager"
    assert out.heard_about_us == "referral"


def test_onboarding_profile_patch_rejects_invalid_enum_values() -> None:
    from src.modules.auth.schema import OnboardingProfilePatchRequest

    with pytest.raises(ValidationError):
        OnboardingProfilePatchRequest(job_role="writer")
