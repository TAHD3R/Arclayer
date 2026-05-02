from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.content._enums import ContentReleaseStatus
from src.modules.projects.publish.schema import PublishImpactOut, PublishReadinessSummaryOut
from src.modules.system.jobs.schema import PublishJobOut


class ReleaseLineageOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    parent_release_id: PublicUUID | None = Field(default=None, description="Immediate parent release id for lineage.")
    parent_release_number: int | None = Field(default=None, ge=1, description="Immediate parent release number.")


class ReleaseDryRunOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    readiness_summary: PublishReadinessSummaryOut = Field(..., description="Aggregated release readiness summary.")
    impact: PublishImpactOut = Field(..., description="Detailed dry-run diagnostics for the pending release.")


class ReleaseOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    release_number: int = Field(..., ge=1, description="Monotonic release number within the site.")
    is_active: bool = Field(..., description="Whether this release is currently active.")
    status: ContentReleaseStatus = Field(..., description="Release lifecycle status.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Actor user id that created the release.")
    activated_at: datetime | None = Field(default=None, description="Current activation timestamp for the release.")
    scheduled_at: datetime | None = Field(default=None, description="Scheduled publish timestamp.")
    selection_count: int = Field(default=0, ge=0, description="Number of items selected into the release graph.")
    lineage: ReleaseLineageOut = Field(default_factory=ReleaseLineageOut, description="Release lineage metadata.")
    created_at: datetime = Field(..., description="Created at.")
    updated_at: datetime = Field(..., description="Updated at.")


class ReleaseListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ReleaseOut] = Field(default_factory=list, description="Workspace releases.")


class ReleasePublishOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    release: ReleaseOut = Field(..., description="Created release metadata.")
    job: PublishJobOut | None = Field(default=None, description="Scheduled publish job metadata.")
    graph_nodes: int = Field(..., ge=0, description="Number of generated graph nodes.")
    selection_count: int = Field(..., ge=0, description="Number of selected items captured in the release.")
    impact: PublishImpactOut = Field(..., description="Resolved publish impact snapshot used by the release.")


class ReleaseRollbackOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    release: ReleaseOut = Field(..., description="Activated release metadata.")
    previous_active_release_id: PublicUUID | None = Field(
        default=None,
        description="Release that was active immediately before the rollback.",
    )


class ReleasePublishIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    scheduled_at: datetime | None = Field(default=None, description="Future publish time.")


class ReleaseCancelScheduledOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    release: ReleaseOut = Field(..., description="Cancelled release metadata.")
    job: PublishJobOut = Field(..., description="Cancelled publish job metadata.")
