from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectDeploymentSourceType(StrEnum):
    CMS_RUNTIME = "cms_runtime"
    MANAGED_TEMPLATE = "managed_template"
    UPLOADED_BUNDLE = "uploaded_bundle"
    GIT = "git"


class ProjectDeploymentStatus(StrEnum):
    QUEUED = "queued"
    BUILDING = "building"
    READY = "ready"
    FAILED = "failed"
    CANCELED = "canceled"
    PROMOTED = "promoted"


class ProjectDeploymentRuntimeKind(StrEnum):
    STATIC = "static"
    SSR = "ssr"
    EDGE = "edge"


class ProjectDeploymentRecord(BaseModel):
    """Persisted deployment state for a project environment."""

    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="deployments",
        on_delete=fields.CASCADE,
    )
    runtime = fields.ForeignKeyField(
        "models.ProjectRuntimeRecord",
        related_name="deployments",
        on_delete=fields.CASCADE,
    )
    environment = fields.ForeignKeyField(
        "models.ProjectEnvironmentRecord",
        related_name="deployments",
        on_delete=fields.CASCADE,
    )
    source_type = fields.CharEnumField(ProjectDeploymentSourceType, db_index=True)
    source_ref = fields.CharField(max_length=255)
    status = fields.CharEnumField(ProjectDeploymentStatus, db_index=True)
    runtime_kind = fields.CharEnumField(ProjectDeploymentRuntimeKind)
    artifact_storage_profile_id = fields.UUIDField(null=True)
    artifact_key = fields.CharField(max_length=512)
    build_log_key = fields.CharField(max_length=512, null=True)
    is_active = fields.BooleanField(default=False, db_index=True)
    promoted_from_deployment = fields.ForeignKeyField(
        "models.ProjectDeploymentRecord",
        related_name="promotions",
        on_delete=fields.SET_NULL,
        null=True,
    )
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID
        runtime_id: UUID
        environment_id: UUID
        promoted_from_deployment_id: UUID | None

    class Meta(BaseModel.Meta):
        table = "project_deployments"
        table_description = "Persisted deployment state records per environment."
        abstract = False
