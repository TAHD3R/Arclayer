from __future__ import annotations

from math import ceil
from uuid import UUID

from src.common.services import BaseService
from src.config import Settings
from src.core.http.pagination import PageData, PageParams
from src.models.organization.user import User
from src.modules.system.directory.repository import SystemDirectoryRepository
from src.modules.system.directory.schema import (
    DirectoryActorSummaryOut,
    DirectoryOrganizationListItemOut,
    DirectoryProjectListItemOut,
    DirectoryUserListItemOut,
    DirectoryWorkspaceListItemOut,
)


def _build_page[T](items: list[T], *, total: int, params: PageParams) -> PageData[T]:
    pages = ceil(total / params.size) if params.size else 0
    next_page = params.page + 1 if pages > 0 and params.page < pages else None
    prev_page = min(params.page - 1, pages) if pages > 0 and params.page > 1 else None
    return PageData[T](
        items=items,
        total=total,
        page=params.page,
        size=params.size,
        pages=pages,
        next=next_page,
        prev=prev_page,
    )


def _user_id(value: object | None) -> UUID | None:
    if value is None:
        return None
    return UUID(str(value))


class SystemDirectoryService(BaseService):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.repo = SystemDirectoryRepository()

    @staticmethod
    def _to_actor(user: User | None) -> DirectoryActorSummaryOut | None:
        if user is None:
            return None
        return DirectoryActorSummaryOut(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
        )

    async def list_users(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
    ) -> PageData[DirectoryUserListItemOut]:
        total = await self.repo.count_users(q=q)
        rows = await self.repo.list_users_page(
            q=q,
            ordering=ordering,
            offset=params.offset,
            limit=params.limit,
        )
        user_ids = [UUID(str(row.id)) for row in rows]
        owned_org_counts = await self.repo.count_organizations_by_owner_ids(owner_user_ids=user_ids)
        org_membership_counts = await self.repo.count_org_memberships_by_user_ids(user_ids=user_ids)
        workspace_membership_counts = await self.repo.count_workspace_memberships_by_user_ids(user_ids=user_ids)
        project_membership_counts = await self.repo.count_project_memberships_by_user_ids(user_ids=user_ids)

        items = [
            DirectoryUserListItemOut(
                user_id=row.id,
                username=row.username,
                display_name=row.display_name,
                email=row.email,
                status=row.status,
                is_super_admin=bool(row.is_super_admin),
                last_login_at=row.last_login_at,
                created_at=row.created_at,
                owned_organizations_count=owned_org_counts.get(UUID(str(row.id)), 0),
                organization_membership_count=org_membership_counts.get(UUID(str(row.id)), 0),
                workspace_membership_count=workspace_membership_counts.get(UUID(str(row.id)), 0),
                project_membership_count=project_membership_counts.get(UUID(str(row.id)), 0),
            )
            for row in rows
        ]
        return _build_page(items, total=total, params=params)

    async def list_organizations(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
    ) -> PageData[DirectoryOrganizationListItemOut]:
        total = await self.repo.count_organizations(q=q)
        rows = await self.repo.list_organizations_page(
            q=q,
            ordering=ordering,
            offset=params.offset,
            limit=params.limit,
        )
        organization_ids = [UUID(str(row.id)) for row in rows]
        owner_ids = [_user_id(row.owner_user_id) for row in rows]
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id for owner_id in owner_ids if owner_id is not None])
        member_counts = await self.repo.count_org_memberships_by_org_ids(organization_ids=organization_ids)
        workspace_counts = await self.repo.count_workspaces_by_org_ids(organization_ids=organization_ids)
        project_counts = await self.repo.count_projects_by_org_ids(organization_ids=organization_ids)

        items = [
            DirectoryOrganizationListItemOut(
                organization_id=row.id,
                name=row.name,
                slug=row.slug,
                kind=row.kind,
                is_active=bool(row.is_active),
                created_at=row.created_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
                workspace_count=workspace_counts.get(UUID(str(row.id)), 0),
                project_count=project_counts.get(UUID(str(row.id)), 0),
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        return _build_page(items, total=total, params=params)

    async def list_workspaces(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
    ) -> PageData[DirectoryWorkspaceListItemOut]:
        total = await self.repo.count_workspaces(q=q)
        rows = await self.repo.list_workspaces_page(
            q=q,
            ordering=ordering,
            offset=params.offset,
            limit=params.limit,
        )
        workspace_ids = [UUID(str(row.id)) for row in rows]
        owner_ids = [_user_id(row.owner_user_id) for row in rows]
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id for owner_id in owner_ids if owner_id is not None])
        member_counts = await self.repo.count_workspace_memberships_by_workspace_ids(workspace_ids=workspace_ids)
        project_counts = await self.repo.count_projects_by_workspace_ids(workspace_ids=workspace_ids)

        items = [
            DirectoryWorkspaceListItemOut(
                workspace_id=row.id,
                organization_id=row.organization_id,
                organization_name=row.organization.name,
                name=row.name,
                description=row.description,
                is_active=bool(row.is_active),
                is_archived=row.archived_at is not None,
                created_at=row.created_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
                project_count=project_counts.get(UUID(str(row.id)), 0),
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        return _build_page(items, total=total, params=params)

    async def list_projects(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
    ) -> PageData[DirectoryProjectListItemOut]:
        total = await self.repo.count_projects(q=q)
        rows = await self.repo.list_projects_page(
            q=q,
            ordering=ordering,
            offset=params.offset,
            limit=params.limit,
        )
        project_ids = [UUID(str(row.id)) for row in rows]
        owner_ids = [_user_id(row.created_by_user_id) for row in rows]
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id for owner_id in owner_ids if owner_id is not None])
        member_counts = await self.repo.count_project_memberships_by_project_ids(project_ids=project_ids)

        items = [
            DirectoryProjectListItemOut(
                project_id=row.id,
                workspace_id=row.workspace_id,
                workspace_name=row.workspace.name,
                organization_id=row.workspace.organization_id,
                organization_name=row.workspace.organization.name,
                name=row.name,
                slug=row.slug,
                description=row.description,
                is_active=bool(row.is_active),
                created_at=row.created_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        return _build_page(items, total=total, params=params)
