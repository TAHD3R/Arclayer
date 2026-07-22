from __future__ import annotations

from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient

from src.models.design_systems._enums import DesignSystemOwnerKind, DesignSystemValidationStatus
from src.modules.ai.agent_design_system_context_schema import (
    AgentRunDesignSystemContextInputV1,
    AgentRunDesignSystemContextV1,
)
from src.modules.projects.design_systems.repository import ProjectDesignSystemsRepository
from src.modules.workspaces.design_systems.manifest import (
    DesignSystemManifestV1,
    design_system_content_digest,
)


class AgentDesignSystemContextError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AgentDesignSystemContextResolver:
    def __init__(self, *, repository: ProjectDesignSystemsRepository) -> None:
        self._repository = repository

    async def resolve_run_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunDesignSystemContextInputV1:
        assignment = await self._repository.get_assignment(
            project_id=project_id,
            conn=conn,
            for_update=True,
        )
        if assignment is None or assignment.workspace_id != workspace_id:
            raise AgentDesignSystemContextError("AGENT_DESIGN_SYSTEM_ASSIGNMENT_REQUIRED")
        system = await self._repository.get_system(
            workspace_id=workspace_id,
            system_id=assignment.design_system_id,
            conn=conn,
        )
        version = await self._repository.get_version(
            workspace_id=workspace_id,
            system_id=assignment.design_system_id,
            version_id=assignment.design_system_version_id,
            conn=conn,
        )
        validation = await self._repository.latest_validation(
            workspace_id=workspace_id,
            version_id=assignment.design_system_version_id,
            conn=conn,
        )
        if (
            system is None
            or version is None
            or validation is None
            or not _available_to_project(system.owner_kind, system.owning_project_id, project_id)
            or version.manifest_checksum != assignment.manifest_checksum
            or validation.finding_hash != assignment.validation_finding_hash
            or str(validation.status) != DesignSystemValidationStatus.VALID.value
        ):
            raise AgentDesignSystemContextError("AGENT_DESIGN_SYSTEM_SNAPSHOT_INVALID")
        manifest = DesignSystemManifestV1.model_validate(version.manifest)
        payload = {
            "contextVersion": 1,
            "projectId": str(project_id),
            "assignmentId": str(assignment.id),
            "assignmentRevision": assignment.metadata_revision,
            "designSystemId": str(system.id),
            "versionId": str(version.id),
            "ownerKind": str(system.owner_kind),
            "manifestChecksum": version.manifest_checksum,
            "validationFindingHash": validation.finding_hash,
            "tokenIndexHash": validation.token_index_hash,
            "manifest": manifest.model_dump(mode="json", by_alias=True),
            "validationFindings": validation.findings,
            "compatibility": validation.compatibility,
            "publishReady": False,
        }
        context_hash = design_system_content_digest(orjson.dumps(payload, option=orjson.OPT_SORT_KEYS))
        context = AgentRunDesignSystemContextV1.model_validate({**payload, "contextHash": context_hash})
        serialized = orjson.dumps(context.model_dump(mode="json", by_alias=True), option=orjson.OPT_SORT_KEYS)
        return AgentRunDesignSystemContextInputV1(context=context, context_byte_size=len(serialized))


def _available_to_project(
    owner_kind: DesignSystemOwnerKind,
    owning_project_id: UUID | None,
    project_id: UUID,
) -> bool:
    return (str(owner_kind) == DesignSystemOwnerKind.WORKSPACE.value and owning_project_id is None) or (
        str(owner_kind) == DesignSystemOwnerKind.PROJECT.value and owning_project_id == project_id
    )
