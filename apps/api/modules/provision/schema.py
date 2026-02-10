from __future__ import annotations

from pydantic import Field

from apps.api.common.schemas import BaseSchema
from apps.api.common.types.public_uuid import PublicUUID


class BootstrapStateOut(BaseSchema):
    ready: bool = Field(..., description="Whether the current user can enter a workspace immediately.")
    repair_required: bool = Field(..., description="Whether bootstrap repair is required before entering workspace.")
    organization_id: PublicUUID | None = Field(default=None, description="Resolved organization id.")
    workspace_id: PublicUUID | None = Field(default=None, description="Resolved workspace id.")
    site_id: PublicUUID | None = Field(default=None, description="Resolved site id.")
    next_path: str = Field(..., description="Recommended next path for post-auth navigation.")
    reason: str | None = Field(default=None, description="Optional machine-readable reason when not ready.")


class ProvisionRepairOut(BaseSchema):
    repaired: bool = Field(..., description="Whether the repair action changed any bootstrap records.")
    ready: bool = Field(..., description="Whether bootstrap is ready after repair.")
    organization_id: PublicUUID | None = Field(default=None, description="Resolved organization id after repair.")
    workspace_id: PublicUUID | None = Field(default=None, description="Resolved workspace id after repair.")
    site_id: PublicUUID | None = Field(default=None, description="Resolved site id after repair.")
    actions: list[str] = Field(default_factory=list, description="Executed repair actions.")
