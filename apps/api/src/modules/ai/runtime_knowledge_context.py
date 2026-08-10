from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

import orjson
from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.common.utils.public_ids import encode_uuid
from src.models.agents.runtime_knowledge_v1 import AgentRunKnowledgeSourceSnapshotV1Record
from src.models.knowledge._enums import (
    KnowledgeBaseStatus,
    KnowledgeSourceStatus,
    KnowledgeVersionStatus,
)
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_chunk import KnowledgeChunkRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.models.knowledge.knowledge_source_version import (
    KnowledgeSourceVersionRecord,
    KnowledgeSourceVersionStateRecord,
)
from src.modules.ai.agent_knowledge_context_schema import (
    AgentRunKnowledgeContextInputV1,
    AgentRunKnowledgeContextV1,
    AgentRunKnowledgeSourceSnapshotInputV1,
)
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.knowledge.repository import (
    WorkspaceGuidanceRepository,
    WorkspaceKnowledgeRepository,
)

MAX_KNOWLEDGE_RESULTS = 6
MAX_KNOWLEDGE_CONTEXT_CHARACTERS = 12_000


class AgentKnowledgeContextError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AgentKnowledgeEvidence(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    chunk_id: UUID
    source_version_id: UUID
    source_id: UUID
    knowledge_base_id: UUID
    source_name: str
    ordinal: int = Field(ge=0)
    citation_location: JsonObject
    content: str


class AgentKnowledgeContextResolver(Protocol):
    async def resolve_run_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunKnowledgeContextInputV1 | None: ...

    async def load_run_context(
        self,
        *,
        run_id: UUID,
        context: AgentRunKnowledgeContextV1,
        source_snapshot_count: int,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        query: str,
    ) -> tuple[AgentKnowledgeEvidence, ...]: ...


class TenantAgentKnowledgeContextResolver:
    def __init__(self, tenant_context: TenantContext) -> None:
        self._tenant_context = tenant_context
        self._repository = WorkspaceKnowledgeRepository(tenant_context)
        self._guidance_repository = WorkspaceGuidanceRepository(tenant_context)

    async def resolve_run_context(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> AgentRunKnowledgeContextInputV1 | None:
        self._require_workspace(workspace_id)
        effective = await self._guidance_repository.resolve_effective_context(
            workspace_id=workspace_id,
            project_id=project_id,
            conn=conn,
        )
        if effective.effective_content is None and not effective.attached_knowledge_base_ids:
            return None
        sources = await self._snapshot_sources(
            workspace_id=workspace_id,
            project_id=project_id,
            actor_user_id=actor_user_id,
            agent_definition_id=agent_definition_id,
            knowledge_base_ids=effective.attached_knowledge_base_ids,
            conn=conn,
        )
        payload = {
            "contextVersion": 1,
            "workspaceId": workspace_id,
            "projectId": project_id,
            "workspaceLayerId": (
                str(effective.workspace_layer_id) if effective.workspace_layer_id is not None else None
            ),
            "workspaceRevisionId": (
                UUID(str(effective.workspace_published_revision.id))
                if effective.workspace_published_revision is not None
                else None
            ),
            "workspaceRevisionNumber": (
                effective.workspace_published_revision.revision_number
                if effective.workspace_published_revision is not None
                else None
            ),
            "workspaceContentHash": (
                effective.workspace_published_revision.content_hash
                if effective.workspace_published_revision is not None
                else None
            ),
            "projectLayerId": (str(effective.project_layer_id) if effective.project_layer_id is not None else None),
            "projectRevisionId": (
                UUID(str(effective.project_published_revision.id))
                if effective.project_published_revision is not None
                else None
            ),
            "projectRevisionNumber": (
                effective.project_published_revision.revision_number
                if effective.project_published_revision is not None
                else None
            ),
            "projectContentHash": (
                effective.project_published_revision.content_hash
                if effective.project_published_revision is not None
                else None
            ),
            "projectMode": effective.project_mode,
            "precedence": effective.precedence,
            "effectiveGuidance": effective.effective_content,
            "attachedKnowledgeBaseIds": tuple(UUID(str(value)) for value in effective.attached_knowledge_base_ids),
            "unavailableCodes": effective.unavailable_codes,
            "conflictCodes": effective.conflict_codes,
        }
        context_hash = _content_hash(payload)
        context = AgentRunKnowledgeContextV1.model_validate({**payload, "contextHash": context_hash})
        serialized = orjson.dumps(context.model_dump(mode="json", by_alias=True), option=orjson.OPT_SORT_KEYS)
        return AgentRunKnowledgeContextInputV1(
            context=context,
            sources=sources,
            context_byte_size=len(serialized),
        )

    async def load_run_context(
        self,
        *,
        run_id: UUID,
        context: AgentRunKnowledgeContextV1,
        source_snapshot_count: int,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        query: str,
    ) -> tuple[AgentKnowledgeEvidence, ...]:
        workspace_id = UUID(str(context.workspace_id))
        project_id = UUID(str(context.project_id)) if context.project_id is not None else None
        self._require_workspace(workspace_id)
        terms = _query_terms(query)
        async with self._repository.connection() as conn:
            snapshots = tuple(
                await AgentRunKnowledgeSourceSnapshotV1Record
                .filter(run_id=run_id)
                .using_db(conn)
                .order_by("source_order", "id")
            )
            if len(snapshots) != source_snapshot_count:
                raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")
            if not snapshots or not terms:
                return ()
            await self._revalidate_snapshot_access(
                workspace_id=workspace_id,
                project_id=project_id,
                actor_user_id=actor_user_id,
                agent_definition_id=agent_definition_id,
                snapshots=snapshots,
                conn=conn,
            )
            chunks = tuple(
                await KnowledgeChunkRecord
                .filter(
                    workspace_id=workspace_id,
                    source_version_id__in=tuple(item.source_version_id for item in snapshots),
                    retrieval_eligible=True,
                    content_text__not_isnull=True,
                )
                .using_db(conn)
                .order_by("source_version_id", "ordinal")
                .limit(200)
            )
        snapshot_by_version = {item.source_version_id: item for item in snapshots}
        return _rank_evidence(chunks=chunks, snapshot_by_version=snapshot_by_version, terms=terms)

    async def _snapshot_sources(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        knowledge_base_ids: tuple[UUID, ...],
        conn: BaseDBAsyncClient,
    ) -> tuple[AgentRunKnowledgeSourceSnapshotInputV1, ...]:
        if not knowledge_base_ids:
            return ()
        bases = tuple(
            await KnowledgeBaseRecord
            .filter(workspace_id=workspace_id, id__in=knowledge_base_ids)
            .using_db(conn)
            .order_by("id")
        )
        if len(bases) != len(knowledge_base_ids) or any(
            str(base.status) != KnowledgeBaseStatus.ACTIVE.value for base in bases
        ):
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_REFERENCE_UNAVAILABLE")
        policies = await _require_current_policies(
            bases=bases,
            project_id=project_id,
            actor_user_id=actor_user_id,
            agent_definition_id=agent_definition_id,
            conn=conn,
        )
        sources = tuple(
            await KnowledgeSourceRecord
            .filter(
                workspace_id=workspace_id,
                knowledge_base_id__in=knowledge_base_ids,
                status__in=(KnowledgeSourceStatus.READY, KnowledgeSourceStatus.STALE),
                active_ready_version_id__not_isnull=True,
            )
            .using_db(conn)
            .order_by("knowledge_base_id", "id")
        )
        version_ids = tuple(
            UUID(str(source.active_ready_version_id))
            for source in sources
            if source.active_ready_version_id is not None
        )
        versions = tuple(
            await KnowledgeSourceVersionRecord.filter(workspace_id=workspace_id, id__in=version_ids).using_db(conn)
        )
        states = tuple(
            await KnowledgeSourceVersionStateRecord.filter(
                workspace_id=workspace_id, source_version_id__in=version_ids
            ).using_db(conn)
        )
        version_by_id = {version.id: version for version in versions}
        state_by_id = {state.source_version_id: state for state in states}
        snapshots: list[AgentRunKnowledgeSourceSnapshotInputV1] = []
        for source_order, source in enumerate(sources):
            version_id = UUID(str(source.active_ready_version_id))
            version = version_by_id.get(version_id)
            state = state_by_id.get(version_id)
            if (
                version is None
                or version.source_id != source.id
                or state is None
                or str(state.status) != KnowledgeVersionStatus.READY.value
            ):
                raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_REFERENCE_UNAVAILABLE")
            snapshots.append(
                AgentRunKnowledgeSourceSnapshotInputV1(
                    source_order=source_order,
                    knowledge_base_id=source.knowledge_base_id,
                    policy_revision=policies[source.knowledge_base_id].policy_revision,
                    source_id=source.id,
                    source_version_id=version.id,
                    source_name=source.display_name,
                    source_version_content_hash=version.content_hash,
                )
            )
        return tuple(snapshots)

    async def _revalidate_snapshot_access(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        snapshots: tuple[AgentRunKnowledgeSourceSnapshotV1Record, ...],
        conn: BaseDBAsyncClient,
    ) -> None:
        base_ids = tuple(dict.fromkeys(item.knowledge_base_id for item in snapshots))
        bases = tuple(
            await KnowledgeBaseRecord.filter(
                workspace_id=workspace_id, id__in=base_ids, status=KnowledgeBaseStatus.ACTIVE
            ).using_db(conn)
        )
        if len(bases) != len(base_ids):
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_ACCESS_REVOKED")
        await _require_current_policies(
            bases=bases,
            project_id=project_id,
            actor_user_id=actor_user_id,
            agent_definition_id=agent_definition_id,
            conn=conn,
        )
        sources = tuple(
            await KnowledgeSourceRecord.filter(
                workspace_id=workspace_id,
                id__in=tuple(item.source_id for item in snapshots),
            ).using_db(conn)
        )
        versions = tuple(
            await KnowledgeSourceVersionRecord.filter(
                workspace_id=workspace_id, id__in=tuple(item.source_version_id for item in snapshots)
            ).using_db(conn)
        )
        states = tuple(
            await KnowledgeSourceVersionStateRecord.filter(
                workspace_id=workspace_id,
                source_version_id__in=tuple(item.source_version_id for item in snapshots),
            ).using_db(conn)
        )
        source_by_id = {source.id: source for source in sources}
        version_by_id = {version.id: version for version in versions}
        state_by_version_id = {state.source_version_id: state for state in states}
        for snapshot in snapshots:
            source = source_by_id.get(snapshot.source_id)
            version = version_by_id.get(snapshot.source_version_id)
            if (
                source is None
                or source.knowledge_base_id != snapshot.knowledge_base_id
                or version is None
                or version.source_id != snapshot.source_id
                or version.content_hash != snapshot.source_version_content_hash
            ):
                raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")
            state = state_by_version_id.get(snapshot.source_version_id)
            if (
                str(source.status) not in (KnowledgeSourceStatus.READY.value, KnowledgeSourceStatus.STALE.value)
                or state is None
                or str(state.status) != KnowledgeVersionStatus.READY.value
            ):
                raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_ACCESS_REVOKED")

    def _require_workspace(self, workspace_id: UUID) -> None:
        if workspace_id != self._tenant_context.workspace_id:
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_WORKSPACE_MISMATCH")


async def _require_current_policies(
    *,
    bases: Sequence[KnowledgeBaseRecord],
    project_id: UUID | None,
    actor_user_id: UUID,
    agent_definition_id: UUID,
    conn: BaseDBAsyncClient,
) -> dict[UUID, KnowledgeAccessPolicyRecord]:
    policies: dict[UUID, KnowledgeAccessPolicyRecord] = {}
    for base in bases:
        policy = (
            await KnowledgeAccessPolicyRecord
            .filter(
                workspace_id=base.workspace_id,
                knowledge_base_id=base.id,
                policy_revision=base.current_policy_revision,
            )
            .using_db(conn)
            .first()
        )
        if policy is None:
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_POLICY_INVALID")
        if str(policy.visibility) != "workspace" and not _restricted_policy_matches(
            policy=policy,
            project_id=project_id,
            actor_user_id=actor_user_id,
            agent_definition_id=agent_definition_id,
        ):
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_ACCESS_REVOKED")
        policies[base.id] = policy
    return policies


def _restricted_policy_matches(
    *,
    policy: KnowledgeAccessPolicyRecord,
    project_id: UUID | None,
    actor_user_id: UUID,
    agent_definition_id: UUID,
) -> bool:
    project_ids = {UUID(str(value)) for value in (policy.allowed_project_ids or [])}
    member_ids = {UUID(str(value)) for value in (policy.allowed_member_ids or [])}
    agent_ids = {UUID(str(value)) for value in (policy.allowed_agent_definition_ids or [])}
    return bool(
        (project_id is not None and project_id in project_ids)
        or actor_user_id in member_ids
        or agent_definition_id in agent_ids
    )


def _query_terms(value: str) -> tuple[str, ...]:
    lowered = value.casefold()
    words = re.findall(r"[a-z0-9][a-z0-9_-]{1,}", lowered)
    cjk_runs = re.findall(r"[\u4e00-\u9fff]+", lowered)
    cjk_bigrams = [run[index : index + 2] for run in cjk_runs for index in range(len(run) - 1)]
    return tuple(dict.fromkeys((*words, *cjk_bigrams)))[:64]


def _rank_evidence(
    *,
    chunks: Sequence[KnowledgeChunkRecord],
    snapshot_by_version: dict[UUID, AgentRunKnowledgeSourceSnapshotV1Record],
    terms: tuple[str, ...],
) -> tuple[AgentKnowledgeEvidence, ...]:
    ranked: list[tuple[int, KnowledgeChunkRecord]] = []
    for chunk in chunks:
        content = str(chunk.content_text or "").strip()
        score = sum(content.casefold().count(term) for term in terms)
        if score > 0:
            ranked.append((score, chunk))
    ranked.sort(key=lambda item: (-item[0], str(item[1].source_version_id), item[1].ordinal))
    evidence: list[AgentKnowledgeEvidence] = []
    characters = 0
    for _score, chunk in ranked:
        content = str(chunk.content_text or "").strip()
        if not content or characters + len(content) > MAX_KNOWLEDGE_CONTEXT_CHARACTERS:
            continue
        source_version_id = UUID(str(chunk.source_version_id))
        snapshot = snapshot_by_version.get(source_version_id)
        if snapshot is None:
            raise AgentKnowledgeContextError("AGENT_KNOWLEDGE_SNAPSHOT_INVALID")
        evidence.append(
            AgentKnowledgeEvidence(
                knowledge_base_id=snapshot.knowledge_base_id,
                source_id=snapshot.source_id,
                source_version_id=source_version_id,
                source_name=snapshot.source_name,
                chunk_id=chunk.id,
                ordinal=chunk.ordinal,
                citation_location=chunk.citation_location or {},
                content=content,
            )
        )
        characters += len(content)
        if len(evidence) >= MAX_KNOWLEDGE_RESULTS:
            break
    return tuple(evidence)


def _content_hash(payload: object) -> str:
    serialized = orjson.dumps(payload, default=_encode_uuid_for_json, option=orjson.OPT_SORT_KEYS)
    return f"sha256:{hashlib.sha256(serialized).hexdigest()}"


def _encode_uuid_for_json(value: object) -> str:
    try:
        return encode_uuid(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as error:
        raise TypeError(f"Unsupported JSON value: {type(value).__name__}") from error


__all__ = [
    "AgentKnowledgeContextError",
    "AgentKnowledgeContextResolver",
    "AgentKnowledgeEvidence",
    "TenantAgentKnowledgeContextResolver",
]
