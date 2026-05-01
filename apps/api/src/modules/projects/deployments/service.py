from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.utils.public_ids import encode_uuid
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.models.projects.deployment import (
    ProjectDeploymentRecord,
    ProjectDeploymentRuntimeKind,
    ProjectDeploymentSourceType,
    ProjectDeploymentStatus,
)
from src.models.projects.environment import ProjectEnvironmentKey, ProjectEnvironmentRecord
from src.models.sites.site import SiteRecord
from src.modules.projects.deployments.schema import (
    ProjectDeploymentActionOut,
    ProjectDeploymentListOut,
    ProjectDeploymentOut,
)
from src.modules.projects.environments.service import ProjectEnvironmentsService
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.router_helpers import current_tenant_context_or_none
from src.modules.tenancy.schema import TenantContext


def _te(key: str) -> str:
    return t("errors", key)


class ProjectDeploymentsService:
    def __init__(
        self,
        tenant_context: TenantContext | None = None,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        self._tenant_context = tenant_context
        self._conn = conn
        self.environments = ProjectEnvironmentsService(tenant_context, conn=conn)

    def _current_tenant_context(self) -> TenantContext | None:
        return self._tenant_context or current_tenant_context_or_none()

    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    @asynccontextmanager
    async def _operation_connection(self) -> AsyncIterator[BaseDBAsyncClient | None]:
        if self._conn is not None:
            yield self._conn
            return
        context = self._current_tenant_context()
        if context is None:
            yield None
            return
        async with TenantDatabaseRouter(context).connection() as conn:
            yield conn

    @asynccontextmanager
    async def _transaction_connection(self) -> AsyncIterator[BaseDBAsyncClient]:
        if self._conn is not None:
            yield self._conn
            return
        context = self._current_tenant_context()
        if context is not None:
            async with TenantDatabaseRouter(context).connection() as conn:
                yield conn
            return
        async with in_transaction() as conn:
            yield conn

    async def list_deployments_out(
        self,
        *,
        project_id: UUID,
        environment_id: UUID | None = None,
        status: str | None = None,
    ) -> ProjectDeploymentListOut:
        async with self._operation_connection() as conn:
            qs = self._using_db(ProjectDeploymentRecord.filter(project_id=project_id), conn).select_related(
                "environment"
            )
            if environment_id is not None:
                qs = qs.filter(environment_id=environment_id)
            if status is not None:
                qs = qs.filter(status=status)
            rows = await qs.order_by("-created_at", "-id").all()
        return ProjectDeploymentListOut(items=[self._to_out(row) for row in rows])

    async def get_deployment_out(self, *, project_id: UUID, deployment_id: UUID) -> ProjectDeploymentOut:
        row = await self._require_deployment(project_id=project_id, deployment_id=deployment_id)
        return self._to_out(row)

    async def record_release_publication(
        self,
        *,
        site_id: UUID,
        release_id: UUID,
        actor_user_id: UUID | None,
    ) -> None:
        site = await self._require_project_site(site_id=site_id)
        project_id = site.project_id
        runtime_id = site.runtime_id
        if project_id is None or runtime_id is None:
            raise NotFound(_te("PROJECT_SITE_NOT_FOUND"), error="PROJECT_SITE_NOT_FOUND")
        preview_environment = await self.environments.get_default_preview_environment(project_id=project_id)
        production_environment = await self.environments.get_environment_by_key(
            project_id=project_id,
            key=ProjectEnvironmentKey.PRODUCTION,
        )
        base_deployment = await self._create_deployment_for_release(
            project_id=project_id,
            runtime_id=runtime_id,
            environment_id=preview_environment.id,
            release_id=release_id,
            actor_user_id=actor_user_id,
            status=ProjectDeploymentStatus.READY,
        )
        await self._promote_existing_deployment(
            project_id=project_id,
            source=base_deployment,
            target_environment_id=UUID(str(production_environment.id)),
            actor_user_id=actor_user_id,
            status=ProjectDeploymentStatus.PROMOTED,
        )

    async def record_release_rollback(
        self,
        *,
        site_id: UUID,
        release_id: UUID,
        actor_user_id: UUID | None,
    ) -> None:
        await self.record_release_publication(site_id=site_id, release_id=release_id, actor_user_id=actor_user_id)

    async def promote_deployment_out(
        self,
        *,
        project_id: UUID,
        deployment_id: UUID,
        environment_id: UUID,
        actor_user_id: UUID | None,
    ) -> ProjectDeploymentActionOut:
        source = await self._require_deployment(project_id=project_id, deployment_id=deployment_id)
        target = await self._promote_existing_deployment(
            project_id=project_id,
            source=source,
            target_environment_id=environment_id,
            actor_user_id=actor_user_id,
            status=ProjectDeploymentStatus.PROMOTED,
        )
        return target

    async def rollback_deployment_out(
        self,
        *,
        project_id: UUID,
        deployment_id: UUID,
        environment_id: UUID | None,
        actor_user_id: UUID | None,
    ) -> ProjectDeploymentActionOut:
        source = await self._require_deployment(project_id=project_id, deployment_id=deployment_id)
        target_environment_id = environment_id or source.environment_id
        return await self._promote_existing_deployment(
            project_id=project_id,
            source=source,
            target_environment_id=target_environment_id,
            actor_user_id=actor_user_id,
            status=ProjectDeploymentStatus.PROMOTED,
        )

    async def cancel_deployment_out(
        self,
        *,
        project_id: UUID,
        deployment_id: UUID,
    ) -> ProjectDeploymentActionOut:
        row = await self._require_deployment(project_id=project_id, deployment_id=deployment_id)
        if row.status not in {ProjectDeploymentStatus.QUEUED, ProjectDeploymentStatus.BUILDING}:
            raise Conflict(_te("PROJECT_DEPLOYMENT_CANCEL_INVALID"), error="PROJECT_DEPLOYMENT_CANCEL_INVALID")
        if row.is_active:
            raise Conflict(
                _te("PROJECT_DEPLOYMENT_ACTIVE_CANCEL_INVALID"),
                error="PROJECT_DEPLOYMENT_ACTIVE_CANCEL_INVALID",
            )
        row.status = ProjectDeploymentStatus.CANCELED
        async with self._transaction_connection() as conn:
            await row.save(using_db=conn, update_fields=["status", "updated_at"])
        return ProjectDeploymentActionOut(
            deployment=self._to_out(row),
            previous_active_deployment_id=None,
            changedAt=datetime.now(tz=UTC),
        )

    async def get_environment_release_id(
        self,
        *,
        site_id: UUID,
        environment_key: ProjectEnvironmentKey,
    ) -> UUID | None:
        site = await self._require_project_site(site_id=site_id)
        project_id = site.project_id
        if project_id is None:
            raise NotFound(_te("PROJECT_SITE_NOT_FOUND"), error="PROJECT_SITE_NOT_FOUND")
        environment = await self.environments.get_environment_by_key(project_id=project_id, key=environment_key)
        async with self._operation_connection() as conn:
            deployment = (
                await self
                ._using_db(
                    ProjectDeploymentRecord.filter(
                        project_id=project_id,
                        environment_id=environment.id,
                        is_active=True,
                    ),
                    conn,
                )
                .order_by("-created_at", "-id")
                .first()
            )
        if deployment is None or deployment.source_type != ProjectDeploymentSourceType.CMS_RUNTIME:
            return None
        try:
            return UUID(str(deployment.source_ref))
        except ValueError as exc:
            raise BadRequest(
                _te("PROJECT_DEPLOYMENT_SOURCE_REF_INVALID"),
                error="PROJECT_DEPLOYMENT_SOURCE_REF_INVALID",
                meta={"deploymentId": str(deployment.id)},
            ) from exc

    async def get_release_id_for_environment(
        self,
        *,
        site_id: UUID,
        environment_id: UUID,
    ) -> UUID | None:
        site = await self._require_project_site(site_id=site_id)
        project_id = site.project_id
        if project_id is None:
            raise NotFound(_te("PROJECT_SITE_NOT_FOUND"), error="PROJECT_SITE_NOT_FOUND")
        async with self._operation_connection() as conn:
            deployment = (
                await self
                ._using_db(
                    ProjectDeploymentRecord.filter(
                        project_id=project_id,
                        environment_id=environment_id,
                        is_active=True,
                    ),
                    conn,
                )
                .order_by("-created_at", "-id")
                .first()
            )
        if deployment is None or deployment.source_type != ProjectDeploymentSourceType.CMS_RUNTIME:
            return None
        try:
            return UUID(str(deployment.source_ref))
        except ValueError as exc:
            raise BadRequest(
                _te("PROJECT_DEPLOYMENT_SOURCE_REF_INVALID"),
                error="PROJECT_DEPLOYMENT_SOURCE_REF_INVALID",
                meta={"deploymentId": str(deployment.id)},
            ) from exc

    async def _require_project_site(self, *, site_id: UUID) -> SiteRecord:
        async with self._operation_connection() as conn:
            site = await self._using_db(
                SiteRecord.filter(id=site_id, project_id__not_isnull=True, runtime_id__not_isnull=True),
                conn,
            ).first()
        if site is None or site.project_id is None or site.runtime_id is None:
            raise NotFound(_te("PROJECT_SITE_NOT_FOUND"), error="PROJECT_SITE_NOT_FOUND")
        return site

    async def _require_deployment(self, *, project_id: UUID, deployment_id: UUID) -> ProjectDeploymentRecord:
        async with self._operation_connection() as conn:
            row = (
                await self
                ._using_db(ProjectDeploymentRecord.filter(id=deployment_id, project_id=project_id), conn)
                .select_related("environment")
                .first()
            )
        if row is None:
            raise NotFound(_te("PROJECT_DEPLOYMENT_NOT_FOUND"), error="PROJECT_DEPLOYMENT_NOT_FOUND")
        return row

    async def _create_deployment_for_release(
        self,
        *,
        project_id: UUID,
        runtime_id: UUID,
        environment_id: UUID,
        release_id: UUID,
        actor_user_id: UUID | None,
        status: ProjectDeploymentStatus,
    ) -> ProjectDeploymentRecord:
        async with self._transaction_connection() as conn:
            await (
                ProjectDeploymentRecord
                .filter(
                    project_id=project_id,
                    environment_id=environment_id,
                    is_active=True,
                )
                .using_db(conn)
                .update(is_active=False)
            )
            return await ProjectDeploymentRecord.create(
                using_db=conn,
                project_id=project_id,
                runtime_id=runtime_id,
                environment_id=environment_id,
                source_type=ProjectDeploymentSourceType.CMS_RUNTIME,
                source_ref=str(release_id),
                status=status,
                runtime_kind=ProjectDeploymentRuntimeKind.STATIC,
                artifact_key=f"release:{release_id}",
                build_log_key=None,
                is_active=True,
                promoted_from_deployment_id=None,
                created_by_user_id=actor_user_id,
            )

    async def _promote_existing_deployment(
        self,
        *,
        project_id: UUID,
        source: ProjectDeploymentRecord,
        target_environment_id: UUID,
        actor_user_id: UUID | None,
        status: ProjectDeploymentStatus,
    ) -> ProjectDeploymentActionOut:
        async with self._operation_connection() as conn:
            target_environment = await self._using_db(
                ProjectEnvironmentRecord.filter(id=target_environment_id, project_id=project_id),
                conn,
            ).first()
        if target_environment is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        if source.status in {ProjectDeploymentStatus.FAILED, ProjectDeploymentStatus.CANCELED}:
            raise Conflict(_te("PROJECT_DEPLOYMENT_PROMOTE_INVALID"), error="PROJECT_DEPLOYMENT_PROMOTE_INVALID")

        changed_at = datetime.now(tz=UTC)
        async with self._transaction_connection() as conn:
            previous_active = (
                await ProjectDeploymentRecord
                .filter(
                    project_id=project_id,
                    environment_id=target_environment_id,
                    is_active=True,
                )
                .using_db(conn)
                .order_by("-created_at", "-id")
                .first()
            )
            previous_active_id = previous_active.id if previous_active is not None else None
            await (
                ProjectDeploymentRecord
                .filter(
                    project_id=project_id,
                    environment_id=target_environment_id,
                    is_active=True,
                )
                .using_db(conn)
                .update(is_active=False)
            )
            promoted = await ProjectDeploymentRecord.create(
                using_db=conn,
                project_id=project_id,
                runtime_id=source.runtime_id,
                environment_id=target_environment_id,
                source_type=source.source_type,
                source_ref=source.source_ref,
                status=status,
                runtime_kind=source.runtime_kind,
                artifact_storage_profile_id=source.artifact_storage_profile_id,
                artifact_key=source.artifact_key,
                build_log_key=source.build_log_key,
                is_active=True,
                promoted_from_deployment_id=source.id,
                created_by_user_id=actor_user_id,
            )
        return ProjectDeploymentActionOut(
            deployment=self._to_out(await self._require_deployment(project_id=project_id, deployment_id=promoted.id)),
            previous_active_deployment_id=previous_active_id,
            changedAt=changed_at,
        )

    @staticmethod
    def _to_out(row: ProjectDeploymentRecord) -> ProjectDeploymentOut:
        environment = row.environment
        source_ref = str(row.source_ref)
        try:
            source_ref = encode_uuid(UUID(source_ref))
        except ValueError:
            pass
        return ProjectDeploymentOut(
            id=row.id,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
            project_id=row.project_id,
            runtime_id=row.runtime_id,
            environment_id=row.environment_id,
            environmentKey=str(environment.key),
            environmentName=str(environment.name),
            sourceType=str(row.source_type),
            sourceRef=source_ref,
            status=str(row.status),
            runtimeKind=str(row.runtime_kind),
            artifact_storage_profile_id=row.artifact_storage_profile_id,
            artifactKey=str(row.artifact_key),
            build_log_key=row.build_log_key,
            isActive=bool(row.is_active),
            promoted_from_deployment_id=row.promoted_from_deployment_id,
            created_by_user_id=row.created_by_user_id,
        )
