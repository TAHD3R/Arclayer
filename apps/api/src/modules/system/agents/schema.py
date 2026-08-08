from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Self

from pydantic import ConfigDict, Field, field_validator, model_validator

from src.common.schemas import BaseOut, BaseSchema, TimestampMixin
from src.common.types.json_types import JsonObject
from src.common.types.public_uuid import PublicUUID

ExecutionMode = Literal["plan", "build"]
AgentLifecycle = Literal["active", "disabled", "archived"]
AgentVersionStateValue = Literal["draft", "published", "retired"]

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_GRANT_PATTERN = re.compile(r"^[a-z0-9]+(?:[._:-][a-z0-9]+)*$")


class AgentModelPolicy(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    routing_policy: Literal["workspace_default"] = "workspace_default"


class AgentApprovalProfile(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    profile_id: str = Field(min_length=1, max_length=128)


class AgentCompatibility(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    agent_runtime_protocol: Literal[1] = 1


class AgentVersionProvenance(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["arclayer_official", "system_custom", "workspace_custom"]
    manifest_version: int | None = Field(default=None, ge=1)
    created_by_user_id: PublicUUID | None = None


class AgentVersionCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    instructions: str = Field(min_length=1, max_length=50_000)
    model_policy: AgentModelPolicy = Field(default_factory=AgentModelPolicy)
    supported_execution_modes: tuple[ExecutionMode, ...] = Field(min_length=1, max_length=2)
    tool_grants: tuple[str, ...] = Field(default_factory=tuple, max_length=128)
    skill_grant_workspace_id: PublicUUID | None = None
    skill_installation_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple, max_length=128)
    knowledge_base_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple, max_length=128)
    delegation_definition_ids: tuple[PublicUUID, ...] = Field(default_factory=tuple, max_length=128)
    approval_profile: AgentApprovalProfile
    compatibility: AgentCompatibility = Field(default_factory=AgentCompatibility)

    @field_validator(
        "supported_execution_modes",
        "tool_grants",
        "skill_installation_ids",
        "knowledge_base_ids",
        "delegation_definition_ids",
    )
    @classmethod
    def _require_unique_values(cls, values: tuple[object, ...]) -> tuple[object, ...]:
        if len(values) != len(set(values)):
            raise ValueError("Values must be unique")
        return values

    @field_validator("tool_grants")
    @classmethod
    def _validate_tool_grants(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if any(not _GRANT_PATTERN.fullmatch(value) for value in values):
            raise ValueError("Tool grant names are invalid")
        return values

    @model_validator(mode="after")
    def _require_skill_grant_workspace(self) -> Self:
        has_workspace = self.skill_grant_workspace_id is not None
        if has_workspace != bool(self.skill_installation_ids):
            raise ValueError("skillGrantWorkspaceId is required exactly when skillInstallationIds is non-empty")
        return self


class SystemAgentDefinitionCreateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    slug: str = Field(min_length=2, max_length=96)
    display_name: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=96)
    description: str = Field(min_length=1, max_length=1000)
    avatar_url: str | None = Field(default=None, max_length=1024)
    initial_version: AgentVersionCreateRequest

    @field_validator("slug")
    @classmethod
    def _normalize_slug(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not _SLUG_PATTERN.fullmatch(normalized):
            raise ValueError("Agent slug must contain lowercase letters, numbers, and single hyphens")
        return normalized


class SystemAgentDefinitionUpdateRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    role: str | None = Field(default=None, min_length=1, max_length=96)
    description: str | None = Field(default=None, min_length=1, max_length=1000)
    avatar_url: str | None = Field(default=None, max_length=1024)
    lifecycle_state: AgentLifecycle | None = None

    @model_validator(mode="after")
    def _require_change(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one Definition field is required")
        return self


class AgentVersionLifecycleRequest(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    state: Literal["published", "retired"]


class SystemAgentVersionOut(BaseOut, TimestampMixin):
    definition_id: PublicUUID
    version_number: int
    state: AgentVersionStateValue
    instructions: str
    model_policy: AgentModelPolicy
    supported_execution_modes: tuple[ExecutionMode, ...]
    tool_grants: tuple[str, ...]
    skill_grant_workspace_id: PublicUUID | None
    skill_installation_ids: tuple[PublicUUID, ...]
    knowledge_base_ids: tuple[PublicUUID, ...]
    delegation_definition_ids: tuple[PublicUUID, ...]
    approval_profile: AgentApprovalProfile
    compatibility: AgentCompatibility
    provenance: AgentVersionProvenance
    content_checksum: str
    published_at: datetime | None
    created_by_user_id: PublicUUID | None
    adoption_count: int = Field(default=0, ge=0)
    failure_count: int = Field(default=0, ge=0)


class SystemAgentAssignmentOut(BaseOut, TimestampMixin):
    workspace_id: PublicUUID
    workspace_name: str
    project_id: PublicUUID | None
    project_name: str | None
    agent_id: PublicUUID
    version_id: PublicUUID
    version_number: int
    enabled: bool
    is_default: bool
    is_pinned: bool
    sort_order: int
    last_used_at: datetime | None
    assigned_by_user_id: PublicUUID | None


class SystemAgentDefinitionSummaryOut(BaseOut, TimestampMixin):
    stable_key: str
    scope: Literal["system", "workspace"]
    workspace_id: PublicUUID | None
    slug: str
    display_name: str
    name_i18n_key: str | None
    role: str
    role_i18n_key: str | None
    description: str
    description_i18n_key: str | None
    avatar_url: str | None
    lifecycle_state: AgentLifecycle
    is_official: bool
    created_by_user_id: PublicUUID | None
    latest_version: SystemAgentVersionOut | None
    version_count: int = Field(ge=0)
    assignment_count: int = Field(ge=0)
    enabled_assignment_count: int = Field(ge=0)


class SystemAgentDefinitionDetailOut(SystemAgentDefinitionSummaryOut):
    versions: tuple[SystemAgentVersionOut, ...] = Field(default_factory=tuple)
    assignments: tuple[SystemAgentAssignmentOut, ...] = Field(default_factory=tuple)


class SystemAgentAssignmentListOut(BaseSchema):
    items: tuple[SystemAgentAssignmentOut, ...] = Field(default_factory=tuple)


class SystemAgentVersionListOut(BaseSchema):
    items: tuple[SystemAgentVersionOut, ...] = Field(default_factory=tuple)


class SystemAgentCatalogOptionOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    id: str
    label: str
    description: str
    risk: Literal["low", "medium", "high"]
    available: bool = True


class SystemAgentCatalogCapabilitiesOut(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    supported_tool_grants: tuple[str, ...]
    skill_grants_available: bool
    knowledge_grants_available: bool
    model_routing_policies: tuple[Literal["workspace_default"], ...]
    agent_runtime_protocol: Literal[1]
    hard_delete_supported: Literal[False]
    constraints: JsonObject = Field(default_factory=dict)
    execution_mode_catalog: tuple[SystemAgentCatalogOptionOut, ...] = Field(default_factory=tuple)
    tool_grant_catalog: tuple[SystemAgentCatalogOptionOut, ...] = Field(default_factory=tuple)
    approval_profile_catalog: tuple[SystemAgentCatalogOptionOut, ...] = Field(default_factory=tuple)
    model_policy_catalog: tuple[SystemAgentCatalogOptionOut, ...] = Field(default_factory=tuple)
