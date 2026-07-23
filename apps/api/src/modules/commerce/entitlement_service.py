from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn
from uuid import UUID

from pydantic import ValidationError

from src.config import Settings
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import SubscriptionStatus
from src.modules.commerce.entitlement_repository import (
    EntitlementSourceReader,
    WorkspaceEntitlementSource,
)
from src.modules.commerce.entitlement_schema import (
    DEFAULT_ENTITLEMENT_REGISTRY,
    EntitlementDecision,
    EntitlementDecisionReason,
    EntitlementRegistry,
    PlanEntitlementFeature,
)

COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID = "COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID"
COMMERCE_ENTITLEMENT_REQUIRED = "COMMERCE_ENTITLEMENT_REQUIRED"

_ACTIVE_SUBSCRIPTION_STATUSES = frozenset({SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE})


class EntitlementService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repository: EntitlementSourceReader,
        registry: EntitlementRegistry = DEFAULT_ENTITLEMENT_REGISTRY,
    ) -> None:
        super().__init__(settings)
        self._repository = repository
        self._registry = registry

    async def check(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        now: datetime | None = None,
    ) -> EntitlementDecision:
        definition = self._registry.require(entitlement)
        evaluated_at = now if now is not None else datetime.now(UTC)
        if evaluated_at.utcoffset() is None:
            raise ValueError("Entitlement evaluation time must be timezone-aware")

        source = await self._repository.get_workspace_source(workspace_id=workspace_id)
        if source is None:
            return self._decision(
                workspace_id=workspace_id,
                entitlement=definition.key,
                reason="subscription_missing",
            )
        status = self._subscription_status(source)
        if status not in _ACTIVE_SUBSCRIPTION_STATUSES:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="subscription_inactive",
            )
        if source.current_period_end.utcoffset() is None:
            self._raise_configuration_invalid(reason="subscription_period_timezone_invalid")
        if source.current_period_end <= evaluated_at:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="subscription_period_expired",
            )
        if not source.plan_is_active:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="plan_inactive",
            )

        feature = self._plan_features(source.plan_features).get(definition.key)
        if feature is None:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="feature_missing",
            )
        if not feature.included:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="feature_excluded",
            )
        return self._decision_from_source(
            source=source,
            entitlement=definition.key,
            status=status,
            reason="granted",
            value=feature.value,
        )

    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        now: datetime | None = None,
    ) -> EntitlementDecision:
        decision = await self.check(
            workspace_id=workspace_id,
            entitlement=entitlement,
            now=now,
        )
        if decision.granted:
            return decision
        meta: dict[str, object] = {
            "entitlement": decision.entitlement,
            "reason": decision.reason,
        }
        if decision.plan_code is not None:
            meta["planCode"] = decision.plan_code
        raise Forbidden(
            "Workspace plan does not grant the required entitlement",
            error=COMMERCE_ENTITLEMENT_REQUIRED,
            meta=meta,
        )

    @classmethod
    def _subscription_status(cls, source: WorkspaceEntitlementSource) -> SubscriptionStatus:
        try:
            return SubscriptionStatus(source.subscription_status)
        except ValueError as exc:
            cls._raise_configuration_invalid(reason="subscription_status_invalid", cause=exc)

    @classmethod
    def _plan_features(cls, raw_features: object) -> dict[str, PlanEntitlementFeature]:
        if not isinstance(raw_features, list):
            cls._raise_configuration_invalid(reason="plan_features_not_list")
        features: dict[str, PlanEntitlementFeature] = {}
        for raw_feature in raw_features:
            try:
                feature = PlanEntitlementFeature.model_validate(raw_feature)
            except ValidationError as exc:
                cls._raise_configuration_invalid(reason="plan_feature_invalid", cause=exc)
            if feature.key in features:
                cls._raise_configuration_invalid(reason="plan_feature_duplicate")
            features[feature.key] = feature
        return features

    @staticmethod
    def _decision(
        *,
        workspace_id: UUID,
        entitlement: str,
        reason: EntitlementDecisionReason,
    ) -> EntitlementDecision:
        return EntitlementDecision(
            workspace_id=workspace_id,
            entitlement=entitlement,
            granted=False,
            reason=reason,
        )

    @staticmethod
    def _decision_from_source(
        *,
        source: WorkspaceEntitlementSource,
        entitlement: str,
        status: SubscriptionStatus,
        reason: EntitlementDecisionReason,
        value: str | int | bool | None = None,
    ) -> EntitlementDecision:
        return EntitlementDecision(
            workspace_id=source.workspace_id,
            entitlement=entitlement,
            granted=reason == "granted",
            reason=reason,
            plan_code=source.plan_code,
            subscription_status=status,
            value=value,
        )

    @staticmethod
    def _raise_configuration_invalid(
        *,
        reason: str,
        cause: Exception | None = None,
    ) -> NoReturn:
        error = ServiceUnavailable(
            "Commerce entitlement configuration is invalid",
            error=COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
            meta={"reason": reason},
        )
        if cause is None:
            raise error
        raise error from cause
