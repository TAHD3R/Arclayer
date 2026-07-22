from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class GlobalNotificationPresentation(StrEnum):
    INBOX = "inbox"
    TOAST = "toast"
    MODAL = "modal"
    BANNER = "banner"


class GlobalNotificationSeverity(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


class GlobalNotificationBroadcastIn(BaseSchema):
    title: str = Field(min_length=1, max_length=256)
    body: str | None = Field(default=None, max_length=512)
    presentation: GlobalNotificationPresentation = GlobalNotificationPresentation.TOAST
    severity: GlobalNotificationSeverity = GlobalNotificationSeverity.INFO
    action_label: str | None = Field(default=None, max_length=80)
    action_to: str | None = Field(default=None, max_length=512, pattern=r"^/")
    deliver_in_app: bool = True
    deliver_email: bool = False

    @model_validator(mode="after")
    def validate_delivery(self) -> GlobalNotificationBroadcastIn:
        if not self.deliver_in_app and not self.deliver_email:
            raise ValueError("NOTIFICATION_DELIVERY_CHANNEL_REQUIRED")
        if self.action_label and not self.action_to:
            raise ValueError("NOTIFICATION_ACTION_TARGET_REQUIRED")
        return self


class GlobalNotificationBroadcastOut(BaseSchema):
    broadcast_id: PublicUUID
    policy_enabled: bool
    audience_count: int = Field(ge=0)
    in_app_delivered_count: int = Field(ge=0)
    email_delivered_count: int = Field(ge=0)
