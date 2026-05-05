from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.exceptions import IntegrityError

from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import PublicIdDecodeError, decode_public_id, is_public_id
from src.core.exceptions import BadRequest, Conflict, NotFound
from src.core.i18n import t
from src.core.services import BaseService
from src.models.projects.environment import (
    PROJECT_ENVIRONMENT_SPECS,
    ProjectEnvironmentAliasRecord,
    ProjectEnvironmentKey,
    ProjectEnvironmentRecord,
)
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.projects.environments.repository import EnvironmentCopyCounts, ProjectEnvironmentsRepository
from src.modules.projects.environments.schema import (
    ProjectEnvironmentAliasOut,
    ProjectEnvironmentAliasSwitchIn,
    ProjectEnvironmentCloneIn,
    ProjectEnvironmentCopyOut,
    ProjectEnvironmentListOut,
    ProjectEnvironmentOut,
    ProjectEnvironmentPatchIn,
    ProjectEnvironmentPromoteIn,
)
from src.modules.tenancy.database import TenantDatabaseRouter
from src.modules.tenancy.router_helpers import current_tenant_context_or_none
from src.modules.tenancy.schema import TenantContext

PROJECT_ENVIRONMENT_UPDATED_EVENT = "project.environment.updated"


def _te(key: str) -> str:
    return t("errors", key)


