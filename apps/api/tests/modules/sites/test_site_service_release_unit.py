from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict
from src.modules.sites.repository import SitesRepository
from src.modules.sites.service import SiteService


def _service(*, active_release: object | None, database_enabled: bool = True) -> tuple[SiteService, AsyncMock]:
    get_active_release = AsyncMock(return_value=active_release)
    repository = cast(SitesRepository, SimpleNamespace(get_active_release=get_active_release))
    service = SiteService(Settings(), repo=repository)
    service.settings.database = service.settings.database.model_copy(update={"enabled": database_enabled})
    return service, get_active_release


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("active_release", "expected"),
    [(SimpleNamespace(id="release-id"), True), (None, False)],
)
async def test_has_active_release_reflects_repository_state(active_release: object | None, expected: bool) -> None:
    service, get_active_release = _service(active_release=active_release)
    site_id = uuid4()

    assert await service.has_active_release(site_id=site_id) is expected
    get_active_release.assert_awaited_once_with(site_id=site_id)


@pytest.mark.asyncio
async def test_has_active_release_requires_database_storage() -> None:
    service, get_active_release = _service(active_release=None, database_enabled=False)

    with pytest.raises(Conflict) as exc:
        await service.has_active_release(site_id=uuid4())

    assert exc.value.error == "SITE_DB_REQUIRED"
    get_active_release.assert_not_awaited()
