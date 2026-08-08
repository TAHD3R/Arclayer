from __future__ import annotations

from uuid import uuid4

import pytest

from src.config import get_settings
from src.core.exceptions import Conflict
from src.models.system.setting import SettingRecord
from src.modules.platform_system_settings.service import (
    PlatformSystemSettingsService,
    TortoisePlatformSystemSettingsRepository,
)
from src.settings.core_schema import CORE_SETTINGS_NAMESPACE
from src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID

pytestmark = pytest.mark.integration


async def test_system_settings_reads_real_core_record_and_binds_replay_to_revision(db_schema) -> None:
    _ = db_schema
    actor_user_id = uuid4()
    settings = get_settings()
    await SettingRecord.create(
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
        namespace=CORE_SETTINGS_NAMESPACE,
        value={
            "system_settings": {"configuration_revision": 1},
            "site": {"name": "Arclayer Control"},
            "domains": {"base_domain": "example.test", "platform_subdomain": "console"},
            "site_localization": {"supported_locales": ["en-US"], "default_locale": "en-US"},
        },
    )
    repository = TortoisePlatformSystemSettingsRepository()
    service = PlatformSystemSettingsService(settings=settings, repository=repository)

    projected = await service.get_settings()
    assert projected.revision == 1
    assert projected.identity.instance_name == "Arclayer Control"
    assert projected.domains.console_domain == "console.example.test"
    assert projected.languages[0].enabled is False
    assert projected.languages[1].is_default is True

    first = await repository.write_core_section(
        section="site",
        values={"name": "Arclayer Cloud"},
        expected_revision=1,
        idempotency_key_hash="settings-revision-bound-key",
        request_fingerprint="fingerprint-revision-1",
        actor_user_id=actor_user_id,
        settings=settings,
    )
    assert first["system_settings"] == {"configuration_revision": 2}

    with pytest.raises(Conflict, match="SYSTEM_SETTINGS_IDEMPOTENCY_CONFLICT"):
        await repository.write_core_section(
            section="site",
            values={"name": "Arclayer Cloud"},
            expected_revision=2,
            idempotency_key_hash="settings-revision-bound-key",
            request_fingerprint="fingerprint-revision-2",
            actor_user_id=actor_user_id,
            settings=settings,
        )
