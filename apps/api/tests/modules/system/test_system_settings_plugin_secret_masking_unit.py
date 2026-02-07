from __future__ import annotations

from apps.api.config import get_settings
from apps.api.modules.system.settings.service import SettingsService
from apps.api.plugin.manager import PluginManager
from apps.api.plugin.manifest import ConfigField, ConfigSchema, ConfigSection


def test_mask_secrets_sets_value_to_null_and_reports_secrets_state() -> None:
    settings = get_settings()
    manager = PluginManager(settings)
    service = SettingsService(settings, manager=manager)

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

    masked, secrets = service._mask_secrets(schema, {"google": {"client_secret": "enc:v1:dummy"}})
    assert masked["google"]["client_secret"] is None
    assert secrets["google.client_secret"] is True
