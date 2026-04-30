from __future__ import annotations

from collections.abc import Iterable

from src.modules.permissions import (
    PermissionConditionEvaluationContext,
    PermissionConditionSet,
    evaluate_condition_sets,
)
from src.modules.workspaces.permissions.registry import (
    PermissionActionDefinition,
    get_permission_action_registry,
    list_actions_for_permission_codes,
)
from src.modules.workspaces.permissions.schema import PermissionContext, PermissionDecision


class PolicyEvaluationService:
    def __init__(self, registry: dict[str, PermissionActionDefinition] | None = None) -> None:
        self._registry = registry or get_permission_action_registry()

    def list_actions_for_permissions(self, permission_codes: Iterable[str]) -> tuple[str, ...]:
        return list_actions_for_permission_codes(permission_codes)

    def list_actions_for_permissions_set(self, permission_codes: Iterable[str]) -> frozenset[str]:
        return frozenset(self.list_actions_for_permissions(permission_codes))

    def _condition_context(self, context: PermissionContext) -> PermissionConditionEvaluationContext:
        return PermissionConditionEvaluationContext(
            user_id=context.user_id,
            workspace_id=context.workspace_id,
            project_id=context.project_id,
            resource_attributes=context.resource_attributes,
        )

    def _conditions_allow(
        self,
        condition_sets: list[PermissionConditionSet],
        *,
        context: PermissionContext,
    ) -> bool:
        return evaluate_condition_sets(condition_sets, context=self._condition_context(context))

    def evaluate(self, *, context: PermissionContext) -> PermissionDecision:
        definition = self._registry.get(context.action)
        if definition is None:
            return PermissionDecision(
                action=context.action,
                allowed=False,
                reason="ACTION_UNREGISTERED",
            )

        if context.is_superuser:
            return PermissionDecision(
                action=context.action,
                allowed=True,
                reason="SUPERUSER",
                matched_permission_codes=list(definition.permission_codes),
                matched_actions=[context.action],
            )

        allowed_subject_kinds = {str(kind).strip() for kind in definition.subject_kinds if str(kind).strip()}
        subject_kind = str(context.subject_kind).strip()
        if allowed_subject_kinds and subject_kind not in allowed_subject_kinds:
            return PermissionDecision(
                action=context.action,
                allowed=False,
                reason="SUBJECT_KIND_FORBIDDEN",
            )

        direct_action_grants = {str(action).strip() for action in context.granted_actions if str(action).strip()}
        if context.action in direct_action_grants:
            action_condition_sets = context.action_conditions.get(context.action, [])
            if self._conditions_allow(action_condition_sets, context=context):
                return PermissionDecision(
                    action=context.action,
                    allowed=True,
                    reason="ACTION_GRANTED",
                    matched_actions=[context.action],
                    matched_condition_count=sum(len(item.conditions) for item in action_condition_sets),
                )

        permission_grants = {str(code).strip() for code in context.permission_codes if str(code).strip()}
        matched_permissions = sorted(permission_grants.intersection(definition.permission_codes))
        blocked_by_conditions = False
        for permission_code in matched_permissions:
            condition_sets = context.permission_conditions.get(permission_code, [])
            if self._conditions_allow(condition_sets, context=context):
                return PermissionDecision(
                    action=context.action,
                    allowed=True,
                    reason="PERMISSION_GRANTED",
                    matched_permission_codes=[permission_code],
                    matched_condition_count=sum(len(item.conditions) for item in condition_sets),
                )
            blocked_by_conditions = True

        if blocked_by_conditions or (context.action in direct_action_grants):
            return PermissionDecision(
                action=context.action,
                allowed=False,
                reason="CONDITIONS_UNMET",
                matched_permission_codes=matched_permissions,
                matched_actions=[context.action] if context.action in direct_action_grants else [],
            )

        return PermissionDecision(
            action=context.action,
            allowed=False,
            reason="ACTION_FORBIDDEN",
        )
