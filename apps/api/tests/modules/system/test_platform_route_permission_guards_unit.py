from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.modules.platform_ai.router import router as platform_ai_router
from src.modules.platform_identity.http import get_current_platform_session, get_platform_identity_repository
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.platform_site_delivery.router import router as platform_site_delivery_router
from src.modules.system.admin.notifications.campaign_router import router as campaign_router
from src.modules.system.directory.router import router as directory_router
from src.modules.system.plugins.router import operations_router as plugin_operations_router
from src.modules.system.plugins.router import router as plugins_router
from tests.utils.asgi_client import asgi_client


class _DeniedPermissionRepository:
    def __init__(self) -> None:
        self.permission_codes: list[str] = []

    async def operator_has_permission(self, *, operator_id, permission_code: str, at: datetime) -> bool:
        _ = operator_id, at
        self.permission_codes.append(permission_code)
        return False


def _denied_principal() -> PlatformSessionPrincipal:
    return PlatformSessionPrincipal(
        actor_id=uuid4(),
        session_id=uuid4(),
        operator_id=uuid4(),
        is_instance_owner=False,
        policy_revision=1,
        absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
    )


def _app_with_denied_platform_permission(router, *, prefix: str = "") -> tuple[FastAPI, _DeniedPermissionRepository]:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router, prefix=prefix)
    repository = _DeniedPermissionRepository()

    async def current_platform_session() -> PlatformSessionPrincipal:
        return _denied_principal()

    app.dependency_overrides[get_current_platform_session] = current_platform_session
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository
    return app, repository


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("router", "prefix", "method", "path", "expected_permission"),
    [
        (directory_router, "", "get", "/users", PlatformPermissionCode.TENANT_USERS_READ),
        (directory_router, "", "delete", f"/users/{uuid4()}", PlatformPermissionCode.TENANT_USERS_MANAGE),
        (plugins_router, "/extensions", "get", "/catalog", PlatformPermissionCode.EXTENSIONS_CATALOG_READ),
        (plugins_router, "/extensions", "post", "/installations", PlatformPermissionCode.EXTENSIONS_INSTALL),
        (plugins_router, "/extensions", "patch", "/example/configuration", PlatformPermissionCode.EXTENSIONS_CONFIGURE),
        (
            plugin_operations_router,
            "/extensions/operations",
            "get",
            "",
            PlatformPermissionCode.EXTENSIONS_CATALOG_READ,
        ),
        (campaign_router, "", "get", "/campaigns", PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ),
        (campaign_router, "", "post", f"/campaigns/{uuid4()}/preview", PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ),
        (campaign_router, "", "post", f"/campaigns/{uuid4()}/publish", PlatformPermissionCode.MESSAGES_CAMPAIGNS_SEND),
        (
            campaign_router,
            "",
            "post",
            f"/campaigns/{uuid4()}/retry-failures",
            PlatformPermissionCode.MESSAGES_DELIVERY_RETRY,
        ),
        (platform_ai_router, "/ai-services", "get", "/tasks", PlatformPermissionCode.AI_TASKS_READ),
        (
            platform_ai_router,
            "/ai-services",
            "get",
            "/providers/readiness",
            PlatformPermissionCode.AI_PROVIDERS_READ,
        ),
        (
            platform_site_delivery_router,
            "/site-delivery",
            "get",
            "/issues",
            PlatformPermissionCode.SITE_DELIVERY_READ,
        ),
        (
            platform_site_delivery_router,
            "/site-delivery",
            "get",
            "/domains",
            PlatformPermissionCode.SITE_DELIVERY_READ,
        ),
        (
            platform_site_delivery_router,
            "/site-delivery",
            "get",
            "/storage",
            PlatformPermissionCode.SITE_STORAGE_READ,
        ),
        (
            platform_site_delivery_router,
            "/site-delivery",
            "get",
            "/rules",
            PlatformPermissionCode.SITE_DELIVERY_SETTINGS_READ,
        ),
    ],
)
async def test_platform_routes_deny_the_exact_missing_permission(
    router, prefix, method, path, expected_permission
) -> None:
    app, repository = _app_with_denied_platform_permission(router, prefix=prefix)

    async with asgi_client(app) as client:
        response = await getattr(client, method)(f"{prefix}{path}")

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.permission_codes == [expected_permission]
