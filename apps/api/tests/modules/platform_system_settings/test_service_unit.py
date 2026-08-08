from __future__ import annotations

from uuid import UUID, uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.modules.platform_system_settings.schema import PlatformSystemSettingsSectionWrite
from src.modules.platform_system_settings.service import (
    PlatformSystemSettingsService,
    _fingerprint,
    _validate_language_selection,
)


class _Repository:
    def __init__(self, value: dict[str, object]) -> None:
        self._value = value

    async def get_core_value(self):
        return self._value


class _WriteRepository(_Repository):
    def __init__(self, value: dict[str, object]) -> None:
        super().__init__(value)
        self.write: dict[str, object] | None = None

    async def write_core_section(
        self,
        *,
        section: str,
        values: dict[str, object],
        expected_revision: int,
        idempotency_key_hash: str,
        request_fingerprint: str,
        actor_user_id: UUID,
        **_kwargs: object,
    ):
        self.write = {
            "section": section,
            "values": values,
            "expected_revision": expected_revision,
            "idempotency_key_hash": idempotency_key_hash,
            "request_fingerprint": request_fingerprint,
            "actor_user_id": actor_user_id,
        }
        self._value = {
            **self._value,
            section: values,
            "system_settings": {"configuration_revision": expected_revision + 1},
        }
        return self._value


@pytest.mark.asyncio
async def test_system_settings_projects_only_cross_domain_configuration() -> None:
    service = PlatformSystemSettingsService(
        settings=get_settings(),
        repository=_Repository({
            "system_settings": {"configuration_revision": 4},
            "site": {
                "name": "Arclayer Enterprise",
                "description": "Private deployment",
                "contact_email": "ops@example.com",
            },
            "domains": {
                "base_domain": "example.com",
                "platform_subdomain": "control",
                "reserved_labels": ["www", "api"],
            },
            "workspace_localization": {
                "timezone": "UTC",
                "date_format": "DD/MM/YYYY",
                "number_format": "1.234,56",
            },
            "site_localization": {
                "supported_locales": ["en-US"],
                "default_locale": "en-US",
            },
            "seo": {
                "default_title": "Example",
                "default_description": "Default site description",
            },
            "mail": {"password": "must-not-be-projected"},
        }),
    )

    result = await service.get_settings()

    assert result.revision == 4
    assert result.identity.instance_name == "Arclayer Enterprise"
    assert result.domains.console_domain == "control.example.com"
    assert result.regional.number_format == "1.234,56"
    assert [(item.locale, item.enabled, item.is_default) for item in result.languages] == [
        ("zh-CN", False, False),
        ("en-US", True, True),
    ]
    assert not hasattr(result, "mail")


@pytest.mark.asyncio
async def test_system_settings_uses_explicit_platform_defaults_when_unconfigured() -> None:
    settings = get_settings()
    service = PlatformSystemSettingsService(settings=settings, repository=_Repository({}))

    result = await service.get_settings()

    assert result.revision == 1
    assert result.identity.instance_name == "Arclayer"
    assert result.domains.primary_domain == settings.saas.base_domain
    assert result.domains.console_domain == f"platform.{settings.saas.base_domain}"
    assert result.languages[0].bundle_ready is True
    assert result.languages[1].bundle_ready is True


@pytest.mark.asyncio
async def test_system_settings_update_uses_revisioned_idempotent_repository_contract() -> None:
    actor_user_id = uuid4()
    repository = _WriteRepository({"system_settings": {"configuration_revision": 3}})
    service = PlatformSystemSettingsService(settings=get_settings(), repository=repository)

    result = await service.update_section(
        section="site",
        values={"name": "Arclayer Cloud"},
        expected_revision=3,
        idempotency_key="settings-write-1",
        actor_user_id=actor_user_id,
    )

    assert result.revision == 4
    assert result.identity.instance_name == "Arclayer Cloud"
    assert repository.write is not None
    assert repository.write["section"] == "site"
    assert repository.write["expected_revision"] == 3
    assert repository.write["actor_user_id"] == actor_user_id
    assert repository.write["idempotency_key_hash"] != "settings-write-1"


@pytest.mark.asyncio
async def test_system_settings_generic_section_validates_schema_and_preserves_secret_boundary() -> None:
    actor_user_id = uuid4()
    repository = _WriteRepository({"system_settings": {"configuration_revision": 3}})
    service = PlatformSystemSettingsService(settings=get_settings(), repository=repository)

    result = await service.update_generic_section(
        section="ai_agents",
        request=PlatformSystemSettingsSectionWrite(
            expected_revision=3,
            idempotency_key="settings-generic-1",
            values={"enabled": False, "default_mode": "plan"},
        ),
        actor_user_id=actor_user_id,
    )

    assert result.revision == 4
    assert repository.write is not None
    assert repository.write["section"] == "ai_agents"
    assert repository.write["values"] == {"enabled": False, "default_mode": "plan"}

    with pytest.raises(Conflict, match="SYSTEM_SETTINGS_SECRET_FIELD_UNSUPPORTED"):
        await service.update_generic_section(
            section="oauth_google",
            request=PlatformSystemSettingsSectionWrite(
                expected_revision=4,
                idempotency_key="settings-generic-2",
                values={"client_secret": "should-not-be-written-here"},
            ),
            actor_user_id=actor_user_id,
        )


def test_language_catalog_rejects_unverified_locale_and_disabled_default() -> None:
    with pytest.raises(Conflict, match="SYSTEM_SETTINGS_LANGUAGE_LOCALE_NOT_VERIFIED"):
        _validate_language_selection(("zh-CN", "fr-FR"), "zh-CN")
    with pytest.raises(Conflict, match="SYSTEM_SETTINGS_LANGUAGE_DEFAULT_NOT_ENABLED"):
        _validate_language_selection(("zh-CN",), "en-US")


def test_system_settings_idempotency_fingerprint_is_bound_to_expected_revision() -> None:
    actor_user_id = uuid4()
    values = {"name": "Arclayer Cloud"}

    assert _fingerprint(actor_user_id, "site", values, expected_revision=3) != _fingerprint(
        actor_user_id,
        "site",
        values,
        expected_revision=4,
    )
