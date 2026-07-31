from __future__ import annotations

from src.config import Settings
from src.core.exceptions import APIError, Conflict, ServiceUnavailable
from src.core.services import BaseService
from src.modules.commerce.access_state.schema import CommercialAccessProjection, CommercialAccessState
from src.modules.commerce.dunning.schema import (
    PaymentRestrictedErrorMeta,
    RestrictedRecoveryCommand,
    RestrictedRecoveryCommandClass,
    RestrictedRecoveryDecision,
    RestrictedRecoveryEffect,
)

_EFFECT_CLASS: dict[RestrictedRecoveryEffect, RestrictedRecoveryCommandClass] = {
    RestrictedRecoveryEffect.READ_EXISTING: RestrictedRecoveryCommandClass.PRESERVED,
    RestrictedRecoveryEffect.DOWNLOAD_EXISTING: RestrictedRecoveryCommandClass.PRESERVED,
    RestrictedRecoveryEffect.EXPORT_EXISTING: RestrictedRecoveryCommandClass.PRESERVED,
    RestrictedRecoveryEffect.INSPECT_PLAN_USAGE: RestrictedRecoveryCommandClass.RECOVERY,
    RestrictedRecoveryEffect.OPEN_PROVIDER_RECOVERY: RestrictedRecoveryCommandClass.RECOVERY,
    RestrictedRecoveryEffect.COMPLETE_PAYMENT_RECOVERY: RestrictedRecoveryCommandClass.RECOVERY,
    RestrictedRecoveryEffect.REVOKE_SESSION: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.REVOKE_API_KEY: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.REVOKE_CONNECTOR_CREDENTIAL: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.REVOKE_PENDING_INVITATION: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.REMOVE_MEMBER_ACCESS: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.REVOKE_FEATURE_SEAT: RestrictedRecoveryCommandClass.SECURITY,
    RestrictedRecoveryEffect.CONTACT_SUPPORT: RestrictedRecoveryCommandClass.LIFECYCLE,
    RestrictedRecoveryEffect.PRIVACY_RIGHT: RestrictedRecoveryCommandClass.LIFECYCLE,
    RestrictedRecoveryEffect.WORKSPACE_LIFECYCLE: RestrictedRecoveryCommandClass.LIFECYCLE,
    RestrictedRecoveryEffect.CONTENT_MUTATION: RestrictedRecoveryCommandClass.VALUE_EXPANSION,
    RestrictedRecoveryEffect.METERED_EXTERNAL_EFFECT: RestrictedRecoveryCommandClass.VALUE_EXPANSION,
    RestrictedRecoveryEffect.ACCESS_EXPANSION: RestrictedRecoveryCommandClass.VALUE_EXPANSION,
    RestrictedRecoveryEffect.ASSIGN_FEATURE_SEAT: RestrictedRecoveryCommandClass.VALUE_EXPANSION,
}


class RestrictedRecoveryService(BaseService):
    """Classifies Product commands without mutating Commerce or other domains."""

    def __init__(self, *, settings: Settings | None = None) -> None:
        super().__init__(settings)

    def classify(
        self,
        *,
        projection: CommercialAccessProjection | None,
        effects: set[RestrictedRecoveryEffect],
    ) -> RestrictedRecoveryDecision:
        if projection is None:
            raise ServiceUnavailable(error="COMMERCIAL_ACCESS_STATE_UNAVAILABLE")
        command = RestrictedRecoveryCommand(effects=effects)
        command_class = self._single_command_class(command=command)
        if projection.state != CommercialAccessState.PAYMENT_RESTRICTED:
            return RestrictedRecoveryDecision(allowed=True, command_class=command_class)
        if command_class == RestrictedRecoveryCommandClass.VALUE_EXPANSION:
            metadata = PaymentRestrictedErrorMeta()
            raise APIError(
                error="WORKSPACE_PAYMENT_RESTRICTED",
                status_code=402,
                meta=metadata.model_dump(mode="json", by_alias=True),
            )
        return RestrictedRecoveryDecision(
            allowed=True,
            command_class=command_class,
            explanation_key="commerce:PAYMENT_RESTRICTED",
            permitted_recovery_action="open_payment_recovery",
        )

    @staticmethod
    def _single_command_class(*, command: RestrictedRecoveryCommand) -> RestrictedRecoveryCommandClass:
        classes = {_EFFECT_CLASS[effect] for effect in command.effects}
        if len(classes) != 1:
            raise Conflict(error="WORKSPACE_PAYMENT_RESTRICTED_MIXED_COMMAND")
        return classes.pop()
