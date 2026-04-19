from __future__ import annotations

from collections.abc import Iterable

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

        direct_action_grants = {str(action).strip() for action in context.granted_actions if str(action).strip()}
        if context.action in direct_action_grants:
            return PermissionDecision(
                action=context.action,
                allowed=True,
                reason="ACTION_GRANTED",
                matched_actions=[context.action],
            )

        permission_grants = {str(code).strip() for code in context.permission_codes if str(code).strip()}
        matched_permissions = sorted(permission_grants.intersection(definition.permission_codes))
        if matched_permissions:
            return PermissionDecision(
                action=context.action,
                allowed=True,
                reason="PERMISSION_GRANTED",
                matched_permission_codes=matched_permissions,
            )

        return PermissionDecision(
            action=context.action,
            allowed=False,
            reason="ACTION_FORBIDDEN",
        )
