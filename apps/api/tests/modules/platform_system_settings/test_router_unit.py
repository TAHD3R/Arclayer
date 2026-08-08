from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.modules.platform_identity.http import get_current_platform_session, get_platform_identity_repository
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_system_settings.router import (
    get_platform_system_settings_service,
    router,
    update_platform_domains,
    update_platform_identity,
    update_platform_regional,
    update_platform_site_metadata,
)
from src.modules.platform_system_settings.schema import (
    PlatformRegionalSettingsOut,
    PlatformRegionalSettingsWrite,
    PlatformSiteMetadataSettingsOut,
    PlatformSiteMetadataSettingsWrite,
    PlatformSystemDomainSettingsOut,
    PlatformSystemDomainSettingsWrite,
    PlatformSystemIdentitySettingsOut,
    PlatformSystemIdentitySettingsWrite,
    PlatformSystemSettingsOut,
)
from tests.utils.asgi_client import asgi_client


class _DeniedRepository:
    def __init__(self) -> None:
        self.permission_codes: list[str] = []

    async def operator_has_permission(self, *, permission_code: str, **_kwargs: object) -> bool:
        self.permission_codes.append(permission_code)
        return False


class _AllowedRepository(_DeniedRepository):
    async def operator_has_permission(self, *, permission_code: str, **_kwargs: object) -> bool:
        self.permission_codes.append(permission_code)
        return True


def _principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )


def test_system_settings_route_requires_the_exact_read_permission() -> None:
    route = next(candidate for candidate in router.routes if isinstance(candidate, APIRoute))
    dependency = route.dependant.dependencies[0].call
    assert callable(dependency)
    permission_code = inspect.getclosurevars(dependency).nonlocals.get("permission_code")
    assert permission_code == PlatformPermissionCode.SYSTEM_SETTINGS_READ


def test_system_settings_mutation_routes_require_the_exact_manage_permission() -> None:
    mutation_paths = {
        "/identity",
        "/domains",
        "/regional",
        "/site-metadata",
        "/languages/drafts",
        "/languages/drafts/{draft_revision}/impact",
        "/languages/publish",
    }
    routes = {
        candidate.path: candidate
        for candidate in router.routes
        if isinstance(candidate, APIRoute) and candidate.path in mutation_paths
    }

    assert set(routes) == mutation_paths
    for route in routes.values():
        dependency = route.dependant.dependencies[0].call
        assert callable(dependency)
        permission_code = inspect.getclosurevars(dependency).nonlocals.get("permission_code")
        assert permission_code == PlatformPermissionCode.SYSTEM_SETTINGS_MANAGE


@pytest.mark.asyncio
async def test_system_settings_route_denies_an_operator_without_read_permission() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router, prefix="/settings")
    repository = _DeniedRepository()

    async def current_platform_session() -> PlatformSessionPrincipal:
        return _principal()

    app.dependency_overrides[get_current_platform_session] = current_platform_session
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository

    async with asgi_client(app) as client:
        response = await client.get("/settings")

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.permission_codes == [PlatformPermissionCode.SYSTEM_SETTINGS_READ]


@pytest.mark.asyncio
async def test_system_settings_route_reads_projected_settings_for_an_authorized_operator() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router, prefix="/settings")
    repository = _AllowedRepository()
    projected = PlatformSystemSettingsOut(
        revision=2,
        identity=PlatformSystemIdentitySettingsOut(
            instance_name="Arclayer Control",
            description=None,
            contact_email="ops@example.com",
            logo_url=None,
            favicon_url=None,
        ),
        domains=PlatformSystemDomainSettingsOut(
            primary_domain="example.test",
            console_domain="platform.example.test",
            reserved_labels=("www", "api"),
        ),
        languages=(),
        regional=PlatformRegionalSettingsOut(
            timezone="UTC",
            date_format="YYYY-MM-DD",
            number_format="1,234.56",
        ),
        site_metadata=PlatformSiteMetadataSettingsOut(
            default_title="Arclayer",
            title_format="Page title · Site name",
            default_description=None,
        ),
    )
    service = SimpleNamespace(get_settings=AsyncMock(return_value=projected))

    async def current_platform_session() -> PlatformSessionPrincipal:
        return _principal()

    app.dependency_overrides[get_current_platform_session] = current_platform_session
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository
    app.dependency_overrides[get_platform_system_settings_service] = lambda: service

    async with asgi_client(app) as client:
        response = await client.get("/settings")

    assert response.status_code == 200
    assert response.json()["data"]["identity"]["instanceName"] == "Arclayer Control"
    service.get_settings.assert_awaited_once_with()
    assert repository.permission_codes == [PlatformPermissionCode.SYSTEM_SETTINGS_READ]


@pytest.mark.asyncio
async def test_system_settings_mutation_routes_map_api_payloads_to_persisted_sections() -> None:
    principal = _principal()
    projected = SimpleNamespace()
    service = SimpleNamespace(update_section=AsyncMock(return_value=projected))

    await update_platform_identity(
        PlatformSystemIdentitySettingsWrite(
            expected_revision=3,
            idempotency_key="identity-key",
            instance_name="Arclayer Control",
            description="A deployment",
            contact_email="ops@example.com",
            logo_url="https://example.com/logo.svg",
            favicon_url=None,
        ),
        principal=principal,
        service=service,
    )
    await update_platform_domains(
        PlatformSystemDomainSettingsWrite(
            expected_revision=4,
            idempotency_key="domains-key",
            primary_domain="example.com",
            console_subdomain="platform",
            reserved_labels=("www", "api"),
        ),
        principal=principal,
        service=service,
    )
    await update_platform_regional(
        PlatformRegionalSettingsWrite(
            expected_revision=5,
            idempotency_key="regional-key",
            timezone="Asia/Shanghai",
            date_format="YYYY-MM-DD",
            number_format="1,234.56",
        ),
        principal=principal,
        service=service,
    )
    await update_platform_site_metadata(
        PlatformSiteMetadataSettingsWrite(
            expected_revision=6,
            idempotency_key="seo-key",
            default_title="Arclayer",
            title_format="Page title · Site name",
            default_description="Deployment description",
        ),
        principal=principal,
        service=service,
    )

    calls = service.update_section.await_args_list
    assert calls[0].kwargs["section"] == "site"
    assert calls[0].kwargs["values"]["name"] == "Arclayer Control"
    assert "instance_name" not in calls[0].kwargs["values"]
    assert calls[1].kwargs["section"] == "domains"
    assert calls[1].kwargs["values"]["base_domain"] == "example.com"
    assert calls[1].kwargs["values"]["platform_subdomain"] == "platform"
    assert calls[2].kwargs["section"] == "workspace_localization"
    assert calls[2].kwargs["values"]["timezone"] == "Asia/Shanghai"
    assert calls[3].kwargs["section"] == "seo"
    assert calls[3].kwargs["values"]["title_policy_v1"]["parts"][0] == {
        "kind": "token",
        "value": "pageTitle",
    }
