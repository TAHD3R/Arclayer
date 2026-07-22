from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, cast
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from src.models.agents.catalog import (
    AgentAssignmentRecord,
    AgentDefinitionRecord,
    AgentDefinitionScope,
    AgentLifecycleState,
    AgentVersionRecord,
    AgentVersionState,
)
from src.models.agents.runtime_v1 import AgentRunV1Record, AgentThreadV1Record
from src.modules.ai.agent_catalog_manifest import (
    OFFICIAL_AGENT_SPECS,
    OfficialAgentSpec,
    official_agent_version_number,
)
from src.modules.ai.agent_catalog_schema import ResolvedAgentAssignment

ExecutionMode = Literal["plan", "build"]

_LEGACY_AGENT_TARGETS = {
    "content_analyzer": "data-analyst",
    "content_advisor": "arclayer-coordinator",
    "content_builder": "arclayer-coordinator",
    "content_model_advisor": "site-architect",
}


class AgentCatalogRepositoryError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class AgentCatalogRepository:
    async def reconcile_official(self, *, workspace_id: UUID) -> None:
        async with in_transaction() as conn:
            assignments: dict[UUID, AgentAssignmentRecord] = {}
            for spec in OFFICIAL_AGENT_SPECS:
                definition = await self._sync_definition(spec=spec, conn=conn)
                version = await self._sync_version(spec=spec, definition=definition, conn=conn)
                assignment = await self._sync_assignment(
                    workspace_id=workspace_id,
                    spec=spec,
                    definition=definition,
                    version=version,
                    conn=conn,
                )
                assignments[definition.id] = assignment
            await self._backfill_runtime_snapshots(
                workspace_id=workspace_id,
                assignments=assignments,
                conn=conn,
            )

    @staticmethod
    async def mark_used(*, assignment_id: UUID, conn: BaseDBAsyncClient | None = None) -> None:
        await AgentAssignmentRecord.filter(id=assignment_id).using_db(conn).update(last_used_at=datetime.now(UTC))

    @staticmethod
    async def effective_assignments(*, workspace_id: UUID, project_id: UUID | None) -> list[AgentAssignmentRecord]:
        scope = Q(project_id=None)
        if project_id is not None:
            scope |= Q(project_id=project_id)
        records = (
            await AgentAssignmentRecord
            .filter(workspace_id=workspace_id)
            .filter(scope)
            .select_related("definition", "version")
        )
        by_definition: dict[UUID, AgentAssignmentRecord] = {}
        for record in records:
            current = by_definition.get(record.definition_id)
            if current is None or (current.project_id is None and record.project_id is not None):
                by_definition[record.definition_id] = record
        return sorted(by_definition.values(), key=_assignment_sort_key)

    @staticmethod
    async def find_effective_assignment(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        agent_id: UUID,
        conn: BaseDBAsyncClient | None,
    ) -> AgentAssignmentRecord | None:
        scope = Q(project_id=None)
        if project_id is not None:
            scope |= Q(project_id=project_id)
        records = (
            await AgentAssignmentRecord
            .filter(
                workspace_id=workspace_id,
                definition_id=agent_id,
            )
            .filter(scope)
            .using_db(conn)
            .select_related("definition", "version")
        )
        return next((record for record in records if record.project_id == project_id), None) or next(
            iter(records), None
        )

    @staticmethod
    async def get_snapshot_assignment(
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        agent_id: UUID,
        version_id: UUID,
        assignment_id: UUID,
    ) -> AgentAssignmentRecord | None:
        assignment = (
            await AgentAssignmentRecord
            .filter(
                id=assignment_id,
                workspace_id=workspace_id,
                definition_id=agent_id,
                version_id=version_id,
            )
            .select_related("definition", "version")
            .first()
        )
        if assignment is None or assignment.project_id not in {None, project_id}:
            return None
        return assignment

    @staticmethod
    async def resolve_record(assignment: AgentAssignmentRecord) -> ResolvedAgentAssignment:
        if not hasattr(assignment, "definition") or not hasattr(assignment, "version"):
            await assignment.fetch_related("definition", "version")
        version = cast(AgentVersionRecord, assignment.version)
        return ResolvedAgentAssignment(
            assignment_id=assignment.id,
            agent_id=assignment.definition_id,
            version_id=assignment.version_id,
            version_number=version.version_number,
            supported_execution_modes=_execution_modes(version.supported_execution_modes),
            tool_grants=tuple(_string_list(version.tool_grants)),
            skill_grant_workspace_id=version.skill_grant_workspace_id,
            skill_installation_ids=_uuid_tuple(version.skill_installation_ids),
            delegation_agent_ids=_uuid_tuple(version.delegation_definition_ids),
            instructions=version.instructions,
        )

    @staticmethod
    async def _sync_definition(*, spec: OfficialAgentSpec, conn: BaseDBAsyncClient) -> AgentDefinitionRecord:
        values = {
            "workspace_id": None,
            "stable_key": f"system:{spec.slug}",
            "scope": AgentDefinitionScope.SYSTEM,
            "slug": spec.slug,
            "display_name": spec.display_name,
            "name_i18n_key": f"AI_AGENT_{spec.slug.upper().replace('-', '_')}_NAME",
            "role": spec.role,
            "role_i18n_key": f"AI_AGENT_ROLE_{spec.role.upper()}",
            "description": spec.description,
            "description_i18n_key": f"AI_AGENT_{spec.slug.upper().replace('-', '_')}_DESC",
            "avatar_url": None,
            "lifecycle_state": AgentLifecycleState.ACTIVE,
            "is_official": True,
            "created_by_user_id": None,
        }
        definition, created = await AgentDefinitionRecord.get_or_create(
            id=spec.agent_id,
            defaults=values,
            using_db=conn,
        )
        if created:
            return definition
        if definition.stable_key != values["stable_key"] or not definition.is_official:
            raise AgentCatalogRepositoryError("AGENT_OFFICIAL_CATALOG_DRIFT")
        changed = [key for key, value in values.items() if getattr(definition, key) != value]
        for key in changed:
            setattr(definition, key, values[key])
        if changed:
            await definition.save(using_db=conn, update_fields=changed)
        return definition

    @staticmethod
    async def _sync_version(
        *, spec: OfficialAgentSpec, definition: AgentDefinitionRecord, conn: BaseDBAsyncClient
    ) -> AgentVersionRecord:
        values = {
            "definition_id": definition.id,
            "version_number": spec.version_number,
            "state": AgentVersionState.PUBLISHED,
            "instructions": spec.instructions,
            "model_policy": {"routingPolicy": "workspace_default"},
            "supported_execution_modes": list(spec.supported_execution_modes),
            "tool_grants": list(spec.tool_grants),
            "skill_grant_workspace_id": None,
            "skill_installation_ids": [],
            "knowledge_base_ids": [],
            "delegation_definition_ids": [str(item.agent_id) for item in _delegation_specs(spec)],
            "approval_profile": {"profileId": spec.approval_profile},
            "compatibility": {"agentRuntimeProtocol": 1},
            "provenance": {"kind": "arclayer_official", "manifestVersion": 1},
            "content_checksum": spec.content_checksum,
            "published_at": datetime.now(UTC),
            "created_by_user_id": None,
        }
        version, created = await AgentVersionRecord.get_or_create(
            id=spec.version_id,
            defaults=values,
            using_db=conn,
        )
        if created:
            return version
        if (
            version.definition_id != definition.id
            or version.version_number != spec.version_number
            or version.content_checksum != spec.content_checksum
        ):
            raise AgentCatalogRepositoryError("AGENT_OFFICIAL_CATALOG_DRIFT")
        return version

    @staticmethod
    async def _sync_assignment(
        *,
        workspace_id: UUID,
        spec: OfficialAgentSpec,
        definition: AgentDefinitionRecord,
        version: AgentVersionRecord,
        conn: BaseDBAsyncClient,
    ) -> AgentAssignmentRecord:
        assignment, created = await AgentAssignmentRecord.get_or_create(
            assignment_key=f"{workspace_id}:workspace:{definition.id}",
            defaults={
                "workspace_id": workspace_id,
                "project_id": None,
                "definition_id": definition.id,
                "version_id": version.id,
                "enabled": True,
                "is_default": spec.is_default,
                "is_pinned": spec.is_pinned,
                "sort_order": spec.sort_order,
                "assigned_by_user_id": None,
            },
            using_db=conn,
        )
        if created:
            return assignment
        if (
            assignment.workspace_id != workspace_id
            or assignment.project_id is not None
            or assignment.definition_id != definition.id
        ):
            raise AgentCatalogRepositoryError("AGENT_OFFICIAL_CATALOG_DRIFT")
        if assignment.version_id == version.id:
            return assignment
        assigned_version_number = official_agent_version_number(spec.slug, assignment.version_id)
        if assigned_version_number is None or assigned_version_number >= spec.version_number:
            raise AgentCatalogRepositoryError("AGENT_OFFICIAL_CATALOG_DRIFT")
        assignment.version_id = version.id
        await assignment.save(using_db=conn, update_fields=["version_id"])
        return assignment

    @staticmethod
    async def _backfill_runtime_snapshots(
        *,
        workspace_id: UUID,
        assignments: dict[UUID, AgentAssignmentRecord],
        conn: BaseDBAsyncClient,
    ) -> None:
        specs_by_slug = {spec.slug: spec for spec in OFFICIAL_AGENT_SPECS}
        specs_by_id = {spec.agent_id: spec for spec in OFFICIAL_AGENT_SPECS}

        def resolve_legacy(value: str) -> tuple[OfficialAgentSpec, AgentAssignmentRecord]:
            target_slug = _LEGACY_AGENT_TARGETS.get(value)
            spec = specs_by_slug.get(target_slug) if target_slug is not None else None
            if spec is None:
                try:
                    spec = specs_by_id.get(UUID(value))
                except ValueError:
                    spec = None
            if spec is None:
                raise AgentCatalogRepositoryError("AGENT_LEGACY_IDENTITY_UNMAPPED")
            return spec, assignments[spec.agent_id]

        threads = await AgentThreadV1Record.filter(workspace_id=workspace_id).using_db(conn).all()
        for thread in threads:
            if thread.lead_agent_version_id is not None and thread.lead_agent_assignment_id is not None:
                continue
            spec, assignment = resolve_legacy(thread.lead_agent_id)
            if (
                thread.lead_agent_id != str(spec.agent_id)
                or thread.lead_agent_version_id != spec.version_id
                or thread.lead_agent_assignment_id != assignment.id
            ):
                await (
                    AgentThreadV1Record
                    .filter(id=thread.id)
                    .using_db(conn)
                    .update(
                        lead_agent_id=str(spec.agent_id),
                        lead_agent_version_id=spec.version_id,
                        lead_agent_assignment_id=assignment.id,
                    )
                )

        runs = await AgentRunV1Record.filter(workspace_id=workspace_id).using_db(conn).all()
        for run in runs:
            if (
                run.lead_agent_version_id is not None
                and run.lead_agent_assignment_id is not None
                and len(run.mentioned_agent_ids) == len(run.mentioned_agent_version_ids)
                and len(run.mentioned_agent_ids) == len(run.mentioned_agent_assignment_ids)
            ):
                continue
            lead_spec, lead_assignment = resolve_legacy(run.lead_agent_id)
            mentioned = [resolve_legacy(value) for value in _string_list(run.mentioned_agent_ids)]
            await (
                AgentRunV1Record
                .filter(id=run.id)
                .using_db(conn)
                .update(
                    lead_agent_id=str(lead_spec.agent_id),
                    lead_agent_version_id=lead_spec.version_id,
                    lead_agent_assignment_id=lead_assignment.id,
                    mentioned_agent_ids=[str(spec.agent_id) for spec, _assignment in mentioned],
                    mentioned_agent_version_ids=[str(spec.version_id) for spec, _assignment in mentioned],
                    mentioned_agent_assignment_ids=[str(assignment.id) for _spec, assignment in mentioned],
                )
            )


