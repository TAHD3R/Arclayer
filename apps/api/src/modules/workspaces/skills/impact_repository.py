from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.agents.catalog import AgentAssignmentRecord, AgentVersionRecord
from src.models.agents.runtime_skill_v1 import AgentRunSkillSnapshotV1Record
from src.models.skills._enums import SkillGitHubImportStatus
from src.models.skills.skill_github_import import SkillGitHubImportRecord
from src.models.skills.skill_update import SkillInstallationRemovalRecord, SkillPackageArchiveRecord
from src.models.skills.skill_version import (
    SkillResourceRecord,
    SkillValidationResultRecord,
    SkillVersionRecord,
)
from src.modules.tenancy.database import TenantScopedRepository
from src.modules.tenancy.schema import TenantContext


class WorkspaceSkillImpactRepository(TenantScopedRepository):
    def __init__(self, tenant_context: TenantContext) -> None:
        super().__init__(tenant_context)

    async def list_referencing_agent_versions(
        self,
        *,
        workspace_id: UUID,
        installation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentVersionRecord, ...]:
        async with self.connection(conn) as tenant_conn:
            return tuple(
                await AgentVersionRecord
                .filter(
                    skill_grant_workspace_id=workspace_id,
                    skill_installation_ids__contains=[str(installation_id)],
                )
                .using_db(tenant_conn)
                .order_by("id")
            )

    async def package_artifact_counts(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> tuple[int, int, int]:
        async with self.connection(conn) as tenant_conn:
            version_ids = tuple(
                await SkillVersionRecord
                .filter(workspace_id=workspace_id, package_id=package_id)
                .using_db(tenant_conn)
                .values_list("id", flat=True)
            )
            if not version_ids:
                return 0, 0, 0
            resource_count = await (
                SkillResourceRecord.filter(skill_version_id__in=version_ids).using_db(tenant_conn).count()
            )
            validation_count = await (
                SkillValidationResultRecord.filter(skill_version_id__in=version_ids).using_db(tenant_conn).count()
            )
            return len(version_ids), resource_count, validation_count

    async def active_github_operation_count(
        self,
        *,
        workspace_id: UUID,
        package_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> int:
        active_statuses = (
            SkillGitHubImportStatus.QUEUED,
            SkillGitHubImportStatus.FETCHING,
            SkillGitHubImportStatus.PERSISTING,
        )
        async with self.connection(conn) as tenant_conn:
            return await (
                SkillGitHubImportRecord
                .filter(
                    workspace_id=workspace_id,
                    package_id=package_id,
                    status__in=active_statuses,
                )
                .using_db(tenant_conn)
                .count()
            )

    async def assignment_counts(
        self,
        *,
        version_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> tuple[int, int]:
        if not version_ids:
            return 0, 0
        async with self.connection(conn) as tenant_conn:
            queryset = AgentAssignmentRecord.filter(version_id__in=version_ids).using_db(tenant_conn)
            return await queryset.count(), await queryset.filter(enabled=True).count()

    async def retained_run_count(
        self,
        *,
        installation_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> int:
        async with self.connection(conn) as tenant_conn:
            return await (
                AgentRunSkillSnapshotV1Record.filter(installation_id=installation_id).using_db(tenant_conn).count()
            )

    async def get_removal_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillInstallationRemovalRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillInstallationRemovalRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_removal(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillInstallationRemovalRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillInstallationRemovalRecord.create(using_db=tenant_conn, **values)

    async def get_package_archive_by_idempotency_key(
        self,
        *,
        workspace_id: UUID,
        idempotency_key: str,
        conn: BaseDBAsyncClient | None = None,
    ) -> SkillPackageArchiveRecord | None:
        async with self.connection(conn) as tenant_conn:
            return (
                await SkillPackageArchiveRecord
                .filter(
                    workspace_id=workspace_id,
                    request_idempotency_key=idempotency_key,
                )
                .using_db(tenant_conn)
                .first()
            )

    async def create_package_archive(
        self,
        *,
        values: dict[str, object],
        conn: BaseDBAsyncClient,
    ) -> SkillPackageArchiveRecord:
        async with self.connection(conn) as tenant_conn:
            return await SkillPackageArchiveRecord.create(using_db=tenant_conn, **values)
