from __future__ import annotations

from typing import cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.constants.events import (
    SYSTEM_AGENT_ASSIGNMENT_CREATED,
    SYSTEM_AGENT_ASSIGNMENT_UPDATED,
)
from src.core.http.pagination import PageData, PageParams
from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentLifecycleState,
    AgentVersionRecord,
)
from src.models.workspaces.workspace import Workspace
from src.modules.ai.agent_catalog_manifest import OFFICIAL_AGENT_SPEC_BY_ID
from src.modules.ai.agent_skill_grant_service import AgentSkillGrantError
from src.modules.system.agents.projection import SystemAgentProjectionError, project_assignment
from src.modules.system.agents.schema import (
    SystemAgentAssignmentCreateRequest,
    SystemAgentAssignmentOut,
    SystemAgentAssignmentUpdateRequest,
)
from src.modules.system.agents.service_base import SystemAgentServiceBase, page_data


class SystemAgentAssignmentService(SystemAgentServiceBase):
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

    async def create_assignment(
        self,
        *,
        payload: SystemAgentAssignmentCreateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentAssignmentOut:
        async with self.tx() as conn:
            definition = await self._require_definition_for_update(
                definition_id=payload.agent_id,
                conn=conn,
            )
            workspace = await self._require_assignment_scope(payload=payload, conn=conn)
            version = await self._require_assignment_version(
                definition=definition,
                version_id=payload.version_id,
                conn=conn,
            )
            await self._validate_version_skill_grants(workspace=workspace, version=version)
            self._validate_assignment_state(
                definition=definition,
                enabled=payload.enabled,
                is_default=payload.is_default,
            )
            if await self._repository.assignment_exists(
                workspace_id=payload.workspace_id,
                project_id=payload.project_id,
                definition_id=payload.agent_id,
                conn=conn,
            ):
                self._raise_conflict("AGENT_ASSIGNMENT_EXISTS")
            if payload.is_default:
                await self._repository.clear_default_assignments(
                    workspace_id=payload.workspace_id,
                    project_id=payload.project_id,
                    except_assignment_id=None,
                    conn=conn,
                )
            assignment = await self._repository.create_assignment(
                values=_assignment_values(
                    payload=payload,
                    version_id=version.id,
                    actor_user_id=actor_user_id,
                ),
                conn=conn,
            )
            await self._write_assignment_activity(
                event_name=SYSTEM_AGENT_ASSIGNMENT_CREATED,
                actor_user_id=actor_user_id,
                assignment=assignment,
                conn=conn,
            )
        return await self._get_assignment_out(assignment_id=assignment.id)

    async def update_assignment(
        self,
        *,
        assignment_id: UUID,
        payload: SystemAgentAssignmentUpdateRequest,
        actor_user_id: UUID,
    ) -> SystemAgentAssignmentOut:
        async with self.tx() as conn:
            assignment = await self._repository.get_assignment_for_update(
                assignment_id=assignment_id,
                conn=conn,
            )
            if assignment is None:
                self._raise_not_found("AGENT_ASSIGNMENT_NOT_FOUND")
            definition = await self._require_definition_for_update(
                definition_id=assignment.definition_id,
                conn=conn,
            )
            workspace = await self._repository.get_workspace(
                workspace_id=assignment.workspace_id,
                conn=conn,
            )
            if workspace is None:
                self._raise_not_found("AGENT_WORKSPACE_NOT_FOUND")
            next_enabled = payload.enabled if payload.enabled is not None else assignment.enabled
            next_default = payload.is_default if payload.is_default is not None else assignment.is_default
            self._validate_assignment_state(
                definition=definition,
                enabled=next_enabled,
                is_default=next_default,
            )
            changed, version = await self._apply_assignment_update(
                assignment=assignment,
                definition=definition,
                payload=payload,
                conn=conn,
            )
            await self._validate_version_skill_grants(workspace=workspace, version=version)
            if next_default:
                await self._repository.clear_default_assignments(
                    workspace_id=assignment.workspace_id,
                    project_id=assignment.project_id,
                    except_assignment_id=assignment.id,
                    conn=conn,
                )
            if changed:
                unique_fields = tuple(dict.fromkeys(changed))
                await self._repository.save_assignment(
                    assignment=assignment,
                    update_fields=unique_fields,
                    conn=conn,
                )
                await self._write_assignment_activity(
                    event_name=SYSTEM_AGENT_ASSIGNMENT_UPDATED,
                    actor_user_id=actor_user_id,
                    assignment=assignment,
                    conn=conn,
                    fields=unique_fields,
                )
        return await self._get_assignment_out(assignment_id=assignment_id)

    async def _require_assignment_scope(
        self,
        *,
        payload: SystemAgentAssignmentCreateRequest,
        conn: BaseDBAsyncClient,
    ) -> Workspace:
        workspace = await self._repository.get_workspace(
            workspace_id=payload.workspace_id,
            conn=conn,
        )
        if workspace is None:
            self._raise_not_found("AGENT_WORKSPACE_NOT_FOUND")
        if payload.project_id is None:
            return workspace
        project = await self._repository.get_project(
            workspace_id=payload.workspace_id,
            project_id=payload.project_id,
            conn=conn,
        )
        if project is None:
            self._raise_not_found("AGENT_PROJECT_NOT_FOUND")
        return workspace

    async def _require_assignment_version(
        self,
        *,
        definition: AgentDefinitionRecord,
        version_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentVersionRecord:
        version = await self._repository.get_published_version(
            definition_id=definition.id,
            version_id=version_id,
            conn=conn,
        )
        if version is None:
            self._raise_not_found("AGENT_VERSION_NOT_FOUND")
        if definition.is_official:
            official = OFFICIAL_AGENT_SPEC_BY_ID.get(definition.id)
            if official is None or official.version_id != version.id:
                self._raise_conflict("AGENT_OFFICIAL_VERSION_PROTECTED")
        return version

    async def _apply_assignment_update(
        self,
        *,
        assignment: AgentAssignmentRecord,
        definition: AgentDefinitionRecord,
        payload: SystemAgentAssignmentUpdateRequest,
        conn: BaseDBAsyncClient,
    ) -> tuple[list[str], AgentVersionRecord]:
        changed: list[str] = []
        version = await self._require_assignment_version(
            definition=definition,
            version_id=payload.version_id or assignment.version_id,
            conn=conn,
        )
        if payload.version_id is not None and payload.version_id != assignment.version_id:
            assignment.version_id = version.id
            changed.append("version_id")
        for field_name in ("enabled", "is_default", "is_pinned", "sort_order"):
            if field_name not in payload.model_fields_set:
                continue
            value = getattr(payload, field_name)
            if getattr(assignment, field_name) == value:
                continue
            setattr(assignment, field_name, value)
            changed.append(field_name)
        return changed, version

    async def _validate_version_skill_grants(
        self,
        *,
        workspace: Workspace,
        version: AgentVersionRecord,
    ) -> None:
        try:
            raw_installation_ids = cast(list[object], version.skill_installation_ids)
            raw_tool_grants = cast(list[object], version.tool_grants)
            if not isinstance(raw_installation_ids, list) or not isinstance(raw_tool_grants, list):
                raise TypeError
            if any(not isinstance(value, str) or not value for value in raw_installation_ids):
                raise TypeError
            installation_ids = tuple(UUID(cast(str, value)) for value in raw_installation_ids)
            if any(not isinstance(value, str) or not value for value in raw_tool_grants):
                raise TypeError
            tool_grants = tuple(cast(list[str], raw_tool_grants))
        except (TypeError, ValueError):
            self._raise_conflict("AGENT_VERSION_INVALID")
        expected_workspace_id = workspace.id if installation_ids else None
        if version.skill_grant_workspace_id != expected_workspace_id:
            self._raise_conflict("AGENT_SKILL_WORKSPACE_MISMATCH")
        if not installation_ids:
            return
        try:
            await self._skill_grant_validator.validate(
                workspace_id=workspace.id,
                organization_id=workspace.organization_id,
                installation_ids=installation_ids,
                tool_grants=tool_grants,
            )
        except AgentSkillGrantError as error:
            self._raise_conflict(error.code)

    async def _get_assignment_out(self, *, assignment_id: UUID) -> SystemAgentAssignmentOut:
        assignment = await self._repository.get_assignment(assignment_id=assignment_id)
        if assignment is None:
            self._raise_not_found("AGENT_ASSIGNMENT_NOT_FOUND")
        try:
            return project_assignment(assignment)
        except SystemAgentProjectionError as error:
            self._raise_conflict(str(error))

    async def _write_assignment_activity(
        self,
        *,
        event_name: str,
        actor_user_id: UUID,
        assignment: AgentAssignmentRecord,
        conn: BaseDBAsyncClient,
        fields: tuple[str, ...] = (),
    ) -> None:
        await self._write_activity(
            event_name=event_name,
            actor_user_id=actor_user_id,
            workspace_id=assignment.workspace_id,
            project_id=assignment.project_id,
            entity_type="agent_assignment",
            entity_id=assignment.id,
            properties={
                "definitionId": str(assignment.definition_id),
                "versionId": str(assignment.version_id),
                "enabled": assignment.enabled,
                "isDefault": assignment.is_default,
                "isPinned": assignment.is_pinned,
                "fields": list(fields),
            },
            conn=conn,
        )

    @staticmethod
    def _validate_assignment_state(
        *,
        definition: AgentDefinitionRecord,
        enabled: bool,
        is_default: bool,
    ) -> None:
        if enabled and definition.lifecycle_state != AgentLifecycleState.ACTIVE:
            SystemAgentAssignmentService._raise_conflict("AGENT_DEFINITION_UNAVAILABLE")
        if is_default and not enabled:
            SystemAgentAssignmentService._raise_conflict("AGENT_DEFAULT_ASSIGNMENT_DISABLED")


def _assignment_values(
    *,
    payload: SystemAgentAssignmentCreateRequest,
    version_id: UUID,
    actor_user_id: UUID,
) -> dict[str, object]:
    return {
        "workspace_id": payload.workspace_id,
        "project_id": payload.project_id,
        "definition_id": payload.agent_id,
        "version_id": version_id,
        "assignment_key": _assignment_key(
            workspace_id=payload.workspace_id,
            project_id=payload.project_id,
            definition_id=payload.agent_id,
        ),
        "enabled": payload.enabled,
        "is_default": payload.is_default,
        "is_pinned": payload.is_pinned,
        "sort_order": payload.sort_order,
        "assigned_by_user_id": actor_user_id,
    }


def _assignment_key(*, workspace_id: UUID, project_id: UUID | None, definition_id: UUID) -> str:
    scope = f"project:{project_id}" if project_id is not None else "workspace"
    return f"{workspace_id}:{scope}:{definition_id}"
