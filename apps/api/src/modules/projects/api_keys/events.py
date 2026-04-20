from __future__ import annotations

import asyncio
from typing import cast
from uuid import UUID

from asgi_correlation_id import correlation_id

from src.common.protocols.tortoise import HasOrganizationId
from src.common.types.public_uuid import PublicUUID
from src.common.utils.public_ids import decode_public_id
from src.core.events import Event, events
from src.core.logging import get_logger
from src.models.organization.org_membership import OrgMembership
from src.modules.projects.api_keys.schema import ApiKeyOut
from src.modules.workspaces.http.schema import WorkspaceContext

logger = get_logger(__name__)
_FATAL_EVENT_ERRORS = (asyncio.CancelledError, GeneratorExit, KeyboardInterrupt, SystemExit)


def raise_if_fatal_api_key_event(exc: BaseException) -> None:
    if isinstance(exc, _FATAL_EVENT_ERRORS):
        raise exc


def coerce_api_key_event_uuid(value: UUID | PublicUUID | str | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return decode_public_id(str(value))


def organization_id_from_membership(orgm: OrgMembership) -> UUID:
    return UUID(str(cast(HasOrganizationId, orgm).organization_id))


async def publish_api_key_event(
    *,
    actor_user_id: UUID,
    event_name: str,
    key: ApiKeyOut,
    ctx: WorkspaceContext | None = None,
    organization_id: UUID | None = None,
) -> None:
    key_id = coerce_api_key_event_uuid(key.id)
    workspace_id = coerce_api_key_event_uuid(key.workspace_id)
    site_id = coerce_api_key_event_uuid(key.site_id)
    payload: dict[str, object | None] = {
        "delivery_perspective": str(key.delivery_perspective) if key.delivery_perspective is not None else None,
        "entity_id": str(key_id) if key_id is not None else None,
        "entity_type": "api_key",
        "key_family": str(key.family),
        "key_name": key.name,
        "scopes": [str(scope) for scope in key.scopes],
        "site_id": str(site_id) if site_id is not None else None,
        "workspace_id": str(workspace_id) if workspace_id is not None else None,
    }
    if organization_id is not None:
        payload["organization_id"] = str(organization_id)
    if ctx is not None:
        payload["organization_id"] = str(ctx.organization_id)
        payload["workspace_id"] = str(ctx.workspace_id)

    try:
        await events.publish_and_wait(
            Event(
                name=event_name,
                payload=payload,
                source="api",
                trace_id=correlation_id.get(None),
                actor_user_id=str(actor_user_id),
            ),
            timeout=1.0,
        )
    except BaseException as exc:
        raise_if_fatal_api_key_event(exc)
        logger.warning(
            "API key event publish failed",
            actor_user_id=str(actor_user_id),
            event_name=event_name,
            key_id=key.id,
            error=str(exc),
        )
