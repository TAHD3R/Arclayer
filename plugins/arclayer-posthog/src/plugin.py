"""Official PostHog analytics Connector."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Self, TypedDict

import httpx
from pydantic import AnyHttpUrl, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.core.connectors import (
    ConnectorAdminMetadata,
    ConnectorDefinition,
    ConnectorKind,
    ConnectorTrustLevel,
)
from src.core.events import Event
from src.core.exceptions import ServiceUnavailable
from src.core.logging import get_logger
from src.core.registries import PluginRegistry
from src.modules.analytics.ingest.service import sanitize_properties
from src.modules.system.plugins.runtime_configuration import (
    PLUGIN_RUNTIME_CONFIGURATION_SERVICE,
    PluginRuntimeConfigurationSnapshot,
)

logger = get_logger(__name__)

_CONNECTOR_KEY = "analytics.posthog"
_EXTENSION_NAME = "arclayer-posthog"
_MAX_PROPERTY_KEYS = 50
_MAX_STRING_LENGTH = 512
_MAX_PROPERTY_DEPTH = 5


class PostHogPluginSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="POSTHOG__",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
        validate_default=True,
    )

    enabled: bool = False
    project_api_key: SecretStr = Field(default=SecretStr(""))
    host: AnyHttpUrl = AnyHttpUrl("https://us.i.posthog.com")
    timeout_seconds: float = Field(default=10, ge=1, le=30)

    @model_validator(mode="after")
    def validate_enabled_configuration(self) -> Self:
        if self.enabled and not self.project_api_key.get_secret_value():
            raise ValueError("POSTHOG__PROJECT_API_KEY is required when POSTHOG__ENABLED=true")
        return self


PostHogPluginSettings.model_rebuild(
    _types_namespace={
        "AnyHttpUrl": AnyHttpUrl,
        "SecretStr": SecretStr,
        "Self": Self,
    }
)


class PostHogAnalyticsConnector:
    def __init__(
        self,
        settings: PostHogPluginSettings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=settings.timeout_seconds)

    @property
    def enabled(self) -> bool:
        return self._settings.enabled

    async def capture_event(self, event: Event) -> None:
        sanitized_payload = sanitize_properties(
            event.payload,
            max_keys=_MAX_PROPERTY_KEYS,
            max_string_length=_MAX_STRING_LENGTH,
            max_depth=_MAX_PROPERTY_DEPTH,
        )
        properties = {
            **(sanitized_payload if isinstance(sanitized_payload, dict) else {}),
            "distinct_id": event.actor_user_id or event.trace_id or "system",
            "$lib": "arclayer-api",
            "event_version": event.version,
        }
        if event.source:
            properties["event_source"] = event.source
        if event.trace_id:
            properties["trace_id"] = event.trace_id
        groups = {
            key: str(value)
            for key, value in {
                "workspace": event.payload.get("workspaceId") or event.payload.get("workspace_id"),
                "project": event.payload.get("projectId") or event.payload.get("project_id"),
            }.items()
            if value is not None
        }
        if groups:
            properties["$groups"] = groups

        response = await self._client.post(
            f"{str(self._settings.host).rstrip('/')}/capture/",
            json={
                "api_key": self._settings.project_api_key.get_secret_value(),
                "event": event.name,
                "properties": properties,
                "timestamp": event.occurred_at.isoformat(),
            },
        )
        try:
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ServiceUnavailable(error="POSTHOG_DELIVERY_FAILED") from exc
        if not isinstance(body, dict) or body.get("status") != 1:
            raise ServiceUnavailable(error="POSTHOG_INVALID_RESPONSE")

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


class PostHogExtension:
    name = _EXTENSION_NAME

    def __init__(self) -> None:
        self._settings: PostHogPluginSettings | None = None

    def create_connector(self) -> PostHogAnalyticsConnector:
        if self._settings is None:
            raise RuntimeError("PostHog Connector factory was called before plugin registration")
        return PostHogAnalyticsConnector(self._settings)

    def arclayer_register(self, registry: PluginRegistry) -> None:
        self._settings = _resolve_settings(registry)
        registry.connectors.register(
            extension=self.name,
            definition=ConnectorDefinition(
                key=_CONNECTOR_KEY,
                kind=ConnectorKind.ANALYTICS,
                version="1.0.0",
                trust_level=ConnectorTrustLevel.OFFICIAL,
                capabilities=("capture", "identify_by_actor", "group_properties"),
                config_schema={
                    "enabled": {"type": "boolean", "default": False},
                    "host": {
                        "type": "string",
                        "format": "uri",
                        "default": "https://us.i.posthog.com",
                    },
                    "timeoutSeconds": {
                        "type": "number",
                        "minimum": 1,
                        "maximum": 30,
                        "default": 10,
                    },
                },
                secret_schema={
                    "projectApiKey": {
                        "type": "string",
                        "writeOnly": True,
                        "x-required-when-enabled": True,
                    }
                },
                scopes=("domain_events",),
                health_contract=("configured", "reachable"),
                admin=ConnectorAdminMetadata(
                    label_key="settings:SETTINGS_SYSTEM_PLUGIN_POSTHOG_NAME",
                    description_key="settings:SETTINGS_SYSTEM_PLUGIN_POSTHOG_DESC",
                    settings_section="analytics_posthog",
                    icon_key="posthog",
                ),
            ),
            factory=self.create_connector,
        )
        logger.info("PostHog analytics Connector registered", connector=_CONNECTOR_KEY)


def _resolve_settings(registry: PluginRegistry) -> PostHogPluginSettings:
    snapshot = registry.services.resolve(PLUGIN_RUNTIME_CONFIGURATION_SERVICE)
    if snapshot is None:
        return PostHogPluginSettings()
    if not isinstance(snapshot, PluginRuntimeConfigurationSnapshot):
        raise TypeError("Plugin runtime configuration service has an invalid type")
    values = snapshot.configuration_for(_EXTENSION_NAME)
    return PostHogPluginSettings(**_settings_input(values))


class _PostHogSettingsInput(TypedDict, total=False):
    enabled: bool
    project_api_key: SecretStr
    host: AnyHttpUrl
    timeout_seconds: float


def _settings_input(values: Mapping[str, object]) -> _PostHogSettingsInput:
    settings = _PostHogSettingsInput()
    if "enabled" in values:
        enabled = values["enabled"]
        if not isinstance(enabled, bool):
            raise TypeError("PostHog enabled configuration must be boolean")
        settings["enabled"] = enabled
    if "projectApiKey" in values:
        project_api_key = values["projectApiKey"]
        if not isinstance(project_api_key, str):
            raise TypeError("PostHog projectApiKey configuration must resolve to a string")
        settings["project_api_key"] = SecretStr(project_api_key)
    if "host" in values:
        host = values["host"]
        if not isinstance(host, str):
            raise TypeError("PostHog host configuration must be a URI string")
        settings["host"] = AnyHttpUrl(host)
    if "timeoutSeconds" in values:
        timeout = values["timeoutSeconds"]
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
            raise TypeError("PostHog timeoutSeconds configuration must be numeric")
        settings["timeout_seconds"] = float(timeout)
    return settings


def create_plugin() -> PostHogExtension:
    return PostHogExtension()
