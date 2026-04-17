from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.modules.sites.publishing.routes.resolve.service import PublishingRoutesResolveService
from src.modules.sites.schema import SiteRouteMatchOut, SiteRouteResolveOut


class _FakeRepo:
    def __init__(self) -> None:
        self.calls: list[object] = []

    async def get_site_by_id(self, *, site_id):  # type: ignore[no-untyped-def]
        self.calls.append(site_id)
        return {"id": str(site_id)}


class _FakeResolver:
    def __init__(self) -> None:
        self.resolve_result = None
        self.delivery_result = None
        self.delivery_page_result = None
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def resolve(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(("resolve", kwargs))
        return self.resolve_result

    async def resolve_delivery_path(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(("resolve_delivery_path", kwargs))
        return self.delivery_result

    async def resolve_delivery_page_by_id(self, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(("resolve_delivery_page_by_id", kwargs))
        return self.delivery_page_result


def _service(*, database_enabled: bool = True) -> tuple[PublishingRoutesResolveService, _FakeRepo, _FakeResolver]:
    repo = _FakeRepo()
    resolver = _FakeResolver()
    service = PublishingRoutesResolveService(
        Settings(),
        repo=repo,  # type: ignore[arg-type]
        includes=SimpleNamespace(),
    )
    service.settings.database = service.settings.database.model_copy(update={"enabled": database_enabled})
    service._content_resolver = resolver  # type: ignore[attr-defined]
    return service, repo, resolver


@pytest.mark.asyncio
async def test_resolve_route_rejects_when_database_disabled() -> None:
    service, _, _ = _service(database_enabled=False)

    with pytest.raises(Conflict) as exc:
        await service.resolve_route(site_id=uuid4(), path="draft/path", mode="public")

    assert exc.value.error == "ROUTE_RESOLVE_DB_REQUIRED"


@pytest.mark.asyncio
async def test_resolve_route_returns_not_found_when_content_resolver_misses() -> None:
    service, repo, resolver = _service()

    result = await service.resolve_route(site_id=uuid4(), path="draft/path", mode="preview")

    assert repo.calls
    assert resolver.calls[0][0] == "resolve"
    assert resolver.calls[0][1]["pathname"] == "/draft/path"
    assert result == SiteRouteResolveOut(match=SiteRouteMatchOut(kind="not_found"), document=None)


@pytest.mark.asyncio
async def test_resolve_delivery_page_raises_not_found_when_missing() -> None:
    service, _, resolver = _service()

    with pytest.raises(NotFound) as exc:
        await service.resolve_delivery_page(site_id=uuid4(), path="landing", perspective="published")

    assert resolver.calls[0][0] == "resolve_delivery_path"
    assert resolver.calls[0][1]["pathname"] == "/landing"
    assert exc.value.error == "PAGE_ROUTE_NOT_FOUND"


@pytest.mark.asyncio
async def test_get_delivery_page_by_id_returns_resolved_page() -> None:
    service, repo, resolver = _service()
    page_id = uuid4()
    expected = SiteRouteResolveOut(match=SiteRouteMatchOut(kind="page"), document={"path": "/page"})  # type: ignore[arg-type]
    resolver.delivery_page_result = expected

    result = await service.get_delivery_page_by_id(site_id=uuid4(), page_id=page_id, perspective="preview")

    assert repo.calls
    assert resolver.calls[0][0] == "resolve_delivery_page_by_id"
    assert resolver.calls[0][1]["page_id"] == page_id
    assert result == expected
