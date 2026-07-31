from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.core.registry import create_app, create_platform_app
from src.modules.platform_capabilities.router import router
from src.modules.platform_identity.http import (
    get_current_platform_session,
    get_platform_identity_repository,
)
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from tests.utils.asgi_client import asgi_client


class _PermissionRepository:
    async def list_effective_permission_codes(self, **_kwargs: object) -> frozenset[str]:
        return frozenset({PlatformPermissionCode.TENANT_WORKSPACES_READ.value})


def _operator_principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_catalog_requires_platform_session() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router)

    async with asgi_client(app) as client:
        response = await client.get("/capabilities")

    assert response.status_code == 401
    assert response.json()["error"] == "PLATFORM_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_operator_catalog_is_camel_case_and_permission_filtered() -> None:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_platform_session] = _operator_principal
    app.dependency_overrides[get_platform_identity_repository] = _PermissionRepository

    async with asgi_client(app) as client:
        response = await client.get("/capabilities")

    assert response.status_code == 200
    assert response.json()["data"]["items"] == [
        {
            "capabilityId": "tenant-governance",
            "domain": "tenant_governance",
            "nameI18nKey": "navigation:TENANT_GOVERNANCE",
            "descriptionI18nKey": "tenants:WORKSPACES_DESCRIPTION",
            "supportState": "supported",
            "enablementState": "enabled",
            "readinessState": "ready",
            "missingPrerequisiteCodes": [],
            "runtimeHealth": "not_reported",
            "routeTarget": "tenants.workspaces",
            "navigationTargets": [
                {
                    "routeTarget": "tenants.workspaces",
                    "requiredViewPermissions": ["platform:tenant-workspaces:read"],
                    "viewPermissionMatch": "all",
                }
            ],
            "requiredViewPermissions": ["platform:tenant-workspaces:read"],
            "viewPermissionMatch": "all",
            "requiredManagePermissions": ["platform:tenant-workspaces:manage"],
            "managePermissionMatch": "all",
            "navigationCandidate": True,
            "activationAvailable": False,
        }
    ]


def test_catalog_route_is_mounted_only_in_platform_composition() -> None:
    product_paths = {route.path for route in create_app().routes if isinstance(route, APIRoute)}
    platform_paths = {route.path for route in create_platform_app().routes if isinstance(route, APIRoute)}

    assert "/platform-api/v1/capabilities" in platform_paths
    assert "/platform-api/v1/capabilities" not in product_paths
