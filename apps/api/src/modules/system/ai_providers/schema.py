from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.common.schemas import BaseSchema

AIProviderKind = Literal["openai", "anthropic", "deepseek", "openai_compatible", "anthropic_compatible"]


class SystemAIProviderOut(BaseSchema):
    id: UUID
    provider: str
    label: str
    compatibility: AIProviderKind
    is_active: bool
    has_virtual_key: bool
    litellm_key_id: str | None = None
    base_url: str | None = None
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None


class SystemAIProviderListOut(BaseSchema):
    providers: list[SystemAIProviderOut] = Field(default_factory=list)


class SystemAIProviderCreateRequest(BaseSchema):
    provider: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=80)
    compatibility: AIProviderKind = "openai_compatible"
    virtual_key: str = Field(..., min_length=1, max_length=4096)
    litellm_key_id: str | None = Field(default=None, max_length=255)
    base_url: str | None = Field(default=None, max_length=512)
    expires_at: datetime | None = None


class SystemAIProviderUpdateRequest(BaseSchema):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    compatibility: AIProviderKind | None = None
    virtual_key: str | None = Field(default=None, min_length=1, max_length=4096)
    litellm_key_id: str | None = Field(default=None, max_length=255)
    base_url: str | None = Field(default=None, max_length=512)
    is_active: bool | None = None
    expires_at: datetime | None = None
