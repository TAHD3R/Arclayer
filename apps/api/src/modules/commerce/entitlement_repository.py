from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import WorkspaceSubscription


class WorkspaceEntitlementSource(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    plan_code: str
    plan_is_active: bool
    subscription_status: str
    current_period_end: datetime
    plan_features: object


class EntitlementSourceReader(Protocol):
    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
    ) -> WorkspaceEntitlementSource | None: ...


class EntitlementRepository(TortoiseORMRepository):
    def __init__(self) -> None:
        super().__init__(WorkspaceSubscription)

    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
    ) -> WorkspaceEntitlementSource | None:
        subscription = await WorkspaceSubscription.filter(workspace_id=workspace_id).select_related("plan").first()
        if subscription is None:
            return None
        plan = subscription.plan
        return WorkspaceEntitlementSource(
            workspace_id=workspace_id,
            plan_code=str(plan.code),
            plan_is_active=bool(plan.is_active),
            subscription_status=str(subscription.status),
            current_period_end=subscription.current_period_end,
            plan_features=deepcopy(plan.features),
        )
