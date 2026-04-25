from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectDeploymentOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    project_id: PublicUUID = Field(..., description="Project id.")
    runtime_id: PublicUUID = Field(..., description="Runtime id.")
    environment_id: PublicUUID = Field(..., description="Environment id.")
    environment_key: str = Field(..., alias="environmentKey", description="Environment key.")
    environment_name: str = Field(..., alias="environmentName", description="Environment display name.")
    source_type: str = Field(..., alias="sourceType", description="Deployment source type.")
    source_ref: str = Field(..., alias="sourceRef", description="Source reference.")
    status: str = Field(..., description="Deployment status.")
    runtime_kind: str = Field(..., alias="runtimeKind", description="Runtime kind.")
    artifact_storage_profile_id: PublicUUID | None = Field(
        default=None,
        alias="artifactStorageProfileId",
        description="Artifact storage profile id.",
    )
    artifact_key: str = Field(..., alias="artifactKey", description="Artifact key.")
    build_log_key: str | None = Field(default=None, alias="buildLogKey", description="Build log key.")
    is_active: bool = Field(..., alias="isActive", description="Whether the deployment is active for its environment.")
    promoted_from_deployment_id: PublicUUID | None = Field(
        default=None,
        alias="promotedFromDeploymentId",
        description="Deployment this record was promoted from.",
    )
    created_by_user_id: PublicUUID | None = Field(default=None, alias="createdByUserId", description="Actor user id.")
    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")


class ProjectDeploymentListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ProjectDeploymentOut] = Field(default_factory=list, description="Project deployments.")


class ProjectDeploymentPromoteIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    environment_id: PublicUUID = Field(..., alias="environmentId", description="Target environment id.")


class ProjectDeploymentRollbackIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    environment_id: PublicUUID | None = Field(
        default=None,
        alias="environmentId",
        description="Optional target environment id for rollback.",
    )


class ProjectDeploymentActionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    deployment: ProjectDeploymentOut = Field(..., description="Resulting deployment record.")
    previous_active_deployment_id: PublicUUID | None = Field(
        default=None,
        alias="previousActiveDeploymentId",
        description="Previously active deployment for the target environment.",
    )
    changed_at: datetime = Field(..., alias="changedAt", description="Action timestamp.")
