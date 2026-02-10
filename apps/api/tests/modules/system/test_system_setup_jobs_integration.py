from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.config import get_settings
from apps.api.core.database.orm import verify_db_ready
from apps.api.core.registry import create_app

pytestmark = pytest.mark.integration

_SETUP_TOKEN = "integration-setup-token"


async def _reset_setup_prerequisites() -> None:
    from apps.api.modules.organization.models.user import User

    settings = get_settings()
    await User.all().delete()

    master_key_path = Path(settings.setup.master_key_path)
    if master_key_path.exists():
        master_key_path.unlink()


async def _poll_setup_job_status(
    client: AsyncClient,
    *,
    job_id: str,
    setup_token: str,
    max_attempts: int = 120,
    interval_seconds: float = 0.1,
) -> dict:
    for _ in range(max_attempts):
        resp = await client.get(
            f"/api/v1/system/setup/jobs/{job_id}",
            headers={"X-Setup-Token": setup_token},
        )
        assert resp.status_code == 200
        payload = resp.json()["data"]
        if payload["status"] in {"succeeded", "failed"}:
            return payload
        await asyncio.sleep(interval_seconds)

    raise AssertionError("setup job did not reach terminal state in time")


async def test_setup_job_endpoint_reaches_succeeded(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_SETUP__TOKEN", _SETUP_TOKEN)
    monkeypatch.setenv("TEST_SETUP__MASTER_KEY_PATH", str(tmp_path / "master.key"))

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    payload = {
        "admin": {
            "username": f"admin_{uuid4().hex[:8]}",
            "password": "Password@123456",
            "email": "admin@example.com",
            "display_name": "Admin",
        },
        "organization": {"name": "Celestial"},
        "core_patch": {"site": {"name": "Celestial"}},
    }

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await _reset_setup_prerequisites()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_resp = await client.post(
                "/api/v1/system/setup",
                json=payload,
                headers={"X-Setup-Token": _SETUP_TOKEN},
            )
            assert create_resp.status_code == 200

            create_data = create_resp.json()["data"]
            assert create_data["status"] in {"pending", "running"}
            assert create_data["stage"] in {"precheck", "admin", "provision", "workspace", "finalize"}

            job_status = await _poll_setup_job_status(
                client,
                job_id=create_data["jobId"],
                setup_token=_SETUP_TOKEN,
            )
            assert job_status["status"] == "succeeded"
            assert job_status["percent"] == 100
            assert job_status["result"]["adminUsername"] == payload["admin"]["username"]

            status_resp = await client.get("/api/v1/system/setup/status")
            assert status_resp.status_code == 200
            assert status_resp.json()["data"]["initialized"] is True


async def test_setup_job_endpoint_reports_failure(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_SETUP__TOKEN", _SETUP_TOKEN)
    monkeypatch.setenv("TEST_SETUP__MASTER_KEY_PATH", str(tmp_path / "master.key"))

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    payload = {
        "admin": {
            "username": f"admin_{uuid4().hex[:8]}",
            "password": "Password@123456",
            "email": "admin@example.com",
            "display_name": "Admin",
        },
        "organization": {"name": "Celestial"},
        "master_key": "not-a-valid-master-key",
        "core_patch": {},
    }

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await _reset_setup_prerequisites()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_resp = await client.post(
                "/api/v1/system/setup",
                json=payload,
                headers={"X-Setup-Token": _SETUP_TOKEN},
            )
            assert create_resp.status_code == 200

            create_data = create_resp.json()["data"]
            job_status = await _poll_setup_job_status(
                client,
                job_id=create_data["jobId"],
                setup_token=_SETUP_TOKEN,
            )
            assert job_status["status"] == "failed"
            assert job_status["errorCode"] == "MASTER_KEY_INVALID"
            assert job_status["result"] is None

            status_resp = await client.get("/api/v1/system/setup/status")
            assert status_resp.status_code == 200
            assert status_resp.json()["data"]["initialized"] is False


async def test_setup_job_dry_run_does_not_persist_data(
    prepared_db,
    integration_valkey_settings,
    monkeypatch,
    tmp_path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("TEST_SETUP__TOKEN", _SETUP_TOKEN)
    monkeypatch.setenv("TEST_SETUP__MASTER_KEY_PATH", str(tmp_path / "master.key"))

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app)

    payload = {
        "admin": {
            "username": f"admin_{uuid4().hex[:8]}",
            "password": "Password@123456",
            "email": "admin@example.com",
            "display_name": "Admin",
        },
        "organization": {"name": "Celestial"},
        "core_patch": {"site": {"name": "Celestial"}},
    }

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        await _reset_setup_prerequisites()

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_resp = await client.post(
                "/api/v1/system/setup?__dev_setup=1",
                json=payload,
                headers={"X-Setup-Token": _SETUP_TOKEN},
            )
            assert create_resp.status_code == 200

            create_data = create_resp.json()["data"]
            job_status = await _poll_setup_job_status(
                client,
                job_id=create_data["jobId"],
                setup_token=_SETUP_TOKEN,
            )
            assert job_status["status"] == "succeeded"
            assert "DRY_RUN_NO_PERSIST" in job_status["warnings"]
            assert job_status["result"]["adminUsername"] == payload["admin"]["username"]

            status_resp = await client.get("/api/v1/system/setup/status")
            assert status_resp.status_code == 200
            assert status_resp.json()["data"]["initialized"] is False

            from apps.api.modules.organization.models.user import User

            assert await User.all().count() == 0
            assert Path(settings.setup.master_key_path).exists() is False
