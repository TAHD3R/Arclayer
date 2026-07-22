from __future__ import annotations

from collections.abc import Awaitable, Callable
from math import ceil
from typing import NoReturn
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.exceptions import Conflict, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.agents.catalog import AgentDefinitionRecord
from src.modules.analytics.audit import ActivityAuditPayload
from src.modules.system.agents.repository_protocol import SystemAgentRepositoryProtocol
from src.modules.system.agents.skill_grant_validator import AgentVersionSkillGrantValidator

ActivityWriter = Callable[..., Awaitable[object]]


class SystemAgentServiceBase(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: SystemAgentRepositoryProtocol,
        activity_writer: ActivityWriter,
        skill_grant_validator: AgentVersionSkillGrantValidator,
    ) -> None:
        super().__init__(
            settings,
            event_publisher=None,
            default_event_source="system_agent_control_plane",
        )
        self._repository = repository
        self._activity_writer = activity_writer
        self._skill_grant_validator = skill_grant_validator

    async def _require_definition_for_update(
        self,
        *,
        definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentDefinitionRecord:
        definition = await self._repository.get_definition_for_update(
            definition_id=definition_id,
            conn=conn,
        )
        if definition is None:
            self._raise_not_found("AGENT_DEFINITION_NOT_FOUND")
        return definition

    async def _write_activity(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        properties: JsonObject,
        conn: BaseDBAsyncClient,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
    ) -> None:
        await self._activity_writer(
            settings=self.settings,
            payload=ActivityAuditPayload(
                event_name=event_name,
                actor_user_id=actor_user_id,
                workspace_id=workspace_id,
                project_id=project_id,
                entity_type=entity_type,
                entity_id=entity_id,
                source="api",
                properties=properties,
            ),
            conn=conn,
        )

    @staticmethod
    def _raise_not_found(code: str) -> NoReturn:
        raise NotFound(error=code, message=t("errors", code))

    @staticmethod
    def _raise_conflict(code: str) -> NoReturn:
        raise Conflict(error=code, message=t("errors", code))


def page_data[T](*, items: tuple[T, ...], total: int, params: PageParams) -> PageData[T]:
    pages = ceil(total / params.size) if total else 0
    return PageData[T](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=params.page + 1 if params.page < pages else None,
        prev=min(params.page - 1, pages) if pages and params.page > 1 else None,
    )
