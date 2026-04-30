from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from src.common.utils.public_ids import decode_public_id
from src.core.exceptions import Conflict, Forbidden
from src.models.content._enums import ContentWorkflowStage
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.projects.membership import ProjectMembership
from src.modules.projects.content.contracts.schema import (
    ContentWorkflowContract,
    ContentWorkflowStageActorContract,
)

DEFAULT_WORKFLOW_TRANSITIONS: frozenset[tuple[str, str]] = frozenset({
    ("drafting", "in_review"),
    ("drafting", "approved"),
    ("in_review", "changes_requested"),
    ("in_review", "approved"),
    ("changes_requested", "drafting"),
    ("changes_requested", "in_review"),
    ("approved", "changes_requested"),
    ("approved", "drafting"),
})


@dataclass(frozen=True, slots=True)
class WorkflowActor:
    user_id: UUID | None
    role_code: str | None


@dataclass(frozen=True, slots=True)
class WorkflowActorRule:
    role_codes: frozenset[str]
    user_ids: frozenset[UUID]


@dataclass(frozen=True, slots=True)
class ResolvedWorkflowPolicy:
    stages: frozenset[str]
    publish_stage: str
    transitions: frozenset[tuple[str, str]]
    stage_assignments: dict[str, WorkflowActorRule]
    stage_permissions: dict[str, WorkflowActorRule]


def _decode_user_id(value: object) -> UUID:
    raw = str(value)
    try:
        return decode_public_id(raw)
    except ValueError:
        return UUID(raw)


def _actor_rule(rule: ContentWorkflowStageActorContract) -> WorkflowActorRule:
    return WorkflowActorRule(
        role_codes=frozenset(str(role) for role in rule.role_codes),
        user_ids=frozenset(_decode_user_id(user_id) for user_id in rule.user_ids),
    )


def _actor_rules_by_stage(rules: list[ContentWorkflowStageActorContract]) -> dict[str, WorkflowActorRule]:
    return {str(rule.stage): _actor_rule(rule) for rule in rules}


def resolve_workflow_policy(model: ContentModelDefinitionRecord | None) -> ResolvedWorkflowPolicy:
    raw_policy = getattr(model, "workflow_policy", None)
    try:
        contract = ContentWorkflowContract.model_validate(raw_policy if isinstance(raw_policy, dict) else {})
    except ValueError as exc:
        raise Conflict("Content workflow policy is invalid", error="CONTENT_WORKFLOW_POLICY_INVALID") from exc

    stages = frozenset(str(stage) for stage in contract.stages)
    configured_transitions = {
        (str(transition.from_stage), str(transition.to_stage)) for transition in contract.transitions
    }
    transitions = (
        frozenset(configured_transitions)
        if configured_transitions
        else frozenset(
            (source, target) for source, target in DEFAULT_WORKFLOW_TRANSITIONS if source in stages and target in stages
        )
    )
    return ResolvedWorkflowPolicy(
        stages=stages,
        publish_stage=str(contract.publish_stage),
        transitions=transitions,
        stage_assignments=_actor_rules_by_stage(contract.stage_assignments),
        stage_permissions=_actor_rules_by_stage(contract.stage_permissions),
    )


async def resolve_workflow_actor(*, project_id: UUID | None, actor_user_id: UUID | None) -> WorkflowActor:
    if project_id is None or actor_user_id is None:
        return WorkflowActor(user_id=actor_user_id, role_code=None)
    membership = await ProjectMembership.get_or_none(project_id=project_id, user_id=actor_user_id)
    return WorkflowActor(
        user_id=actor_user_id,
        role_code=str(membership.role) if membership is not None else None,
    )


def _actor_allowed(rule: WorkflowActorRule | None, actor: WorkflowActor) -> bool:
    if rule is None:
        return True
    if actor.role_code is not None and actor.role_code in rule.role_codes:
        return True
    return actor.user_id is not None and actor.user_id in rule.user_ids


def validate_workflow_transition(
    *,
    current_stage: object,
    target_stage: object,
    policy: ResolvedWorkflowPolicy,
    actor: WorkflowActor,
) -> None:
    source = str(current_stage or ContentWorkflowStage.DRAFTING)
    target = str(target_stage)
    if source == target:
        return
    if source not in policy.stages or target not in policy.stages:
        raise Conflict("Content workflow stage is not configured", error="CONTENT_WORKFLOW_STAGE_INVALID")
    if (source, target) not in policy.transitions:
        raise Conflict("Content workflow transition is not configured", error="CONTENT_WORKFLOW_TRANSITION_INVALID")
    if not _actor_allowed(policy.stage_permissions.get(source), actor):
        raise Forbidden(
            "Content workflow stage permission denied",
            error="CONTENT_WORKFLOW_STAGE_PERMISSION_DENIED",
        )
    if not _actor_allowed(policy.stage_assignments.get(target), actor):
        raise Forbidden(
            "Content workflow stage assignee required",
            error="CONTENT_WORKFLOW_STAGE_ASSIGNEE_REQUIRED",
        )
