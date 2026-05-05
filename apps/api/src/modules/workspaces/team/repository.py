from __future__ import annotations

from uuid import UUID

from tortoise.backends.base.client import BaseDBAsyncClient
from tortoise.expressions import Q
from tortoise.queryset import QuerySet

from src.common.constants.users import ADMIN_USERS_ALLOWED_ORDER_FIELDS
from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.organization.user import User
from src.models.system.rbac import Role
from src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from src.models.workspaces.workspace_invite import WorkspaceInviteLinkUseEvent
from src.modules.workspaces.team.schema import WorkspaceTeamMemberListQuery


class WorkspaceTeamRepository(TortoiseORMRepository):
    async def get_workspace(self, *, workspace_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(id=workspace_id)

    def query_memberships(
        self, *, workspace_id: UUID, filters: WorkspaceTeamMemberListQuery
    ) -> QuerySet[WorkspaceMembership]:
        qs = WorkspaceMembership.filter(workspace_id=workspace_id).select_related("user")

        if filters.status is not None:
            qs = qs.filter(status=filters.status)

        if filters.q:
            needle = filters.q.strip()
            if needle:
                qs = qs.filter(
                    Q(user__username__icontains=needle)
                    | Q(user__email__icontains=needle)
                    | Q(user__display_name__icontains=needle)
                )

        if filters.user_status is not None:
            qs = qs.filter(user__status=filters.user_status)

        if filters.role_code:
            qs = qs.filter(membership_roles__role__code=filters.role_code)

        ordering = (filters.ordering or "").strip()
        if ordering:
            qs = qs.order_by(*_normalize_team_member_ordering(ordering))
        else:
            qs = qs.order_by("-created_at")

        return qs.distinct()

    async def get_membership(
        self,
        *,
        membership_id: UUID,
        workspace_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceMembership | None:
        qs = WorkspaceMembership.filter(id=membership_id, workspace_id=workspace_id)
        if conn is not None:
            qs = qs.using_db(conn)
        return await qs.select_related("user").first()

    async def get_membership_with_roles(
        self,
        *,
        membership_id: UUID,
        conn: BaseDBAsyncClient | None = None,
    ) -> WorkspaceMembership | None:
        qs = WorkspaceMembership.filter(id=membership_id)
        if conn is not None:
            qs = qs.using_db(conn)
        return await qs.select_related("user").prefetch_related("membership_roles__role").first()

    async def query_user_options(self, *, workspace_id: UUID, q: str | None) -> QuerySet[WorkspaceMembership]:
        qs = (
            WorkspaceMembership
            .filter(workspace_id=workspace_id)
            .filter(status__in=[WorkspaceMembershipStatus.ACTIVE, WorkspaceMembershipStatus.DISABLED])
            .select_related("user")
        )
        if q:
            needle = q.strip()
            if needle:
                qs = qs.filter(
                    Q(user__username__icontains=needle)
                    | Q(user__email__icontains=needle)
                    | Q(user__display_name__icontains=needle)
                )
        return qs.order_by("-user__last_login_at", "user__username")

    async def list_users_by_ids(self, *, user_ids: list[UUID]) -> list[User]:
        if not user_ids:
            return []
        return await User.filter(id__in=user_ids).all()

    async def list_users_matching(self, *, needle: str) -> list[User]:
        normalized = needle.strip()
        if not normalized:
            return []
        return await User.filter(
            Q(username__icontains=normalized) | Q(email__icontains=normalized) | Q(display_name__icontains=normalized)
        ).all()

    async def list_recent_link_events(self, *, link_id: UUID, limit: int) -> list[WorkspaceInviteLinkUseEvent]:
        return await WorkspaceInviteLinkUseEvent.filter(link_id=link_id).order_by("-used_at").limit(limit).all()

    async def replace_membership_roles(
        self,
        *,
        membership_id: UUID,
        role_ids: list[UUID],
        conn: BaseDBAsyncClient | None = None,
    ) -> None:
        delete_qs = WorkspaceMembershipRole.filter(membership_id=membership_id)
        if conn is not None:
            delete_qs = delete_qs.using_db(conn)
        await delete_qs.delete()
        for rid in role_ids:
            await WorkspaceMembershipRole.get_or_create(
                membership_id=membership_id,
                role_id=rid,
                using_db=conn,
            )

    async def get_roles_by_codes(
        self,
        *,
        workspace_id: UUID,
        role_codes: list[str],
        conn: BaseDBAsyncClient | None = None,
    ) -> list[Role]:
        if not role_codes:
            return []
        qs = Role.filter(workspace_id=workspace_id, code__in=role_codes)
        if conn is not None:
            qs = qs.using_db(conn)
        return await qs.all()


def _normalize_team_member_ordering(value: str) -> list[str]:
    fields: list[str] = []
    for part in value.split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        name = raw[1:] if desc else raw

        if name in {"created_at", "updated_at", "status"}:
            fields.append(f"-{name}" if desc else name)
            continue

        if name.startswith("user__"):
            suffix = name.removeprefix("user__")
            if suffix in ADMIN_USERS_ALLOWED_ORDER_FIELDS:
                fields.append(f"-{name}" if desc else name)

    return fields or ["-created_at"]
