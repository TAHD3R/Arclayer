from __future__ import annotations

from uuid import UUID

from src.core.http.pagination import PageData, PageParams
from src.modules.system.agents.projection import SystemAgentProjectionError, project_assignment
from src.modules.system.agents.schema import SystemAgentAssignmentOut
from src.modules.system.agents.service_base import SystemAgentServiceBase, page_data


class SystemAgentAssignmentService(SystemAgentServiceBase):
    """Read-only Platform projection of effective assistant assignments."""

    async def list_assignments(
        self,
        *,
        params: PageParams,
        workspace_id: UUID | None,
        project_id: UUID | None,
        definition_id: UUID | None,
        enabled: bool | None,
    ) -> PageData[SystemAgentAssignmentOut]:
        records, total = await self._repository.list_assignments(
            params=params,
            workspace_id=workspace_id,
            project_id=project_id,
            definition_id=definition_id,
            enabled=enabled,
        )
        try:
            items = tuple(project_assignment(record) for record in records)
        except SystemAgentProjectionError as error:
            self._raise_conflict(str(error))
        return page_data(items=items, total=total, params=params)
