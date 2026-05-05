from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from src.core.exceptions import NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.projects.database import (
    ProjectDatabaseBackupRecord,
    ProjectDatabaseCredentialRecord,
    ProjectDatabaseCredentialRole,
    ProjectDatabaseEngine,
    ProjectDatabaseInstanceRecord,
    ProjectDatabaseInstanceStatus,
    ProjectDatabaseIsolationMode,
    ProjectDatabaseMigrationRecord,
)
from src.modules.projects.databases.provisioning import (
    ProjectDatabaseProvisioner,
    ProvisionedDatabaseInstance,
)
from src.modules.projects.databases.schema import (
    ProjectDatabaseBackupOut,
    ProjectDatabaseCreateIn,
    ProjectDatabaseCredentialOut,
    ProjectDatabaseDetailOut,
    ProjectDatabaseInstanceOut,
    ProjectDatabaseListOut,
    ProjectDatabaseMigrationOut,
    ProjectDatabaseRotateCredentialIn,
)


def _te(key: str) -> str:
    return t("errors", key)


class ProjectDatabasesService(BaseService):
    def __init__(self, provisioner: ProjectDatabaseProvisioner) -> None:
        super().__init__()
        self.provisioner = provisioner

    async def list_databases_out(self, *, project_id: UUID) -> ProjectDatabaseListOut:
        rows = await ProjectDatabaseInstanceRecord.filter(project_id=project_id).select_related("environment").all()
        items = [await self._to_instance_out(row) for row in rows]
        return ProjectDatabaseListOut(items=items)

    async def get_database_detail_out(self, *, project_id: UUID, database_id: UUID) -> ProjectDatabaseDetailOut:
        row = await self._require_instance(project_id=project_id, database_id=database_id)
        migrations = (
            await ProjectDatabaseMigrationRecord.filter(instance_id=row.id).order_by("-created_at", "-id").all()
        )
        backups = await ProjectDatabaseBackupRecord.filter(instance_id=row.id).order_by("-created_at", "-id").all()
        return ProjectDatabaseDetailOut(
            database=await self._to_instance_out(row),
            migrations=[
                ProjectDatabaseMigrationOut(
                    id=migration.id,
                    createdAt=migration.created_at,
                    updatedAt=migration.updated_at,
                    version=migration.version,
                    checksum=migration.checksum,
                    status=migration.status,
                    applied_at=migration.applied_at,
                )
                for migration in migrations
            ],
            backups=[
                ProjectDatabaseBackupOut(
                    id=backup.id,
                    createdAt=backup.created_at,
                    updatedAt=backup.updated_at,
                    backupKey=backup.backup_key,
                    status=backup.status,
                    retention_until=backup.retention_until,
                )
                for backup in backups
            ],
        )

    async def create_database_out(
        self,
        *,
        project_id: UUID,
        payload: ProjectDatabaseCreateIn,
        actor_user_id: UUID | None,
    ) -> ProjectDatabaseDetailOut:
        environment = await self._require_environment(project_id=project_id, environment_id=payload.environment_id)
        instance = await self.provisioner.create_instance(
            project_id=project_id,
            environment_id=environment.id,
            engine=ProjectDatabaseEngine(payload.engine),
            isolation_mode=ProjectDatabaseIsolationMode(payload.isolation_mode),
        )
        row = await ProjectDatabaseInstanceRecord.create(
            project_id=project_id,
            environment_id=environment.id,
            engine=payload.engine,
            isolation_mode=payload.isolation_mode,
            host=instance.host,
            port=instance.port,
            database_name=instance.database_name,
            schema_name=instance.schema_name,
            status=ProjectDatabaseInstanceStatus.READY,
            created_by_user_id=actor_user_id,
        )
        for role in ProjectDatabaseCredentialRole:
            credential = await self.provisioner.create_role(instance=instance, role=role)
            await ProjectDatabaseCredentialRecord.create(
                instance_id=row.id,
                role=credential.role,
                username=credential.username,
                secret_ref=credential.secret_ref,
                expires_at=credential.expires_at,
                rotated_at=datetime.now(tz=UTC),
            )
        return await self.get_database_detail_out(project_id=project_id, database_id=row.id)

    async def rotate_credential_out(
        self,
        *,
        project_id: UUID,
        database_id: UUID,
        payload: ProjectDatabaseRotateCredentialIn,
    ) -> ProjectDatabaseDetailOut:
        row = await self._require_instance(project_id=project_id, database_id=database_id)
        role = ProjectDatabaseCredentialRole(payload.role)
        credential = await ProjectDatabaseCredentialRecord.get_or_none(instance_id=row.id, role=role)
        if credential is None:
            raise NotFound(_te("PROJECT_DATABASE_CREDENTIAL_NOT_FOUND"), error="PROJECT_DATABASE_CREDENTIAL_NOT_FOUND")
        provisioned = await self.provisioner.rotate_credential(
            instance=self._to_provisioned_instance(row),
            role=role,
            username=credential.username,
        )
        credential.secret_ref = provisioned.secret_ref
        credential.expires_at = provisioned.expires_at
        credential.rotated_at = datetime.now(tz=UTC)
        await credential.save(update_fields=["secret_ref", "expires_at", "rotated_at", "updated_at"])
        return await self.get_database_detail_out(project_id=project_id, database_id=row.id)

    async def _require_instance(self, *, project_id: UUID, database_id: UUID) -> ProjectDatabaseInstanceRecord:
        row = await ProjectDatabaseInstanceRecord.get_or_none(id=database_id, project_id=project_id).select_related(
            "environment"
        )
        if row is None:
            raise NotFound(_te("PROJECT_DATABASE_NOT_FOUND"), error="PROJECT_DATABASE_NOT_FOUND")
        return row

    async def _require_environment(self, *, project_id: UUID, environment_id: UUID):
        from src.models.projects.environment import ProjectEnvironmentRecord

        row = await ProjectEnvironmentRecord.get_or_none(id=environment_id, project_id=project_id)
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return row

    async def _to_instance_out(self, row: ProjectDatabaseInstanceRecord) -> ProjectDatabaseInstanceOut:
        credentials = (
            await ProjectDatabaseCredentialRecord.filter(instance_id=row.id).order_by("created_at", "id").all()
        )
        environment = row.environment
        return ProjectDatabaseInstanceOut(
            id=row.id,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
            project_id=row.project_id,
            environmentId=row.environment_id,
            environmentKey=str(environment.key),
            environmentName=str(environment.name),
            engine=str(row.engine),
            isolationMode=str(row.isolation_mode),
            host=str(row.host),
            port=int(row.port),
            databaseName=str(row.database_name),
            schemaName=str(row.schema_name),
            status=str(row.status),
            credentials=[
                ProjectDatabaseCredentialOut(
                    id=credential.id,
                    createdAt=credential.created_at,
                    updatedAt=credential.updated_at,
                    role=str(credential.role),
                    username=str(credential.username),
                    secretSet=bool(credential.secret_ref),
                    secret_ref="********" if credential.secret_ref else "",
                    expires_at=credential.expires_at,
                    rotated_at=credential.rotated_at,
                )
                for credential in credentials
            ],
        )

    @staticmethod
    def _to_provisioned_instance(row: ProjectDatabaseInstanceRecord) -> ProvisionedDatabaseInstance:
        return ProvisionedDatabaseInstance(
            host=str(row.host),
            port=int(row.port),
            database_name=str(row.database_name),
            schema_name=str(row.schema_name),
        )
