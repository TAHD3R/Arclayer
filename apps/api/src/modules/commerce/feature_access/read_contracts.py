from __future__ import annotations

from collections.abc import Iterable, Mapping
from types import MappingProxyType
from typing import Annotated, Literal, Protocol
from uuid import UUID

from pydantic import ConfigDict, Field
from tortoise.backends.base.client import BaseDBAsyncClient

from src.common.schemas import BaseSchema
from src.modules.commerce.feature_access.contracts import FeatureAccessCapacity


class FeatureAccessCapabilityMetadata(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    entitlement_key: str = Field(min_length=3, max_length=160)
    name_i18n_key: str = Field(min_length=1, max_length=160)
    description_i18n_key: str = Field(min_length=1, max_length=160)


class FeatureAccessMetadataRegistry:
    __slots__ = ("_by_entitlement_key",)

    def __init__(self, definitions: Iterable[FeatureAccessCapabilityMetadata]) -> None:
        indexed: dict[str, FeatureAccessCapabilityMetadata] = {}
        for definition in definitions:
            if definition.entitlement_key in indexed:
                raise ValueError(f"Duplicate Feature Access metadata: {definition.entitlement_key}")
            indexed[definition.entitlement_key] = definition
        self._by_entitlement_key: Mapping[str, FeatureAccessCapabilityMetadata] = MappingProxyType(indexed)

    def require(self, entitlement_key: str) -> FeatureAccessCapabilityMetadata:
        definition = self._by_entitlement_key.get(entitlement_key)
        if definition is None:
            raise KeyError(entitlement_key)
        return definition


EMPTY_FEATURE_ACCESS_METADATA_REGISTRY = FeatureAccessMetadataRegistry(())


class FeatureAccessCapabilityState(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    entitlement_key: str
    metadata: FeatureAccessCapabilityMetadata
    capacity: FeatureAccessCapacity
    revision: int = Field(ge=0)
    assigned_membership_ids: tuple[UUID, ...]


class FeatureAccessReadSnapshot(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    actor_membership_id: UUID
    role_management_included: bool
    capabilities: tuple[FeatureAccessCapabilityState, ...]


class MemberFeatureAccessCapability(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    projection: Literal["member"] = "member"
    entitlement_key: str
    metadata: FeatureAccessCapabilityMetadata
    capacity: FeatureAccessCapacity
    revision: int = Field(ge=0)
    assigned_count: int = Field(ge=0)
    available_count: int | None = Field(default=None, ge=0)
    current_membership_assigned: bool


class ManagerFeatureAccessCapability(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    projection: Literal["manager"] = "manager"
    entitlement_key: str
    metadata: FeatureAccessCapabilityMetadata
    capacity: FeatureAccessCapacity
    revision: int = Field(ge=0)
    assigned_count: int = Field(ge=0)
    available_count: int | None = Field(default=None, ge=0)
    assigned_membership_ids: tuple[UUID, ...]


type FeatureAccessCapabilityProjection = Annotated[
    MemberFeatureAccessCapability | ManagerFeatureAccessCapability,
    Field(discriminator="projection"),
]


class FeatureAccessReadResult(BaseSchema):
    model_config = ConfigDict(extra="forbid", frozen=True)

    workspace_id: UUID
    capabilities: tuple[FeatureAccessCapabilityProjection, ...]


class FeatureAccessReadPersistence(Protocol):
    async def read_workspace_feature_access(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
        conn: BaseDBAsyncClient,
    ) -> FeatureAccessReadSnapshot | None: ...
