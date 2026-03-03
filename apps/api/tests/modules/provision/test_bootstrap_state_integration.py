from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import verify_db_ready
from apps.api.src.core.registry import create_app
from apps.api.src.modules.auth.deps import get_current_user, get_current_user_id
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.auth.security import hash_password
from apps.api.src.modules.organization.models.user import User

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_bootstrap_state_and_repair_for_orphan_user(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)

        user_repo = UserRepository()
        user = await user_repo.create_user(
            username=f"orphan_{uuid4().hex[:10]}",
            email=f"orphan_{uuid4().hex[:8]}@example.com",
            display_name="Orphan",
            password_hash=hash_password("pass1234", settings.auth),
        )

        async def _get_user() -> User:
            return user

        async def _get_user_id() -> UUID:
            return user.id

        app.dependency_overrides[get_current_user] = _get_user
        app.dependency_overrides[get_current_user_id] = _get_user_id

        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            state_before = await client.get("/api/v1/me/bootstrap-state")
            assert state_before.status_code == 200, state_before.text
            before_payload = state_before.json()["data"]
            assert before_payload["ready"] is False
            assert before_payload["repairRequired"] is True
            assert before_payload["reason"] == "ORG_MEMBERSHIP_MISSING"

            repaired = await client.post("/api/v1/provision/repair")
            assert repaired.status_code == 200, repaired.text
            repaired_payload = repaired.json()["data"]
            assert repaired_payload["ready"] is True
            assert repaired_payload["repaired"] is True
            assert len(repaired_payload["actions"]) >= 3

            state_after = await client.get("/api/v1/me/bootstrap-state")
            assert state_after.status_code == 200, state_after.text
            after_payload = state_after.json()["data"]
            assert after_payload["ready"] is True
            assert after_payload["repairRequired"] is False
            assert after_payload["organizationId"]
            assert after_payload["workspaceId"]
            assert after_payload["siteId"]
            assert after_payload["nextPath"].startswith("/w/")

            repaired_again = await client.post("/api/v1/provision/repair")
            assert repaired_again.status_code == 200, repaired_again.text
            repaired_again_payload = repaired_again.json()["data"]
            assert repaired_again_payload["ready"] is True
            assert repaired_again_payload["repaired"] is False
            assert repaired_again_payload["actions"] == []


@pytest.mark.asyncio
async def test_register_public_auto_bootstraps_user(prepared_db, integration_valkey_settings) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = True

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    username = f"user{uuid4().hex[:8]}"
    email = f"{username}@example.com"
    password = "pass1234"

    try:
        async with app.router.lifespan_context(app):
            await verify_db_ready(settings)

            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                register_resp = await client.post(
                    "/api/v1/auth/register",
                    json={
                        "username": username,
                        "email": email,
                        "password": password,
                        "confirmPassword": password,
                    },
                )
                assert register_resp.status_code == 200, register_resp.text

                login_resp = await client.post(
                    "/api/v1/auth/login",
                    json={"identifier": email, "password": password},
                )
                assert login_resp.status_code == 200, login_resp.text
                tokens = login_resp.json()["data"]
                access_token = str(tokens["accessToken"])

                state_resp = await client.get(
                    "/api/v1/me/bootstrap-state",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                assert state_resp.status_code == 200, state_resp.text
                state = state_resp.json()["data"]
                assert state["ready"] is True
                assert state["workspaceId"]
                assert state["siteId"]
    finally:
        settings.auth.allow_public_register = old_allow


@pytest.mark.asyncio
async def test_register_public_returns_not_found_when_public_register_disabled(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    settings = get_settings()
    old_allow = settings.auth.allow_public_register
    settings.auth.allow_public_register = False

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    username = f"closed_{uuid4().hex[:8]}"
    email = f"{username}@example.com"
    password = "pass1234"

    try:
        async with app.router.lifespan_context(app):
            await verify_db_ready(settings)

            async with AsyncClient(transport=transport, base_url="http://testserver") as client:
                register_resp = await client.post(
                    "/api/v1/auth/register",
                    json={
                        "username": username,
                        "email": email,
                        "password": password,
                        "confirmPassword": password,
                    },
                )

                assert register_resp.status_code == 404, register_resp.text
                payload = register_resp.json()
                assert payload.get("error") == "NOT_FOUND"
    finally:
        settings.auth.allow_public_register = old_allow
