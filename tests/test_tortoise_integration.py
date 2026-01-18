from __future__ import annotations

import os

import pytest
from tortoise import Tortoise

from apps.api.config import get_settings
from apps.api.core.database.orm import close_orm, init_orm, verify_db_ready


def _integration_enabled() -> bool:
    return os.getenv("RUN_INTEGRATION_TESTS") == "1"


async def test_tortoise_connection(monkeypatch) -> None:
    if not _integration_enabled():
        pytest.skip("integration tests disabled")

    monkeypatch.setenv("DATABASE__ENABLED", "1")
    settings = get_settings()

    try:
        await init_orm(settings)
        await verify_db_ready(settings)
        assert Tortoise._inited is True
    finally:
        await close_orm()
