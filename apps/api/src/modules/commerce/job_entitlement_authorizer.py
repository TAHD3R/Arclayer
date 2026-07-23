from __future__ import annotations

from typing import Final, Protocol, cast
from uuid import UUID

from pydantic import ConfigDict, Field, ValidationError

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.exceptions import Forbidden, ServiceUnavailable
from src.modules.commerce.entitlement_schema import EntitlementDecision, EntitlementDecisionReason
from src.modules.commerce.entitlement_service import (
    COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
    COMMERCE_ENTITLEMENT_REQUIRED,
)
from src.modules.jobs.execution_errors import (
    JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
    PermanentJobExecutionError,
    TransientJobExecutionError,
)
from src.modules.jobs.registry import JobTerminalErrorContract


class JobEntitlementRequiredMetadata(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    entitlement: str = Field(min_length=3, max_length=160)
    reason: EntitlementDecisionReason
    plan_code: str | None = Field(default=None, min_length=1, max_length=48)


class JobEntitlementConfigurationMetadata(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    reason: str = Field(min_length=1, max_length=160)


COMMERCE_ENTITLEMENT_JOB_TERMINAL_ERROR_CONTRACTS: Final = (
    JobTerminalErrorContract(
        code=COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
        metadata_schema=JobEntitlementConfigurationMetadata,
    ),
    JobTerminalErrorContract(
        code=COMMERCE_ENTITLEMENT_REQUIRED,
        metadata_schema=JobEntitlementRequiredMetadata,
    ),
)


class EntitlementRequirementChecker(Protocol):
    async def require(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
    ) -> EntitlementDecision: ...


class WorkspaceCommerceJobEntitlementAuthorizer:
    """Translate Commerce authorization failures into durable Job error evidence."""

    __slots__ = ("_entitlements",)

    def __init__(self, entitlements: EntitlementRequirementChecker) -> None:
        self._entitlements = entitlements

    async def authorize(
        self,
        *,
        workspace_id: UUID,
        entitlement: str,
    ) -> None:
        try:
            await self._entitlements.require(
                workspace_id=workspace_id,
                entitlement=entitlement,
            )
        except Forbidden as error:
            if error.error != COMMERCE_ENTITLEMENT_REQUIRED:
                raise
            metadata = _error_metadata(JobEntitlementRequiredMetadata, error.meta)
            raise PermanentJobExecutionError(
                code=COMMERCE_ENTITLEMENT_REQUIRED,
                safe_message="The workspace plan no longer grants this background job entitlement",
                metadata=metadata,
            ) from error
        except ServiceUnavailable as error:
            if error.error != COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID:
                raise
            metadata = _error_metadata(JobEntitlementConfigurationMetadata, error.meta)
            raise TransientJobExecutionError(
                code=COMMERCE_ENTITLEMENT_CONFIGURATION_INVALID,
                safe_message="Commerce entitlement configuration is temporarily invalid",
                metadata=metadata,
            ) from error


def _error_metadata(
    schema: type[JobEntitlementRequiredMetadata] | type[JobEntitlementConfigurationMetadata],
    raw_metadata: object,
) -> JsonObject:
    try:
        metadata = schema.model_validate(raw_metadata)
    except ValidationError as error:
        raise PermanentJobExecutionError(
            code=JOB_EXECUTION_CONTRACT_MISMATCH_CODE,
            safe_message="Commerce entitlement authorization returned invalid error metadata",
        ) from error
    return cast(JsonObject, metadata.model_dump(mode="json", by_alias=True))
