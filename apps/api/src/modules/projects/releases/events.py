from __future__ import annotations

import asyncio
from uuid import UUID

from asgi_correlation_id import correlation_id

from src.common.types.public_uuid import PublicUUID
from src.common.utils.public_ids import decode_public_id
from src.core.events import Event, events
from src.core.logging import get_logger
from src.modules.projects.http.schema import ProjectRequestContext
from src.modules.projects.releases.schema import ReleaseOut
from src.modules.tenancy.router_helpers import current_tenant_context_or_none, tenant_payload_from_context

logger = get_logger(__name__)
_FATAL_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def _raise_if_fatal(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EVENT_ERRORS):
        raise exc


def _normalize_public_or_uuid(value: PublicUUID | UUID | str | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        return decode_public_id(raw)


async def publish_project_release_event(
    *,
    actor_user_id: UUID,
    project_ctx: ProjectRequestContext,
    event_name: str,
    payload: ReleaseOut,
    project_id: UUID | None = None,
    previous_active_release_id: str | None = None,
) -> None:
    tenant_context = current_tenant_context_or_none()
    normalized_site_id = _normalize_public_or_uuid(payload.site_id)
    if tenant_context is not None and normalized_site_id is not None:
        tenant_context = tenant_context.with_project(
            project_id=project_id or tenant_context.project_id or UUID(str(project_ctx.project_id)),
            runtime_id=project_ctx.runtime_id or tenant_context.runtime_id,
            site_id=normalized_site_id,
            scope=tenant_context.scope,
        )
    event_payload: dict[str, object | None] = {
        "entity_id": str(_normalize_public_or_uuid(payload.id)),
        "entity_type": "release",
        "is_active": payload.is_active,
        "organization_id": str(project_ctx.organization_id),
        "previous_active_release_id": (
            str(_normalize_public_or_uuid(previous_active_release_id))
            if previous_active_release_id is not None
            else None
        ),
        "project_id": str(project_id) if project_id is not None else None,
        "release_number": payload.release_number,
        "site_id": str(normalized_site_id),
        "tenant": tenant_payload_from_context(tenant_context) if tenant_context is not None else None,
        "workspace_id": str(project_ctx.workspace_id),
    }
    try:
        await events.publish_and_wait(
            Event(
                name=event_name,
                payload=event_payload,
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        _raise_if_fatal(exc)
        logger.warning(
            "Project release event publish failed",
            actor_user_id=str(actor_user_id),
            event_name=event_name,
            release_id=payload.id,
            error=str(exc),
        )
