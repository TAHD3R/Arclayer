from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI

from src.config import get_settings
from src.core.exceptions import init_exception_handlers
from src.core.http.pagination import PageData, PageParams
from src.models.organization.user import UserStatus
from src.models.system.notification_campaign import (
    NotificationCampaignChannel,
    NotificationCampaignState,
    NotificationDeliveryRecord,
    NotificationDeliverySourceKind,
    NotificationDeliveryState,
    NotificationPresentation,
)
from src.modules.platform_identity.http import get_current_platform_session, get_platform_identity_repository
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.system.admin.notifications.delivery_directory_repository import (
    NotificationDeliveryDirectoryRepository,
    _normalize_ordering,
)
from src.modules.system.admin.notifications.delivery_directory_router import (
    get_notification_delivery_directory_service,
    router,
)
from src.modules.system.admin.notifications.delivery_directory_schema import NotificationDeliveryDirectoryOut
from src.modules.system.admin.notifications.delivery_directory_service import NotificationDeliveryDirectoryService
from tests.utils.asgi_client import asgi_client

pytestmark = pytest.mark.unit


class _DirectoryRepository:
    def __init__(
        self,
        *,
        rows: list[NotificationDeliveryRecord],
        total: int,
        campaigns: dict[UUID, Any],
        variants: dict[UUID, Any],
        recipients: dict[UUID, Any],
    ) -> None:
        self.rows = rows
        self.total = total
        self.campaigns = campaigns
        self.variants = variants
        self.recipients = recipients
        self.list_args: dict[str, Any] | None = None

    async def list_deliveries(self, **kwargs: Any) -> tuple[list[NotificationDeliveryRecord], int]:
        self.list_args = kwargs
        return self.rows, self.total

    async def list_campaigns(self, campaign_ids: set[UUID]) -> dict[UUID, Any]:
        assert campaign_ids == set(self.campaigns)
        return self.campaigns

    async def list_variants(self, variant_ids: set[UUID]) -> dict[UUID, Any]:
        assert variant_ids == set(self.variants)
        return self.variants

    async def list_recipients(self, recipient_ids: set[UUID]) -> dict[UUID, Any]:
        assert recipient_ids == {UUID(str(row.recipient_user_id)) for row in self.rows}
        return self.recipients


class _DeniedPermissionRepository:
    def __init__(self) -> None:
        self.permission_codes: list[str] = []

    async def operator_has_permission(self, *, operator_id: UUID, permission_code: str, at: datetime) -> bool:
        _ = operator_id, at
        self.permission_codes.append(permission_code)
        return False


class _EmptyDirectoryService:
    async def list_deliveries(self, **kwargs: Any) -> PageData[NotificationDeliveryDirectoryOut]:
        _ = kwargs
        return PageData[NotificationDeliveryDirectoryOut](
            items=[],
            total=0,
            page=1,
            size=20,
            pages=0,
        )


def _delivery(
    *,
    campaign_id: UUID,
    variant_id: UUID | None,
    recipient_id: UUID,
) -> NotificationDeliveryRecord:
    now = datetime(2026, 8, 2, 12, tzinfo=UTC)
    return cast(
        NotificationDeliveryRecord,
        SimpleNamespace(
            id=uuid4(),
            campaign_id=campaign_id,
            variant_id=variant_id,
            recipient_user_id=recipient_id,
            source_kind=NotificationDeliverySourceKind.CAMPAIGN,
            source_identity=f"campaign:{campaign_id}:variant:{variant_id}",
            channel=NotificationCampaignChannel.EMAIL,
            presentation=NotificationPresentation.EMAIL,
            state=NotificationDeliveryState.FAILED,
            attempt_count=2,
            is_retryable=True,
            scheduled_at=now - timedelta(minutes=3),
            processing_at=now - timedelta(minutes=2),
            sent_at=None,
            delivered_at=None,
            read_at=None,
            clicked_at=None,
            dismissed_at=None,
            notification_id=None,
            provider_message_id="provider-message-42",
            failure_code="SMTP_BOUNCE",
            failure_message="Mailbox rejected the message",
            created_at=now - timedelta(minutes=4),
            updated_at=now,
        ),
    )


