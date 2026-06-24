from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class WorkspaceTenantIsolationMode(StrEnum):
    WORKSPACE_SCHEMA = "workspace_schema"


class WorkspaceTenantStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


class WorkspaceTenantRecord(BaseModel):
    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="tenant_records",
        on_delete=fields.CASCADE,
    )
    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="workspace_tenant_records",
        on_delete=fields.CASCADE,
    )
    schema_name = fields.CharField(max_length=64, unique=True)
    isolation_mode = fields.CharEnumField(
        WorkspaceTenantIsolationMode,
        max_length=32,
        default=WorkspaceTenantIsolationMode.WORKSPACE_SCHEMA,
    )
    status = fields.CharEnumField(
        WorkspaceTenantStatus,
        max_length=16,
        default=WorkspaceTenantStatus.PENDING,
        db_index=True,
    )
    schema_version = fields.IntField(default=0)
    failure_reason = fields.TextField(null=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        organization_id: UUID

    class Meta(BaseModel.Meta):
        table = "workspace_tenant_registry"
        table_description = "Workspace tenant registry for multi-tenant routing."
        abstract = False
        unique_together = (("workspace_id",), ("schema_name",))
