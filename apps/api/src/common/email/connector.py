from __future__ import annotations

from typing import Protocol, runtime_checkable

from src.common.email.provider import EmailProvider
from src.common.types.json_types import JsonObject
from src.config import Settings
from src.core.connectors import ConnectorKind
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry


@runtime_checkable
class EmailConnector(Protocol):
    provider_id: str
    provider_label: str

    def create_provider(self, *, settings: Settings, config: JsonObject) -> EmailProvider: ...


def get_email_connector(
    connector_registry: ConnectorRegistry,
    provider_id: str,
) -> EmailConnector | None:
    normalized = provider_id.strip().lower()
    registration = connector_registry.resolve(f"email.{normalized}")
    if registration is None:
        return None
    connector = registration.factory()
    if not isinstance(connector, EmailConnector):
        raise ServiceUnavailable(error="EMAIL_CONNECTOR_INVALID")
    if connector.provider_id != normalized:
        raise ServiceUnavailable(error="EMAIL_CONNECTOR_ID_MISMATCH")
    return connector


def list_email_connectors(
    connector_registry: ConnectorRegistry,
) -> tuple[EmailConnector, ...]:
    connectors: list[EmailConnector] = []
    for registration in connector_registry.list_registrations():
        if registration.definition.kind is not ConnectorKind.EMAIL:
            continue
        connector = registration.factory()
        if not isinstance(connector, EmailConnector):
            raise ServiceUnavailable(error="EMAIL_CONNECTOR_INVALID")
        connectors.append(connector)
    return tuple(connectors)
