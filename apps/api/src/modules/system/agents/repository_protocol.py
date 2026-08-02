from __future__ import annotations

from collections.abc import Sequence
from typing import NamedTuple, Protocol
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.core.http.pagination import PageParams
from src.models.agents.catalog import AgentAssignmentRecord, AgentDefinitionRecord, AgentVersionRecord
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace


class AgentDefinitionBundle(NamedTuple):
    definition: AgentDefinitionRecord
    versions: tuple[AgentVersionRecord, ...]
    assignments: tuple[AgentAssignmentRecord, ...]
    version_usage: dict[UUID, AgentVersionUsage]


class AgentVersionUsage(NamedTuple):
    adoption_count: int
    failure_count: int


class SystemAgentRepositoryProtocol(Protocol):
    async def list_definition_bundles(
        self,
        *,
        params: PageParams,
        query: str | None,
        lifecycle_state: str | None,
        scope: str | None,
    ) -> tuple[tuple[AgentDefinitionBundle, ...], int]: ...

    async def get_definition_bundle(self, *, definition_id: UUID) -> AgentDefinitionBundle | None: ...

    async def get_definition_for_update(
        self, *, definition_id: UUID, conn: BaseDBAsyncClient
    ) -> AgentDefinitionRecord | None: ...

    async def definition_slug_exists(self, *, slug: str, conn: BaseDBAsyncClient) -> bool: ...

    async def create_definition(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> AgentDefinitionRecord: ...

    async def save_definition(
        self,
        *,
        definition: AgentDefinitionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def next_version_number(self, *, definition_id: UUID, conn: BaseDBAsyncClient) -> int: ...

    async def create_version(self, *, values: dict[str, object], conn: BaseDBAsyncClient) -> AgentVersionRecord: ...

    async def get_version_for_update(
        self,
        *,
        definition_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord | None: ...

    async def save_version(
        self,
        *,
        version: AgentVersionRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def has_enabled_assignment_for_version(self, *, version_id: UUID, conn: BaseDBAsyncClient) -> bool: ...

    async def get_definitions_by_ids(
        self, *, definition_ids: Sequence[UUID], conn: BaseDBAsyncClient
    ) -> dict[UUID, AgentDefinitionRecord]: ...

    async def get_workspace(self, *, workspace_id: UUID, conn: BaseDBAsyncClient) -> Workspace | None: ...

    async def get_project(
        self, *, workspace_id: UUID, project_id: UUID, conn: BaseDBAsyncClient
    ) -> ProjectRecord | None: ...

    async def get_published_version(
        self,
        *,
        definition_id: UUID,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord | None: ...

    async def assignment_exists(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> bool: ...

    async def create_assignment(
        self, *, values: dict[str, object], conn: BaseDBAsyncClient
    ) -> AgentAssignmentRecord: ...

    async def get_assignment_for_update(
        self, *, assignment_id: UUID, conn: BaseDBAsyncClient
    ) -> AgentAssignmentRecord | None: ...

    async def save_assignment(
        self,
        *,
        assignment: AgentAssignmentRecord,
        update_fields: Sequence[str],
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def clear_default_assignments(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        except_assignment_id: UUID | None,
        conn: BaseDBAsyncClient,
    ) -> None: ...

    async def get_assignment(self, *, assignment_id: UUID) -> AgentAssignmentRecord | None: ...

    async def list_assignments(
        self,
        *,
        params: PageParams,
        workspace_id: UUID | None,
        project_id: UUID | None,
        definition_id: UUID | None,
        enabled: bool | None,
    ) -> tuple[tuple[AgentAssignmentRecord, ...], int]: ...
