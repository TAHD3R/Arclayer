from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class DomainBindingSource(StrEnum):
    PLATFORM = "platform"
    CUSTOM = "custom"


class DomainBindingTargetType(StrEnum):
    PROJECT_RUNTIME = "project_runtime"


class DomainBindingCertificateStatus(StrEnum):
    PLATFORM_MANAGED = "platform_managed"
    PENDING = "pending"
    ISSUED = "issued"
    ERROR = "error"


class DomainBindingRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="domain_bindings",
        on_delete=fields.CASCADE,
    )
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="domain_bindings",
        on_delete=fields.CASCADE,
    )
    runtime = fields.ForeignKeyField(
        "models.ProjectRuntimeRecord",
        related_name="domain_bindings",
        on_delete=fields.CASCADE,
    )
    site = fields.ForeignKeyField(
        "models.SiteRecord",
        related_name="domain_bindings",
        on_delete=fields.CASCADE,
    )

    hostname = fields.CharField(max_length=253, unique=True, db_index=True)
    source = fields.CharField(max_length=32, default=DomainBindingSource.CUSTOM, db_index=True)
    target_type = fields.CharField(max_length=32, default=DomainBindingTargetType.PROJECT_RUNTIME, db_index=True)
    environment_id = fields.UUIDField(null=True, db_index=True)

    is_primary = fields.BooleanField(default=False, db_index=True)
    is_verified = fields.BooleanField(default=False, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    verification_token = fields.CharField(max_length=128, null=True)
    verified_at = fields.DatetimeField(null=True)
    certificate_status = fields.CharField(
        max_length=32,
        default=DomainBindingCertificateStatus.PENDING,
        db_index=True,
    )

    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "domain_bindings"
        table_description = "Custom domain bindings with TLS certificate status."
        abstract = False
        indexes = (
            ("project_id",),
            ("runtime_id",),
            ("site_id",),
            ("source",),
            ("is_active",),
        )

    if TYPE_CHECKING:
        workspace_id: UUID
        project_id: UUID
        runtime_id: UUID
        site_id: UUID
