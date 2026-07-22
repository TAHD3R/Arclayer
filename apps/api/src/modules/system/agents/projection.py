from __future__ import annotations

from typing import Literal, cast
from uuid import UUID

from pydantic import ValidationError

from src.models.agents.catalog import AgentAssignmentRecord, AgentDefinitionRecord, AgentVersionRecord
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace
from src.modules.system.agents.repository_protocol import AgentDefinitionBundle
from src.modules.system.agents.schema import (
    AgentApprovalProfile,
    AgentCompatibility,
    AgentLifecycle,
    AgentModelPolicy,
    AgentVersionProvenance,
    AgentVersionStateValue,
    ExecutionMode,
    SystemAgentAssignmentOut,
    SystemAgentDefinitionDetailOut,
    SystemAgentDefinitionSummaryOut,
    SystemAgentVersionOut,
)


class SystemAgentProjectionError(RuntimeError):
    pass


def project_version(version: AgentVersionRecord) -> SystemAgentVersionOut:
    try:
        return SystemAgentVersionOut(
            id=version.id,
            created_at=version.created_at,
            updated_at=version.updated_at,
            definition_id=version.definition_id,
            version_number=version.version_number,
            state=cast(AgentVersionStateValue, str(version.state)),
            instructions=version.instructions,
            model_policy=AgentModelPolicy.model_validate(version.model_policy),
            supported_execution_modes=cast(
                tuple[ExecutionMode, ...],
                _string_tuple(version.supported_execution_modes),
            ),
            tool_grants=_string_tuple(version.tool_grants),
            skill_grant_workspace_id=version.skill_grant_workspace_id,
            skill_installation_ids=_uuid_tuple(version.skill_installation_ids),
            knowledge_base_ids=_uuid_tuple(version.knowledge_base_ids),
            delegation_definition_ids=_uuid_tuple(version.delegation_definition_ids),
            approval_profile=AgentApprovalProfile.model_validate(version.approval_profile),
            compatibility=AgentCompatibility.model_validate(version.compatibility),
            provenance=_provenance(version.provenance),
            content_checksum=version.content_checksum,
            published_at=version.published_at,
            created_by_user_id=version.created_by_user_id,
        )
    except (TypeError, ValueError, ValidationError) as error:
        raise SystemAgentProjectionError("AGENT_VERSION_INVALID") from error


def project_assignment(assignment: AgentAssignmentRecord) -> SystemAgentAssignmentOut:
    try:
        workspace = cast(Workspace, assignment.workspace)
        project = cast(ProjectRecord | None, assignment.project)
        version = cast(AgentVersionRecord, assignment.version)
        return SystemAgentAssignmentOut(
            id=assignment.id,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at,
            workspace_id=assignment.workspace_id,
            workspace_name=workspace.name,
            project_id=assignment.project_id,
            project_name=project.name if project is not None else None,
            agent_id=assignment.definition_id,
            version_id=assignment.version_id,
            version_number=version.version_number,
            enabled=assignment.enabled,
            is_default=assignment.is_default,
            is_pinned=assignment.is_pinned,
            sort_order=assignment.sort_order,
            last_used_at=assignment.last_used_at,
            assigned_by_user_id=assignment.assigned_by_user_id,
        )
    except (AttributeError, TypeError, ValueError, ValidationError) as error:
        raise SystemAgentProjectionError("AGENT_ASSIGNMENT_INVALID") from error


def project_definition_summary(bundle: AgentDefinitionBundle) -> SystemAgentDefinitionSummaryOut:
    versions = tuple(project_version(version) for version in bundle.versions)
    return _definition_out(
        definition=bundle.definition,
        versions=versions,
        assignments=bundle.assignments,
    )


def project_definition_detail(bundle: AgentDefinitionBundle) -> SystemAgentDefinitionDetailOut:
    versions = tuple(project_version(version) for version in bundle.versions)
    assignments = tuple(project_assignment(assignment) for assignment in bundle.assignments)
    summary = _definition_out(
        definition=bundle.definition,
        versions=versions,
        assignments=bundle.assignments,
    )
    return SystemAgentDefinitionDetailOut(
        **summary.model_dump(),
        versions=versions,
        assignments=assignments,
    )


def _definition_out(
    *,
    definition: AgentDefinitionRecord,
    versions: tuple[SystemAgentVersionOut, ...],
    assignments: tuple[AgentAssignmentRecord, ...],
) -> SystemAgentDefinitionSummaryOut:
    return SystemAgentDefinitionSummaryOut(
        id=definition.id,
        created_at=definition.created_at,
        updated_at=definition.updated_at,
        stable_key=definition.stable_key,
        scope=cast(Literal["system", "workspace"], str(definition.scope)),
        workspace_id=definition.workspace_id,
        slug=definition.slug,
        display_name=definition.display_name,
        name_i18n_key=definition.name_i18n_key,
        role=definition.role,
        role_i18n_key=definition.role_i18n_key,
        description=definition.description,
        description_i18n_key=definition.description_i18n_key,
        avatar_url=definition.avatar_url,
        lifecycle_state=cast(AgentLifecycle, str(definition.lifecycle_state)),
        is_official=definition.is_official,
        created_by_user_id=definition.created_by_user_id,
        latest_version=versions[0] if versions else None,
        version_count=len(versions),
        assignment_count=len(assignments),
        enabled_assignment_count=sum(1 for assignment in assignments if assignment.enabled),
    )


def _string_tuple(value: object) -> tuple[str, ...]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise TypeError("Expected a list of non-empty strings")
    return tuple(cast(list[str], value))


def _uuid_tuple(value: object) -> tuple[UUID, ...]:
    return tuple(UUID(item) for item in _string_tuple(value))


def _provenance(value: object) -> AgentVersionProvenance:
    if not isinstance(value, dict):
        raise TypeError("Expected provenance object")
    payload = dict(value)
    actor = payload.get("createdByUserId")
    if isinstance(actor, str):
        payload["createdByUserId"] = UUID(actor)
    return AgentVersionProvenance.model_validate(payload)
