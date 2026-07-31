from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field, model_validator

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject

SupportAccessContentCategory = Literal["content_items"]


class SupportAccessScopeIn(BaseSchema):
    model_config = ConfigDict(frozen=True)
    project_id: UUID | None = None
    content_category: SupportAccessContentCategory


class SupportAccessGrantCreate(BaseSchema):
    model_config = ConfigDict(frozen=True)
    case_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=2000)
    expires_at: datetime
    operator_user_ids: tuple[UUID, ...] = Field(min_length=1)
    scopes: tuple[SupportAccessScopeIn, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_scope(self) -> SupportAccessGrantCreate:
        if len(set(self.operator_user_ids)) != len(self.operator_user_ids):
            raise ValueError("operators must be unique")
        if self.expires_at <= datetime.now(self.expires_at.tzinfo):
            raise ValueError("expiry must be in the future")
        return self


class SupportAccessGrantOut(BaseSchema):
    id: UUID
    workspace_id: UUID
    case_id: str
    reason: str
    expires_at: datetime
    state: str
    revision: int
    operator_user_ids: tuple[UUID, ...]
    scopes: tuple[SupportAccessScopeIn, ...]


class SupportAccessProjectionItemOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    id: UUID
    title: str
    slug: str
    locale: str
    body: JsonObject


class SupportAccessProjectionPageOut(BaseSchema):
    model_config = ConfigDict(frozen=True)

    items: tuple[SupportAccessProjectionItemOut, ...]
    grant_revision: int = Field(ge=1)
    page: int = Field(ge=1)
    continuation: str | None = None
