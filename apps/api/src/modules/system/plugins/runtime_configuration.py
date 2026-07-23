from __future__ import annotations

import os
import re
from collections.abc import Iterable, Mapping
from types import MappingProxyType
from typing import cast

from src.common.types.json_types import JsonObject, JsonValue
from src.models.system.plugin_installation import PluginInstallationRecord

PLUGIN_RUNTIME_CONFIGURATION_SERVICE = "system.plugin.runtime_configuration"
_ENV_REFERENCE_PATTERN = re.compile(r"^env:([A-Z][A-Z0-9_]*)$")


class PluginSecretReferenceError(RuntimeError):
    """Raised when a persisted plugin secret reference cannot be resolved."""


class PluginRuntimeConfigurationSnapshot:
    def __init__(self, configurations: Mapping[str, JsonObject]) -> None:
        self._configurations = MappingProxyType({
            plugin_name: MappingProxyType(dict(values)) for plugin_name, values in configurations.items()
        })

    @classmethod
    def from_installations(
        cls,
        installations: Iterable[PluginInstallationRecord],
        *,
        environment: Mapping[str, str] | None = None,
    ) -> PluginRuntimeConfigurationSnapshot:
        env = os.environ if environment is None else environment
        configurations: dict[str, JsonObject] = {}
        for installation in installations:
            if not installation.desired_enabled:
                continue
            values = dict(cast(JsonObject, installation.configuration or {}))
            references = cast(dict[str, str], installation.secret_references or {})
            for field, reference in references.items():
                values[field] = _resolve_secret_reference(reference, environment=env)
            configurations[installation.plugin_name] = values
        return cls(configurations)

    def configuration_for(self, plugin_name: str) -> Mapping[str, JsonValue]:
        return self._configurations.get(plugin_name, MappingProxyType({}))


def validate_secret_reference(reference: str) -> str:
    normalized = reference.strip()
    if _ENV_REFERENCE_PATTERN.fullmatch(normalized) is None:
        raise ValueError("Plugin secret references must use the env:VARIABLE_NAME format")
    return normalized


def _resolve_secret_reference(reference: str, *, environment: Mapping[str, str]) -> str:
    normalized = validate_secret_reference(reference)
    match = _ENV_REFERENCE_PATTERN.fullmatch(normalized)
    if match is None:
        raise PluginSecretReferenceError("Plugin secret reference is invalid")
    variable_name = match.group(1)
    if variable_name not in environment:
        raise PluginSecretReferenceError(
            f"Plugin secret reference environment variable is unavailable: {variable_name}"
        )
    return environment[variable_name]
