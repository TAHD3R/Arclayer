from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.public_uuid import PublicUUID
from src.modules.system.settings.schema import SettingsSchemaItem


class SysConfigNamespaceSummary(BaseSchema):
    """Sys config namespace summary."""

    namespace: str
    kind: str = "core"
    title: str
    description: str | None = None


class SysConfigRevisionOut(BaseOut, TimestampMixin):
    namespace: str
    base_revision_id: PublicUUID | None = None
    created_by: PublicUUID | None = None
    signature: str | None = None
    signing_key_fingerprint: str | None = None


class SysConfigRevisionDetail(SysConfigRevisionOut):
    """
    Sys config revision detail (super admin).

    Notes:
    - `value` is schema-filtered and secrets are masked to `None`.
    - `signature_verified` is best-effort:
      - None: no signature, public key missing, or key rotated / verify error
      - True/False: verified against the current public key
    """

    signature_verified: bool | None = None
    signature_verify_reason: str | None = None
    value: dict[str, Any]
    secrets: dict[str, bool] = Field(default_factory=dict)


class SysConfigDetail(BaseSchema):
    namespace: str
    setting_schema: SettingsSchemaItem
    value: dict[str, Any]
    secrets: dict[str, bool] = Field(default_factory=dict)
    active_revision_id: PublicUUID | None = None
    revision_id: PublicUUID | None = None
    updated_at: datetime | None = None


class SysConfigPatch(BaseSchema):
    patch: dict[str, Any] = Field(default_factory=dict)
    activate: bool = True


class SysConfigActivateRequest(BaseSchema):
    revision_id: PublicUUID


class SysConfigTestRequest(BaseSchema):
    revision_id: PublicUUID


class SysConfigTestCheck(BaseSchema):
    code: str
    ok: bool
    kind: Literal["config", "connectivity", "internal"] = "config"
    message: str | None = None
    details: dict[str, Any] | None = None


class SysConfigTestResult(BaseSchema):
    ok: bool
    checks: list[SysConfigTestCheck] = Field(default_factory=list)
