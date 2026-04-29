from __future__ import annotations

from collections.abc import Callable
from typing import Any

from src.core.logging import get_logger

logger = get_logger(__name__)


class PluginConfig:
    """Validates and merges plugin configuration.

    Each plugin can declare a default config and an optional validator.
    User-provided config is deep-merged over defaults.
    """

    def __init__(
        self,
        *,
        plugin_name: str,
        default: dict[str, Any] | None = None,
        validator: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._plugin_name = plugin_name
        self._default = default or {}
        self._validator = validator

    @property
    def default(self) -> dict[str, Any]:
        return dict(self._default)

    def merge(self, user_config: dict[str, Any] | None) -> dict[str, Any]:
        merged = _deep_merge(self._default, user_config or {})
        if self._validator is not None:
            try:
                self._validator(merged)
            except Exception:
                logger.exception("Plugin config validation failed", plugin=self._plugin_name)
                raise
        return merged

    def validate(self, config: dict[str, Any]) -> None:
        if self._validator is not None:
            self._validator(config)


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result
