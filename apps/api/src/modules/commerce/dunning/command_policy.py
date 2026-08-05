from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol
from uuid import UUID

from src.core.exceptions import APIError, Conflict
from src.modules.commerce.access_state.repository import TortoiseCommercialAccessStateRepository
from src.modules.commerce.access_state.schema import CommercialAccessProjection
from src.modules.commerce.dunning.restricted_recovery import RestrictedRecoveryService
from src.modules.commerce.dunning.schema import RestrictedRecoveryDecision, RestrictedRecoveryEffect
from src.modules.jobs.execution_errors import PermanentJobExecutionError


class CommercialAccessProjectionReader(Protocol):
    async def get_projection(self, *, workspace_id: UUID) -> CommercialAccessProjection | None: ...


_WORKSPACE_AI_ACTION_EFFECTS: dict[str, RestrictedRecoveryEffect] = {
    "list_content_models": RestrictedRecoveryEffect.READ_EXISTING,
    "list_content_items": RestrictedRecoveryEffect.READ_EXISTING,
    "list_projects": RestrictedRecoveryEffect.READ_EXISTING,
    "open_projects": RestrictedRecoveryEffect.READ_EXISTING,
    "read_project_source": RestrictedRecoveryEffect.READ_EXISTING,
    "create_project": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "create_content_model": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "update_content_model": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "delete_content_model": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "create_content_item": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "update_content_item": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "update_homepage": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "delete_content_item": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "write_project_source_file": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "delete_project_source_file": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "update_site_settings": RestrictedRecoveryEffect.CONTENT_MUTATION,
    "refine_plan": RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT,
}


class RestrictedRecoveryCommandPolicy:
    """Loads the durable commercial projection once before a Product command dispatches."""

    def __init__(
        self,
        *,
        reader: CommercialAccessProjectionReader,
        recovery: RestrictedRecoveryService | None = None,
    ) -> None:
        self._reader = reader
        self._recovery = recovery or RestrictedRecoveryService()

    async def authorize(
        self,
        *,
        workspace_id: UUID,
        effects: set[RestrictedRecoveryEffect],
    ) -> RestrictedRecoveryDecision:
        projection = await self._reader.get_projection(workspace_id=workspace_id)
        return self._recovery.classify(projection=projection, effects=effects)


def build_restricted_recovery_command_policy() -> RestrictedRecoveryCommandPolicy:
    return RestrictedRecoveryCommandPolicy(reader=TortoiseCommercialAccessStateRepository())


class CommercialAccessJobAuthorizer:
    """Convert an HTTP Product denial into a durable Job terminal outcome."""

    def __init__(self, *, policy: RestrictedRecoveryCommandPolicy) -> None:
        self._policy = policy

    async def authorize(
        self,
        *,
        workspace_id: UUID,
        effects: set[RestrictedRecoveryEffect],
    ) -> None:
        try:
            await self._policy.authorize(workspace_id=workspace_id, effects=effects)
        except APIError as error:
            if error.error not in {
                "WORKSPACE_PAYMENT_RECOVERY_REQUIRED",
                "WORKSPACE_PAYMENT_RESTRICTED",
            }:
                raise
            raise PermanentJobExecutionError(
                code=error.error,
                safe_message="Workspace payment state prevents this Job from creating a new billable effect",
                metadata=error.meta,
            ) from error


def build_commercial_access_job_authorizer() -> CommercialAccessJobAuthorizer:
    return CommercialAccessJobAuthorizer(policy=build_restricted_recovery_command_policy())


def workspace_ai_action_effects(*, actions: Iterable[str]) -> set[RestrictedRecoveryEffect]:
    effects: set[RestrictedRecoveryEffect] = set()
    for action in actions:
        effect = _WORKSPACE_AI_ACTION_EFFECTS.get(action)
        if effect is None:
            raise Conflict(error="COMMERCIAL_COMMAND_EFFECT_UNCLASSIFIED")
        effects.add(effect)
    if not effects:
        raise Conflict(error="COMMERCIAL_COMMAND_EFFECT_UNCLASSIFIED")
    return effects