class ProjectEnvironmentsService(BaseService):
    def __init__(
        self,
        tenant_context: TenantContext | None = None,
        *,
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        super().__init__()
        self._tenant_context = tenant_context
        self._conn = conn

    def _current_tenant_context(self) -> TenantContext | None:
        return self._tenant_context or current_tenant_context_or_none()

    @staticmethod
    def _using_db(qs, conn: BaseDBAsyncClient | None):
        return qs if conn is None else qs.using_db(conn)

    async def _write_environment_activity_event(
        self,
        *,
        workspace_id: UUID | None,
        project_id: UUID,
        environment_id: UUID,
        actor_user_id: UUID,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
    ) -> None:
        payload: JsonObject = {
            "workspace_id": str(workspace_id) if workspace_id is not None else None,
            "project_id": str(project_id),
            "environment_id": str(environment_id),
            "actor_user_id": str(actor_user_id),
        }
        payload.update(properties)
        await write_required_activity_event(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=PROJECT_ENVIRONMENT_UPDATED_EVENT,
                workspace_id=workspace_id,
                actor_user_id=actor_user_id,
                entity_type="project_environment",
                entity_id=environment_id,
                source="api",
                properties=payload,
            ),
            conn=conn,
        )

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
        async with self.tx() as conn:
            yield conn

    async def list_environments_out(self, *, project_id: UUID) -> ProjectEnvironmentListOut:
        rows = await self._list_environments(project_id=project_id)
        aliases = await self._list_aliases(project_id=project_id)
        return ProjectEnvironmentListOut(
            items=[self._environment_out(row) for row in rows],
            aliases=[self._alias_out(row) for row in aliases],
        )

    async def patch_environment_out(
        self,
        *,
        project_id: UUID,
        environment_id: UUID,
        payload: ProjectEnvironmentPatchIn,
        actor_user_id: UUID,
        workspace_id: UUID | None = None,
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
                await self._write_environment_activity_event(
                    workspace_id=workspace_id,
                    project_id=project_id,
                    environment_id=environment_id,
                    actor_user_id=actor_user_id,
                    properties={
                        "environment_key": str(current.key),
                        "updated_fields": sorted(update_fields),
                    },
                    conn=conn,
                )

        async with self._operation_connection() as conn:
            refreshed = await self._using_db(ProjectEnvironmentRecord.filter(id=environment_id), conn).first()
        if refreshed is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return self._environment_out(refreshed)

    async def get_environment_by_key(self, *, project_id: UUID, key: ProjectEnvironmentKey) -> ProjectEnvironmentRecord:
        async with self._operation_connection() as conn:
            row = await self._using_db(
                ProjectEnvironmentRecord.filter(project_id=project_id, key=key),
                conn,
            ).first()
        if row is None:
            raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")
        return row

    async def resolve_environment_target(
        self,
        *,
        project_id: UUID,
        target: str | UUID | None,
        default_key: ProjectEnvironmentKey = ProjectEnvironmentKey.PRODUCTION,
    ) -> ProjectEnvironmentRecord:
        normalized = str(target or "").strip()
        if not normalized:
            return await self.get_environment_by_key(project_id=project_id, key=default_key)

        async with self._operation_connection() as conn:
            query = ProjectEnvironmentRecord.filter(project_id=project_id)
            target_id = self._target_uuid(normalized)
            if target_id is not None:
                environment = await self._using_db(query.filter(id=target_id), conn).first()
                if environment is not None:
                    return environment

            try:
                environment_key = ProjectEnvironmentKey(normalized)
            except ValueError:
                environment_key = None
            if environment_key is not None:
                environment = await self._using_db(query.filter(key=environment_key), conn).first()
                if environment is not None:
                    return environment

            alias = await self._using_db(
                ProjectEnvironmentAliasRecord.filter(project_id=project_id, key=normalized).prefetch_related(
                    "target_environment"
                ),
                conn,
            ).first()
            if alias is not None:
                return alias.target_environment

        raise NotFound(_te("PROJECT_ENVIRONMENT_NOT_FOUND"), error="PROJECT_ENVIRONMENT_NOT_FOUND")

    @staticmethod
    def _target_uuid(target: str) -> UUID | None:
        if is_public_id(target):
            try:
                return decode_public_id(target)
            except PublicIdDecodeError:
                return None
        try:
            return UUID(target)
        except ValueError:
            return None

    async def switch_alias_out(
        self,
        *,
        project_id: UUID,
        alias_key: str,
        payload: ProjectEnvironmentAliasSwitchIn,
        actor_user_id: UUID | None,
    ) -> ProjectEnvironmentAliasOut:
        normalized_alias = alias_key.strip()
        if not normalized_alias:
            raise BadRequest(_te("PROJECT_ENVIRONMENT_ALIAS_REQUIRED"), error="PROJECT_ENVIRONMENT_ALIAS_REQUIRED")

        if payload.target_environment_id is not None:
            target = await self.resolve_environment_target(project_id=project_id, target=payload.target_environment_id)
        elif payload.target_environment_key is not None:
            target = await self.resolve_environment_target(project_id=project_id, target=payload.target_environment_key)
        else:
            raise BadRequest(
                _te("PROJECT_ENVIRONMENT_ALIAS_TARGET_REQUIRED"),
                error="PROJECT_ENVIRONMENT_ALIAS_TARGET_REQUIRED",
            )

        async with self._transaction_connection() as conn:
            alias = (
                await ProjectEnvironmentAliasRecord
                .filter(project_id=project_id, key=normalized_alias)
                .using_db(conn)
                .select_for_update()
                .first()
            )
            if alias is None:
                raise NotFound(_te("PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND"), error="PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND")
            alias.target_environment_id = target.id
            alias.switched_by_user_id = actor_user_id
            alias.switched_at = datetime.now(UTC)
            await alias.save(
                using_db=conn,
                update_fields=["target_environment_id", "switched_by_user_id", "switched_at", "updated_at"],
            )

        aliases = await self._list_aliases(project_id=project_id)
        for item in aliases:
            if str(item.key) == normalized_alias:
                return self._alias_out(item)
        raise NotFound(_te("PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND"), error="PROJECT_ENVIRONMENT_ALIAS_NOT_FOUND")

    async def clone_environment_out(
        self,
        *,
        project_id: UUID,
        payload: ProjectEnvironmentCloneIn,
    ) -> ProjectEnvironmentCopyOut:
        source = await self.resolve_environment_target(project_id=project_id, target=payload.source)
        target = await self.resolve_environment_target(project_id=project_id, target=payload.target)
        counts = await self._copy_environment(
            project_id=project_id,
            source_environment_id=source.id,
            target_environment_id=target.id,
            include_content=payload.include_content,
            require_empty_target=True,
        )
        return ProjectEnvironmentCopyOut.model_validate({
            "source_environment_id": source.id,
            "target_environment_id": target.id,
            "content_models": counts.content_models,
            "content_items": counts.content_items,
            "content_versions": counts.content_versions,
            "route_bindings": counts.route_bindings,
            "releases": counts.releases,
        })

    async def promote_environment_out(
        self,
        *,
        project_id: UUID,
        payload: ProjectEnvironmentPromoteIn,
    ) -> ProjectEnvironmentCopyOut:
        source = await self.resolve_environment_target(project_id=project_id, target=payload.source)
        target = await self.resolve_environment_target(project_id=project_id, target=payload.target)
        counts = await self._copy_environment(
            project_id=project_id,
            source_environment_id=source.id,
            target_environment_id=target.id,
            include_content=payload.include_content,
            require_empty_target=False,
        )
        return ProjectEnvironmentCopyOut.model_validate({
            "source_environment_id": source.id,
            "target_environment_id": target.id,
            "content_models": counts.content_models,
            "content_items": counts.content_items,
            "content_versions": counts.content_versions,
            "route_bindings": counts.route_bindings,
            "releases": counts.releases,
        })

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

    async def _list_aliases(self, *, project_id: UUID) -> list[ProjectEnvironmentAliasRecord]:
        async with self._operation_connection() as conn:
            rows = await self._using_db(
                ProjectEnvironmentAliasRecord
                .filter(project_id=project_id)
                .prefetch_related("target_environment")
                .order_by("key", "id"),
                conn,
            ).all()
        return list(rows)

    @staticmethod
    def _environment_out(record: ProjectEnvironmentRecord) -> ProjectEnvironmentOut:
        return ProjectEnvironmentOut.model_validate({
            "id": record.id,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
            "project_id": record.project_id,
            "key": str(record.key),
            "name": str(record.name),
            "is_production": bool(record.is_production),
            "is_default_preview": bool(record.is_default_preview),
            "created_by_user_id": record.created_by_user_id,
        })

    @staticmethod
    def _alias_out(record: ProjectEnvironmentAliasRecord) -> ProjectEnvironmentAliasOut:
        target = record.target_environment
        return ProjectEnvironmentAliasOut.model_validate({
            "id": record.id,
            "project_id": record.project_id,
            "key": str(record.key),
            "name": str(record.name),
            "target_environment_id": target.id,
            "target_environment_key": str(target.key),
            "target_environment_name": str(target.name),
            "created_by_user_id": record.created_by_user_id,
            "switched_by_user_id": record.switched_by_user_id,
            "switched_at": record.switched_at,
            "created_at": record.created_at,
            "updated_at": record.updated_at,
        })

    async def _copy_environment(
        self,
        *,
        project_id: UUID,
        source_environment_id: UUID,
        target_environment_id: UUID,
        include_content: bool,
        require_empty_target: bool,
    ) -> EnvironmentCopyCounts:
        if source_environment_id == target_environment_id:
            raise Conflict(
                "Source and target environments must be different",
                error="PROJECT_ENVIRONMENT_COPY_TARGET_REQUIRED",
            )

        async with self._transaction_connection() as conn:
            repo = self._copy_repository()
            target_models, target_items = await repo.count_target_content(
                target_environment_id=target_environment_id,
                conn=conn,
            )
            if require_empty_target and (target_models > 0 or target_items > 0):
                raise Conflict(
                    "Target environment already contains content",
                    error="PROJECT_ENVIRONMENT_TARGET_NOT_EMPTY",
                    meta={"contentModels": target_models, "contentItems": target_items},
                )
            await repo.clear_environment_content(target_environment_id=target_environment_id, conn=conn)
            try:
                return await repo.copy_environment_content(
                    project_id=project_id,
                    source_environment_id=source_environment_id,
                    target_environment_id=target_environment_id,
                    include_content=include_content,
                    conn=conn,
                )
            except IntegrityError as exc:
                raise Conflict(
                    "Environment copy failed because target records conflict",
                    error="PROJECT_ENVIRONMENT_COPY_CONFLICT",
                ) from exc

    def _copy_repository(self) -> ProjectEnvironmentsRepository:
        context = self._current_tenant_context()
        if context is None:
            raise BadRequest(
                _te("TENANT_CONTEXT_REQUIRED"),
                error="TENANT_CONTEXT_REQUIRED",
            )
        return ProjectEnvironmentsRepository(context)
