from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema

PlatformAIRecoveryAction = Literal["retry", "cancel", "reconcile"]


class PlatformAIRecoveryAuthority(BaseSchema):
    """Explicit Platform authority; it is never a Workspace actor surrogate."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    kind: Literal["platform_operator"] = "platform_operator"
    actor_user_id: UUID
    correlation_id: UUID


class PlatformAIRecoveryCommand(BaseSchema):
    """One idempotent operator request against a durable AI Run."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    task_id: UUID
    action: PlatformAIRecoveryAction
    authority: PlatformAIRecoveryAuthority
    idempotency_key: str = Field(..., min_length=1, max_length=192)
    reason: str | None = Field(default=None, min_length=1, max_length=512)


class PlatformAIRecoveryReceipt(BaseSchema):
    """Safe mutation receipt for the Platform projection layer."""

    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    task_id: UUID
    action: PlatformAIRecoveryAction
    disposition: Literal["accepted", "already_applied"]
    workspace_id: UUID
    job_id: UUID | None
    recovery_id: UUID | None = None
    source_job_id: UUID | None = None
