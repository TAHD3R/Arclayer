from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

import asyncpg

from src.config import Settings
from src.core.exceptions import BadRequest, ServiceUnavailable
from src.core.i18n import t
from src.models.projects.database import (
    ProjectDatabaseCredentialRole,
    ProjectDatabaseEngine,
    ProjectDatabaseIsolationMode,
)


def _te(key: str, **kwargs: object) -> str:
    return t("errors", key, **kwargs)


@dataclass(slots=True)
class ProvisionedDatabaseInstance:
    host: str
    port: int
    database_name: str
    schema_name: str


@dataclass(slots=True)
class ProvisionedDatabaseCredential:
    role: ProjectDatabaseCredentialRole
    username: str
    secret_ref: str
    expires_at: datetime | None = None


class ProjectDatabaseProvisioner(Protocol):
    async def create_instance(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        engine: ProjectDatabaseEngine,
        isolation_mode: ProjectDatabaseIsolationMode,
    ) -> ProvisionedDatabaseInstance: ...

    async def create_role(
        self,
        *,
        instance: ProvisionedDatabaseInstance,
        role: ProjectDatabaseCredentialRole,
    ) -> ProvisionedDatabaseCredential: ...

    async def rotate_credential(
        self,
        *,
        instance: ProvisionedDatabaseInstance,
        role: ProjectDatabaseCredentialRole,
        username: str,
    ) -> ProvisionedDatabaseCredential: ...

    async def create_backup(self, *, instance: ProvisionedDatabaseInstance) -> str: ...

    async def restore_backup(self, *, instance: ProvisionedDatabaseInstance, backup_key: str) -> None: ...


def _validated_identifier(raw: str, *, label: str) -> str:
    value = raw.strip().lower().replace("-", "_")
    if not value or len(value) > 63:
        raise BadRequest(
            _te("PROJECT_DATABASE_IDENTIFIER_INVALID", label=label),
            error="PROJECT_DATABASE_IDENTIFIER_INVALID",
        )
    if not all(ch.isalnum() or ch == "_" for ch in value):
        raise BadRequest(
            _te("PROJECT_DATABASE_IDENTIFIER_INVALID", label=label),
            error="PROJECT_DATABASE_IDENTIFIER_INVALID",
        )
    return value


def _secret_ref(role: ProjectDatabaseCredentialRole) -> str:
    return f"project-db/{role.value}/{uuid4().hex}"


class PostgresProjectDatabaseProvisioner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.database_settings = settings.project_databases

    def _require_enabled(self) -> None:
        if not self.database_settings.enabled:
            raise ServiceUnavailable(
                _te("PROJECT_DATABASE_PROVISIONING_UNAVAILABLE"),
                error="PROJECT_DATABASE_PROVISIONING_UNAVAILABLE",
            )
        if not self.database_settings.host or not self.database_settings.user:
            raise ServiceUnavailable(
                _te("PROJECT_DATABASE_PROVISIONING_CONFIG_MISSING"),
                error="PROJECT_DATABASE_PROVISIONING_CONFIG_MISSING",
            )

    async def create_instance(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        engine: ProjectDatabaseEngine,
        isolation_mode: ProjectDatabaseIsolationMode,
    ) -> ProvisionedDatabaseInstance:
        self._require_enabled()
        if engine != ProjectDatabaseEngine.POSTGRES:
            raise BadRequest(_te("PROJECT_DATABASE_ENGINE_UNSUPPORTED"), error="PROJECT_DATABASE_ENGINE_UNSUPPORTED")
        database_name = _validated_identifier(f"proj_{project_id.hex[:12]}", label="database name")
        schema_name = _validated_identifier(f"env_{environment_id.hex[:12]}", label="schema name")
        password = self.database_settings.password.get_secret_value()
        auth = f"{self.database_settings.user}:{password}@" if password else f"{self.database_settings.user}@"
        dsn = (
            f"postgresql://{auth}{self.database_settings.host}:{self.database_settings.port}/"
            f"{self.database_settings.database}"
        )
        conn = await asyncpg.connect(dsn)
        try:
            await conn.execute(f'CREATE DATABASE "{database_name}"')
        except asyncpg.DuplicateDatabaseError:
            pass
        finally:
            await conn.close()
        if isolation_mode == ProjectDatabaseIsolationMode.SCHEMA:
            instance_dsn = (
                f"postgresql://{auth}{self.database_settings.host}:{self.database_settings.port}/{database_name}"
            )
            instance_conn = await asyncpg.connect(instance_dsn)
            try:
                await instance_conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"')
            finally:
                await instance_conn.close()
        return ProvisionedDatabaseInstance(
            host=self.database_settings.host,
            port=self.database_settings.port,
            database_name=database_name,
            schema_name=schema_name,
        )

    async def create_role(
        self,
        *,
        instance: ProvisionedDatabaseInstance,
        role: ProjectDatabaseCredentialRole,
    ) -> ProvisionedDatabaseCredential:
        self._require_enabled()
        username = _validated_identifier(f"{instance.database_name}_{role.value}", label="username")
        return ProvisionedDatabaseCredential(
            role=role,
            username=username,
            secret_ref=_secret_ref(role),
            expires_at=datetime.now(tz=UTC) + timedelta(days=30),
        )

    async def rotate_credential(
        self,
        *,
        instance: ProvisionedDatabaseInstance,
        role: ProjectDatabaseCredentialRole,
        username: str,
    ) -> ProvisionedDatabaseCredential:
        self._require_enabled()
        return ProvisionedDatabaseCredential(
            role=role,
            username=_validated_identifier(username, label="username"),
            secret_ref=_secret_ref(role),
            expires_at=datetime.now(tz=UTC) + timedelta(days=30),
        )

    async def create_backup(self, *, instance: ProvisionedDatabaseInstance) -> str:
        self._require_enabled()
        return f"{instance.database_name}/backups/{uuid4().hex}.dump"

    async def restore_backup(self, *, instance: ProvisionedDatabaseInstance, backup_key: str) -> None:
        self._require_enabled()
        if not backup_key.strip():
            raise BadRequest(_te("PROJECT_DATABASE_BACKUP_KEY_REQUIRED"), error="PROJECT_DATABASE_BACKUP_KEY_REQUIRED")


def get_project_database_provisioner(settings: Settings) -> ProjectDatabaseProvisioner:
    return PostgresProjectDatabaseProvisioner(settings)
