from __future__ import annotations

import pytest
from tortoise import Tortoise

pytestmark = pytest.mark.integration


async def test_tortoise_connection(db) -> None:
    assert Tortoise._inited is True
