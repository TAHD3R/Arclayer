from __future__ import annotations

from uuid import UUID

from fastapi import Depends, Header
from pydantic import ConfigDict
from structlog.contextvars import bind_contextvars

from apps.api.common.schemas import BaseSchema
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden
from apps.api.core.i18n import t
from apps.api.core.organization.context import set_current_org_context
from apps.api.core.organization.repository import OrganizationRepository
from apps.api.core.organization.select import (
    ForbiddenOrgAccess,
    InvalidOrgHeader,
    NoOrganizationMembership,
    OrgSelectionRequired,
    select_org_id,
)
from apps.api.routers.v1.auth.deps import get_current_user_id


class OrgContext(BaseSchema):
    model_config = ConfigDict(frozen=True)

    org_id: UUID
    membership_id: UUID | None = None


async def get_current_org_context(
    user_id: UUID = Depends(get_current_user_id),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
) -> OrgContext:
    """
    Resolve current organization for the request.

    Strategy (B):
    - If `X-Org-Id` provided, it must be a UUID and the user must be a member.
    - If missing:
      - if exactly one membership: auto-select it
      - if multiple: return 409 asking client to choose
      - if none: return 403
    """

    repo = OrganizationRepository()
    pairs = await repo.list_user_membership_pairs(user_id=user_id)
    member_org_ids = [org_id for _, org_id in pairs]

    try:
        org_id = select_org_id(header_org_id=x_org_id, member_org_ids=member_org_ids)
    except InvalidOrgHeader as exc:
        raise BadRequest(
            message=t("errors", "ORG_HEADER_INVALID", default="组织标识不合法"),
            error="ORG_HEADER_INVALID",
            meta={"raw": exc.raw},
        ) from exc
    except ForbiddenOrgAccess as exc:
        raise Forbidden(
            message=t("errors", "ORG_FORBIDDEN", default="无权访问该组织"),
            error="ORG_FORBIDDEN",
            meta={"org_id": str(exc.org_id)},
        ) from exc
    except NoOrganizationMembership as exc:
        raise Forbidden(
            message=t("errors", "ORG_MEMBERSHIP_REQUIRED", default="当前账号未加入任何组织"),
            error="ORG_MEMBERSHIP_REQUIRED",
        ) from exc
    except OrgSelectionRequired as exc:
        raise Conflict(
            message=t("errors", "ORG_SELECTION_REQUIRED", default="需要选择组织"),
            error="ORG_SELECTION_REQUIRED",
            meta={"candidates": [str(x) for x in exc.candidates]},
        ) from exc

    membership_id: UUID | None = None
    for mid, oid in pairs:
        if oid == org_id:
            membership_id = mid
            break

    # Bind to logging context and to request ContextVars used by authz/menu.
    bind_contextvars(org_id=str(org_id))
    if membership_id is not None:
        bind_contextvars(membership_id=str(membership_id))
    set_current_org_context(org_id=org_id, membership_id=membership_id)
    return OrgContext(org_id=org_id, membership_id=membership_id)


async def get_current_org_id(
    ctx: OrgContext = Depends(get_current_org_context),
) -> UUID:
    return ctx.org_id


async def get_current_membership_id(
    ctx: OrgContext = Depends(get_current_org_context),
) -> UUID | None:
    return ctx.membership_id
