from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from tortoise.expressions import Q

from src.core.repository.implementations.tortoise import TortoiseORMRepository
from src.models.auth.oauth_identity import OAuthIdentity
from src.models.auth.user_two_factor import UserTwoFactor, UserTwoFactorBackupCode
from src.models.organization.org_membership import OrgMembership
from src.models.organization.organization import Organization
from src.models.organization.user import User, UserCredential
from src.models.projects.membership import ProjectMembership
from src.models.projects.project import ProjectRecord
from src.models.workspaces.workspace import Workspace, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.system.directory.schema import (
    DirectoryProjectListFilters,
    DirectoryUserListFilters,
    DirectoryWorkspaceListFilters,
)

_USER_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "username": "username",
    "email": "email",
    "status": "status",
    "is_super_admin": "is_super_admin",
    "last_login_at": "last_login_at",
}
_WORKSPACE_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "name": "name",
}
_PROJECT_ALLOWED_ORDER_FIELDS = {
    "created_at": "created_at",
    "name": "name",
    "slug": "slug",
    "workspace_name": "workspace__name",
}


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


def _normalize_ordering(value: str | None, allowed: dict[str, str], default: str) -> list[str]:
    fields: list[str] = []
    for part in str(value or "").split(","):
        raw = part.strip()
        if not raw:
            continue
        desc = raw.startswith("-")
        key = raw[1:] if desc else raw
        mapped = allowed.get(key)
        if mapped is None:
            continue
        fields.append(f"-{mapped}" if desc else mapped)
    return fields or [default]


