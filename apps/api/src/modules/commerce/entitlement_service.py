from __future__ import annotations

from datetime import UTC, datetime
from typing import NoReturn
from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient

from src.config import Settings
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.core.services.base import BaseService
from src.models.commerce.billing import (
    EntitlementAllocationMode,
    PlanRevisionStatus,
    ResourceLimitKind,
    SubscriptionStatus,
)
from src.modules.commerce.entitlement_repository import (
    EntitlementSourceReader,
    WorkspaceEntitlementSource,
    WorkspaceRevisionEntitlement,
)
from src.modules.commerce.entitlement_schema import (
    DEFAULT_ENTITLEMENT_REGISTRY,
    EntitlementDecision,
    EntitlementDecisionReason,
    EntitlementRegistry,
)

COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID = "COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID"
COMMERCE_ENTITLEMENT_REQUIRED = "COMMERCE_ENTITLEMENT_REQUIRED"

_ACTIVE_SUBSCRIPTION_STATUSES = frozenset({SubscriptionStatus.ACTIVE})


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
        conn: BaseDBAsyncClient | None = None,
    ) -> EntitlementDecision:
        definition = self._registry.require(entitlement)
        evaluated_at = now if now is not None else datetime.now(UTC)
        if evaluated_at.utcoffset() is None:
            raise ValueError("Entitlement evaluation time must be timezone-aware")

        source = await self._repository.get_workspace_source(workspace_id=workspace_id, conn=conn)
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
        if source.current_period_end is None or source.current_period_end.utcoffset() is None:
            self._raise_configuration_invalid(reason="subscription_period_timezone_invalid")
        if source.current_period_end <= evaluated_at:
            return self._decision_from_source(
                source=source,
                entitlement=definition.key,
                status=status,
                reason="subscription_period_expired",
            )

        self._require_published_revision(source)
        entitlement_rows = self._validated_entitlement_rows(source)
        row = entitlement_rows[definition.key]
        if not row.is_included:
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
        )

    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
        now: datetime | None = None,
        conn: BaseDBAsyncClient | None = None,
    ) -> EntitlementDecision:
        decision = await self.check(
            workspace_id=workspace_id,
            entitlement=entitlement,
            now=now,
            conn=conn,
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
        except (TypeError, ValueError) as exc:
            cls._raise_configuration_invalid(reason="subscription_status_invalid", cause=exc)

    @classmethod
    def _require_published_revision(cls, source: WorkspaceEntitlementSource) -> None:
        if source.plan_revision_id is None or source.plan_code is None:
            cls._raise_configuration_invalid(reason="plan_revision_missing")
        try:
            status = PlanRevisionStatus(source.plan_revision_status)
        except (TypeError, ValueError) as exc:
            cls._raise_configuration_invalid(reason="plan_revision_status_invalid", cause=exc)
        if status is not PlanRevisionStatus.PUBLISHED:
            cls._raise_configuration_invalid(reason="plan_revision_not_published")
        if source.plan_revision_published_at is None:
            cls._raise_configuration_invalid(reason="plan_revision_unpublished")
        if source.plan_revision_published_at.utcoffset() is None:
            cls._raise_configuration_invalid(reason="plan_revision_publication_timezone_invalid")

    def _validated_entitlement_rows(
        self,
        source: WorkspaceEntitlementSource,
    ) -> dict[str, WorkspaceRevisionEntitlement]:
        rows_by_key: dict[str, list[WorkspaceRevisionEntitlement]] = {}
        for row in source.entitlements:
            if not isinstance(row.key, str):
                self._raise_configuration_invalid(reason="entitlement_row_key_invalid")
            rows_by_key.setdefault(row.key, []).append(row)

        validated: dict[str, WorkspaceRevisionEntitlement] = {}
        for definition in self._registry.list_definitions():
            rows = rows_by_key.get(definition.key, [])
            if not rows:
                self._raise_configuration_invalid(reason="entitlement_row_missing")
            if len(rows) != 1:
                self._raise_configuration_invalid(reason="entitlement_row_duplicate")
            row = rows[0]
            self._validate_entitlement_row(row)
            validated[definition.key] = row
        return validated

    @classmethod
    def _validate_entitlement_row(cls, row: WorkspaceRevisionEntitlement) -> None:
        if row.definition_is_active is not True:
            cls._raise_configuration_invalid(reason="entitlement_definition_inactive")
        if not isinstance(row.supports_workspace_allocation, bool) or not isinstance(
            row.supports_member_seat_allocation, bool
        ):
            cls._raise_configuration_invalid(reason="entitlement_definition_allocation_invalid")
        if not isinstance(row.is_included, bool):
            cls._raise_configuration_invalid(reason="entitlement_row_inclusion_invalid")
        if not row.is_included:
            if row.allocation_mode is not None or row.seat_limit_kind is not None or row.seat_limit_value is not None:
                cls._raise_configuration_invalid(reason="entitlement_row_exclusion_shape_invalid")
            return

        try:
            allocation_mode = EntitlementAllocationMode(row.allocation_mode)
        except (TypeError, ValueError) as exc:
            cls._raise_configuration_invalid(reason="entitlement_allocation_mode_invalid", cause=exc)
        if allocation_mode is EntitlementAllocationMode.WORKSPACE:
            if not row.supports_workspace_allocation:
                cls._raise_configuration_invalid(reason="entitlement_workspace_allocation_unsupported")
            if row.seat_limit_kind is not None or row.seat_limit_value is not None:
                cls._raise_configuration_invalid(reason="entitlement_workspace_allocation_shape_invalid")
            return

        if not row.supports_member_seat_allocation:
            cls._raise_configuration_invalid(reason="entitlement_member_seat_allocation_unsupported")
        try:
            seat_limit_kind = ResourceLimitKind(row.seat_limit_kind)
        except (TypeError, ValueError) as exc:
            cls._raise_configuration_invalid(reason="entitlement_member_seat_limit_kind_invalid", cause=exc)
        if seat_limit_kind is ResourceLimitKind.LIMITED:
            if (
                not isinstance(row.seat_limit_value, int)
                or isinstance(row.seat_limit_value, bool)
                or row.seat_limit_value <= 0
            ):
                cls._raise_configuration_invalid(reason="entitlement_member_seat_limit_invalid")
            return
        if row.seat_limit_value is not None:
            cls._raise_configuration_invalid(reason="entitlement_member_seat_unlimited_shape_invalid")

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
    ) -> EntitlementDecision:
        return EntitlementDecision(
            workspace_id=source.workspace_id,
            entitlement=entitlement,
            granted=reason == "granted",
            reason=reason,
            plan_code=source.plan_code,
            subscription_status=status,
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
