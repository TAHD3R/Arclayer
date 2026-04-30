from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from math import ceil
from typing import Protocol, TypeVar
from uuid import UUID

from tortoise.exceptions import IntegrityError

from src.common.services import BaseService
from src.common.utils.slug import slugify
from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.models.organization.org_membership import OrgRole
from src.models.organization.organization import OrganizationKind
from src.models.organization.user import User, UserStatus
from src.modules.auth.repository import UserRepository
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password
from src.modules.auth.two_factor.service import AuthTwoFactorService
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.settings.service import OrganizationSettingsService
from src.modules.organization.workspaces.service import OrganizationWorkspaceService
from src.modules.projects.schema import ProjectUpdateRequest
from src.modules.projects.service import ProjectService
from src.modules.system.directory.repository import SystemDirectoryRepository
from src.modules.system.directory.schema import (
    DirectoryActorSummaryOut,
    DirectoryDeleteRequest,
    DirectoryOrganizationDetailOut,
    DirectoryOrganizationListFilters,
    DirectoryOrganizationListItemOut,
    DirectoryOrganizationUpdateRequest,
    DirectoryProjectDetailOut,
    DirectoryProjectListFilters,
    DirectoryProjectListItemOut,
    DirectoryProjectUpdateRequest,
    DirectoryUserDetailOut,
    DirectoryUserListFilters,
    DirectoryUserListItemOut,
    DirectoryUserResetPasswordRequest,
    DirectoryUserUpdateRequest,
    DirectoryWorkspaceDetailOut,
    DirectoryWorkspaceListFilters,
    DirectoryWorkspaceListItemOut,
    DirectoryWorkspaceUpdateRequest,
)
from src.modules.workspaces.schema import WorkspaceUpdateRequest
from src.modules.workspaces.service import WorkspaceService
from src.platform.cache.valkey import ValkeyClientLike

_SortKeyT = TypeVar("_SortKeyT", bound="_SupportsRichCompare")


class _SupportsRichCompare(Protocol):
    def __lt__(self, other: object) -> bool: ...
    def __le__(self, other: object) -> bool: ...
    def __gt__(self, other: object) -> bool: ...
    def __ge__(self, other: object) -> bool: ...


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


def _normalize_slug_value(value: str, *, fallback: str) -> str:
    normalized = slugify(value)[:64]
    if normalized == "asset" or not normalized:
        normalized = slugify(fallback)[:64] or "entity"
    return normalized


