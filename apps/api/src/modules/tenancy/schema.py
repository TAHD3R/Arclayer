from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum
from hashlib import sha256
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas.base import BaseSchema


class TenantIsolationMode(StrEnum):
    PUBLIC = "public"
    WORKSPACE_SCHEMA = "workspace_schema"


class TenantScope(StrEnum):
    WORKSPACE = "workspace"
    PROJECT = "project"
    RUNTIME = "runtime"
    JOB = "job"


class TenantIdentity(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    organization_id: UUID = Field(..., description="Organization id.")
    workspace_id: UUID = Field(..., description="Workspace id.")
    project_id: UUID | None = Field(default=None, description="Project id.")
    runtime_id: UUID | None = Field(default=None, description="Runtime id.")
    site_id: UUID | None = Field(default=None, description="Site id.")
    schema_name: str = Field(..., min_length=1, description="Tenant PostgreSQL schema name.")
    isolation_mode: TenantIsolationMode = Field(..., description="Isolation mode for tenant-owned data.")


@dataclass(frozen=True, slots=True)
class TenantContext:
    identity: TenantIdentity
    scope: TenantScope = TenantScope.WORKSPACE

    @property
    def organization_id(self) -> UUID:
        return self.identity.organization_id

    @property
    def workspace_id(self) -> UUID:
        return self.identity.workspace_id

    @property
    def project_id(self) -> UUID | None:
        return self.identity.project_id

    @property
    def runtime_id(self) -> UUID | None:
        return self.identity.runtime_id

    @property
    def site_id(self) -> UUID | None:
        return self.identity.site_id

    @property
    def schema_name(self) -> str:
        return self.identity.schema_name

    @property
    def isolation_mode(self) -> TenantIsolationMode:
        return self.identity.isolation_mode

    def with_project(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID | None = None,
        site_id: UUID | None = None,
        scope: TenantScope = TenantScope.PROJECT,
    ) -> TenantContext:
        return TenantContext(
            identity=self.identity.model_copy(
                update={
                    "project_id": project_id,
                    "runtime_id": runtime_id,
                    "site_id": site_id,
                }
            ),
            scope=scope,
        )

    def with_runtime(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID,
        site_id: UUID,
    ) -> TenantContext:
        return self.with_project(
            project_id=project_id,
            runtime_id=runtime_id,
            site_id=site_id,
            scope=TenantScope.RUNTIME,
        )

    def with_scope(self, scope: TenantScope) -> TenantContext:
        return replace(self, scope=scope)

    def to_job_payload(self) -> TenantJobContextPayload:
        return TenantJobContextPayload(
            organization_id=self.organization_id,
            workspace_id=self.workspace_id,
            project_id=self.project_id,
            runtime_id=self.runtime_id,
            site_id=self.site_id,
            schema_name=self.schema_name,
            isolation_mode=self.isolation_mode,
            scope=self.scope,
        )


class TenantJobContextPayload(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    organization_id: UUID = Field(..., description="Organization id.")
    workspace_id: UUID = Field(..., description="Workspace id.")
    project_id: UUID | None = Field(default=None, description="Project id.")
    runtime_id: UUID | None = Field(default=None, description="Runtime id.")
    site_id: UUID | None = Field(default=None, description="Site id.")
    schema_name: str = Field(..., min_length=1, description="Tenant PostgreSQL schema name.")
    isolation_mode: TenantIsolationMode = Field(..., description="Isolation mode.")
    scope: TenantScope = Field(default=TenantScope.JOB, description="Context scope.")

    def to_context(self) -> TenantContext:
        return TenantContext(
            identity=TenantIdentity(
                organization_id=self.organization_id,
                workspace_id=self.workspace_id,
                project_id=self.project_id,
                runtime_id=self.runtime_id,
                site_id=self.site_id,
                schema_name=self.schema_name,
                isolation_mode=self.isolation_mode,
            ),
            scope=self.scope,
        )


class TenantMigration(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(frozen=True)

    version: int = Field(..., ge=1, description="Monotonic tenant schema migration version.")
    name: str = Field(..., min_length=1, description="Migration name.")
    sql: tuple[str, ...] = Field(..., min_length=1, description="Ordered SQL statements.")
    checksum: str = Field(..., min_length=64, max_length=64, description="SHA-256 checksum.")

    @classmethod
    def create(cls, *, version: int, name: str, sql: tuple[str, ...]) -> TenantMigration:
        checksum = sha256("\n-- statement --\n".join(sql).encode("utf-8")).hexdigest()
        return cls(version=version, name=name, sql=sql, checksum=checksum)
