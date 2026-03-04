from __future__ import annotations

from apps.api.src.config import get_settings
from apps.api.src.modules.system.settings.service import SettingsService
from apps.api.src.plugin.event_bus import EventBus
from apps.api.src.plugin.manifest import ConfigField, ConfigSchema, ConfigSection


def test_mask_secrets_sets_value_to_null_and_reports_secrets_state() -> None:
    settings = get_settings()
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

    masked, secrets = service._mask_secrets(schema, {"google": {"client_secret": "enc:v1:dummy"}})
    google = masked.get("google")
    assert isinstance(google, dict)
    assert google.get("client_secret") is None
    assert secrets["google.client_secret"] is True