class SystemDirectoryRepository(TortoiseORMRepository):
    async def _user_filter_q(self, *, filters: DirectoryUserListFilters) -> Q:
        query = Q()
        if filters.status is not None:
            query &= Q(status=filters.status)
        if filters.is_super_admin is not None:
            query &= Q(is_super_admin=filters.is_super_admin)
        if filters.has_password is not None:
            rows = await UserCredential.all().values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids) if filters.has_password else ~Q(id__in=ids)
        if filters.two_factor_enabled is not None:
            rows = await UserTwoFactor.filter(enabled_at__not_isnull=True).values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids) if filters.two_factor_enabled else ~Q(id__in=ids)
        if filters.oauth_provider is not None:
            if filters.oauth_provider == "any":
                rows = await OAuthIdentity.all().values("user_id")
            elif filters.oauth_provider == "none":
                rows = await OAuthIdentity.all().values("user_id")
                ids = [row["user_id"] for row in rows]
                query &= ~Q(id__in=ids)
                return query
            else:
                rows = await OAuthIdentity.filter(provider=filters.oauth_provider).values("user_id")
            ids = [row["user_id"] for row in rows]
            query &= Q(id__in=ids)
        return query

    async def count_users(self, *, q: str | None, filters: DirectoryUserListFilters) -> int:
        return await User.filter(
            _search_q(("username", "email", "display_name"), q),
            await self._user_filter_q(filters=filters),
        ).count()

    async def list_users_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryUserListFilters,
        offset: int,
        limit: int,
    ) -> list[User]:
        queryset = User.filter(
            _search_q(("username", "email", "display_name"), q),
            await self._user_filter_q(filters=filters),
        )
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _USER_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    def _workspace_filter_q(self, *, filters: DirectoryWorkspaceListFilters) -> Q:
        query = Q()
        if filters.is_active is not None:
            query &= Q(is_active=filters.is_active)
        if filters.is_archived is True:
            query &= Q(archived_at__not_isnull=True)
        elif filters.is_archived is False:
            query &= Q(archived_at__isnull=True)
        return query

    def _project_filter_q(self, *, filters: DirectoryProjectListFilters) -> Q:
        query = Q()
        if filters.workspace_id is not None:
            query &= Q(workspace_id=filters.workspace_id)
        if filters.is_active is not None:
            query &= Q(is_active=filters.is_active)
        return query

    async def count_workspaces(self, *, q: str | None, filters: DirectoryWorkspaceListFilters) -> int:
        return (
            await Workspace
            .filter(deleted_at__isnull=True)
            .filter(
                _search_q(("name", "description"), q),
                self._workspace_filter_q(filters=filters),
            )
            .count()
        )

    async def list_workspaces_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
        offset: int,
        limit: int,
    ) -> list[Workspace]:
        queryset = Workspace.filter(deleted_at__isnull=True).filter(
            _search_q(("name", "description"), q),
            self._workspace_filter_q(filters=filters),
        )
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _WORKSPACE_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    async def list_workspaces_all(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
    ) -> list[Workspace]:
        return (
            await Workspace
            .filter(deleted_at__isnull=True)
            .filter(
                _search_q(("name", "description"), q),
                self._workspace_filter_q(filters=filters),
            )
            .order_by(*_normalize_ordering(ordering, _WORKSPACE_ALLOWED_ORDER_FIELDS, "-created_at"))
        )

    async def count_projects(self, *, q: str | None, filters: DirectoryProjectListFilters) -> int:
        return (
            await ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description", "workspace__name"), q),
                self._project_filter_q(filters=filters),
            )
            .count()
        )

    async def list_projects_page(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryProjectListFilters,
        offset: int,
        limit: int,
    ) -> list[ProjectRecord]:
        queryset = (
            ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description", "workspace__name"), q),
                self._project_filter_q(filters=filters),
            )
            .prefetch_related("workspace")
        )
        return (
            await queryset
            .order_by(*_normalize_ordering(ordering, _PROJECT_ALLOWED_ORDER_FIELDS, "-created_at"))
            .offset(offset)
            .limit(limit)
        )

    async def list_projects_all(
        self,
        *,
        q: str | None,
        ordering: str | None,
        filters: DirectoryProjectListFilters,
    ) -> list[ProjectRecord]:
        return (
            await ProjectRecord
            .filter(workspace__deleted_at__isnull=True)
            .filter(
                _search_q(("name", "slug", "description", "workspace__name"), q),
                self._project_filter_q(filters=filters),
            )
            .prefetch_related("workspace")
            .order_by(*_normalize_ordering(ordering, _PROJECT_ALLOWED_ORDER_FIELDS, "-created_at"))
        )

    async def get_user_by_id(self, *, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).get_or_none()

    async def get_organization_by_id(self, *, organization_id: UUID) -> Organization | None:
        return await Organization.filter(id=organization_id, deleted_at__isnull=True).get_or_none()

    async def get_workspace_by_id(self, *, workspace_id: UUID) -> Workspace | None:
        return await Workspace.filter(id=workspace_id, deleted_at__isnull=True).get_or_none()

    async def get_project_by_id(self, *, project_id: UUID) -> ProjectRecord | None:
        return (
            await ProjectRecord
            .filter(id=project_id, workspace__deleted_at__isnull=True)
            .prefetch_related(
                "workspace",
            )
            .get_or_none()
        )

    async def project_slug_exists(
        self,
        *,
        workspace_id: UUID,
        slug: str,
        exclude_project_id: UUID | None = None,
    ) -> bool:
        query = ProjectRecord.filter(workspace_id=workspace_id, slug=slug, workspace__deleted_at__isnull=True)
        if exclude_project_id is not None:
            query = query.exclude(id=exclude_project_id)
        return await query.exists()

    async def get_users_by_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await User.filter(id__in=ids)
        return {UUID(str(row.id)): row for row in rows}

    async def get_users_with_credentials_by_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, User]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await User.filter(id__in=ids).prefetch_related("credential")
        return {UUID(str(row.id)): row for row in rows}

    async def get_user_with_credential_by_id(self, *, user_id: UUID) -> User | None:
        return await User.filter(id=user_id).prefetch_related("credential").get_or_none()

    async def list_linked_oauth_providers_by_user_ids(self, *, user_ids: Iterable[UUID]) -> dict[UUID, list[str]]:
        ids = list(set(user_ids))
        if not ids:
            return {}
        rows = await OAuthIdentity.filter(user_id__in=ids).values("user_id", "provider")
        providers_by_user: dict[UUID, list[str]] = {}
        for row in rows:
            key = UUID(str(row["user_id"]))
            provider = str(row["provider"] or "").strip().lower()
            if not provider:
                continue
            providers = providers_by_user.setdefault(key, [])
            if provider not in providers:
                providers.append(provider)
        for providers in providers_by_user.values():
            providers.sort()
        return providers_by_user

    async def list_two_factor_enabled_user_ids(self, *, user_ids: Iterable[UUID]) -> set[UUID]:
        ids = list(set(user_ids))
        if not ids:
            return set()
        rows = await UserTwoFactor.filter(user_id__in=ids, enabled_at__not_isnull=True).values("user_id")
        return {UUID(str(row["user_id"])) for row in rows}

    async def delete_user_two_factor(self, *, user_id: UUID) -> None:
        await UserTwoFactorBackupCode.filter(user_id=user_id).delete()
        await UserTwoFactor.filter(user_id=user_id).delete()

    async def delete_user_linked_oauth_provider(self, *, user_id: UUID, provider: str) -> int:
        provider_key = str(provider or "").strip().lower()
        if not provider_key:
            return 0
        return await OAuthIdentity.filter(user_id=user_id, provider=provider_key).delete()

    async def delete_user_linked_oauth_identities(self, *, user_id: UUID) -> int:
        return await OAuthIdentity.filter(user_id=user_id).delete()

    async def user_has_password(self, *, user_id: UUID) -> bool:
        return await UserCredential.filter(user_id=user_id).exists()

    async def delete_user_credentials(self, *, user_id: UUID) -> int:
        return await UserCredential.filter(user_id=user_id).delete()

    async def disable_user_workspace_memberships(self, *, user_id: UUID) -> int:
        from src.llm.keys import revoke_user_grants_for_workspace

        memberships = await WorkspaceMembership.filter(
            user_id=user_id, status=WorkspaceMembershipStatus.ACTIVE
        ).all()
        for m in memberships:
            await revoke_user_grants_for_workspace(
                user_id=user_id, workspace_id=m.workspace_id,
            )
        return await WorkspaceMembership.filter(user_id=user_id).update(
            status=WorkspaceMembershipStatus.DISABLED,
        )

    async def delete_user_org_memberships(self, *, user_id: UUID) -> int:
        return await OrgMembership.filter(user_id=user_id).delete()

    async def delete_user_project_memberships(self, *, user_id: UUID) -> int:
        return await ProjectMembership.filter(user_id=user_id).delete()

    async def list_owned_organization_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        rows = await Organization.filter(owner_user_id=user_id, deleted_at__isnull=True).values_list("id", flat=True)
        return [UUID(str(row)) for row in rows]

    async def list_owned_workspace_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        membership_rows = await WorkspaceMembership.filter(
            user_id=user_id,
            status=WorkspaceMembershipStatus.ACTIVE,
            workspace__deleted_at__isnull=True,
            membership_roles__role__code=ROLE_OWNER,
        ).values_list("workspace_id", flat=True)
        workspace_rows = await Workspace.filter(owner_user_id=user_id, deleted_at__isnull=True).values_list(
            "id",
            flat=True,
        )
        return sorted({UUID(str(row)) for row in [*membership_rows, *workspace_rows]})

    async def list_created_project_ids_by_user(self, *, user_id: UUID) -> list[UUID]:
        rows = await ProjectRecord.filter(
            created_by_user_id=user_id,
            workspace__deleted_at__isnull=True,
        ).values_list("id", flat=True)
        return [UUID(str(row)) for row in rows]

    async def delete_workspaces_by_ids(self, *, workspace_ids: Iterable[UUID]) -> int:
        ids = list(set(workspace_ids))
        if not ids:
            return 0
        return await Workspace.filter(id__in=ids).delete()

    async def delete_projects_by_ids(self, *, project_ids: Iterable[UUID]) -> int:
        ids = list(set(project_ids))
        if not ids:
            return 0
        return await ProjectRecord.filter(id__in=ids).delete()

    async def list_workspace_owner_user_ids(self, *, workspace_ids: Iterable[UUID]) -> dict[UUID, UUID]:
        from src.modules.system.rbac.constants.service import ROLE_OWNER

        ids = list(set(workspace_ids))
        if not ids:
            return {}
        rows = (
            await WorkspaceMembership
            .filter(
                workspace_id__in=ids,
                status=WorkspaceMembershipStatus.ACTIVE,
                membership_roles__role__code=ROLE_OWNER,
                membership_roles__role__workspace_id__in=ids,
            )
            .order_by("created_at", "id")
            .values("workspace_id", "user_id")
        )
        owner_ids_by_workspace: dict[UUID, UUID] = {}
        for row in rows:
            workspace_id = UUID(str(row["workspace_id"]))
            if workspace_id in owner_ids_by_workspace:
                continue
            owner_ids_by_workspace[workspace_id] = UUID(str(row["user_id"]))
        return owner_ids_by_workspace

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
