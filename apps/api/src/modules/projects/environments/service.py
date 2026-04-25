from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.core.exceptions import BadRequest, NotFound
from src.core.i18n import t
from src.models.projects.environment import (
    PROJECT_ENVIRONMENT_SPECS,
    ProjectEnvironmentKey,
    ProjectEnvironmentRecord,
)
from src.modules.projects.environments.schema import (
    ProjectEnvironmentListOut,
    ProjectEnvironmentOut,
    ProjectEnvironmentPatchIn,
)
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.router_helpers import current_tenant_context_or_none
from src.modules.tenancy.schema import TenantContext


def _te(key: str) -> str:
    return t("errors", key)


class ProjectEnvironmentsService:
    def __init__(
        self,
        tenant_context: TenantContext | None = None,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        self._tenant_context = tenant_context
        self._conn = conn

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

    async def list_environments_out(self, *, project_id: UUID) -> ProjectEnvironmentListOut:
        rows = await self._list_environments(project_id=project_id)
        return ProjectEnvironmentListOut(items=[ProjectEnvironmentOut.model_validate(row) for row in rows])

    async def patch_environment_out(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        payload: ProjectEnvironmentPatchIn,
    ) -> ProjectEnvironmentOut:
        async with self._operation_connection() as conn:
            row = await self._using_db(
                ProjectEnvironmentRecord.filter(id=environment_id, project_id=project_id),
                conn,
            ).first()
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

        normalized_name = payload.name.strip() if payload.name is not None else None
        if normalized_name == "":
            raise BadRequest(_te("PROJECT_ENVIRONMENT_NAME_REQUIRED"), error="PROJECT_ENVIRONMENT_NAME_REQUIRED")

        async with self._transaction_connection() as conn:
            current = (
                await ProjectEnvironmentRecord.filter(id=environment_id, project_id=project_id).using_db(conn).first()
            )
            if current is None:
                raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

            update_fields: list[str] = []
            if normalized_name is not None:
                current.name = normalized_name
                update_fields.append("name")

            if (
                payload.is_default_preview is not None
                and bool(current.is_default_preview) != payload.is_default_preview
            ):
                if payload.is_default_preview:
                    await (
                        ProjectEnvironmentRecord
                        .filter(project_id=project_id, is_default_preview=True)
                        .using_db(conn)
                        .update(is_default_preview=False)
                    )
                current.is_default_preview = payload.is_default_preview
                update_fields.append("is_default_preview")

            if update_fields:
                await current.save(using_db=conn, update_fields=[*dict.fromkeys([*update_fields, "updated_at"])])

        async with self._operation_connection() as conn:
            refreshed = await self._using_db(ProjectEnvironmentRecord.filter(id=environment_id), conn).first()
        if refreshed is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return ProjectEnvironmentOut.model_validate(refreshed)

    async def get_environment_by_key(self, *, project_id: UUID, key: ProjectEnvironmentKey) -> ProjectEnvironmentRecord:
        async with self._operation_connection() as conn:
            row = await self._using_db(
                ProjectEnvironmentRecord.filter(project_id=project_id, key=key),
                conn,
            ).first()
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return row

    async def get_default_preview_environment(self, *, project_id: UUID) -> ProjectEnvironmentRecord:
        async with self._operation_connection() as conn:
            row = (
                await self
                ._using_db(
                    ProjectEnvironmentRecord.filter(project_id=project_id, is_default_preview=True),
                    conn,
                )
                .order_by("created_at", "id")
                .first()
            )
        if row is not None:
            return row
        return await self.get_environment_by_key(project_id=project_id, key=ProjectEnvironmentKey.DEVELOPMENT)

    async def _list_environments(self, *, project_id: UUID) -> list[ProjectEnvironmentRecord]:
        async with self._operation_connection() as conn:
            rows = await self._using_db(ProjectEnvironmentRecord.filter(project_id=project_id), conn).all()
        order = {key.value: index for index, (key, *_rest) in enumerate(PROJECT_ENVIRONMENT_SPECS)}
        return sorted(rows, key=lambda row: (order.get(str(row.key), 999), row.created_at, row.id))
