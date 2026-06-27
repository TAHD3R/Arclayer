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
    request_model: str
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
    provider_api_key: str = Field(..., min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=512)
    request_model: str = Field(..., min_length=1, max_length=255)
    expires_at: datetime | None = None


class SystemAIProviderUpdateRequest(BaseSchema):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    compatibility: AIProviderKind | None = None
    provider_api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    base_url: str | None = Field(default=None, max_length=512)
    request_model: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    expires_at: datetime | None = None