class SystemDirectoryService(BaseService):
    def __init__(self, settings: Settings, *, valkey: ValkeyClientLike | None = None) -> None:
        super().__init__(settings)
        self.repo = SystemDirectoryRepository()
        self.user_repo = UserRepository()
        self.organization_repo = OrganizationRepository()
        self.auth_service = AuthService(settings, valkey=valkey, user_repo=self.user_repo)
        self.two_factor_service = AuthTwoFactorService(settings)
        self.workspace_service = WorkspaceService(settings)
        self.project_service = ProjectService(settings)
        self.organization_settings_service = OrganizationSettingsService(settings)
        self.organization_workspace_service = OrganizationWorkspaceService(settings)

    @staticmethod
    def _to_actor(user: User | None) -> DirectoryActorSummaryOut | None:
        if user is None:
            return None
        return DirectoryActorSummaryOut(
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            avatar_url=user.avatar_url,
        )

    async def _build_user_security_state(
        self,
        *,
        user_ids: list[UUID],
    ) -> tuple[dict[UUID, bool], set[UUID], dict[UUID, list[str]]]:
        users_with_credentials = await self.repo.get_users_with_credentials_by_ids(user_ids=user_ids)
        has_password = {
            user_id: bool(getattr(user, "credential", None) is not None)
            for user_id, user in users_with_credentials.items()
        }
        two_factor_enabled = await self.repo.list_two_factor_enabled_user_ids(user_ids=user_ids)
        linked_oauth_providers = await self.repo.list_linked_oauth_providers_by_user_ids(user_ids=user_ids)
        return has_password, two_factor_enabled, linked_oauth_providers

    async def _build_user_detail_out(self, *, user_id: UUID, row: User) -> DirectoryUserDetailOut:
        has_password_map, two_factor_enabled_set, linked_oauth_providers_map = await self._build_user_security_state(
            user_ids=[user_id]
        )
        owned_org_counts = await self.repo.count_organizations_by_owner_ids(owner_user_ids=[user_id])
        org_membership_counts = await self.repo.count_org_memberships_by_user_ids(user_ids=[user_id])
        workspace_membership_counts = await self.repo.count_workspace_memberships_by_user_ids(user_ids=[user_id])
        project_membership_counts = await self.repo.count_project_memberships_by_user_ids(user_ids=[user_id])

        return DirectoryUserDetailOut(
            user_id=row.id,
            username=row.username,
            display_name=row.display_name,
            email=row.email,
            avatar_url=row.avatar_url,
            status=row.status,
            is_super_admin=bool(row.is_super_admin),
            has_password=has_password_map.get(user_id, False),
            two_factor_enabled=user_id in two_factor_enabled_set,
            linked_oauth_providers=linked_oauth_providers_map.get(user_id, []),
            last_login_at=row.last_login_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
            owned_organizations_count=owned_org_counts.get(user_id, 0),
            organization_membership_count=org_membership_counts.get(user_id, 0),
            workspace_membership_count=workspace_membership_counts.get(user_id, 0),
            project_membership_count=project_membership_counts.get(user_id, 0),
        )

    async def list_users(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryUserListFilters,
    ) -> PageData[DirectoryUserListItemOut]:
        total = await self.repo.count_users(q=q, filters=filters)
        rows = await self.repo.list_users_page(
            q=q,
            ordering=ordering,
            filters=filters,
            offset=params.offset,
            limit=params.limit,
        )
        user_ids = [UUID(str(row.id)) for row in rows]
        owned_org_counts = await self.repo.count_organizations_by_owner_ids(owner_user_ids=user_ids)
        org_membership_counts = await self.repo.count_org_memberships_by_user_ids(user_ids=user_ids)
        workspace_membership_counts = await self.repo.count_workspace_memberships_by_user_ids(user_ids=user_ids)
        project_membership_counts = await self.repo.count_project_memberships_by_user_ids(user_ids=user_ids)
        has_password_map, two_factor_enabled_set, linked_oauth_providers_map = await self._build_user_security_state(
            user_ids=user_ids
        )

        items = [
            DirectoryUserListItemOut(
                user_id=row.id,
                username=row.username,
                display_name=row.display_name,
                email=row.email,
                avatar_url=row.avatar_url,
                status=row.status,
                is_super_admin=bool(row.is_super_admin),
                has_password=has_password_map.get(UUID(str(row.id)), False),
                two_factor_enabled=UUID(str(row.id)) in two_factor_enabled_set,
                linked_oauth_providers=linked_oauth_providers_map.get(UUID(str(row.id)), []),
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

    async def get_user_detail(self, *, user_id: UUID) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        return await self._build_user_detail_out(user_id=user_id, row=row)

    async def require_user(self, *, user_id: UUID) -> User:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        return row

    async def update_user(self, *, user_id: UUID, payload: DirectoryUserUpdateRequest) -> DirectoryUserDetailOut:
        row = await self.require_user(user_id=user_id)

        model_fields_set = getattr(payload, "model_fields_set", set())
        updates: dict[str, object | None] = {}
        if "email" in model_fields_set:
            email = str(payload.email).strip().lower() if payload.email else None
            if email and email != (row.email or "").strip().lower() and await self.user_repo.exists_email(email):
                raise Conflict(message=t("auth", "EMAIL_EXISTS"), error="EMAIL_EXISTS")
            updates["email"] = email
        if "display_name" in model_fields_set:
            updates["display_name"] = payload.display_name
        if "avatar_asset_id" in model_fields_set:
            avatar_asset_id = payload.avatar_asset_id
            if avatar_asset_id is None:
                updates["avatar_asset_id"] = None
                updates["avatar_url"] = None
            else:
                from src.common.constants.assets import ASSET_SCOPE_USER
                from src.common.utils.public_ids import encode_uuid
                from src.models.assets.asset import AssetPurpose, AssetRecord
                from src.modules.assets.admin.assets.binding_align import align_asset_for_binding
                from src.modules.assets.scope import AssetScope, scope_filter_kwargs

                scope = AssetScope(type=ASSET_SCOPE_USER, id=row.id)
                asset = await AssetRecord.get_or_none(
                    id=UUID(str(avatar_asset_id)),
                    deleted_at=None,
                    **scope_filter_kwargs(scope),
                )
                if asset is None:
                    raise NotFound(message=t("errors", "ASSET_NOT_FOUND"), error="ASSET_NOT_FOUND")
                await align_asset_for_binding(
                    self.settings,
                    scope=scope,
                    asset_id=UUID(str(asset.id)),
                    purpose=AssetPurpose.AVATAR,
                )
                updates["avatar_asset_id"] = asset.id
                updates["avatar_url"] = f"/assets/{encode_uuid(UUID(str(asset.id)))}"

        if updates:
            for field, value in updates.items():
                setattr(row, field, value)
            try:
                await row.save(update_fields=sorted(updates.keys()))
            except IntegrityError as exc:
                raise Conflict(message=t("auth", "EMAIL_EXISTS"), error="EMAIL_EXISTS") from exc

        return await self.get_user_detail(user_id=user_id)

    async def reset_user_password(
        self,
        *,
        user_id: UUID,
        payload: DirectoryUserResetPasswordRequest,
    ) -> DirectoryUserDetailOut:
        row = await self.user_repo.get_by_id_with_credential(user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        password_hash = hash_password(payload.new_password, self.settings.auth)
        await self.user_repo.set_password(row, password_hash)
        await self.auth_service.invalidate_user_sessions(user=row)
        return await self.get_user_detail(user_id=user_id)

    async def send_reset_password_email(self, *, user_id: UUID) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if not row.email:
            raise BadRequest(message=t("auth", "EMAIL_REQUIRED"), error="EMAIL_REQUIRED")
        _payload, issued = await self.auth_service.request_password_reset(email=str(row.email))
        if not issued:
            raise Forbidden(message=t("auth", "USER_DISABLED"), error="USER_DISABLED")
        token, ttl, recipient, target_user_id = issued
        await self.auth_service.send_reset_email(
            recipient=recipient,
            reset_token=token,
            expires_in=ttl,
            user_id=target_user_id,
        )
        return await self.get_user_detail(user_id=user_id)

    async def revoke_user_sessions(self, *, user_id: UUID) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        await self.auth_service.invalidate_user_sessions(user=row)
        return await self.get_user_detail(user_id=user_id)

    async def set_user_enabled(
        self,
        *,
        user_id: UUID,
        enabled: bool,
        acting_user_id: UUID,
    ) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if row.id == acting_user_id and not enabled:
            raise BadRequest(message=t("errors", "CANNOT_DISABLE_SELF"), error="CANNOT_DISABLE_SELF")

        target = UserStatus.ACTIVE if enabled else UserStatus.DISABLED
        if row.status != target:
            row = await self.user_repo.set_status(row, target)

        return await self.get_user_detail(user_id=user_id)

    async def disable_user_two_factor(self, *, user_id: UUID) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        await self.repo.delete_user_two_factor(user_id=user_id)
        await self.auth_service.invalidate_user_sessions(user=row)
        return await self.get_user_detail(user_id=user_id)

    async def unlink_user_oauth_provider(self, *, user_id: UUID, provider: str) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        provider_key = str(provider or "").strip().lower()
        if not provider_key:
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="BAD_REQUEST")

        linked_providers = await self.repo.list_linked_oauth_providers_by_user_ids(user_ids=[user_id])
        current_providers = linked_providers.get(user_id, [])
        if provider_key not in current_providers:
            raise NotFound(error="NOT_FOUND")

        has_password = await self.repo.user_has_password(user_id=user_id)
        if not has_password and len(current_providers) <= 1:
            raise Conflict(message=t("errors", "LAST_SIGNIN_METHOD"), error="LAST_SIGNIN_METHOD")

        await self.repo.delete_user_linked_oauth_provider(user_id=user_id, provider=provider_key)
        return await self.get_user_detail(user_id=user_id)

    async def delete_user_account(
        self,
        *,
        user_id: UUID,
        acting_user_id: UUID,
    ) -> None:
        row = await self.repo.get_user_with_credential_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if row.id == acting_user_id:
            raise BadRequest(message=t("errors", "CANNOT_DELETE_SELF"), error="CANNOT_DELETE_SELF")

        await self._delete_owned_entities_for_user(user_id=user_id)
        await self.auth_service.invalidate_user_sessions(user=row)
        await self.repo.delete_user_linked_oauth_identities(user_id=user_id)
        await self.repo.delete_user_two_factor(user_id=user_id)
        await self.repo.disable_user_workspace_memberships(user_id=user_id)
        await self.repo.delete_user_org_memberships(user_id=user_id)
        await self.repo.delete_user_project_memberships(user_id=user_id)
        await self.repo.delete_user_credentials(user_id=user_id)
        await self.user_repo.anonymize_user(row)

    async def list_organization_owner_candidates(
        self,
        *,
        organization_id: UUID,
        q: str | None,
    ) -> list[DirectoryActorSummaryOut]:
        row = await self.repo.get_organization_by_id(organization_id=organization_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        candidates = await self.repo.list_organization_owner_candidates(
            organization_id=organization_id,
            q=q,
        )
        return [actor for actor in (self._to_actor(user) for user in candidates) if actor is not None]

    async def list_organizations(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryOrganizationListFilters,
    ) -> PageData[DirectoryOrganizationListItemOut]:
        count_sort_requested = ordering in {
            "member_count",
            "-member_count",
            "workspace_count",
            "-workspace_count",
            "project_count",
            "-project_count",
        }
        rows = (
            await self.repo.list_organizations_all(q=q, ordering=ordering, filters=filters)
            if count_sort_requested
            else await self.repo.list_organizations_page(
                q=q,
                ordering=ordering,
                filters=filters,
                offset=params.offset,
                limit=params.limit,
            )
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
        if count_sort_requested:
            items = self._sort_organization_items(items=items, ordering=ordering)
            total = len(items)
            items = items[params.offset : params.offset + params.limit]
            return _build_page(items, total=total, params=params)
        total = await self.repo.count_organizations(q=q, filters=filters)
        return _build_page(items, total=total, params=params)

    async def get_organization_detail(self, *, organization_id: UUID) -> DirectoryOrganizationDetailOut:
        row = await self.repo.get_organization_by_id(organization_id=organization_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        owner_id = _user_id(row.owner_user_id)
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id] if owner_id is not None else [])
        member_counts = await self.repo.count_org_memberships_by_org_ids(organization_ids=[organization_id])
        workspace_counts = await self.repo.count_workspaces_by_org_ids(organization_ids=[organization_id])
        project_counts = await self.repo.count_projects_by_org_ids(organization_ids=[organization_id])

        return DirectoryOrganizationDetailOut(
            organization_id=row.id,
            name=row.name,
            slug=row.slug,
            kind=row.kind,
            is_active=bool(row.is_active),
            created_at=row.created_at,
            updated_at=row.updated_at,
            logo_url=row.logo_url,
            owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
            member_count=member_counts.get(organization_id, 0),
            workspace_count=workspace_counts.get(organization_id, 0),
            project_count=project_counts.get(organization_id, 0),
        )

    async def list_workspaces(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
    ) -> PageData[DirectoryWorkspaceListItemOut]:
        count_sort_requested = ordering in {"member_count", "-member_count", "project_count", "-project_count"}
        rows = (
            await self.repo.list_workspaces_all(q=q, ordering=ordering, filters=filters)
            if count_sort_requested
            else await self.repo.list_workspaces_page(
                q=q,
                ordering=ordering,
                filters=filters,
                offset=params.offset,
                limit=params.limit,
            )
        )
        workspace_ids = [UUID(str(row.id)) for row in rows]
        owner_ids_by_workspace = await self.repo.list_workspace_owner_user_ids(workspace_ids=workspace_ids)
        owner_ids = [owner_ids_by_workspace.get(UUID(str(row.id))) or _user_id(row.owner_user_id) for row in rows]
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
                icon_mode=row.icon_mode,
                icon_color=row.icon_color,
                icon_glyph=row.icon_glyph,
                icon_emoji=row.icon_emoji,
                icon_url=row.icon_url,
                is_active=bool(row.is_active),
                is_archived=row.archived_at is not None,
                created_at=row.created_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
                project_count=project_counts.get(UUID(str(row.id)), 0),
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        if count_sort_requested:
            items = self._sort_workspace_items(items=items, ordering=ordering)
            total = len(items)
            items = items[params.offset : params.offset + params.limit]
            return _build_page(items, total=total, params=params)
        total = await self.repo.count_workspaces(q=q, filters=filters)
        return _build_page(items, total=total, params=params)

    async def get_workspace_detail(self, *, workspace_id: UUID) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        owner_id = (await self.repo.list_workspace_owner_user_ids(workspace_ids=[workspace_id])).get(
            workspace_id,
        ) or _user_id(row.owner_user_id)
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id] if owner_id is not None else [])
        member_counts = await self.repo.count_workspace_memberships_by_workspace_ids(workspace_ids=[workspace_id])
        project_counts = await self.repo.count_projects_by_workspace_ids(workspace_ids=[workspace_id])

        return DirectoryWorkspaceDetailOut(
            workspace_id=row.id,
            organization_id=row.organization_id,
            organization_name=row.organization.name,
            name=row.name,
            description=row.description,
            kind=row.kind,
            is_active=bool(row.is_active),
            is_archived=row.archived_at is not None,
            created_at=row.created_at,
            updated_at=row.updated_at,
            owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
            member_count=member_counts.get(workspace_id, 0),
            project_count=project_counts.get(workspace_id, 0),
            icon_mode=row.icon_mode,
            icon_color=row.icon_color,
            icon_glyph=row.icon_glyph,
            icon_emoji=row.icon_emoji,
            icon_url=row.icon_url,
        )

    async def list_projects(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryProjectListFilters,
    ) -> PageData[DirectoryProjectListItemOut]:
        count_sort_requested = ordering in {"member_count", "-member_count"}
        rows = (
            await self.repo.list_projects_all(q=q, ordering=ordering, filters=filters)
            if count_sort_requested
            else await self.repo.list_projects_page(
                q=q,
                ordering=ordering,
                filters=filters,
                offset=params.offset,
                limit=params.limit,
            )
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
                icon_mode=row.icon_mode,
                icon_color=row.icon_color,
                icon_glyph=row.icon_glyph,
                icon_emoji=row.icon_emoji,
                icon_url=row.icon_url,
                is_active=bool(row.is_active),
                created_at=row.created_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        if count_sort_requested:
            items = self._sort_project_items(items=items, ordering=ordering)
            total = len(items)
            items = items[params.offset : params.offset + params.limit]
            return _build_page(items, total=total, params=params)
        total = await self.repo.count_projects(q=q, filters=filters)
        return _build_page(items, total=total, params=params)

    async def get_project_detail(self, *, project_id: UUID) -> DirectoryProjectDetailOut:
        row = await self.repo.get_project_by_id(project_id=project_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        owner_id = _user_id(row.created_by_user_id)
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id] if owner_id is not None else [])
        member_counts = await self.repo.count_project_memberships_by_project_ids(project_ids=[project_id])

        return DirectoryProjectDetailOut(
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
            updated_at=row.updated_at,
            owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
            member_count=member_counts.get(project_id, 0),
            icon_mode=row.icon_mode,
            icon_color=row.icon_color,
            icon_glyph=row.icon_glyph,
            icon_emoji=row.icon_emoji,
            icon_url=row.icon_url,
        )

    async def update_organization(
        self,
        *,
        organization_id: UUID,
        payload: DirectoryOrganizationUpdateRequest,
    ) -> DirectoryOrganizationDetailOut:
        row = await self.repo.get_organization_by_id(organization_id=organization_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        updates: dict[str, object | None] = {}
        model_fields_set = getattr(payload, "model_fields_set", set())

        if "name" in model_fields_set:
            name = str(payload.name or "").strip()
            if not name:
                raise BadRequest(message=t("errors", "BAD_REQUEST"), error="INVALID_ORGANIZATION_NAME")
            updates["name"] = name

        if "slug" in model_fields_set:
            next_slug = _normalize_slug_value(str(payload.slug or ""), fallback=str(payload.name or row.name))
            if await self.repo.organization_slug_exists(slug=next_slug, exclude_organization_id=organization_id):
                raise Conflict(message=t("errors", "BAD_REQUEST"), error="ORGANIZATION_SLUG_EXISTS")
            updates["slug"] = next_slug

        if "owner_user_id" in model_fields_set:
            owner_user_id = _user_id(payload.owner_user_id)
            if owner_user_id is None:
                updates["owner_user_id"] = None
            else:
                owner = await self.repo.get_user_by_id(user_id=owner_user_id)
                if owner is None:
                    raise NotFound(error="NOT_FOUND")
                if owner.status != UserStatus.ACTIVE:
                    raise BadRequest(
                        message=t("errors", "BAD_REQUEST"),
                        error="ORGANIZATION_OWNER_INACTIVE_USER",
                    )
                membership = await self.repo.get_org_membership(
                    organization_id=organization_id,
                    user_id=owner_user_id,
                )
                if membership is None or str(membership.status).lower() != "active":
                    raise BadRequest(
                        message=t("errors", "BAD_REQUEST"),
                        error="ORGANIZATION_OWNER_MEMBER_REQUIRED",
                    )
                if membership.role != OrgRole.OWNER or str(membership.role_code or "") != OrgRole.OWNER.value:
                    membership.role = OrgRole.OWNER
                    membership.role_code = OrgRole.OWNER.value
                    await membership.save(update_fields=["role", "role_code", "updated_at"])
                updates["owner_user_id"] = owner.id
                await self._downgrade_previous_owner_membership(
                    organization_id=organization_id,
                    previous_owner_id=_user_id(row.owner_user_id),
                    next_owner_id=owner_user_id,
                    organization_kind=row.kind,
                )

        if updates:
            for field, value in updates.items():
                setattr(row, field, value)
            await row.save(update_fields=[*sorted(updates.keys()), "updated_at"])

        return await self.get_organization_detail(organization_id=organization_id)

    async def set_organization_enabled(
        self,
        *,
        organization_id: UUID,
        enabled: bool,
    ) -> DirectoryOrganizationDetailOut:
        row = await self.repo.get_organization_by_id(organization_id=organization_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if bool(row.is_active) != enabled:
            row.is_active = enabled
            await row.save(update_fields=["is_active", "updated_at"])
        return await self.get_organization_detail(organization_id=organization_id)

    async def update_workspace(
        self,
        *,
        workspace_id: UUID,
        payload: DirectoryWorkspaceUpdateRequest,
        actor_user_id: UUID,
    ) -> DirectoryWorkspaceDetailOut:
        workspace = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if workspace is None:
            raise NotFound(error="NOT_FOUND")
        service_payload = payload.model_dump(exclude_none=False, by_alias=False)
        detail = await self.workspace_service.update_workspace(
            organization_id=UUID(str(workspace.organization_id)),
            workspace_id=workspace_id,
            payload=WorkspaceUpdateRequest(**service_payload),
            actor_user_id=actor_user_id,
        )
        return await self.get_workspace_detail(workspace_id=UUID(str(detail.id)))

    async def set_workspace_enabled(
        self,
        *,
        workspace_id: UUID,
        enabled: bool,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if bool(row.is_active) != enabled:
            row.is_active = enabled
            await row.save(update_fields=["is_active", "updated_at"])
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def archive_workspace(
        self,
        *,
        workspace_id: UUID,
        acting_user_id: UUID,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if row.archived_at is None:
            row.archived_at = datetime.now(UTC)
            row.archived_by_user_id = acting_user_id
            await row.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def restore_workspace(
        self,
        *,
        workspace_id: UUID,
        acting_user_id: UUID,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if row.archived_at is not None or row.archived_by_user_id is not None:
            row.archived_at = None
            row.archived_by_user_id = None
            await row.save(update_fields=["archived_at", "archived_by_user_id", "updated_at"])
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def update_project(
        self,
        *,
        project_id: UUID,
        payload: DirectoryProjectUpdateRequest,
    ) -> DirectoryProjectDetailOut:
        service_payload = ProjectUpdateRequest(**payload.model_dump(exclude_none=False, by_alias=False))
        await self.project_service.update_project(project_id=project_id, payload=service_payload)
        return await self.get_project_detail(project_id=project_id)

    async def set_project_enabled(
        self,
        *,
        project_id: UUID,
        enabled: bool,
    ) -> DirectoryProjectDetailOut:
        row = await self.repo.get_project_by_id(project_id=project_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if bool(row.is_active) != enabled:
            row.is_active = enabled
            await row.save(update_fields=["is_active", "updated_at"])
        return await self.get_project_detail(project_id=project_id)

    async def delete_project(
        self,
        *,
        project_id: UUID,
        payload: DirectoryDeleteRequest,
        acting_user_id: UUID,
    ) -> None:
        row = await self.repo.get_project_by_id(project_id=project_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        normalized_confirm_name = str(payload.confirm_name or "").strip()
        if normalized_confirm_name != str(row.name):
            raise BadRequest(message=t("errors", "BAD_REQUEST"), error="PROJECT_DELETE_CONFIRM_NAME_MISMATCH")
        await self.project_service.delete_project(project_id=project_id)

    async def delete_organization(
        self,
        *,
        organization_id: UUID,
        payload: DirectoryDeleteRequest,
    ) -> None:
        await self.organization_settings_service.delete_organization(
            organization_id=organization_id,
            confirm_name=payload.confirm_name,
        )

    async def delete_workspace(
        self,
        *,
        workspace_id: UUID,
        payload: DirectoryDeleteRequest,
        acting_user_id: UUID,
    ) -> None:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        await self.organization_workspace_service.delete_workspace(
            organization_id=UUID(str(row.organization_id)),
            workspace_id=workspace_id,
            user_id=acting_user_id,
            org_role=OrgRole.OWNER,
            confirm_name=payload.confirm_name,
        )

    async def _downgrade_previous_owner_membership(
        self,
        *,
        organization_id: UUID,
        previous_owner_id: UUID | None,
        next_owner_id: UUID | None,
        organization_kind: str | OrganizationKind,
    ) -> None:
        if previous_owner_id is None or previous_owner_id == next_owner_id:
            return
        if str(organization_kind) == OrganizationKind.PERSONAL.value:
            return
        membership = await self.repo.get_org_membership(organization_id=organization_id, user_id=previous_owner_id)
        if membership is None:
            return
        membership.role = OrgRole.ADMIN
        membership.role_code = OrgRole.ADMIN.value
        await membership.save(update_fields=["role", "role_code", "updated_at"])

    async def _delete_owned_entities_for_user(self, *, user_id: UUID) -> None:
        project_ids = await self.repo.list_created_project_ids_by_user(user_id=user_id)
        if project_ids:
            await self.repo.delete_projects_by_ids(project_ids=project_ids)

        workspace_ids = await self.repo.list_owned_workspace_ids_by_user(user_id=user_id)
        if workspace_ids:
            await self.repo.delete_workspaces_by_ids(workspace_ids=workspace_ids)

        organization_ids = await self.repo.list_owned_organization_ids_by_user(user_id=user_id)
        for organization_id in organization_ids:
            organization = await self.repo.get_organization_by_id(organization_id=organization_id)
            if organization is None:
                continue
            await self.organization_settings_service.delete_organization(
                organization_id=organization_id,
                confirm_name=str(organization.name),
            )

    def _sort_organization_items(
        self,
        *,
        items: list[DirectoryOrganizationListItemOut],
        ordering: str | None,
    ) -> list[DirectoryOrganizationListItemOut]:
        return self._sort_items_with_key(
            items=items,
            ordering=ordering,
            accessors={
                "member_count": lambda item: item.member_count,
                "workspace_count": lambda item: item.workspace_count,
                "project_count": lambda item: item.project_count,
            },
        )

    def _sort_workspace_items(
        self,
        *,
        items: list[DirectoryWorkspaceListItemOut],
        ordering: str | None,
    ) -> list[DirectoryWorkspaceListItemOut]:
        return self._sort_items_with_key(
            items=items,
            ordering=ordering,
            accessors={
                "member_count": lambda item: item.member_count,
                "project_count": lambda item: item.project_count,
            },
        )

    def _sort_project_items(
        self,
        *,
        items: list[DirectoryProjectListItemOut],
        ordering: str | None,
    ) -> list[DirectoryProjectListItemOut]:
        return self._sort_items_with_key(
            items=items,
            ordering=ordering,
            accessors={"member_count": lambda item: item.member_count},
        )

    def _sort_items_with_key[T](
        self,
        *,
        items: list[T],
        ordering: str | None,
        accessors: dict[str, Callable[[T], _SortKeyT]],
    ) -> list[T]:
        ordered = list(items)
        parts = [part.strip() for part in str(ordering or "").split(",") if part.strip()]
        for raw in reversed(parts):
            desc = raw.startswith("-")
            field = raw[1:] if desc else raw
            accessor = accessors.get(field)
            if accessor is None:
                continue
            ordered.sort(key=lambda item, getter=accessor: getter(item), reverse=desc)
        return ordered
