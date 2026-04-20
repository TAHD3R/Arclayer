from __future__ import annotations

from datetime import datetime

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema
from src.models.projects.api_key import ApiKeyFamily, DeliveryKeyPerspective
from src.modules.projects.api_keys.scopes import ApiKeyScope


class PersonalApiKeyCreateIn(BaseSchema):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    scopes: list[ApiKeyScope] = Field(default_factory=list, min_length=1)
    expires_at: datetime | None = None


class ProjectApiKeyCreateIn(BaseSchema):
    family: ApiKeyFamily
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    scopes: list[ApiKeyScope] = Field(default_factory=list, min_length=1)
    expires_at: datetime | None = None
    delivery_perspective: DeliveryKeyPerspective | None = None


class ApiKeyOut(BaseOut):
    owner_user_id: str | None = None
    workspace_id: str | None = None
    site_id: str | None = None
    family: ApiKeyFamily
    delivery_perspective: DeliveryKeyPerspective | None = None
    name: str
    description: str | None = None
    token_public_id: str
    token_mask: str
    scopes: list[ApiKeyScope] = Field(default_factory=list)
    created_by_user_id: str | None = None
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ApiKeyCreateOut(BaseSchema):
    key: ApiKeyOut
    secret_token: str


class ApiKeyListOut(BaseSchema):
    items: list[ApiKeyOut] = Field(default_factory=list)
