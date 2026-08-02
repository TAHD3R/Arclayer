from __future__ import annotations

from enum import StrEnum
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class HostingVisitorDeliveryGate(StrEnum):
    CONTINUITY = "continuity"
    SUSPENDED = "suspended"
    SERVING = "serving"


class HostingDeliveryTarget(BaseModel):
    """Immutable delivery identity shared by Hosting and the delivery owner."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    site_id: UUID
    runtime_id: UUID
    preserved_release_id: UUID | None


class HostingDeliveryTargetResult(BaseModel):
    """Per-target outcome for a Hosting-owned delivery operation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    target: HostingDeliveryTarget
    succeeded: bool
    operation_identity: str | None = None
    verification_evidence: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None


class HostingRestorationTarget(BaseModel):
    """A durable restoration operation bound to its exact delivery target."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    target: HostingDeliveryTarget
    operation_identity: str


class HostingDeliveryPort(Protocol):
    """Hosting's boundary to the delivery owner; no Commerce or publish mutation is permitted."""

    async def list_current_serving_targets(self, *, workspace_id: UUID) -> tuple[HostingDeliveryTarget, ...]: ...

    async def apply_visitor_delivery_gate(
        self,
        *,
        workspace_id: UUID,
        gate: HostingVisitorDeliveryGate,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]: ...

    async def invalidate_delivery_cache(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]: ...

    async def start_restoration(
        self,
        *,
        workspace_id: UUID,
        source_identity: str,
        targets: tuple[HostingDeliveryTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]: ...

    async def verify_restoration(
        self,
        *,
        workspace_id: UUID,
        targets: tuple[HostingRestorationTarget, ...],
    ) -> tuple[HostingDeliveryTargetResult, ...]: ...
