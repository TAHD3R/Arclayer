from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field, HttpUrl

from apps.api.src.common.schemas import BaseSchema
from apps.api.src.common.types.public_uuid import PublicUUID


class WebhookSubscriptionOut(BaseSchema):
    id: PublicUUID
    capability_id: str | None = Field(default=None, description="Optional owning capability id.")
    event: str
    endpoint_url: str
    enabled: bool = True
    created_at: datetime


class WebhookSubscriptionListOut(BaseSchema):
    items: list[WebhookSubscriptionOut] = Field(default_factory=list)


class WebhookSubscriptionCreateIn(BaseSchema):
    capability_id: str | None = None
    event: str = Field(..., min_length=1, max_length=128)
    endpoint_url: HttpUrl
    enabled: bool = True
    secret: str | None = Field(default=None, description="Optional secret for delivery signing (encrypted at rest).")
    meta: dict[str, Any] | None = None


class WebhookDeliveryOut(BaseSchema):
    id: PublicUUID
    subscription_id: PublicUUID
    event: str
    status: str
    response_code: int | None = None
    error: str | None = None
    duration_ms: int | None = None
    created_at: datetime


class WebhookDeliveryListOut(BaseSchema):
    items: list[WebhookDeliveryOut] = Field(default_factory=list)
