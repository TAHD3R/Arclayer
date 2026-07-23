from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.models.knowledge.knowledge_base import KnowledgeAccessPolicyRecord, KnowledgeBaseRecord
from src.models.knowledge.knowledge_chunk import KnowledgeChunkRecord
from src.models.knowledge.knowledge_source import KnowledgeSourceRecord
from src.modules.tenancy.schema import TenantContext
from src.modules.workspaces.knowledge.repository import WorkspaceKnowledgeRepository

MAX_KNOWLEDGE_RESULTS = 6
MAX_KNOWLEDGE_CONTEXT_CHARACTERS = 12_000


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
    async def retrieve(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        query: str,
    ) -> tuple[AgentKnowledgeEvidence, ...]: ...


class TenantAgentKnowledgeContextResolver:
    def __init__(self, tenant_context: TenantContext) -> None:
        self._tenant_context = tenant_context
        self._repository = WorkspaceKnowledgeRepository(tenant_context)

    async def retrieve(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID | None,
        actor_user_id: UUID,
        agent_definition_id: UUID,
        query: str,
    ) -> tuple[AgentKnowledgeEvidence, ...]:
        if workspace_id != self._tenant_context.workspace_id:
            raise ValueError("Knowledge retrieval workspace does not match the active tenant")
        terms = _query_terms(query)
        if not terms:
            return ()
        async with self._repository.connection() as conn:
            bases = tuple(
                await KnowledgeBaseRecord
                .filter(workspace_id=workspace_id, status="active")
                .using_db(conn)
                .order_by("id")
            )
            allowed_base_ids = await _allowed_base_ids(
                bases=bases,
                project_id=project_id,
                actor_user_id=actor_user_id,
                agent_definition_id=agent_definition_id,
                conn=conn,
            )
            if not allowed_base_ids:
                return ()
            sources = tuple(
                await KnowledgeSourceRecord
                .filter(
                    workspace_id=workspace_id,
                    knowledge_base_id__in=allowed_base_ids,
                    status="ready",
                    active_ready_version_id__not_isnull=True,
                )
                .using_db(conn)
                .order_by("id")
            )
            source_by_version = {
                UUID(str(source.active_ready_version_id)): source
                for source in sources
                if source.active_ready_version_id is not None
            }
            if not source_by_version:
                return ()
            chunks = tuple(
                await KnowledgeChunkRecord
                .filter(
                    workspace_id=workspace_id,
                    source_version_id__in=tuple(source_by_version),
                    retrieval_eligible=True,
                    content_text__not_isnull=True,
                )
                .using_db(conn)
                .order_by("source_version_id", "ordinal")
                .limit(200)
            )
        return _rank_evidence(chunks=chunks, source_by_version=source_by_version, terms=terms)


async def _allowed_base_ids(
    *,
    bases: Sequence[KnowledgeBaseRecord],
    project_id: UUID | None,
    actor_user_id: UUID,
    agent_definition_id: UUID,
    conn,
) -> tuple[UUID, ...]:
    allowed: list[UUID] = []
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
            raise RuntimeError("Active Knowledge Base is missing its current access policy")
        if str(policy.visibility) == "workspace" or _restricted_policy_matches(
            policy=policy,
            project_id=project_id,
            actor_user_id=actor_user_id,
            agent_definition_id=agent_definition_id,
        ):
            allowed.append(UUID(str(base.id)))
    return tuple(allowed)


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
    source_by_version: dict[UUID, KnowledgeSourceRecord],
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
        source = source_by_version[source_version_id]
        evidence.append(
            AgentKnowledgeEvidence(
                chunk_id=chunk.id,
                source_version_id=source_version_id,
                source_id=source.id,
                knowledge_base_id=source.knowledge_base_id,
                source_name=source.display_name,
                ordinal=chunk.ordinal,
                citation_location=chunk.citation_location or {},
                content=content,
            )
        )
        characters += len(content)
        if len(evidence) >= MAX_KNOWLEDGE_RESULTS:
            break
    return tuple(evidence)


__all__ = [
    "AgentKnowledgeContextResolver",
    "AgentKnowledgeEvidence",
    "TenantAgentKnowledgeContextResolver",
]
