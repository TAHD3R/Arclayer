from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from src.core.registry import create_app, create_platform_app
from src.modules.auth.http.service import get_current_user
from src.modules.platform_identity.eligibility_router import (
    get_platform_identity_authority_service,
    router,
)
from src.modules.platform_identity.schema import PlatformEntryEligibility


class _EligibilityService:
    def __init__(self, *, eligible: bool) -> None:
        self.eligible = eligible
        self.seen_user_id: UUID | None = None

    async def entry_eligibility(self, *, user_id: UUID) -> PlatformEntryEligibility:
        self.seen_user_id = user_id
        return PlatformEntryEligibility(user_id=user_id, eligible=self.eligible)


def _route_paths(app: FastAPI) -> set[str]:
    return {route.path for route in app.routes if isinstance(route, APIRoute)}


@pytest.mark.parametrize("eligible", [True, False])
async def test_product_entry_eligibility_returns_only_discoverability(
    eligible: bool,
) -> None:
    user_id = uuid4()
    service = _EligibilityService(eligible=eligible)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=user_id)
    app.dependency_overrides[get_platform_identity_authority_service] = lambda: service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/me/platform-entry-eligibility")

    assert response.status_code == 200
    assert response.json() == {"eligible": eligible}
    assert service.seen_user_id == user_id


async def test_product_entry_eligibility_requires_product_authentication() -> None:
    service = _EligibilityService(eligible=True)
    app = create_app()
    app.dependency_overrides[get_platform_identity_authority_service] = lambda: service

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/me/platform-entry-eligibility")

    assert response.status_code == 401
    assert service.seen_user_id is None


def test_product_entry_eligibility_route_is_not_mounted_by_platform_api() -> None:
    product_path = "/api/v1/me/platform-entry-eligibility"
    platform_path = "/platform-api/v1/me/platform-entry-eligibility"

    assert product_path in _route_paths(create_app())
    assert platform_path not in _route_paths(create_platform_app())
