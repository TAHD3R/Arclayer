from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.functions import Count

from src.core.http.pagination import PageParams
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.agents.runtime_v1 import AgentRunStatusV1, AgentRunV1Record
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.system.agents.repository_protocol import AgentDefinitionBundle, AgentVersionUsage


class SystemAgentRepository(TortoiseORMRepository[AgentDefinitionRecord]):
    async def list_definition_bundles(
        self,
        *,
        params: PageParams,
        query: str | None,
        lifecycle_state: str | None,
        scope: str | None,
    ) -> tuple[tuple[AgentDefinitionBundle, ...], int]:
        queryset = AgentDefinitionRecord.all()
        if query:
            queryset = queryset.filter(
                Q(display_name__icontains=query)
                | Q(slug__icontains=query)
                | Q(role__icontains=query)
                | Q(description__icontains=query)
            )
        if lifecycle_state is not None:
            queryset = queryset.filter(lifecycle_state=lifecycle_state)
        if scope is not None:
            queryset = queryset.filter(scope=scope)
        total = await queryset.count()
        definitions = (
            await queryset.order_by("-is_official", "display_name", "id").offset(params.offset).limit(params.limit)
        )
        return await self._bundles(definitions), total

    async def get_definition_bundle(self, *, definition_id: UUID) -> AgentDefinitionBundle | None:
        definition = await AgentDefinitionRecord.get_or_none(id=definition_id)
        if definition is None:
            return None
        bundles = await self._bundles((definition,))
        return bundles[0]

    @staticmethod
    async def get_definition_for_update(
        *, definition_id: UUID, conn: BaseDBAsyncClient
    ) -> AgentDefinitionRecord | None:
        return await AgentDefinitionRecord.filter(id=definition_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def definition_slug_exists(*, slug: str, conn: BaseDBAsyncClient) -> bool:
        return await AgentDefinitionRecord.filter(scope="system", slug=slug).using_db(conn).exists()

    @staticmethod
    async def create_definition(*, values: dict[str, object], conn: BaseDBAsyncClient) -> AgentDefinitionRecord:
        return await AgentDefinitionRecord.create(using_db=conn, **values)

    @staticmethod
    async def save_definition(
        *,
        definition: AgentDefinitionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        await definition.save(using_db=conn, update_fields=[*update_fields, "updated_at"])

    @staticmethod
    async def next_version_number(*, definition_id: UUID, conn: BaseDBAsyncClient) -> int:
        latest = (
            await AgentVersionRecord
            .filter(definition_id=definition_id)
            .using_db(conn)
            .order_by("-version_number")
            .first()
        )
        return 1 if latest is None else latest.version_number + 1

    @staticmethod
    async def create_version(*, values: dict[str, object], conn: BaseDBAsyncClient) -> AgentVersionRecord:
        return await AgentVersionRecord.create(using_db=conn, **values)

    @staticmethod
    async def get_version_for_update(
        *,
        definition_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord | None:
        return (
            await AgentVersionRecord
            .filter(
                id=version_id,
                definition_id=definition_id,
            )
            .using_db(conn)
            .select_for_update()
            .first()
        )

    @staticmethod
    async def save_version(
        *,
        version: AgentVersionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        await version.save(using_db=conn, update_fields=[*update_fields, "updated_at"])

    @staticmethod
    async def has_enabled_assignment_for_version(*, version_id: UUID, conn: BaseDBAsyncClient) -> bool:
        return await AgentAssignmentRecord.filter(version_id=version_id, enabled=True).using_db(conn).exists()

    @staticmethod
    async def get_definitions_by_ids(
        *, definition_ids: Sequence[UUID], conn: BaseDBAsyncClient
    ) -> dict[UUID, AgentDefinitionRecord]:
        records = await AgentDefinitionRecord.filter(id__in=definition_ids).using_db(conn)
        return {record.id: record for record in records}

    @staticmethod
    async def get_workspace(*, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None:
        return (
            await Workspace
            .filter(
                id=workspace_id,
                is_active=True,
                archived_at=None,
                deleted_at=None,
            )
            .using_db(conn)
            .first()
        )

    @staticmethod
    async def get_project(*, workspace_id: UUID, project_id: UUID, conn: BaseDBAsyncClient) -> ProjectRecord | None:
        return (
            await ProjectRecord
            .filter(
                id=project_id,
                workspace_id=workspace_id,
                is_active=True,
            )
            .using_db(conn)
            .first()
        )

    @staticmethod
    async def get_published_version(
        *,
        definition_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord | None:
        return (
            await AgentVersionRecord
            .filter(
                id=version_id,
                definition_id=definition_id,
                state=AgentVersionState.PUBLISHED,
            )
            .using_db(conn)
            .first()
        )

    @staticmethod
    async def assignment_exists(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool:
        return (
            await AgentAssignmentRecord
            .filter(
                workspace_id=workspace_id,
                project_id=project_id,
                definition_id=definition_id,
            )
            .using_db(conn)
            .exists()
        )

    @staticmethod
    async def create_assignment(*, values: dict[str, object], conn: BaseDBAsyncClient) -> AgentAssignmentRecord:
        return await AgentAssignmentRecord.create(using_db=conn, **values)

    @staticmethod
    async def get_assignment_for_update(
        *, assignment_id: UUID, conn: BaseDBAsyncClient
    ) -> AgentAssignmentRecord | None:
        return await AgentAssignmentRecord.filter(id=assignment_id).using_db(conn).select_for_update().first()

    @staticmethod
    async def save_assignment(
        *,
        assignment: AgentAssignmentRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None:
        await assignment.save(using_db=conn, update_fields=[*update_fields, "updated_at"])

    @staticmethod
    async def clear_default_assignments(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        except_assignment_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> None:
        queryset = AgentAssignmentRecord.filter(
            workspace_id=workspace_id,
            project_id=project_id,
            is_default=True,
        ).using_db(conn)
        if except_assignment_id is not None:
            queryset = queryset.exclude(id=except_assignment_id)
        await queryset.update(is_default=False)

    @staticmethod
    async def get_assignment(*, assignment_id: UUID) -> AgentAssignmentRecord | None:
        return (
            await AgentAssignmentRecord
            .filter(id=assignment_id)
            .select_related("workspace", "project", "definition", "version")
            .first()
        )

    @staticmethod
    async def list_assignments(
        *,
        params: PageParams,
        workspace_id: UUID | None,
        project_id: UUID | None,
        definition_id: UUID | None,
        enabled: bool | None,
    ) -> tuple[tuple[AgentAssignmentRecord, ...], int]:
        queryset = AgentAssignmentRecord.all()
        if workspace_id is not None:
            queryset = queryset.filter(workspace_id=workspace_id)
        if project_id is not None:
            queryset = queryset.filter(project_id=project_id)
        if definition_id is not None:
            queryset = queryset.filter(definition_id=definition_id)
        if enabled is not None:
            queryset = queryset.filter(enabled=enabled)
        total = await queryset.count()
        records = (
            await queryset
            .select_related("workspace", "project", "definition", "version")
            .order_by("workspace__name", "project_id", "sort_order", "id")
            .offset(params.offset)
            .limit(params.limit)
        )
        return tuple(records), total

    @staticmethod
    async def _bundles(
        definitions: Sequence[AgentDefinitionRecord],
    ) -> tuple[AgentDefinitionBundle, ...]:
        definition_ids = [definition.id for definition in definitions]
        if not definition_ids:
            return ()
        versions = await AgentVersionRecord.filter(definition_id__in=definition_ids).order_by(
            "definition_id", "-version_number"
        )
        version_usage = await SystemAgentRepository._version_usage(versions=versions)
        assignments = (
            await AgentAssignmentRecord
            .filter(definition_id__in=definition_ids)
            .select_related("workspace", "project", "definition", "version")
            .order_by("definition_id", "workspace__name", "project_id", "sort_order", "id")
        )
        versions_by_definition: dict[UUID, list[AgentVersionRecord]] = {}
        for version in versions:
            versions_by_definition.setdefault(version.definition_id, []).append(version)
        assignments_by_definition: dict[UUID, list[AgentAssignmentRecord]] = {}
        for assignment in assignments:
            assignments_by_definition.setdefault(assignment.definition_id, []).append(assignment)
        return tuple(
            AgentDefinitionBundle(
                definition=definition,
                versions=tuple(versions_by_definition.get(definition.id, ())),
                assignments=tuple(assignments_by_definition.get(definition.id, ())),
                version_usage=version_usage,
            )
            for definition in definitions
        )

    @staticmethod
    async def _version_usage(*, versions: Sequence[AgentVersionRecord]) -> dict[UUID, AgentVersionUsage]:
        version_ids = tuple(version.id for version in versions)
        if not version_ids:
            return {}
        adoptions = await (
            AgentRunV1Record
            .filter(lead_agent_version_id__in=version_ids)
            .group_by("lead_agent_version_id")
            .annotate(count=Count("id"))
            .values("lead_agent_version_id", "count")
        )
        failures = await (
            AgentRunV1Record
            .filter(
                lead_agent_version_id__in=version_ids,
                status=AgentRunStatusV1.FAILED,
            )
            .group_by("lead_agent_version_id")
            .annotate(count=Count("id"))
            .values("lead_agent_version_id", "count")
        )
        adoption_counts = {UUID(str(row["lead_agent_version_id"])): int(row["count"]) for row in adoptions}
        failure_counts = {UUID(str(row["lead_agent_version_id"])): int(row["count"]) for row in failures}
        return {
            version_id: AgentVersionUsage(
                adoption_count=adoption_counts.get(version_id, 0),
                failure_count=failure_counts.get(version_id, 0),
            )
            for version_id in version_ids
        }
