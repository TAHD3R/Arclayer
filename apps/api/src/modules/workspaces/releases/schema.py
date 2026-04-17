from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.modules.workspaces.publish.schema import PublishImpactOut


class ReleaseOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    release_number: int = Field(..., ge=1, description="Monotonic release number within the site.")
    is_active: bool = Field(..., description="Whether this release is currently active.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Actor user id that created the release.")
    activated_at: datetime = Field(..., description="Current activation timestamp for the release.")
    created_at: datetime = Field(..., description="Created at.")
    updated_at: datetime = Field(..., description="Updated at.")


class ReleaseListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ReleaseOut] = Field(default_factory=list, description="Workspace releases.")


class ReleasePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    release: ReleaseOut = Field(..., description="Created release metadata.")
    graph_nodes: int = Field(..., ge=0, description="Number of generated graph nodes.")
    impact: PublishImpactOut = Field(..., description="Resolved publish impact snapshot used by the release.")


class ReleaseRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    release: ReleaseOut = Field(..., description="Activated release metadata.")
    previous_active_release_id: PublicUUID | None = Field(
        default=None,
        description="Release that was active immediately before the rollback.",
    )
