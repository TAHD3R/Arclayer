from __future__ import annotations

import pytest

from apps.api.src.config import Settings, SetupSettings
from apps.api.src.modules.system.settings.service import SettingsService
from apps.api.src.plugin.event_bus import EventBus
from apps.api.src.plugin.manifest import ConfigField, ConfigSchema, ConfigSection
from apps.api.src.settings.crypto import ensure_master_key, is_encrypted
from apps.api.src.settings.scopes import SCOPE_TYPE_SYSTEM, SYSTEM_SCOPE_ID


@pytest.mark.asyncio
async def test_plugin_settings_secrets_are_encrypted_with_stable_aad(tmp_path) -> None:
    key_path = tmp_path / "master.key"
    ensure_master_key(key_path)

    settings = Settings(setup=SetupSettings(master_key_path=key_path))
    service = SettingsService(settings, event_bus=EventBus())

    schema = ConfigSchema(
        sections=[
            ConfigSection(
                id="google",
                title="Google",
                fields=[
                    ConfigField(key="client_secret", type="str", default=None, secret=True),
                ],
            )
        ]
    )
    namespace = "plugin:plugin-oauth-social"
    config: dict[str, object] = {"google": {"client_secret": "plain-secret"}}

    encrypted = await service._encrypt_plugin_secrets(
        schema,
        config,
        namespace=namespace,
        scope_type=SCOPE_TYPE_SYSTEM,
        scope_id=SYSTEM_SCOPE_ID,
    )

    google = encrypted.get("google")
    assert isinstance(google, dict)
    raw = google.get("client_secret")
    assert isinstance(raw, str)
    assert is_encrypted(raw)
