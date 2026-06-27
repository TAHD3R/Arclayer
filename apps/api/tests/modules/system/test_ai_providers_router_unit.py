from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.modules.auth.http.service import get_current_user, require_super_admin
from src.modules.system.ai_providers.router import get_system_ai_provider_service
from src.modules.system.router import router as system_router
from tests.utils.asgi_client import asgi_client


async def test_system_ai_providers_route_returns_empty_list() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(system_router, prefix="/api/v1/system")

    async def _super_admin():
        return SimpleNamespace(is_super_admin=True)

    class EmptyProviderService:
        async def list_providers(self):
            return []

    app.dependency_overrides[get_current_user] = _super_admin
    app.dependency_overrides[require_super_admin] = _super_admin
    app.dependency_overrides[get_system_ai_provider_service] = lambda: EmptyProviderService()

    async with asgi_client(app) as client:
        res = await client.get("/api/v1/system/ai/providers")

    assert res.status_code == 200
    assert res.json()["data"] == {"providers": []}
