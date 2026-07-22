from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.modules.sites import public_host_router
from src.modules.sites.public_host_router import project_host_routing_middleware
from src.modules.sites.runtime.schema import SiteResolveOut
from src.modules.tenancy.schema import TenantContext, TenantIdentity, TenantIsolationMode, TenantScope


def _tenant_context() -> TenantContext:
    return TenantContext(
        identity=TenantIdentity(
            organization_id=uuid4(),
            workspace_id=uuid4(),
            project_id=uuid4(),
            runtime_id=uuid4(),
            site_id=uuid4(),
            schema_name="workspace_test",
            isolation_mode=TenantIsolationMode.WORKSPACE_SCHEMA,
        ),
        scope=TenantScope.RUNTIME,
    )


def _resolved_site(host: str) -> SiteResolveOut:
    return SiteResolveOut.model_validate({
        "siteId": uuid4(),
        "workspaceId": uuid4(),
        "projectId": uuid4(),
        "runtimeId": uuid4(),
        "hostname": host,
        "source": "platform_subdomain",
        "targetType": "site",
        "default_locale": "en-US",
        "fallback_locale": "en-US",
        "supported_locales": ["en-US"],
    })


def test_project_host_filter_accepts_only_platform_subdomains() -> None:
    settings = Settings()

    assert public_host_router._is_project_host("launch.arclayer.localhost", settings)
    assert not public_host_router._is_project_host("arclayer.localhost", settings)
    assert not public_host_router._is_project_host("app.arclayer.localhost", settings)
    assert not public_host_router._is_project_host("api.arclayer.localhost", settings)
    assert not public_host_router._is_project_host("storage.arclayer.localhost", settings)
    assert not public_host_router._is_project_host("rustfs.arclayer.localhost", settings)


def test_project_host_renders_resolved_published_page(monkeypatch) -> None:
    resolve_calls: list[str] = []
    delivery_calls: list[str] = []

    class FakeSiteService:
        def __init__(self, settings, *, valkey=None):  # type: ignore[no-untyped-def]
            self.settings = settings
            self.valkey = valkey

        async def resolve_site(self, *, host: str):  # type: ignore[no-untyped-def]
            resolve_calls.append(host)
            return SiteResolveOut.model_validate({
                "siteId": uuid4(),
                "workspaceId": uuid4(),
                "projectId": uuid4(),
                "runtimeId": uuid4(),
                "hostname": host,
                "source": "platform_subdomain",
                "targetType": "site",
                "default_locale": "en-US",
                "fallback_locale": "en-US",
                "supported_locales": ["en-US"],
            })

    class FakeDeliveryKernel:
        def __init__(self, site_service):  # type: ignore[no-untyped-def]
            self.site_service = site_service

        async def resolve_delivery_page(self, *, target, path: str, perspective: str, token):  # type: ignore[no-untyped-def]
            delivery_calls.append(f"{target.runtime_id}:{path}:{perspective}:{token}")
            return SimpleNamespace(
                match=SimpleNamespace(kind="page", redirect_to=None, redirect_status=None),
                page_meta=SimpleNamespace(title="Launch Site", description="A published project site."),
                document=SimpleNamespace(
                    sections=[
                        SimpleNamespace(
                            id="hero",
                            component_key="hero.section",
                            props={"title": "Hello", "description": "Published through Arclayer."},
                        )
                    ],
                ),
            )

    monkeypatch.setattr(public_host_router, "SiteService", FakeSiteService)
    monkeypatch.setattr(public_host_router, "SiteRuntimeDeliveryKernel", FakeDeliveryKernel)

    async def fake_tenant_context(*, resolved):  # type: ignore[no-untyped-def]
        return _tenant_context()

    monkeypatch.setattr(public_host_router, "_resolve_public_tenant_context", fake_tenant_context)

    app = FastAPI()
    app.middleware("http")(project_host_routing_middleware)
    response = TestClient(app).get("/about", headers={"host": "launch.arclayer.localhost"})

    assert response.status_code == 200
    assert resolve_calls == ["launch.arclayer.localhost"]
    assert delivery_calls[0].endswith(":/about:published:None")
    assert "Launch Site" in response.text
    assert "Published through Arclayer." in response.text


def test_project_host_router_keeps_reserved_api_paths_404(monkeypatch) -> None:
    class UnexpectedSiteService:
        def __init__(self, settings, *, valkey=None):  # type: ignore[no-untyped-def]
            raise AssertionError("reserved API paths must not resolve public sites")

    monkeypatch.setattr(public_host_router, "SiteService", UnexpectedSiteService)

    app = FastAPI()
    app.middleware("http")(project_host_routing_middleware)
    response = TestClient(app).get(
        "/api/v1/projects",
        headers={"host": "launch.arclayer.localhost"},
    )

    assert response.status_code == 404


