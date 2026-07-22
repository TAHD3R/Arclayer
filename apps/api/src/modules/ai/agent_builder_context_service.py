from __future__ import annotations

from typing import cast
from uuid import UUID

import orjson
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.types.json_types import JsonObject, JsonValue
from src.core.exceptions import Conflict
from src.modules.ai.agent_builder_context_schema import (
    AgentRunBuilderContextInputV1,
    AgentRunBuilderContextV1,
)
from src.modules.projects.builder.manifest import parse_site_revision_manifest
from src.modules.projects.builder.repository import SiteBuilderRepository
from src.modules.projects.builder.schema import ContentStructureSnapshotV1
from src.modules.projects.builder.snapshot import canonical_hash


class AgentBuilderContextError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AgentBuilderContextResolver:
    def __init__(self, *, repository: SiteBuilderRepository) -> None:
        self._repository = repository

    async def resolve_run_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        site_revision_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunBuilderContextInputV1:
        record = await self._repository.get_site_revision(
            project_id=project_id,
            revision_id=site_revision_id,
            conn=conn,
            for_update=True,
        )
        if record is None or record.workspace_id != workspace_id:
            raise AgentBuilderContextError("AGENT_BUILDER_SITE_REVISION_NOT_FOUND")
        latest = await self._repository.get_latest_site_revision(
            project_id=project_id,
            site_id=record.site_id,
            environment_id=record.environment_id,
            conn=conn,
            for_update=True,
        )
        if latest is None or latest.id != record.id:
            raise AgentBuilderContextError("AGENT_BUILDER_SITE_REVISION_STALE")
        status = await self._repository.get_status(
            site_revision_id=record.id,
            conn=conn,
            for_update=True,
        )
        structure = await self._repository.get_structure_revision(
            project_id=project_id,
            revision_id=record.content_structure_revision_id,
            conn=conn,
        )
        if status is None or structure is None:
            raise AgentBuilderContextError("AGENT_BUILDER_CONTEXT_INVALID")
        try:
            manifest = parse_site_revision_manifest(record)
            structure_snapshot = ContentStructureSnapshotV1.model_validate(structure.structure_snapshot)
        except (Conflict, ValueError) as error:
            raise AgentBuilderContextError("AGENT_BUILDER_CONTEXT_INVALID") from error
        structure_hash = canonical_hash(cast(JsonValue, structure_snapshot.model_dump(mode="json", by_alias=True)))
        if (
            manifest.id != record.id
            or manifest.workspace_id != workspace_id
            or manifest.project_id != project_id
            or manifest.site_id != record.site_id
            or manifest.environment_id != record.environment_id
            or manifest.manifest_hash != record.manifest_hash
            or manifest.content_structure_revision_id != structure.id
            or manifest.content_structure_hash != structure.structure_hash
            or structure_hash != structure.structure_hash
            or structure.workspace_id != workspace_id
            or structure.site_id != record.site_id
            or structure.environment_id != record.environment_id
            or status.site_revision_id != record.id
        ):
            raise AgentBuilderContextError("AGENT_BUILDER_CONTEXT_INVALID")
        payload: JsonObject = {
            "contextVersion": 1,
            "workspaceId": str(workspace_id),
            "projectId": str(project_id),
            "siteId": str(record.site_id),
            "environmentId": str(record.environment_id),
            "siteRevisionId": str(record.id),
            "revisionNumber": record.revision_number,
            "manifestHash": record.manifest_hash,
            "statusEtag": status.etag,
            "contentStructureRevisionId": str(structure.id),
            "contentStructureHash": structure.structure_hash,
            "manifest": cast(JsonObject, manifest.model_dump(mode="json", by_alias=True)),
            "contentStructure": cast(JsonObject, structure_snapshot.model_dump(mode="json", by_alias=True)),
        }
        context_hash = canonical_hash(cast(JsonValue, payload))
        context = AgentRunBuilderContextV1.model_validate({**payload, "contextHash": context_hash})
        serialized = orjson.dumps(context.model_dump(mode="json", by_alias=True), option=orjson.OPT_SORT_KEYS)
        return AgentRunBuilderContextInputV1(context=context, context_byte_size=len(serialized))
