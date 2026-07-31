from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from pydantic import ConfigDict
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.commerce.billing import CommercePlanRevisionEntitlement, WorkspaceSubscription


class WorkspaceRevisionEntitlement(BaseSchema):
    """Raw typed entitlement row bound to a Workspace subscription revision."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str | None
    definition_is_active: bool | None
    supports_workspace_allocation: bool | None
    supports_member_seat_allocation: bool | None
    is_included: bool | None
    allocation_mode: str | None
    seat_limit_kind: str | None
    seat_limit_value: int | None


class WorkspaceEntitlementSource(BaseSchema):
    """Commerce authority snapshot sourced only from the bound Plan Revision."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    plan_code: str | None
    subscription_status: str | None
    current_period_end: datetime | None
    plan_revision_id: UUID | None
    plan_revision_status: str | None
    plan_revision_published_at: datetime | None
    entitlements: tuple[WorkspaceRevisionEntitlement, ...]


class EntitlementSourceReader(Protocol):
    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceEntitlementSource | None: ...


class EntitlementRepository(TortoiseORMRepository):
    def __init__(self) -> None:
        super().__init__(WorkspaceSubscription)

    async def get_workspace_source(
        self,
        *,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceEntitlementSource | None:
        subscription_query = WorkspaceSubscription.filter(workspace_id=workspace_id).select_related(
            "plan_revision__plan"
        )
        if conn is not None:
            subscription_query = subscription_query.using_db(conn)
        subscription = await subscription_query.first()
        if subscription is None:
            return None

        revision = getattr(subscription, "plan_revision", None)
        revision_id = getattr(subscription, "plan_revision_id", None)
        entitlement_query = CommercePlanRevisionEntitlement.filter(plan_revision_id=revision_id)
        if conn is not None:
            entitlement_query = entitlement_query.using_db(conn)
        rows = await entitlement_query.values(
            "entitlement__key",
            "entitlement__is_active",
            "entitlement__supports_workspace_allocation",
            "entitlement__supports_member_seat_allocation",
            "is_included",
            "allocation_mode",
            "seat_limit_kind",
            "seat_limit_value",
        )

        return WorkspaceEntitlementSource.model_construct(
            workspace_id=workspace_id,
            plan_code=getattr(getattr(revision, "plan", None), "code", None),
            subscription_status=getattr(subscription, "status", None),
            current_period_end=getattr(subscription, "current_period_end", None),
            plan_revision_id=revision_id,
            plan_revision_status=getattr(revision, "status", None),
            plan_revision_published_at=getattr(revision, "published_at", None),
            entitlements=tuple(
                WorkspaceRevisionEntitlement.model_construct(
                    key=row.get("entitlement__key"),
                    definition_is_active=row.get("entitlement__is_active"),
                    supports_workspace_allocation=row.get("entitlement__supports_workspace_allocation"),
                    supports_member_seat_allocation=row.get("entitlement__supports_member_seat_allocation"),
                    is_included=row.get("is_included"),
                    allocation_mode=row.get("allocation_mode"),
                    seat_limit_kind=row.get("seat_limit_kind"),
                    seat_limit_value=row.get("seat_limit_value"),
                )
                for row in rows
            ),
        )
