from __future__ import annotations

from typing import Protocol, runtime_checkable

import httpx
from pydantic import BaseModel, ConfigDict, Field

from src.core.connectors import ConnectorKind
from src.core.exceptions import ServiceUnavailable
from src.core.registries import ConnectorRegistry


class OAuthProviderDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: str = Field(..., pattern=r"^[a-z][a-z0-9_-]*$", max_length=64)
    section_id: str = Field(..., pattern=r"^oauth_[a-z][a-z0-9_]*$", max_length=96)
    title_key: str = Field(..., min_length=3, max_length=160)
    label: str = Field(..., min_length=1, max_length=120)
    icon_key: str = Field(..., pattern=r"^[a-z][a-z0-9_-]*$", max_length=64)


class OAuthProviderProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    subject: str
    email: str | None = None
    email_verified: bool
    display_name: str | None = None
    avatar_url: str | None = None


@runtime_checkable
class OAuthProviderConnector(Protocol):
    definition: OAuthProviderDefinition

    def build_authorize_url(
        self,
        *,
        client_id: str,
        redirect_uri: str,
        state: str,
        code_challenge: str,
    ) -> str: ...

    async def exchange_access_token(
        self,
        *,
        client: httpx.AsyncClient,
        client_id: str,
        client_secret: str,
        code: str,
        code_verifier: str,
        redirect_uri: str,
    ) -> str: ...

    async def fetch_profile(
        self,
        *,
        client: httpx.AsyncClient,
        access_token: str,
    ) -> OAuthProviderProfile: ...


def get_oauth_provider_connector(
    connector_registry: ConnectorRegistry,
    provider: str,
) -> OAuthProviderConnector | None:
    provider_key = (provider or "").strip().lower()
    registration = connector_registry.resolve(f"oauth.{provider_key}")
    if registration is None:
        return None
    connector = registration.factory()
    if not isinstance(connector, OAuthProviderConnector):
        raise ServiceUnavailable(error="OAUTH_CONNECTOR_INVALID")
    return connector


def list_oauth_provider_connectors(
    connector_registry: ConnectorRegistry,
) -> tuple[OAuthProviderConnector, ...]:
    connectors: list[OAuthProviderConnector] = []
    for registration in connector_registry.list_registrations():
        if registration.definition.kind is not ConnectorKind.OAUTH:
            continue
        connector = registration.factory()
        if not isinstance(connector, OAuthProviderConnector):
            raise ServiceUnavailable(error="OAUTH_CONNECTOR_INVALID")
        connectors.append(connector)
    return tuple(connectors)
