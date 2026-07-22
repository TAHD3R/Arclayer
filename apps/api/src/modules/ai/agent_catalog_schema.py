from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID


class WorkspaceAgentCatalogItemV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agent_id: PublicUUID
    version_id: PublicUUID
    assignment_id: PublicUUID
    version_number: int
    slug: str
    name: str
    name_i18n_key: str | None
    role: str
    role_i18n_key: str | None
    description: str
    description_i18n_key: str | None
    avatar_url: str | None
    scope: Literal["system", "workspace"]
    provenance: Literal["arclayer_official", "workspace"]
    supported_execution_modes: tuple[Literal["plan", "build"], ...]
    collaboration_agent_ids: tuple[PublicUUID, ...]
    tool_grants: tuple[str, ...]
    available: bool
    unavailable_reason: str | None
    is_default: bool
    is_pinned: bool


class WorkspaceAgentCatalogV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agents: tuple[WorkspaceAgentCatalogItemV1, ...]
    default_agent_id: PublicUUID | None


class ResolvedAgentAssignment(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    assignment_id: UUID
    agent_id: UUID
    version_id: UUID
    version_number: int
    supported_execution_modes: tuple[Literal["plan", "build"], ...]
    tool_grants: tuple[str, ...]
    skill_grant_workspace_id: UUID | None
    skill_installation_ids: tuple[UUID, ...]
    delegation_agent_ids: tuple[UUID, ...]
    instructions: str