def _delegation_specs(spec: OfficialAgentSpec) -> tuple[OfficialAgentSpec, ...]:
    by_slug = {item.slug: item for item in OFFICIAL_AGENT_SPECS}
    return tuple(by_slug[slug] for slug in spec.delegation_slugs)


def _execution_modes(values: object) -> tuple[ExecutionMode, ...]:
    modes = _string_list(values)
    if any(mode not in {"plan", "build"} for mode in modes):
        raise AgentCatalogRepositoryError("AGENT_VERSION_INVALID")
    return cast(tuple[ExecutionMode, ...], tuple(modes))


def _uuid_tuple(values: object) -> tuple[UUID, ...]:
    try:
        return tuple(UUID(value) for value in _string_list(values))
    except ValueError as error:
        raise AgentCatalogRepositoryError("AGENT_VERSION_INVALID") from error


def _string_list(values: object) -> list[str]:
    if not isinstance(values, list) or any(not isinstance(value, str) or not value for value in values):
        raise AgentCatalogRepositoryError("AGENT_VERSION_INVALID")
    return cast(list[str], values)


def _assignment_sort_key(record: AgentAssignmentRecord) -> tuple[bool, float, int, str]:
    recent = record.last_used_at.timestamp() if record.last_used_at is not None else 0.0
    return (not record.is_pinned, -recent, record.sort_order, str(record.id))