@pytest.mark.asyncio
async def test_delivery_directory_projects_cross_campaign_evidence_and_forwards_query_controls() -> None:
    campaign_id = uuid4()
    variant_id = uuid4()
    recipient_id = uuid4()
    row = _delivery(campaign_id=campaign_id, variant_id=variant_id, recipient_id=recipient_id)
    repository = _DirectoryRepository(
        rows=[row],
        total=3,
        campaigns={
            campaign_id: SimpleNamespace(
                id=campaign_id,
                name="August service update",
                revision=4,
                state=NotificationCampaignState.PARTIALLY_FAILED,
            )
        },
        variants={
            variant_id: SimpleNamespace(
                id=variant_id,
                locale="en-US",
                revision=4,
                email_payload={
                    "template_key": "system.service-update",
                    "template_version": 7,
                    "variables": {"scope": "all"},
                },
            )
        },
        recipients={
            recipient_id: SimpleNamespace(
                id=recipient_id,
                username="recipient",
                display_name="Recipient Operator",
                status=UserStatus.ACTIVE,
            )
        },
    )
    service = NotificationDeliveryDirectoryService(cast(NotificationDeliveryDirectoryRepository, repository))

    page = await service.list_deliveries(
        params=PageParams(page=2, size=1),
        q="mailbox",
        campaign_ids=(campaign_id,),
        states=(NotificationDeliveryState.FAILED,),
        channels=(NotificationCampaignChannel.EMAIL,),
        presentations=(NotificationPresentation.EMAIL,),
        retryable=True,
        ordering="-attempt_count",
    )

    assert repository.list_args == {
        "offset": 1,
        "limit": 1,
        "q": "mailbox",
        "campaign_ids": (campaign_id,),
        "states": (NotificationDeliveryState.FAILED,),
        "channels": (NotificationCampaignChannel.EMAIL,),
        "presentations": (NotificationPresentation.EMAIL,),
        "retryable": True,
        "ordering": "-attempt_count",
    }
    assert page.total == 3
    assert page.page == 2
    assert page.pages == 3
    assert page.next == 3
    assert page.prev == 1
    item = page.items[0]
    assert item.campaign.id == campaign_id
    assert item.campaign.name == "August service update"
    assert item.recipient.id == recipient_id
    assert item.recipient.username == "recipient"
    assert item.template is not None
    assert item.template.variant_id == variant_id
    assert item.template.template_key == "system.service-update"
    assert item.template.template_version == 7
    assert item.source_identity == f"campaign:{campaign_id}:variant:{variant_id}"
    assert item.attempt_count == 2
    assert item.failure_code == "SMTP_BOUNCE"
    assert item.provider_message_id == "provider-message-42"


@pytest.mark.asyncio
async def test_delivery_directory_exposes_missing_recipient_or_template_evidence_without_fallback() -> None:
    campaign_id = uuid4()
    recipient_id = uuid4()
    row = _delivery(campaign_id=campaign_id, variant_id=None, recipient_id=recipient_id)
    repository = _DirectoryRepository(
        rows=[row],
        total=1,
        campaigns={
            campaign_id: SimpleNamespace(
                id=campaign_id,
                name="Archived campaign",
                revision=2,
                state=NotificationCampaignState.ARCHIVED,
            )
        },
        variants={},
        recipients={},
    )
    service = NotificationDeliveryDirectoryService(cast(NotificationDeliveryDirectoryRepository, repository))

    page = await service.list_deliveries(
        params=PageParams(),
        q=None,
        campaign_ids=(),
        states=(),
        channels=(),
        presentations=(),
        retryable=None,
        ordering=None,
    )

    item = page.items[0]
    assert item.recipient.id == recipient_id
    assert item.recipient.username is None
    assert item.recipient.display_name is None
    assert item.template is None


def test_delivery_directory_only_accepts_visible_ordering_fields_with_stable_tie_breaking() -> None:
    assert _normalize_ordering("-attempt_count,campaign_name,unrecognized") == (
        "-attempt_count",
        "campaign__name",
        "-id",
    )
    assert _normalize_ordering("unrecognized") == ("-created_at", "-id")
    assert _normalize_ordering("recipient") == ("-created_at", "-id")


@pytest.mark.asyncio
async def test_delivery_directory_requires_the_existing_campaign_read_permission() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router)
    repository = _DeniedPermissionRepository()

    async def current_platform_session() -> PlatformSessionPrincipal:
        return PlatformSessionPrincipal(
            actor_id=uuid4(),
            session_id=uuid4(),
            operator_id=uuid4(),
            is_instance_owner=False,
            policy_revision=1,
            absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )

    app.dependency_overrides[get_current_platform_session] = current_platform_session
    app.dependency_overrides[get_platform_identity_repository] = lambda: repository

    async with asgi_client(app) as client:
        response = await client.get("/deliveries")

    assert response.status_code == 403
    assert response.json()["error"] == "PLATFORM_PERMISSION_DENIED"
    assert repository.permission_codes == [PlatformPermissionCode.MESSAGES_CAMPAIGNS_READ]


@pytest.mark.asyncio
async def test_delivery_directory_returns_an_explicit_empty_page_in_the_standard_envelope() -> None:
    app = FastAPI()
    init_exception_handlers(app, get_settings())
    app.include_router(router)

    async def current_platform_session() -> PlatformSessionPrincipal:
        return PlatformSessionPrincipal(
            actor_id=uuid4(),
            session_id=uuid4(),
            operator_id=None,
            is_instance_owner=True,
            policy_revision=1,
            absolute_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )

    app.dependency_overrides[get_current_platform_session] = current_platform_session
    app.dependency_overrides[get_notification_delivery_directory_service] = _EmptyDirectoryService

    async with asgi_client(app) as client:
        response = await client.get("/deliveries")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"] == {
        "items": [],
        "total": 0,
        "page": 1,
        "size": 20,
        "pages": 0,
        "next": None,
        "prev": None,
    }
    assert "error" not in payload
