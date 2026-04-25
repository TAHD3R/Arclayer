from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models.base import BaseModel


class ProjectDatabaseEngine(StrEnum):
    POSTGRES = "postgres"


class ProjectDatabaseIsolationMode(StrEnum):
    DATABASE = "database"
    SCHEMA = "schema"


class ProjectDatabaseInstanceStatus(StrEnum):
    PROVISIONING = "provisioning"
    READY = "ready"
    FAILED = "failed"


class ProjectDatabaseCredentialRole(StrEnum):
    OWNER = "owner"
    MIGRATION = "migration"
    APP = "app"
    READONLY = "readonly"


class ProjectDatabaseBackupStatus(StrEnum):
    READY = "ready"
    FAILED = "failed"


class ProjectDatabaseMigrationStatus(StrEnum):
    APPLIED = "applied"
    FAILED = "failed"


class ProjectDatabaseInstanceRecord(BaseModel):
    project = fields.ForeignKeyField(
        "models.ProjectRecord",
        related_name="database_instances",
        on_delete=fields.CASCADE,
    )
    environment = fields.ForeignKeyField(
        "models.ProjectEnvironmentRecord",
        related_name="database_instances",
        on_delete=fields.CASCADE,
    )
    engine = fields.CharEnumField(ProjectDatabaseEngine, db_index=True)
    isolation_mode = fields.CharEnumField(ProjectDatabaseIsolationMode)
    host = fields.CharField(max_length=255)
    port = fields.IntField()
    database_name = fields.CharField(max_length=128)
    schema_name = fields.CharField(max_length=128)
    status = fields.CharEnumField(ProjectDatabaseInstanceStatus, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        project_id: UUID
        environment_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_project_database_instances"
        abstract = False


class ProjectDatabaseCredentialRecord(BaseModel):
    instance = fields.ForeignKeyField(
        "models.ProjectDatabaseInstanceRecord",
        related_name="credentials",
        on_delete=fields.CASCADE,
    )
    role = fields.CharEnumField(ProjectDatabaseCredentialRole, db_index=True)
    username = fields.CharField(max_length=128)
    secret_ref = fields.CharField(max_length=255)
    expires_at = fields.DatetimeField(null=True)
    rotated_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        instance_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_project_database_credentials"
        abstract = False
        unique_together = (("instance_id", "role"),)


class ProjectDatabaseMigrationRecord(BaseModel):
    instance = fields.ForeignKeyField(
        "models.ProjectDatabaseInstanceRecord",
        related_name="migrations",
        on_delete=fields.CASCADE,
    )
    version = fields.CharField(max_length=128)
    checksum = fields.CharField(max_length=255)
    status = fields.CharEnumField(ProjectDatabaseMigrationStatus, db_index=True)
    applied_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        instance_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_project_database_migrations"
        abstract = False


class ProjectDatabaseBackupRecord(BaseModel):
    instance = fields.ForeignKeyField(
        "models.ProjectDatabaseInstanceRecord",
        related_name="backups",
        on_delete=fields.CASCADE,
    )
    backup_key = fields.CharField(max_length=255)
    status = fields.CharEnumField(ProjectDatabaseBackupStatus, db_index=True)
    retention_until = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        instance_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_project_database_backups"
        abstract = False
