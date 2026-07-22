from __future__ import annotations

from fastapi import Request

from src.core.exceptions import ServiceUnavailable
from src.core.extensions.manager import ExtensionManager
from src.core.registries import ConnectorRegistry


def get_connector_registry(request: Request) -> ConnectorRegistry:
    manager = getattr(request.app.state, "extension_manager", None)
    if not isinstance(manager, ExtensionManager):
        raise ServiceUnavailable(error="EXTENSION_RUNTIME_UNAVAILABLE")
    return manager.registry.connectors
