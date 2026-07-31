from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.core.database.orm import verify_db_ready
from src.core.registry import create_platform_app
from src.models.analytics.audit_event import AuditEvent
from src.models.organization.user import User, UserCredential
from src.models.platform_identity.identity import PlatformInstanceOwnership
from src.modules.system.setup.service import InstanceSetupService, InstanceSetupStatus

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_platform_bootstrap_creates_initial_owner_without_product_tokens(
    prepared_db,
    integration_valkey_settings,
    tmp_path: Path,
) -> None:
    _ = prepared_db
    _ = integration_valkey_settings

    base_settings = get_settings()
    settings = base_settings.model_copy(deep=True)
    settings.application.data_dir = tmp_path
    app = create_platform_app()
    app.dependency_overrides[get_settings] = lambda: settings
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        await verify_db_ready(settings)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/platform-api/v1/setup/bootstrap",
                json={
                    "username": "founder01",
                    "email": "founder@example.com",
                    "display_name": "Founder",
                    "password": "bootstrap123",
                },
            )

            assert response.status_code == 200
            bootstrap = response.json()["data"]
            assert bootstrap["ownerIdentityId"]
            assert bootstrap["mfaSetupRequired"] is True
            assert "accessToken" not in bootstrap
            assert "refreshToken" not in bootstrap
            assert settings.application.data_dir.joinpath("install.lock").exists() is True

            ownership = await PlatformInstanceOwnership.get(id=bootstrap["ownerIdentityId"])
            owner = await User.get(id=ownership.owner_user_id)
            assert "is_super_admin" not in User._meta.fields_map
            assert await UserCredential.filter(user_id=owner.id).exists() is True
            audit = await AuditEvent.get(event_name="platform.instance_owner.bootstrapped")
            assert audit.actor_user_id == ownership.owner_user_id
            assert audit.entity_id == ownership.id

            state = await InstanceSetupService(settings).get_state()
            assert state.status == InstanceSetupStatus.READY
            assert state.owner_user_id == ownership.owner_user_id

            repeat = await client.post(
                "/platform-api/v1/setup/bootstrap",
                json={
                    "username": "founder02",
                    "email": "founder2@example.com",
                    "display_name": "Founder Two",
                    "password": "bootstrap123",
                },
            )
            assert repeat.status_code == 409
            assert await PlatformInstanceOwnership.all().count() == 1

    app.dependency_overrides.clear()
