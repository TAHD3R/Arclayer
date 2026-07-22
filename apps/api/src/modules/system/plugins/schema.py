from __future__ import annotations

from pydantic import Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject
from src.core.connectors import ConnectorKind, ConnectorTrustLevel
from src.core.extensions.manifest import PackageState, ProcessState


class SystemPluginProvidesOut(BaseSchema):
    services: list[str] = Field(default_factory=list)
    middlewares: list[str] = Field(default_factory=list)
    providers: list[str] = Field(default_factory=list)
    connectors: list[str] = Field(default_factory=list)
    content_types: list[str] = Field(default_factory=list)


class SystemPluginAdminOut(BaseSchema):
    label_key: str
    description_key: str
    settings_path: str | None = None


class SystemConnectorAdminOut(BaseSchema):
    label_key: str
    description_key: str
    settings_section: str | None = None
    icon_key: str | None = None


class SystemConnectorDefinitionOut(BaseSchema):
    key: str
    kind: ConnectorKind
    version: str
    trust_level: ConnectorTrustLevel
    capabilities: list[str] = Field(default_factory=list)
    config_schema: JsonObject = Field(default_factory=dict)
    secret_schema: JsonObject = Field(default_factory=dict)
    scopes: list[str] = Field(default_factory=list)
    webhook_events: list[str] = Field(default_factory=list)
    health_contract: list[str] = Field(default_factory=list)
    admin: SystemConnectorAdminOut | None = None


class SystemPluginListItemOut(BaseSchema):
    name: str
    version: str
    package_state: PackageState
    process_state: ProcessState
    provides: SystemPluginProvidesOut
    permissions: list[str] = Field(default_factory=list)
    config_schema: JsonObject = Field(default_factory=dict)
    admin: SystemPluginAdminOut | None = None
    connector_definitions: list[SystemConnectorDefinitionOut] = Field(default_factory=list)


class SystemPluginListOut(BaseSchema):
    plugins: list[SystemPluginListItemOut] = Field(default_factory=list)
