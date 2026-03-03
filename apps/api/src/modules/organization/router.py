from __future__ import annotations

from collections import defaultdict
from typing import cast
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.common.text.slug.service import slugify
from apps.api.src.core.exceptions import BadRequest, NotFound
from apps.api.src.core.http.response import Response, ResponseModel
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.organization.user import User
from apps.api.src.modules.auth.http.service import get_current_user_id
from apps.api.src.modules.organization.http.service import get_current_org_membership
from apps.api.src.modules.organization.members.router import router as organization_members_router
from apps.api.src.modules.organization.plugins.router import router as organization_plugins_router
from apps.api.src.modules.organization.rbac.router import router as organization_rbac_router
from apps.api.src.modules.organization.schema import (
    CreateMyOrganizationRequest,
    MyOrganizationListOut,
    MyOrganizationOut,
    OrganizationBriefOut,
    OrganizationMemberPreviewOut,
    OrganizationMembershipOut,
)
from apps.api.src.modules.organization.settings.router import router as organization_settings_router
from apps.api.src.modules.organization.workspaces.router import router as organization_workspaces_router

router = APIRouter(tags=["Me"])

router.include_router(organization_plugins_router)
router.include_router(organization_workspaces_router)
router.include_router(organization_members_router)
router.include_router(organization_rbac_router)
router.include_router(organization_settings_router)


def _normalize_org_slug(value: str, *, fallback: str) -> str:
    raw = slugify(value)
    if raw == "asset":
        raw = slugify(fallback)
    if not raw:
        raw = slugify(fallback) or "organization"
    return raw[:64]


async def _next_available_org_slug(base_slug: str) -> str:
    base = _normalize_org_slug(base_slug, fallback="organization")
    candidate = base[:64]
    for index in range(1, 200):
        exists = await Organization.filter(slug=candidate).exists()
        if not exists:
            return candidate
        suffix = f"-{index + 1}"
        candidate = f"{base[: max(1, 64 - len(suffix))]}{suffix}"
    return f"{base[:55]}-{uuid4().hex[:8]}"


@router.get(
    "/me/organizations",
    response_model=ResponseModel[MyOrganizationListOut],
    summary="List organizations accessible to current user",
)
async def list_my_organizations(
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[MyOrganizationListOut]:
    memberships = (
        await OrgMembership
        .filter(user_id=user_id, status="active")
        .prefetch_related("organization")
        .order_by("created_at", "id")
        .all()
    )
    if not memberships:
        return Response.success(data=MyOrganizationListOut(items=[], total=0))

    org_ids = [UUID(str(cast(HasOrganizationId, membership).organization_id)) for membership in memberships]
    active_org_memberships = (
        await OrgMembership
        .filter(organization_id__in=org_ids, status="active")
        .prefetch_related("user")
        .order_by("organization_id", "created_at", "id")
        .all()
    )

    member_count_map: dict[UUID, int] = defaultdict(int)
    preview_map: dict[UUID, list[OrganizationMemberPreviewOut]] = defaultdict(list)
    for membership in active_org_memberships:
        organization_id = UUID(str(cast(HasOrganizationId, membership).organization_id))
        member_count_map[organization_id] += 1

        if len(preview_map[organization_id]) >= 4:
            continue

        user = cast(User | None, getattr(membership, "user", None))
        if user is None:
            continue

        preview_map[organization_id].append(
            OrganizationMemberPreviewOut(
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
            )
        )

    items: list[MyOrganizationOut] = []
    for membership in memberships:
        org = membership.organization
        if org is None:
            continue

        organization_id = UUID(str(org.id))
        items.append(
            MyOrganizationOut(
                organization=OrganizationBriefOut(
                    id=org.id,
                    name=org.name,
                    slug=org.slug,
                    logo_url=org.logo_url,
                ),
                membership=OrganizationMembershipOut(
                    id=membership.id,
                    organization_id=organization_id,
                    role=membership.role,
                    status=membership.status,
                ),
                member_count=member_count_map.get(organization_id, 0),
                members_preview=preview_map.get(organization_id, []),
            )
        )

    return Response.success(data=MyOrganizationListOut(items=items, total=len(items)))


@router.post(
    "/me/organizations",
    response_model=ResponseModel[MyOrganizationOut],
    summary="Create organization for current user",
)
async def create_my_organization(
    payload: CreateMyOrganizationRequest,
    user_id: UUID = Depends(get_current_user_id),
) -> ResponseModel[MyOrganizationOut]:
    name = str(payload.name or "").strip()
    if not name:
        raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_ORGANIZATION_NAME")

    requested_slug = str(payload.slug or "").strip()
    base_slug = requested_slug or name
    slug = await _next_available_org_slug(base_slug)

    organization = await Organization.create(slug=slug, name=name[:128], logo_url=None, is_active=True)
    membership = await OrgMembership.create(
        organization_id=organization.id,
        user_id=user_id,
        role=OrgRole.OWNER,
        role_code=OrgRole.OWNER.value,
        status="active",
    )

    user = await User.get_or_none(id=user_id)
    preview: list[OrganizationMemberPreviewOut] = []
    if user is not None:
        preview.append(
            OrganizationMemberPreviewOut(
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
            )
        )

    return Response.success(
        data=MyOrganizationOut(
            organization=OrganizationBriefOut(
                id=organization.id,
                name=organization.name,
                slug=organization.slug,
                logo_url=organization.logo_url,
            ),
            membership=OrganizationMembershipOut(
                id=membership.id,
                organization_id=organization.id,
                role=membership.role,
                status=membership.status,
            ),
            member_count=1,
            members_preview=preview,
        )
    )


@router.get(
    "/me/organization",
    response_model=ResponseModel[MyOrganizationOut],
    summary="Get current user organization and membership",
)
async def get_my_organization(
    orgm: OrgMembership = Depends(get_current_org_membership),
) -> ResponseModel[MyOrganizationOut]:
    await orgm.fetch_related("organization")
    org = orgm.organization

    # `get_current_org_membership` guarantees membership exists; organization should always exist.
    # Still keep a defensive error for corrupted DB records.
    if org is None:
        raise NotFound(
            message=t("errors", "NOT_FOUND", default="资源不存在"),
            error="ORGANIZATION_NOT_FOUND",
        )

    # 在生产环境中，`orgm` 总是 Tortoise 模型实例且 ORM 已初始化；
    # 但部分依赖轻量化测试会 override `get_current_org_membership` 返回 stub 对象。
    # 这种情况下我们避免触发任何 DB 查询，只返回最小必要字段。
    active_memberships: list[OrgMembership] = []
    if isinstance(orgm, OrgMembership):
        active_memberships = (
            await OrgMembership
            .filter(organization_id=org.id, status="active")
            .prefetch_related("user")
            .order_by("created_at", "id")
            .all()
        )
    preview: list[OrganizationMemberPreviewOut] = []
    for membership in active_memberships:
        if len(preview) >= 4:
            break
        user = cast(User | None, getattr(membership, "user", None))
        if user is None:
            continue
        preview.append(
            OrganizationMemberPreviewOut(
                user_id=user.id,
                username=user.username,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
            )
        )

    organization = OrganizationBriefOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        logo_url=org.logo_url,
    )
    membership = OrganizationMembershipOut(
        id=orgm.id,
        organization_id=org.id,
        role=orgm.role,
        status=orgm.status,
    )
    return Response.success(
        data=MyOrganizationOut(
            organization=organization,
            membership=membership,
            member_count=len(active_memberships) if active_memberships else 1,
            members_preview=preview,
        )
    )