def test_project_host_returns_explicit_failure_when_published_page_bindings_are_unresolved(monkeypatch) -> None:
    class FakeSiteService:
        def __init__(self, settings, *, valkey=None):  # type: ignore[no-untyped-def]
            self.settings = settings
            self.valkey = valkey

        async def resolve_site(self, *, host: str):  # type: ignore[no-untyped-def]
            return _resolved_site(host)

    class FakeDeliveryKernel:
        def __init__(self, site_service):  # type: ignore[no-untyped-def]
            self.site_service = site_service

        async def resolve_delivery_page(self, *, target, path: str, perspective: str, token):  # type: ignore[no-untyped-def]
            raise Conflict(
                "Page binding resolution failed",
                error="PAGE_BINDING_RESOLUTION_FAILED",
                details=[{"sectionId": "hero", "propKey": "title"}],
            )

    monkeypatch.setattr(public_host_router, "SiteService", FakeSiteService)
    monkeypatch.setattr(public_host_router, "SiteRuntimeDeliveryKernel", FakeDeliveryKernel)

    async def fake_tenant_context(*, resolved):  # type: ignore[no-untyped-def]
        return _tenant_context()

    monkeypatch.setattr(public_host_router, "_resolve_public_tenant_context", fake_tenant_context)

    app = FastAPI()
    app.middleware("http")(project_host_routing_middleware)
    response = TestClient(app).get("/", headers={"host": "asset-10-572ed28b.arclayer.localhost"})

    assert response.status_code == 500
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"] == "noindex"
    assert "Site rendering failed" in response.text
    assert "Site Connected" not in response.text


@pytest.mark.parametrize(
    ("path", "has_active_release", "expected_status", "expects_prelaunch"),
    [
        ("/", False, 200, True),
        ("/about", False, 404, False),
        ("/", True, 404, False),
        ("/about", True, 404, False),
    ],
)
def test_project_host_prelaunch_requires_root_without_active_release(
    monkeypatch,
    path: str,
    has_active_release: bool,
    expected_status: int,
    expects_prelaunch: bool,
) -> None:
    class FakeSiteService:
        def __init__(self, settings, *, valkey=None):  # type: ignore[no-untyped-def]
            self.settings = settings
            self.valkey = valkey

        async def resolve_site(self, *, host: str):  # type: ignore[no-untyped-def]
            return _resolved_site(host)

    class FakeDeliveryKernel:
        def __init__(self, site_service):  # type: ignore[no-untyped-def]
            self.site_service = site_service

        async def resolve_delivery_page(self, **_kwargs):  # type: ignore[no-untyped-def]
            raise NotFound("Route not found", error="PAGE_ROUTE_NOT_FOUND")

        async def has_active_release(self, *, target):  # type: ignore[no-untyped-def]
            assert target.site_id is not None
            return has_active_release

    monkeypatch.setattr(public_host_router, "SiteService", FakeSiteService)
    monkeypatch.setattr(public_host_router, "SiteRuntimeDeliveryKernel", FakeDeliveryKernel)

    async def fake_tenant_context(*, resolved):  # type: ignore[no-untyped-def]
        return _tenant_context()

    monkeypatch.setattr(public_host_router, "_resolve_public_tenant_context", fake_tenant_context)

    app = FastAPI()
    app.middleware("http")(project_host_routing_middleware)
    response = TestClient(app).get(path, headers={"host": "launch.arclayer.localhost"})

    assert response.status_code == expected_status
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-robots-tag"].startswith("noindex")
    assert ("arclayer-prelaunch-v1" in response.text) is expects_prelaunch
    assert (response.headers.get("x-arclayer-template") == "arclayer-prelaunch-v1") is expects_prelaunch


def test_project_host_middleware_preserves_later_app_routes(monkeypatch) -> None:
    class UnexpectedSiteService:
        def __init__(self, settings, *, valkey=None):  # type: ignore[no-untyped-def]
            raise AssertionError("matched app routes must not resolve public sites")

    monkeypatch.setattr(public_host_router, "SiteService", UnexpectedSiteService)

    app = FastAPI()
    app.middleware("http")(project_host_routing_middleware)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    response = TestClient(app).get("/healthz", headers={"host": "launch.arclayer.localhost"})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
