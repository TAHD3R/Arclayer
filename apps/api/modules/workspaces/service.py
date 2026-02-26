from __future__ import annotations

from collections import defaultdict
from typing import cast
from uuid import UUID

from apps.api.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from apps.api.common.services import BaseService
from apps.api.config import Settings
from apps.api.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from apps.api.core.i18n import t
from apps.api.modules.organization.models.org_membership import OrgMembership, OrgRole
from apps.api.modules.sites.models.site import SiteRecord
from apps.api.modules.system.models.rbac import Role
from apps.api.modules.system.rbac.constants import ROLE_OWNER
from apps.api.modules.workspaces.models.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from apps.api.modules.workspaces.schema import (
    LeaveWorkspaceResult,
    MyWorkspaceOut,
    WorkspaceDetailOut,
    WorkspaceUpdateRequest,
)
from apps.api.modules.workspaces.slug_policy import parse_explicit_workspace_slug


class WorkspaceService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def list_my_workspaces(self, *, user_id: UUID) -> list[MyWorkspaceOut]:
        """
        List workspaces visible to the current user.

        Rules:
        - Non-owner: only active workspaces where user has an ACTIVE workspace membership.
        - Org owner: can see all workspaces in the org; those without membership are marked visible_only.
        - Creator admin: if org owner created the workspace, mark is_creator_admin (and not visible_only).

        Multi-org:
        - A user can belong to multiple organizations.
        - This endpoint aggregates workspaces across all ACTIVE org memberships.
        """

        orgms = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").all()
        if not orgms:
            return []

        org_roles: dict[UUID, OrgRole] = {}
        org_order: list[UUID] = []
        for orgm in orgms:
            orgm_like = cast(HasOrganizationId, orgm)
            org_id = UUID(str(orgm_like.organization_id))
            if org_id not in org_roles:
                org_roles[org_id] = orgm.role
                org_order.append(org_id)

        # Collect memberships for the current user.
        memberships = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__is_active=True,
        ).all()
        membership_by_workspace_id = {UUID(str(cast(HasWorkspaceId, m).workspace_id)): m for m in memberships}

        membership_workspace_ids = list(membership_by_workspace_id.keys())
        membership_workspaces: list[Workspace] = []
        if membership_workspace_ids:
            membership_workspaces = (
                await Workspace.filter(id__in=membership_workspace_ids, is_active=True).order_by("created_at").all()
            )

        membership_workspaces_by_org: dict[UUID, list[Workspace]] = defaultdict(list)
        for ws in membership_workspaces:
            ws_org_id = UUID(str(cast(HasOrganizationId, ws).organization_id))
            membership_workspaces_by_org[ws_org_id].append(ws)

        owner_org_ids = [org_id for org_id in org_order if org_roles.get(org_id) == OrgRole.OWNER]
        owner_workspaces: list[Workspace] = []
        if owner_org_ids:
            owner_workspaces = (
                await Workspace.filter(organization_id__in=owner_org_ids, is_active=True).order_by("created_at").all()
            )

        owner_workspaces_by_org: dict[UUID, list[Workspace]] = defaultdict(list)
        for ws in owner_workspaces:
            ws_org_id = UUID(str(cast(HasOrganizationId, ws).organization_id))
            owner_workspaces_by_org[ws_org_id].append(ws)

        out: list[MyWorkspaceOut] = []
        seen_workspace_ids: set[UUID] = set()

        for org_id in org_order:
            role = org_roles.get(org_id)
            if role is None:
                continue

            is_owner = role == OrgRole.OWNER
            org_workspaces = (
                owner_workspaces_by_org.get(org_id, []) if is_owner else membership_workspaces_by_org.get(org_id, [])
            )
            for ws in org_workspaces:
                ws_id = UUID(str(ws.id))
                if ws_id in seen_workspace_ids:
                    continue
                seen_workspace_ids.add(ws_id)

                is_creator_admin = is_owner and (UUID(str(ws.created_by_user_id)) == UUID(str(user_id)))
                has_membership = ws_id in membership_by_workspace_id
                visible_only = bool(is_owner and (not has_membership) and (not is_creator_admin))

                out.append(
                    MyWorkspaceOut(
                        id=ws.id,
                        workspace_id=ws.id,
                        organization_id=org_id,
                        slug=ws.slug,
                        name=ws.name,
                        visible_only=visible_only,
                        is_creator_admin=is_creator_admin,
                    )
                )
        return out

    async def get_workspace_detail(self, *, organization_id: UUID, workspace_id: UUID) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")
        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
        )

    async def update_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        payload: WorkspaceUpdateRequest,
        actor_user_id: UUID,
    ) -> WorkspaceDetailOut:
        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        updates: dict[str, str] = {}
        if payload.name is not None:
            name = str(payload.name).strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            if len(name) > 128:
                raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="INVALID_WORKSPACE_NAME")
            updates["name"] = name

        if payload.slug is not None:
            normalized, reason = parse_explicit_workspace_slug(str(payload.slug))
            if reason == "invalid":
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="WORKSPACE_SLUG_INVALID",
                )
            if reason == "reserved":
                assert normalized is not None
                raise BadRequest(
                    message=t("errors", "BAD_REQUEST", default="参数错误"),
                    error="WORKSPACE_SLUG_RESERVED",
                    meta={"slug": normalized},
                )

            assert normalized is not None

            if normalized != str(ws.slug):
                exists = await Workspace.filter(slug=normalized).exclude(id=workspace_id).exists()
                if exists:
                    raise Conflict(
                        message=t("errors", "CONFLICT", default="请求冲突"),
                        error="WORKSPACE_SLUG_TAKEN",
                        meta={"slug": normalized},
                    )
                updates["slug"] = normalized

        if updates:
            for k, v in updates.items():
                setattr(ws, k, v)
            await ws.save(update_fields=list(updates.keys()) + ["updated_at"])

            # Keep SiteRecord.slug in sync for the single-site workspace model.
            if "slug" in updates:
                site = await SiteRecord.filter(workspace_id=ws.id).order_by("created_at", "id").first()
                if site is not None:
                    site.slug = updates["slug"]
                    await site.save(update_fields=["slug", "updated_at"])

                # Best-effort: keep workspace-scoped core settings `site.url` aligned with /w/:workspaceSlug.
                # This avoids stale Portal base URLs after slug changes.
                try:
                    from apps.api.modules.workspaces.portal_url_policy import rewrite_workspace_slug_in_portal_url
                    from apps.api.modules.workspaces.settings.service import WorkspaceSettingsService

                    settings_service = WorkspaceSettingsService(self.settings)
                    core = await settings_service.get_core_detail(workspace_id=UUID(str(ws.id)))
                    value = core.value if isinstance(core.value, dict) else {}
                    site_cfg = value.get("site") if isinstance(value, dict) else None
                    url_raw = site_cfg.get("url") if isinstance(site_cfg, dict) else None
                    if isinstance(url_raw, str) and url_raw.strip():
                        rewritten = rewrite_workspace_slug_in_portal_url(
                            url_raw,
                            workspace_slug=updates["slug"],
                        )
                        if rewritten and rewritten != url_raw:
                            await settings_service.patch_core(
                                workspace_id=UUID(str(ws.id)),
                                patch={"site": {"url": rewritten}},
                                updated_by=actor_user_id,
                            )
                except BaseException as exc:
                    self.logger.warning(
                        "Workspace slug change: portal base url rewrite failed",
                        action="workspace_slug_rewrite_portal_url",
                        workspace_id=str(ws.id),
                        user_id=str(actor_user_id),
                        error=str(exc),
                    )

        return WorkspaceDetailOut(
            id=ws.id,
            organization_id=UUID(str(cast(HasOrganizationId, ws).organization_id)),
            slug=ws.slug,
            name=ws.name,
        )

    async def leave_workspace(
        self,
        *,
        organization_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        confirm_text: str,
    ) -> LeaveWorkspaceResult:
        if str(confirm_text or "").strip() != "LEAVE":
            raise BadRequest(
                message=t("errors", "BAD_REQUEST", default="参数错误"),
                error="WORKSPACE_LEAVE_CONFIRM_TEXT_MISMATCH",
            )

        ws = await Workspace.get_or_none(id=workspace_id, organization_id=organization_id, is_active=True)
        if ws is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        membership = await WorkspaceMembership.get_or_none(
            workspace_id=workspace_id,
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
        )
        if membership is None:
            raise NotFound(message=t("errors", "NOT_FOUND", default="资源不存在"), error="NOT_FOUND")

        owner_role = await Role.get_or_none(workspace_id=workspace_id, code=ROLE_OWNER)
        if owner_role is not None:
            is_owner_member = await WorkspaceMembership.filter(
                id=membership.id,
                membership_roles__role_id=owner_role.id,
            ).exists()
            if is_owner_member:
                owner_count = await WorkspaceMembership.filter(
                    workspace_id=workspace_id,
                    status=WorkspaceMembershipStatus.ACTIVE,
                    membership_roles__role_id=owner_role.id,
                ).count()
                if int(owner_count) <= 1:
                    raise Forbidden(
                        message=t("errors", "PERMISSION_DENIED", default="权限不足"),
                        error="WORKSPACE_OWNER_AT_LEAST_ONE_REQUIRED",
                    )

        membership_id = membership.id
        await membership.delete()

        return LeaveWorkspaceResult(
            workspace_id=workspace_id,
            membership_id=membership_id,
            left=True,
        )
