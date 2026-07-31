from __future__ import annotations

from collections.abc import Iterable, Mapping
from types import MappingProxyType
from typing import Final, Literal

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.public_uuid import PublicUUID
from src.models.commerce.billing import SubscriptionStatus


class EntitlementDefinition(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str = Field(
        min_length=3,
        max_length=160,
        pattern=r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$",
    )


type EntitlementDecisionReason = Literal[
    "granted",
    "subscription_missing",
    "subscription_inactive",
    "subscription_period_expired",
    "feature_missing",
    "feature_excluded",
]


class EntitlementDecision(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: PublicUUID
    entitlement: str
    granted: bool
    reason: EntitlementDecisionReason
    plan_code: str | None = None
    subscription_status: SubscriptionStatus | None = None
    value: str | int | bool | None = None


class EntitlementRegistry:
    __slots__ = ("_definitions",)

    def __init__(self, definitions: Iterable[EntitlementDefinition]) -> None:
        indexed: dict[str, EntitlementDefinition] = {}
        for definition in definitions:
            if definition.key in indexed:
                raise ValueError(f"Duplicate entitlement key: {definition.key}")
            indexed[definition.key] = definition
        self._definitions: Mapping[str, EntitlementDefinition] = MappingProxyType(indexed)

    def require(self, key: str) -> EntitlementDefinition:
        definition = self._definitions.get(key)
        if definition is None:
            raise ValueError(f"Unknown entitlement key: {key}")
        return definition

    def list_definitions(self) -> tuple[EntitlementDefinition, ...]:
        return tuple(self._definitions[key] for key in sorted(self._definitions))


SITE_GENERATION_ENTITLEMENT: Final = "sites.generate"
WORKSPACE_ROLES_MANAGE_ENTITLEMENT: Final = "workspace.roles.manage"

DEFAULT_ENTITLEMENT_REGISTRY = EntitlementRegistry((
    EntitlementDefinition(key=SITE_GENERATION_ENTITLEMENT),
    EntitlementDefinition(key=WORKSPACE_ROLES_MANAGE_ENTITLEMENT),
))
