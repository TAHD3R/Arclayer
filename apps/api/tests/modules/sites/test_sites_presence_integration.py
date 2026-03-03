from __future__ import annotations

from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from tortoise import Tortoise

from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.config import get_settings
from apps.api.src.core.database.orm import close_orm, init_orm
from apps.api.src.core.registry import create_app
from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.src.modules.organization.models.organization import Organization
from apps.api.src.modules.organization.models.user import User, UserCredential, UserStatus
from apps.api.src.modules.sites.models.site import SiteRecord
from apps.api.src.modules.workspaces.models.workspace import Workspace
from apps.api.tests.utils.tortoise import reset_postgres_schema

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def prepared_schema(integration_db_settings, integration_valkey_settings, monkeypatch) -> None:
    """
    Prepare DB schema for integration tests.

    Note:
    - We disable plugin system to keep the test focused on Sites protocol behavior.
    - Schema is created via `Tortoise.generate_schemas()` (test-only), not Aerich.
    """

    _ = integration_valkey_settings
    monkeypatch.setenv("PLUGIN__ENABLED", "0")
    monkeypatch.setenv("PLUGIN__AUTO_MIGRATE", "0")
    monkeypatch.setenv("PLUGIN__AUTO_RESTART", "0")
    monkeypatch.setenv("SETUP__ENABLED", "0")
    get_settings.cache_clear()

    settings = get_settings()
    await init_orm(settings)
    await reset_postgres_schema()
    await Tortoise.generate_schemas(safe=True)
    await close_orm()


async def test_sites_presence_heartbeat_and_list(prepared_schema) -> None:
    _ = prepared_schema

    app = create_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with app.router.lifespan_context(app):
        # Arrange tenant + site.
        user = await User.create(username=f"u_{uuid4().hex[:10]}", status=UserStatus.ACTIVE)
        await UserCredential.create(user_id=user.id, password_hash="x")
        org = await Organization.create(slug=f"org_{uuid4().hex[:10]}", name="Test Org", logo_url=None, is_active=True)
        await OrgMembership.create(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER, status="active")
        ws = await Workspace.create(
            organization_id=org.id,
            slug="ws",
            name="Workspace",
            is_active=True,
            created_by_user_id=user.id,
        )

        site = await SiteRecord.create(
            workspace_id=ws.id,
            slug="demo",
            name="Demo",
            default_locale="zh-CN",
            fallback_locale="en-US",
            is_active=True,
            created_by_user_id=user.id,
        )
        site_pid = encode_uuid(site.id)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Issue preview token (stored in Valkey with TTL).
            resp = await client.post(f"/api/v1/sites/{site_pid}/preview-tokens", json={"ttlSeconds": 600})
            assert resp.status_code == 201
            token = resp.json()["data"]["token"]
            assert isinstance(token, str) and token

            # Heartbeat creates (or refreshes) a presence record.
            doc_key = "route:/about"
            client_id = "c_123456"
            resp = await client.post(
                f"/api/v1/sites/{site_pid}/presence/heartbeat",
                params={"token": token},
                json={"docKey": doc_key, "clientId": client_id, "actor": {"displayName": "Alice"}},
            )
            assert resp.status_code == 200
            expires_at_ms = resp.json()["data"]["expiresAtMs"]
            assert isinstance(expires_at_ms, int) and expires_at_ms > 0

            # Listing returns the active record.
            resp = await client.get(
                f"/api/v1/sites/{site_pid}/presence",
                params={"token": token, "docKey": doc_key},
            )
            assert resp.status_code == 200
            payload = resp.json()["data"]
            assert payload["docKey"] == doc_key
            assert len(payload["items"]) == 1
            assert payload["items"][0]["clientId"] == client_id
            assert payload["items"][0]["actor"]["displayName"] == "Alice"

            # Simulate stale client by deleting the record key; list() should clean up the set.
            set_key = f"sites:presence:{site.id}:{doc_key}:clients"
            record_key = f"sites:presence:{site.id}:{doc_key}:client:{client_id}"
            await app.state.valkey.delete(record_key)

            resp = await client.get(
                f"/api/v1/sites/{site_pid}/presence",
                params={"token": token, "docKey": doc_key},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["items"] == []
            assert client_id not in await app.state.valkey.smembers(set_key)
