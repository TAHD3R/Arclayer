from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut
from src.common.types.public_uuid import PublicUUID
from src.models.content._enums import PublishJobStatus, PublishJobType


class PublishJobOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    workspace_id: PublicUUID = Field(..., description="Workspace id.")
    site_id: PublicUUID = Field(..., description="Site id.")
    project_id: PublicUUID | None = Field(default=None, description="Project id.")
    release_id: PublicUUID | None = Field(default=None, description="Release id.")
    job_type: PublishJobType = Field(..., description="Publish job type.")
    status: PublishJobStatus = Field(..., description="Publish job status.")
    scheduled_at: datetime | None = Field(default=None, description="Scheduled execution time.")
    started_at: datetime | None = Field(default=None, description="Started at.")
    completed_at: datetime | None = Field(default=None, description="Completed at.")
    error_message: str | None = Field(default=None, description="Failure details.")
    created_by_user_id: PublicUUID | None = Field(default=None, description="Actor user id.")
    created_at: datetime = Field(..., description="Created at.")
    updated_at: datetime = Field(..., description="Updated at.")
