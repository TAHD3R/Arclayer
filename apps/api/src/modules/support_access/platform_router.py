from __future__ import annotations

from typing import cast
from uuid import UUID

from fastapi import APIRouter, Query

from src.common.types.json_types import JsonObject
from src.config import get_settings
from src.core.exceptions import Forbidden
from src.core.http.response import ApiResponse, ResponseModel
from src.core.sanitize.output import sanitize_api_response
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.projects.project import ProjectRecord
from src.modules.analytics.audit import ActivityAuditPayload, write_required_activity_event
from src.modules.platform_identity.http import require_platform_permission
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_identity.session_schema import PlatformSessionPrincipal
from src.modules.support_access.schema import (
    SupportAccessContentCategory,
    SupportAccessProjectionItemOut,
    SupportAccessProjectionPageOut,
)
from src.modules.support_access.service import SupportAccessService

router = APIRouter(tags=["platform.support-access"])


@router.get(
    "/projection",
    response_model=ResponseModel[SupportAccessProjectionPageOut],
    response_model_exclude_none=True,
)
async def read_support_projection(
    workspace_id: UUID = Query(),
    project_id: UUID | None = Query(default=None),
    category: SupportAccessContentCategory = Query(),
    case_id: str = Query(min_length=1, max_length=128),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=25, ge=1, le=50),
    grant_revision: int | None = Query(default=None, ge=1),
    continuation: str | None = Query(default=None, min_length=1, max_length=255),
    principal: PlatformSessionPrincipal = require_platform_permission(PlatformPermissionCode.TENANT_SUPPORT_READ),
) -> ResponseModel[SupportAccessProjectionPageOut]:
    if page > 1 and (grant_revision is None or continuation is None):
        raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
    grant = await SupportAccessService().require_current(
        workspace_id=workspace_id,
        project_id=project_id,
        category=category,
        case_id=case_id,
        operator_user_id=principal.actor_id,
        expected_revision=grant_revision,
    )
    if page > 1 and continuation != _continuation(grant_id=grant.id, revision=grant.revision, page=page, size=size):
        raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
    items_query = ContentItemRecord.filter(workspace_id=workspace_id)
    if project_id is not None:
        if not await ProjectRecord.filter(id=project_id, workspace_id=workspace_id).exists():
            raise Forbidden(error="SUPPORT_ACCESS_REQUIRED")
        items_query = items_query.filter(site__project_id=project_id)
    rows = await items_query.offset((page - 1) * size).limit(size + 1).order_by("-updated_at").all()
    has_next_page = len(rows) > size
    result: list[SupportAccessProjectionItemOut] = []
    for item in rows[:size]:
        version = await ContentVersionRecord.get_or_none(item_id=item.id, version=item.draft_version)
        result.append(
            SupportAccessProjectionItemOut(
                id=item.id,
                title=item.title or "",
                slug=item.slug,
                locale=item.locale,
                body=cast(JsonObject, sanitize_api_response(version.fields_snapshot if version else {})),
            )
        )
    await write_required_activity_event(
        settings=get_settings(),
        payload=ActivityAuditPayload(
            event_name="support_access.content.read",
            workspace_id=workspace_id,
            actor_user_id=principal.actor_id,
            entity_type="support_access_grant",
            entity_id=grant.id,
            properties={
                "case_id": case_id,
                "grant_revision": grant.revision,
                "category": category,
                "count": len(result),
            },
        ),
    )
    continuation = (
        _continuation(
            grant_id=grant.id,
            revision=grant.revision,
            page=page + 1,
            size=size,
        )
        if has_next_page
        else None
    )
    return ApiResponse.success(
        data=SupportAccessProjectionPageOut(
            items=tuple(result),
            grant_revision=grant.revision,
            page=page,
            continuation=continuation,
        )
    )


def _continuation(*, grant_id: UUID, revision: int, page: int, size: int) -> str:
    return f"support-access:{grant_id}:{revision}:{page}:{size}"
