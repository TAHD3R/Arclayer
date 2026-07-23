from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from src.core.registry import create_app
from src.models.organization.user import User, UserStatus
from src.modules.auth.http.service import require_super_admin

pytestmark = pytest.mark.integration


async def test_campaign_draft_round_trip_uses_public_ids_at_every_route_boundary(
    prepared_db,
    integration_valkey_settings,
) -> None:
    _ = prepared_db, integration_valkey_settings
    operator = await User.create(
        username=f"campaign_operator_{uuid4().hex}",
        email=f"campaign-operator-{uuid4().hex}@example.com",
        display_name="Campaign operator",
        status=UserStatus.ACTIVE,
        is_super_admin=True,
    )
    recipient = await User.create(
        username=f"campaign_recipient_{uuid4().hex}",
        email=f"campaign-recipient-{uuid4().hex}@example.com",
        status=UserStatus.ACTIVE,
    )
    app = create_app()

    async def current_operator() -> User:
        return operator

    app.dependency_overrides[require_super_admin] = current_operator
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            create_response = await client.post(
                "/api/v1/system/notifications/campaigns",
                json={
                    "name": "July release",
                    "internalDescription": "Product release announcement",
                    "audience": {"kind": "all_active_users"},
                    "timezone": "UTC",
                    "priority": 20,
                    "conflictPolicy": "queue",
                    "channels": ["in_app"],
                    "presentations": ["inbox"],
                    "fallbackLocale": "en-US",
                    "variants": [
                        {
                            "locale": "en-US",
                            "inbox": {
                                "title": "July release is ready",
                                "body": "Review the release notes.",
                                "severity": "info",
                            },
                        }
                    ],
                },
            )
            assert create_response.status_code == 201
            created = create_response.json()["data"]
            campaign_id = created["id"]
            assert len(campaign_id) == 22
            assert created["revision"] == 1
            assert created["owner"]["id"] != str(operator.id)

            list_response = await client.get("/api/v1/system/notifications/campaigns?q=July&page=1&size=20")
            assert list_response.status_code == 200
            assert list_response.json()["data"]["items"][0]["id"] == campaign_id

            detail_response = await client.get(f"/api/v1/system/notifications/campaigns/{campaign_id}")
            assert detail_response.status_code == 200
            assert detail_response.json()["data"]["variants"][0]["locale"] == "en-US"

            patch_response = await client.patch(
                f"/api/v1/system/notifications/campaigns/{campaign_id}",
                json={"expectedRevision": 1, "name": "July release notes"},
            )
            assert patch_response.status_code == 200
            patched = patch_response.json()["data"]
            assert patched["name"] == "July release notes"
            assert patched["revision"] == 2

            estimate_response = await client.post(
                f"/api/v1/system/notifications/campaigns/{campaign_id}/audience-estimate"
            )
            assert estimate_response.status_code == 200
            estimate = estimate_response.json()["data"]
            assert estimate["estimatedRecipients"] >= 2
            assert recipient.id is not None

            preview_response = await client.post(f"/api/v1/system/notifications/campaigns/{campaign_id}/preview")
            assert preview_response.status_code == 200
            preview = preview_response.json()["data"]
            assert preview["campaignId"] == campaign_id
            assert preview["variants"][0]["presentations"]["inbox"]["title"] == ("July release is ready")
