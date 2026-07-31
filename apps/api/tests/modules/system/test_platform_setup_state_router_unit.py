from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.modules.system import router as system_router_module
from src.modules.system.setup.service import InstanceSetupStatus


@pytest.mark.asyncio
async def test_platform_setup_state_exposes_only_platform_bootstrap_routing_state(monkeypatch) -> None:
    class SetupStateServiceStub:
        async def get_state(self):
            return SimpleNamespace(
                status=InstanceSetupStatus.REPAIR_REQUIRED,
                repair_reason="state_mismatch",
            )

    app = FastAPI()
    app.include_router(system_router_module.platform_router, prefix="/platform-api/v1")
    app.dependency_overrides[get_settings] = get_settings
    monkeypatch.setattr(system_router_module, "InstanceSetupService", lambda _: SetupStateServiceStub())

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/platform-api/v1/setup/state")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "repair_required",
        "repairReason": "state_mismatch",
    }
