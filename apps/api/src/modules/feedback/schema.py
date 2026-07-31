from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, overload

from pydantic import AliasChoices, BeforeValidator, Field, model_validator

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID
from src.models.feedback.feedback import (
    FeedbackCategory,
    FeedbackIntent,
    FeedbackMessageKind,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStatus,
)
from src.models.feedback.feedback import (
    FeedbackContextType as StoredFeedbackContextType,
)


class FeedbackContextType(StrEnum):
    GLOBAL = "global"
    WORKSPACE = "workspace"
    PROJECT = "project"


class FeedbackOrdering(StrEnum):
    LAST_ACTIVITY_DESC = "-last_activity_at"
    LAST_ACTIVITY_ASC = "last_activity_at"
    CREATED_DESC = "-created_at"
    CREATED_ASC = "created_at"


@overload
def project_feedback_context_type(value: StoredFeedbackContextType) -> FeedbackContextType: ...


@overload
def project_feedback_context_type(value: FeedbackContextType) -> FeedbackContextType: ...


@overload
def project_feedback_context_type(value: object) -> object: ...


def project_feedback_context_type(value: object) -> object:
    if value == StoredFeedbackContextType.AI_CONVERSATION:
        return FeedbackContextType.WORKSPACE
    return value


FeedbackOutputContextType = Annotated[
    FeedbackContextType,
    BeforeValidator(project_feedback_context_type),
]


class FeedbackSubmitRequest(BaseSchema):
    client_request_id: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    source: FeedbackSource
    context_type: FeedbackContextType
    intent: FeedbackIntent
    message: str = Field(min_length=3, max_length=10_000)
    rating: int | None = Field(default=None, ge=1, le=5)
    workspace_id: PublicUUID | None = None
    project_id: PublicUUID | None = None
    context_url: str | None = Field(default=None, max_length=2048)
    context: JsonObject = Field(
        default_factory=dict,
        validation_alias=AliasChoices("context", "metadata"),
    )

    @model_validator(mode="after")
    def validate_context_scope(self):
        if self.context_type == FeedbackContextType.GLOBAL:
            if self.workspace_id is not None or self.project_id is not None:
                raise ValueError("global feedback cannot include workspaceId or projectId")
        elif self.context_type == FeedbackContextType.PROJECT and self.project_id is None:
            raise ValueError("projectId is required for project feedback")
        elif self.context_type == FeedbackContextType.WORKSPACE and self.workspace_id is None:
            raise ValueError("workspaceId is required for workspace feedback")
        return self


class FeedbackUserOut(BaseSchema):
    id: PublicUUID
    email: str | None
    username: str
    display_name: str | None
    avatar_url: str | None
    status: str
    last_login_at: datetime | None
    created_at: datetime


class FeedbackMessageCreate(BaseSchema):
    kind: FeedbackMessageKind
    body: str = Field(min_length=1, max_length=10_000)


class FeedbackMessageOut(BaseOut):
    kind: FeedbackMessageKind
    body: str
    author: FeedbackUserOut
    created_at: datetime


class FeedbackTicketUpdate(BaseSchema):
    status: FeedbackStatus | None = None
    priority: FeedbackPriority | None = None
    assignee_user_id: PublicUUID | None = None
    clear_assignee: bool = False

    @model_validator(mode="after")
    def require_change(self):
        if self.status is None and self.priority is None and self.assignee_user_id is None and not self.clear_assignee:
            raise ValueError("at least one feedback field must be changed")
        if self.assignee_user_id is not None and self.clear_assignee:
            raise ValueError("assigneeUserId and clearAssignee cannot be combined")
        return self


class FeedbackTicketListItemOut(BaseOut, TimestampMixin):
    client_request_id: str
    source: FeedbackSource
    context_type: FeedbackOutputContextType
    intent: FeedbackIntent | None
    legacy_category: FeedbackCategory | None
    message_preview: str
    rating: int | None
    status: FeedbackStatus
    priority: FeedbackPriority
    workspace_id: PublicUUID | None
    project_id: PublicUUID | None
    reporter: FeedbackUserOut
    assignee: FeedbackUserOut | None
    message_count: int
    last_activity_at: datetime
    first_response_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None


class FeedbackTicketDetailOut(BaseOut, TimestampMixin):
    client_request_id: str
    source: FeedbackSource
    context_type: FeedbackOutputContextType
    intent: FeedbackIntent | None
    legacy_category: FeedbackCategory | None
    message: str
    rating: int | None
    status: FeedbackStatus
    priority: FeedbackPriority
    workspace_id: PublicUUID | None
    project_id: PublicUUID | None
    context_url: str | None
    context: JsonObject
    reporter: FeedbackUserOut
    assignee: FeedbackUserOut | None
    messages: list[FeedbackMessageOut]
    last_activity_at: datetime
    first_response_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
