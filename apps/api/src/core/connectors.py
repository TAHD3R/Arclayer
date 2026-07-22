from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from src.common.types.json_types import JsonObject


class ConnectorKind(StrEnum):
    BILLING = "billing"
    OAUTH = "oauth"
    ANALYTICS = "analytics"
    EMAIL = "email"


class ConnectorTrustLevel(StrEnum):
    OFFICIAL = "official"
    THIRD_PARTY = "third_party"


class ConnectorAdminMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    label_key: str = Field(..., min_length=3, max_length=160)
    description_key: str = Field(..., min_length=3, max_length=160)
    settings_section: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]*$")
    icon_key: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_-]*$")


class ConnectorDefinition(BaseModel):
    """Typed, plugin-owned description of an external integration."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str = Field(..., pattern=r"^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$", max_length=128)
    kind: ConnectorKind
    version: str = Field(..., min_length=1, max_length=64)
    trust_level: ConnectorTrustLevel
    capabilities: tuple[str, ...] = ()
    config_schema: JsonObject = Field(default_factory=dict)
    secret_schema: JsonObject = Field(default_factory=dict)
    scopes: tuple[str, ...] = ()
    webhook_events: tuple[str, ...] = ()
    health_contract: tuple[str, ...] = ()
    admin: ConnectorAdminMetadata | None = None


ConnectorFactory = Callable[[], object]


class ConnectorRegistration(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    extension: str
    definition: ConnectorDefinition
    factory: ConnectorFactory


class ConnectorRegistrationError(RuntimeError):
    """Raised when Connector registration is ambiguous or inconsistent."""
