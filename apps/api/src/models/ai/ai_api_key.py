"""AI API key model — virtual keys and bring-your-own-key.

R3 audit requirement:
    - Keys are stored with hashed values only.
    - LiteLLM key IDs stored for virtual key management.
    - Key lifecycle tracked via is_active and timestamps.
"""

from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models.base import BaseModel


class KeyOwnerType(StrEnum):
    WORKSPACE = "workspace"
    USER = "user"
    PLATFORM = "platform"


class KeyType(StrEnum):
    VIRTUAL_KEY = "virtual_key"
    BRING_YOUR_OWN_KEY = "bring_own_key"


class AIAPIKey(BaseModel):
    """API key for AI provider access."""

    owner_type = fields.CharEnumField(KeyOwnerType, db_index=True)
    owner_id = fields.UUIDField(db_index=True)
    key_type = fields.CharEnumField(KeyType)
    provider = fields.CharField(max_length=50)
    litellm_key_id = fields.CharField(max_length=255, null=True)
    key_hash = fields.CharField(max_length=255, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    last_used_at = fields.DatetimeField(null=True)
    expires_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "ai_api_keys"
        abstract = False
