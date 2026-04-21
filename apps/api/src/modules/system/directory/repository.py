from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from tortoise.expressions import Q

from src.models.organization.org_membership import OrgMembership
from src.models.organization.organization import Organization
from src.models.organization.user import User
from src.models.projects.membership import ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus


def _search_q(fields: Iterable[str], q: str | None) -> Q:
    query = (q or "").strip()
    if not query:
        return Q()

    predicates = [Q(**{f"{field}__icontains": query}) for field in fields]
    if not predicates:
        return Q()

    merged = predicates[0]
    for predicate in predicates[1:]:
        merged |= predicate
    return merged


class SystemDirectoryRepository:
    async def count_users(self, *, q: str | None) -> int:
        return await User.filter(_search_q(("username", "email", "display_name"), q)).count()

    async def list_users_page(self, *, q: str | None, ordering: str | None, offset: int, limit: int) -> list[User]:
        queryset = User.filter(_search_q(("username", "email", "display_name"), q))
        return await queryset.order_by(ordering or "-created_at").offset(offset).limit(limit)

    async def count_organizations(self, *, q: str | None) -> int:
        return await Organization.filter(deleted_at__isnull=True).filter(_search_q(("name", "slug"), q)).count()

    async def list_organizations_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        offset: int,
        limit: int,
    ) -> list[Organization]:
        queryset = Organization.filter(deleted_at__isnull=True).filter(_search_q(("name", "slug"), q))
        return await queryset.order_by(ordering or "-created_at").offset(offset).limit(limit)

    async def count_workspaces(self, *, q: str | None) -> int:
        return await Workspace.filter(deleted_at__isnull=True).filter(_search_q(("name", "description"), q)).count()

    async def list_workspaces_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        offset: int,
        limit: int,
    ) -> list[Workspace]:
        queryset = (
            Workspace
            .filter(deleted_at__isnull=True)
            .filter(
                _search_q(("name", "description"), q),
            )
            .prefetch_related("organization")
        )
        return await queryset.order_by(ordering or "-created_at").offset(offset).limit(limit)

    async def count_projects(self, *, q: str | None) -> int:
        return (
            await ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description"), q),
            )
            .count()
        )

    async def list_projects_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        offset: int,
        limit: int,
    ) -> list[ProjectRecord]:
        queryset = (
            ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description"), q),
            )
            .prefetch_related("workspace", "workspace__organization")
        )
        return await queryset.order_by(ordering or "-created_at").offset(offset).limit(limit)

    async def get_user_by_id(self, *, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).get_or_none()

    async def get_organization_by_id(self, *, organization_id: UUID) -> Organization | None:
        return await Organization.filter(id=organization_id, deleted_at__isnull=True).get_or_none()

    async def get_workspace_by_id(self, *, workspace_id: UUID) -> Workspace | None:
        return (
            await Workspace
            .filter(id=workspace_id, deleted_at__isnull=True)
            .prefetch_related(
                "organization",
            )
            .get_or_none()
        )

    async def get_project_by_id(self, *, project_id: UUID) -> ProjectRecord | None:
        return (
            await ProjectRecord
            .filter(id=project_id, workspace__deleted_at__isnull=True)
            .prefetch_related(
                "workspace",
                "workspace__organization",
            )
            .get_or_none()
        )

    async def get_users_by_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await User.filter(id__in=ids)
        return {UUID(str(row.id)): row for row in rows}

    async def count_organizations_by_owner_ids(self, *, owner_user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(owner_user_ids))
        if not ids:
            return {}
        rows = await Organization.filter(owner_user_id__in=ids).values("owner_user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            owner_user_id = row.get("owner_user_id")
            if owner_user_id is None:
                continue
            key = UUID(str(owner_user_id))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_org_memberships_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await OrgMembership.filter(user_id__in=ids, status="active").values("user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_workspace_memberships_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await WorkspaceMembership.filter(
            user_id__in=ids,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values("user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_project_memberships_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await ProjectMembership.filter(user_id__in=ids).values("user_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_org_memberships_by_org_ids(self, *, organization_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(organization_ids))
        if not ids:
            return {}
        rows = await OrgMembership.filter(organization_id__in=ids, status="active").values("organization_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["organization_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_workspaces_by_org_ids(self, *, organization_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(organization_ids))
        if not ids:
            return {}
        rows = await Workspace.filter(organization_id__in=ids).values("organization_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["organization_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_projects_by_org_ids(self, *, organization_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(organization_ids))
        if not ids:
            return {}
        rows = await ProjectRecord.filter(workspace__organization_id__in=ids).values("workspace__organization_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["workspace__organization_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_workspace_memberships_by_workspace_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await WorkspaceMembership.filter(
            workspace_id__in=ids,
            status=WorkspaceMembershipStatus.ACTIVE,
        ).values("workspace_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["workspace_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_projects_by_workspace_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = await ProjectRecord.filter(workspace_id__in=ids).values("workspace_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["workspace_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts

    async def count_project_memberships_by_project_ids(self, *, project_ids: Iterable[UUID]) -> dict[UUID, int]:
        ids = list(set(project_ids))
        if not ids:
            return {}
        rows = await ProjectMembership.filter(project_id__in=ids).values("project_id")
        counts: dict[UUID, int] = {}
        for row in rows:
            key = UUID(str(row["project_id"]))
            counts[key] = counts.get(key, 0) + 1
        return counts
