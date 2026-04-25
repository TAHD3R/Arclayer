from __future__ import annotations

from datetime import datetime

from pydantic import ConfigDict, Field

from src.common.schemas import BaseOut, BaseSchema
from src.common.types.public_uuid import PublicUUID


class ProjectDatabaseCredentialOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    role: str = Field(..., description="Credential role.")
    username: str = Field(..., description="Database username.")
    secret_set: bool = Field(..., alias="secretSet", description="Whether a secret reference exists.")
    secret_ref: str = Field(default="********", alias="secretRef", description="Masked secret reference marker.")
    expires_at: datetime | None = Field(default=None, alias="expiresAt", description="Credential expiry.")
    rotated_at: datetime | None = Field(default=None, alias="rotatedAt", description="Last rotation timestamp.")
    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")


class ProjectDatabaseMigrationOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    version: str = Field(..., description="Migration version.")
    checksum: str = Field(..., description="Migration checksum.")
    status: str = Field(..., description="Migration status.")
    applied_at: datetime | None = Field(default=None, alias="appliedAt", description="Applied timestamp.")
    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")


class ProjectDatabaseBackupOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    backup_key: str = Field(..., alias="backupKey", description="Backup key.")
    status: str = Field(..., description="Backup status.")
    retention_until: datetime | None = Field(default=None, alias="retentionUntil", description="Retention deadline.")
    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")


class ProjectDatabaseInstanceOut(BaseOut):
    model_config = BaseOut.model_config | ConfigDict(extra="forbid")

    project_id: PublicUUID = Field(..., description="Project id.")
    environment_id: PublicUUID = Field(..., alias="environmentId", description="Environment id.")
    environment_key: str = Field(..., alias="environmentKey", description="Environment key.")
    environment_name: str = Field(..., alias="environmentName", description="Environment name.")
    engine: str = Field(..., description="Database engine.")
    isolation_mode: str = Field(..., alias="isolationMode", description="Isolation mode.")
    host: str = Field(..., description="Database host.")
    port: int = Field(..., description="Database port.")
    database_name: str = Field(..., alias="databaseName", description="Database name.")
    schema_name: str = Field(..., alias="schemaName", description="Schema name.")
    status: str = Field(..., description="Provisioning status.")
    credentials: list[ProjectDatabaseCredentialOut] = Field(default_factory=list, description="Masked credentials.")
    created_at: datetime = Field(..., alias="createdAt", description="Created at.")
    updated_at: datetime = Field(..., alias="updatedAt", description="Updated at.")


class ProjectDatabaseListOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    items: list[ProjectDatabaseInstanceOut] = Field(default_factory=list, description="Project databases.")


class ProjectDatabaseDetailOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    database: ProjectDatabaseInstanceOut = Field(..., description="Database instance.")
    migrations: list[ProjectDatabaseMigrationOut] = Field(default_factory=list, description="Migration records.")
    backups: list[ProjectDatabaseBackupOut] = Field(default_factory=list, description="Backup records.")


class ProjectDatabaseCreateIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    environment_id: PublicUUID = Field(..., alias="environmentId", description="Environment id.")
    engine: str = Field(default="postgres", description="Database engine.")
    isolation_mode: str = Field(default="database", alias="isolationMode", description="Isolation mode.")


class ProjectDatabaseRotateCredentialIn(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    role: str = Field(default="app", description="Credential role to rotate.")
