from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, field_validator

from src.common.schemas.base import BaseOut, BaseSchema, TimestampMixin
from src.common.types.public_uuid import PublicUUID
from src.core.i18n import t
from src.models.storage.storage_profile import StorageProfileConfigSource
from src.platform.storage.capabilities import ObjectStorageProviderKind


class StorageProfileConfigPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    endpoint_url: str | None = None
    region: str | None = None
    bucket: str | None = None
    public_bucket: str | None = None
    public_base_url: str | None = None
    public_delivery_mode: str = "auto"
    force_path_style: bool = False
    access_key_id: str | None = None
    secret_access_key: str | None = Field(default=None, exclude=True)
    presign_expires_seconds: int = Field(default=900, ge=60, le=24 * 3600)


class StorageProfileSecretsOut(BaseSchema):
    secret_access_key: bool = False


class StorageProfileOut(BaseOut, TimestampMixin):
    profile_key: str
    scope_type: str
    scope_id: PublicUUID
    provider: ObjectStorageProviderKind
    config_source: StorageProfileConfigSource
    display_name: str
    config: StorageProfileConfigPayload
    secrets: StorageProfileSecretsOut = Field(default_factory=StorageProfileSecretsOut)
    is_active: bool
    is_default: bool
    last_test_status: Literal["passed", "failed"] | None = None
    last_test_message: str | None = None
    last_tested_at: datetime | None = None


class StorageProfileListOut(BaseSchema):
    items: list[StorageProfileOut] = Field(default_factory=list)


class StorageProfileCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    profile_key: str = Field(min_length=2, max_length=128)
    provider: ObjectStorageProviderKind
    display_name: str = Field(min_length=1, max_length=128)
    config: StorageProfileConfigPayload
    is_active: bool = True

    @field_validator("profile_key")
    @classmethod
    def _normalize_profile_key(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized.replace("-", "").replace("_", "").isalnum():
            raise ValueError(t("errors", "STORAGE_PROFILE_KEY_INVALID"))
        return normalized


class StorageProfileUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    config: StorageProfileConfigPayload | None = None
    is_active: bool | None = None


class StorageProfileTestResultOut(BaseSchema):
    ok: bool
    status: Literal["passed", "failed"]
    message: str


class StorageProfileDeleteOut(BaseSchema):
    id: PublicUUID
    deleted: bool
