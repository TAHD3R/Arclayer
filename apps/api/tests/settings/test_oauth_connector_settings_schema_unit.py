from __future__ import annotations

from src.settings.core_schema import CORE_SETTINGS_SCHEMA


def test_official_oauth_connector_settings_namespaces_remain_host_validated() -> None:
    sections = {section.id: section for section in CORE_SETTINGS_SCHEMA.sections}

    for section_id in ("oauth_google", "oauth_github", "oauth_microsoft", "oauth_discord"):
        section = sections[section_id]
        assert tuple(field.key for field in section.fields) == (
            "enabled",
            "client_id",
            "client_secret",
        )
        assert section.fields[-1].secret is True
