from __future__ import annotations

import pytest

from src.config import Settings
from src.settings import runtime
from src.settings.core_schema import CORE_SETTINGS_SCHEMA


def test_core_settings_schema_uses_profile_key_and_upload_limits() -> None:
    storage_section = next(section for section in CORE_SETTINGS_SCHEMA.sections if section.id == "storage")
    storage_keys = {field.key for field in storage_section.fields}

    assert "default_profile_key" in storage_keys
    assert "upload_chunk_size_mb" in storage_keys
    assert "upload_policy" in storage_keys
    assert "upload_max_file_size_mb" not in storage_keys
    assert "upload_max_avatar_size_mb" not in storage_keys
    assert "upload_max_site_logo_size_mb" not in storage_keys
    assert "upload_max_favicon_size_mb" not in storage_keys
    assert "public_base_url" not in storage_keys
    assert "s3_bucket" not in storage_keys


@pytest.mark.asyncio
async def test_get_effective_settings_applies_profile_key_and_upload_limit_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "storage": {
                "default_profile_key": "cloud-primary",
                "upload_chunk_size_mb": 16,
                "upload_max_file_size_mb": 4096,
                "upload_policy": {
                    "defaults": {"max_size_mb": 512, "allowed_extensions": ["pdf"]},
                    "purposes": {
                        "library": {"max_size_mb": 256, "allowed_extensions": ["pdf", "png"]},
                    },
                },
                "public_base_url": "https://legacy.example.com",
                "s3_bucket": "legacy-bucket",
            }
        }

    monkeypatch.setattr(runtime, "get_core_settings_value_cached", fake_core_settings)

    effective = await runtime.get_effective_settings(Settings())

    assert effective.storage.default_profile_key == "cloud-primary"
    assert effective.storage.upload_chunk_size_mb == 16
    assert effective.storage.upload_max_file_size_mb == 4096
    assert effective.storage.upload_policy.defaults.max_size_mb == 512
    assert effective.storage.upload_policy.purposes["library"].allowed_extensions == ["pdf", "png"]
    assert effective.storage.public_base_url is None
    assert effective.storage.s3_bucket is None
