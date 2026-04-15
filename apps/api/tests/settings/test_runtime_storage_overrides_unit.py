from __future__ import annotations

import pytest

from src.config import Settings
from src.settings import runtime
from src.settings.core_schema import CORE_SETTINGS_SCHEMA


def test_core_settings_schema_includes_public_asset_delivery_fields() -> None:
    storage_section = next(section for section in CORE_SETTINGS_SCHEMA.sections if section.id == "storage")
    storage_keys = {field.key for field in storage_section.fields}

    assert "public_base_url" in storage_keys
    assert "public_delivery_mode" in storage_keys
    assert "s3_public_bucket" in storage_keys
    assert "s3_presign_expires_seconds" in storage_keys


@pytest.mark.asyncio
async def test_get_effective_settings_applies_public_asset_delivery_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_core_settings(_settings: Settings, *, ttl_seconds: float = 5.0) -> dict[str, object]:
        _ = ttl_seconds
        return {
            "storage": {
                "provider": "s3",
                "public_base_url": "https://cdn.example.com",
                "public_delivery_mode": "direct",
                "s3_bucket": "assets-private",
                "s3_public_bucket": "assets-public",
                "s3_presign_expires_seconds": 300,
            }
        }

    monkeypatch.setattr(runtime, "get_core_settings_value_cached", fake_core_settings)

    effective = await runtime.get_effective_settings(Settings())

    assert effective.storage.provider == "s3"
    assert effective.storage.public_base_url == "https://cdn.example.com"
    assert effective.storage.public_delivery_mode == "direct"
    assert effective.storage.s3_bucket == "assets-private"
    assert effective.storage.s3_public_bucket == "assets-public"
    assert effective.storage.s3_presign_expires_seconds == 300
