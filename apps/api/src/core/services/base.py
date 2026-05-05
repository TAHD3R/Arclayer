from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from typing import Any, Protocol
from uuid import UUID

from asgi_correlation_id import correlation_id
from pydantic import ConfigDict
from structlog.contextvars import get_contextvars
from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.transactions import in_transaction

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.config import Settings, get_settings
from src.core.events import Event, events
from src.core.logging import get_logger

_FATAL_SERVICE_CONTRACT_ERRORS: tuple[type[BaseException], ...] = (
    GeneratorExit,
    KeyboardInterrupt,
    SystemExit,
)


class DomainEventPublisher(Protocol):
    async def publish(self, event: Event) -> None: ...


class ServiceContractError(RuntimeError):
    """Raised when a service violates the canonical base-service contract."""


class RequiredEventPublisherMissing(ServiceContractError):
    """Raised when a required domain event publisher is unavailable."""


class RequiredDomainEventPublishFailed(ServiceContractError):
    """Raised when required domain event publishing fails."""


class ServiceActorContext(BaseSchema):
    model_config = ConfigDict(frozen=True)

    actor_user_id: UUID | None = None
    organization_id: UUID | None = None
    workspace_id: UUID | None = None
    project_id: UUID | None = None
    runtime_id: UUID | None = None
    site_id: UUID | None = None
    trace_id: str | None = None
    source: str = "api"

    def model_dump_json_safe(self) -> JsonObject:
        return {
            "actor_user_id": str(self.actor_user_id) if self.actor_user_id is not None else None,
            "organization_id": str(self.organization_id) if self.organization_id is not None else None,
            "workspace_id": str(self.workspace_id) if self.workspace_id is not None else None,
            "project_id": str(self.project_id) if self.project_id is not None else None,
            "runtime_id": str(self.runtime_id) if self.runtime_id is not None else None,
            "site_id": str(self.site_id) if self.site_id is not None else None,
            "trace_id": self.trace_id,
            "source": self.source,
        }


def _coerce_uuid(value: object | None) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


class BaseService:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        event_publisher: DomainEventPublisher | None = events,
        default_event_source: str = "api",
    ) -> None:
        self.settings = settings or get_settings()
        self.logger = get_logger(self.__class__.__module__)
        self._event_publisher = event_publisher
        self._default_event_source = (default_event_source or "api").strip() or "api"

    @asynccontextmanager
    async def tx(self, *, conn: BaseDBAsyncClient | None = None) -> AsyncIterator[BaseDBAsyncClient]:
        if conn is not None:
            yield conn
            return
        async with in_transaction() as tx_conn:
            yield tx_conn

    def resolve_actor_context(
        self,
        *,
        actor_user_id: UUID | None = None,
        organization_id: UUID | None = None,
        workspace_id: UUID | None = None,
        project_id: UUID | None = None,
        runtime_id: UUID | None = None,
        site_id: UUID | None = None,
        trace_id: str | None = None,
        source: str | None = None,
    ) -> ServiceActorContext:
        ctx = get_contextvars()
        resolved_source = str(source or ctx.get("source") or self._default_event_source).strip() or "api"
        resolved_trace_id = trace_id or correlation_id.get(None) or _trace_from_context(ctx)

        return ServiceActorContext(
            actor_user_id=actor_user_id or _coerce_uuid(ctx.get("user_id") or ctx.get("actor_user_id")),
            organization_id=organization_id
            or _coerce_uuid(ctx.get("organization_id") or ctx.get("tenant_organization_id")),
            workspace_id=workspace_id or _coerce_uuid(ctx.get("workspace_id") or ctx.get("tenant_workspace_id")),
            project_id=project_id or _coerce_uuid(ctx.get("project_id") or ctx.get("tenant_project_id")),
            runtime_id=runtime_id or _coerce_uuid(ctx.get("runtime_id") or ctx.get("tenant_runtime_id")),
            site_id=site_id or _coerce_uuid(ctx.get("site_id") or ctx.get("tenant_site_id")),
            trace_id=resolved_trace_id,
            source=resolved_source,
        )

    async def publish_domain_event(
        self,
        *,
        name: str,
        payload: Mapping[str, JsonValue] | JsonObject | None = None,
        required: bool = True,
        actor_context: ServiceActorContext | None = None,
        source: str | None = None,
        actor_user_id: UUID | None = None,
    ) -> Event:
        context = actor_context or self.resolve_actor_context(actor_user_id=actor_user_id, source=source)
        event = Event(
            name=name,
            payload=dict(payload or {}),
            source=source or context.source,
            trace_id=context.trace_id,
            actor_user_id=str(context.actor_user_id) if context.actor_user_id is not None else None,
        )

        publisher = self._event_publisher
        if publisher is None:
            if required:
                raise RequiredEventPublisherMissing(f"Required event publisher missing for event '{name}'")
            self.logger.warning(
                "Optional domain event skipped because publisher is unavailable",
                action="publish_domain_event",
                event_name=name,
            )
            return event

        try:
            await publisher.publish(event)
        except BaseException as exc:
            _raise_if_fatal(exc)
            if required:
                raise RequiredDomainEventPublishFailed(f"Domain event publish failed for '{name}'") from exc
            self.logger.warning(
                "Optional domain event publish failed",
                action="publish_domain_event",
                event_name=name,
                error=str(exc),
            )
        return event

    async def publish_optional_domain_event(
        self,
        *,
        name: str,
        payload: Mapping[str, JsonValue] | JsonObject | None = None,
        actor_context: ServiceActorContext | None = None,
        source: str | None = None,
        actor_user_id: UUID | None = None,
    ) -> Event:
        return await self.publish_domain_event(
            name=name,
            payload=payload,
            required=False,
            actor_context=actor_context,
            source=source,
            actor_user_id=actor_user_id,
        )


def _trace_from_context(ctx: Mapping[str, Any]) -> str | None:
    value = ctx.get("trace_id") or ctx.get("request_id")
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_SERVICE_CONTRACT_ERRORS):
        raise exc
