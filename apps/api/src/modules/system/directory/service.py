from __future__ import annotations

from asyncio import gather
from collections.abc import Mapping
from datetime import UTC, datetime
from math import ceil
from typing import Protocol
from uuid import UUID

from tortoise.exceptions import IntegrityError

from src.config import Settings
from src.core.exceptions import BadRequest, Conflict, Forbidden, NotFound
from src.core.http.pagination import PageData, PageParams
from src.core.i18n import t
from src.core.services import BaseService
from src.models.organization.user import User, UserStatus
from src.models.system.access_restriction import (
    AccessRestrictionEntityType,
    AccessRestrictionType,
)
from src.modules.access_restrictions.repository import AccessRestrictionRepository
from src.modules.access_restrictions.schema import (
    AccessRestrictionAdminOut,
    AccessRestrictionEnforceRequest,
    AccessRestrictionLiftRequest,
)
from src.modules.access_restrictions.service import (
    AccessRestrictionAuthority,
    AccessRestrictionService,
    build_access_restriction_admin_out,
)
from src.modules.auth.repository import UserRepository
from src.modules.auth.service import AuthService
from src.modules.auth.tokens.service import hash_password
from src.modules.auth.two_factor.service import AuthTwoFactorService
from src.modules.commerce.schema import WorkspaceCommerceDirectoryOut
from src.modules.organization.settings.service import OrganizationSettingsService
from src.modules.projects.schema import ProjectUpdateRequest
from src.modules.projects.service import build_project_service
from src.modules.system.directory.repository import SystemDirectoryRepository
from src.modules.system.directory.schema import (
    DirectoryActorSummaryOut,
    DirectoryProjectDetailOut,
    DirectoryProjectListFilters,
    DirectoryProjectListItemOut,
    DirectoryProjectOperationalSummaryOut,
    DirectoryProjectUpdateRequest,
    DirectoryUserAuditActivityOut,
    DirectoryUserDetailOut,
    DirectoryUserFeedbackActivityOut,
    DirectoryUserListFilters,
    DirectoryUserListItemOut,
    DirectoryUserProjectMembershipOut,
    DirectoryUserResetPasswordRequest,
    DirectoryUserRestrictionHistoryOut,
    DirectoryUserUpdateRequest,
    DirectoryUserWorkspaceMembershipOut,
    DirectoryWorkspaceDetailOut,
    DirectoryWorkspaceListFilters,
    DirectoryWorkspaceListItemOut,
    DirectoryWorkspaceUpdateRequest,
)
from src.modules.workspaces.schema import WorkspaceUpdateRequest
from src.modules.workspaces.service import WorkspaceService
from src.platform.cache.valkey import ValkeyClientLike


class WorkspaceCommerceProjectionReader(Protocol):
    async def list_projections(
        self,
        *,
        workspace_ids: list[UUID],
    ) -> dict[UUID, WorkspaceCommerceDirectoryOut]: ...


class ProjectOperationsProjectionReader(Protocol):
    async def filter_project_ids(self, *, filters: DirectoryProjectListFilters) -> set[UUID] | None: ...

    async def list_projections(
        self,
        *,
        project_activity: Mapping[UUID, datetime],
    ) -> dict[UUID, DirectoryProjectOperationalSummaryOut]: ...


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
    def __init__(
        self,
        settings: Settings,
        *,
        valkey: ValkeyClientLike | None = None,
        commerce_projection_reader: WorkspaceCommerceProjectionReader,
        project_projection_reader: ProjectOperationsProjectionReader,
        restriction_service: AccessRestrictionService | None = None,
        restriction_authority: AccessRestrictionAuthority | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = SystemDirectoryRepository()
        self.user_repo = UserRepository()
        self.auth_service = AuthService(settings, valkey=valkey, user_repo=self.user_repo)
        self.two_factor_service = AuthTwoFactorService(settings)
        self.workspace_service = WorkspaceService(settings)
        self.project_service = build_project_service(settings)
        self.organization_settings_service = OrganizationSettingsService(settings)
        self.commerce_projection_reader = commerce_projection_reader
        self.project_projection_reader = project_projection_reader
        restriction_repository = AccessRestrictionRepository()
        self.restriction_service = restriction_service or AccessRestrictionService(
            settings,
            repository=restriction_repository,
        )
        self.restriction_authority = restriction_authority or AccessRestrictionAuthority(restriction_repository)

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

    async def _restrictions_by_entity(
        self,
        *,
        entity_type: AccessRestrictionEntityType,
        entity_ids: list[UUID],
    ) -> dict[UUID, list[AccessRestrictionAdminOut]]:
        rows = await self.restriction_authority.list_current(
            entity_type=entity_type,
            entity_ids=entity_ids,
        )
        restrictions_by_entity: dict[UUID, list[AccessRestrictionAdminOut]] = {}
        for row in rows:
            entity_id = UUID(str(row.entity_id))
            restrictions_by_entity.setdefault(entity_id, []).append(build_access_restriction_admin_out(row))
        return restrictions_by_entity

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
        (
            security_state,
            workspace_membership_counts,
            project_membership_counts,
            restrictions,
            workspace_memberships,
            project_memberships,
        ) = await gather(
            self._build_user_security_state(user_ids=[user_id]),
            self.repo.count_workspace_memberships_by_user_ids(user_ids=[user_id]),
            self.repo.count_project_memberships_by_user_ids(user_ids=[user_id]),
            self._restrictions_by_entity(
                entity_type=AccessRestrictionEntityType.USER,
                entity_ids=[user_id],
            ),
            self.repo.list_user_workspace_memberships(user_id=user_id),
            self.repo.list_user_project_memberships(user_id=user_id),
        )
        audit_activity, feedback_activity, restriction_commands = await gather(
            self.repo.list_recent_user_audit_activity(user_id=user_id),
            self.repo.list_recent_user_feedback_activity(user_id=user_id),
            self.repo.list_user_restriction_history(user_id=user_id),
        )
        has_password_map, two_factor_enabled_set, linked_oauth_providers_map = security_state
        workspace_membership_out = [
            DirectoryUserWorkspaceMembershipOut(
                workspace_id=membership.workspace.id,
                workspace_name=membership.workspace.name,
                status=membership.status,
                role_codes=sorted({
                    binding.role.code
                    for binding in (getattr(membership, "membership_roles", None) or [])
                    if getattr(binding, "role", None) is not None
                }),
                is_owner=(membership.workspace.owner_user_id == user_id),
                joined_at=membership.created_at,
            )
            for membership in workspace_memberships
        ]
        project_membership_out = [
            DirectoryUserProjectMembershipOut(
                project_id=membership.project.id,
                project_name=membership.project.name,
                workspace_id=membership.project.workspace.id,
                workspace_name=membership.project.workspace.name,
                role=membership.role,
                joined_at=membership.created_at,
            )
            for membership in project_memberships
        ]
        restriction_history = []
        for command in restriction_commands:
            snapshot = AccessRestrictionAdminOut.model_validate(command.result_snapshot)
            restriction_history.append(
                DirectoryUserRestrictionHistoryOut(
                    command_id=command.id,
                    restriction_type=snapshot.restriction_type,
                    state=snapshot.state,
                    reason_category=snapshot.reason_category,
                    reason_code=snapshot.reason_code,
                    operator_note=snapshot.operator_note if snapshot.state == "active" else snapshot.lift_note or "",
                    actor_user_id=command.actor_user_id,
                    changed_at=command.created_at,
                    revision=command.resulting_revision,
                )
            )

        return DirectoryUserDetailOut(
            user_id=row.id,
            username=row.username,
            display_name=row.display_name,
            email=row.email,
            avatar_url=row.avatar_url,
            status=row.status,
            has_password=has_password_map.get(user_id, False),
            two_factor_enabled=user_id in two_factor_enabled_set,
            linked_oauth_providers=linked_oauth_providers_map.get(user_id, []),
            last_login_at=row.last_login_at,
            created_at=row.created_at,
            updated_at=row.updated_at,
            workspace_membership_count=workspace_membership_counts.get(user_id, 0),
            project_membership_count=project_membership_counts.get(user_id, 0),
            restrictions=restrictions.get(user_id, []),
            owned_workspace_count=sum(item.is_owner for item in workspace_membership_out),
            owned_project_count=sum(item.role == "owner" for item in project_membership_out),
            workspace_memberships=workspace_membership_out,
            project_memberships=project_membership_out,
            recent_audit_activity=[
                DirectoryUserAuditActivityOut(
                    event_id=event.id,
                    event_name=event.event_name,
                    occurred_at=event.occurred_at,
                    source=event.source,
                    workspace_id=event.workspace_id,
                    project_id=event.project_id,
                )
                for event in audit_activity
            ],
            recent_feedback_activity=[
                DirectoryUserFeedbackActivityOut(
                    feedback_id=feedback.id,
                    intent=str(feedback.intent) if feedback.intent is not None else None,
                    status=str(feedback.status),
                    source=str(feedback.source),
                    message=feedback.message,
                    last_activity_at=feedback.last_activity_at,
                )
                for feedback in feedback_activity
            ],
            restriction_history=restriction_history,
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
        workspace_membership_counts = await self.repo.count_workspace_memberships_by_user_ids(user_ids=user_ids)
        project_membership_counts = await self.repo.count_project_memberships_by_user_ids(user_ids=user_ids)
        has_password_map, two_factor_enabled_set, linked_oauth_providers_map = await self._build_user_security_state(
            user_ids=user_ids
        )
        restrictions = await self._restrictions_by_entity(
            entity_type=AccessRestrictionEntityType.USER,
            entity_ids=user_ids,
        )

        items = [
            DirectoryUserListItemOut(
                user_id=row.id,
                username=row.username,
                display_name=row.display_name,
                email=row.email,
                avatar_url=row.avatar_url,
                status=row.status,
                has_password=has_password_map.get(UUID(str(row.id)), False),
                two_factor_enabled=UUID(str(row.id)) in two_factor_enabled_set,
                linked_oauth_providers=linked_oauth_providers_map.get(UUID(str(row.id)), []),
                last_login_at=row.last_login_at,
                created_at=row.created_at,
                workspace_membership_count=workspace_membership_counts.get(UUID(str(row.id)), 0),
                project_membership_count=project_membership_counts.get(UUID(str(row.id)), 0),
                restrictions=restrictions.get(UUID(str(row.id)), []),
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

    async def update_user(
        self,
        *,
        user_id: UUID,
        payload: DirectoryUserUpdateRequest,
    ) -> DirectoryUserDetailOut:
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
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest | AccessRestrictionLiftRequest,
    ) -> DirectoryUserDetailOut:
        row = await self.repo.get_user_by_id(user_id=user_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        if row.id == acting_user_id and not enabled:
            raise BadRequest(message=t("errors", "CANNOT_DISABLE_SELF"), error="CANNOT_DISABLE_SELF")

        target = UserStatus.ACTIVE if enabled else UserStatus.DISABLED
        async with self.tx() as conn:
            if enabled:
                if not isinstance(payload, AccessRestrictionLiftRequest):
                    raise TypeError("Enabling a user requires AccessRestrictionLiftRequest")
                await self.restriction_service.lift(
                    entity_type=AccessRestrictionEntityType.USER,
                    entity_id=user_id,
                    restriction_type=AccessRestrictionType.USER_DISABLED,
                    actor_user_id=acting_user_id,
                    idempotency_key=idempotency_key,
                    payload=payload,
                    conn=conn,
                )
            else:
                if not isinstance(payload, AccessRestrictionEnforceRequest):
                    raise TypeError("Disabling a user requires AccessRestrictionEnforceRequest")
                await self.restriction_service.enforce(
                    entity_type=AccessRestrictionEntityType.USER,
                    entity_id=user_id,
                    restriction_type=AccessRestrictionType.USER_DISABLED,
                    actor_user_id=acting_user_id,
                    idempotency_key=idempotency_key,
                    payload=payload,
                    conn=conn,
                )
            if row.status != target:
                row.status = target
                await row.save(update_fields=["status", "updated_at"], using_db=conn)

        if not enabled:
            await self.auth_service.invalidate_user_sessions(user=row)

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

    async def list_workspaces(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryWorkspaceListFilters,
    ) -> PageData[DirectoryWorkspaceListItemOut]:
        rows = await self.repo.list_workspaces_page(
            q=q,
            ordering=ordering,
            filters=filters,
            offset=params.offset,
            limit=params.limit,
        )
        workspace_ids = [UUID(str(row.id)) for row in rows]
        owner_ids_by_workspace, member_counts, project_counts, restrictions, commerce = await gather(
            self.repo.list_workspace_owner_user_ids(workspace_ids=workspace_ids),
            self.repo.count_workspace_memberships_by_workspace_ids(workspace_ids=workspace_ids),
            self.repo.count_projects_by_workspace_ids(workspace_ids=workspace_ids),
            self._restrictions_by_entity(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_ids=workspace_ids,
            ),
            self.commerce_projection_reader.list_projections(workspace_ids=workspace_ids),
        )
        owner_ids = [owner_ids_by_workspace.get(UUID(str(row.id))) or _user_id(row.owner_user_id) for row in rows]
        owners = await self.repo.get_users_by_ids(user_ids=[owner_id for owner_id in owner_ids if owner_id is not None])

        items = [
            DirectoryWorkspaceListItemOut(
                workspace_id=row.id,
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
                last_activity_at=row.updated_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
                project_count=project_counts.get(UUID(str(row.id)), 0),
                restrictions=restrictions.get(UUID(str(row.id)), []),
                commerce=commerce[UUID(str(row.id))],
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
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
        member_counts, project_counts, restrictions, commerce = await gather(
            self.repo.count_workspace_memberships_by_workspace_ids(workspace_ids=[workspace_id]),
            self.repo.count_projects_by_workspace_ids(workspace_ids=[workspace_id]),
            self._restrictions_by_entity(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_ids=[workspace_id],
            ),
            self.commerce_projection_reader.list_projections(workspace_ids=[workspace_id]),
        )

        return DirectoryWorkspaceDetailOut(
            workspace_id=row.id,
            name=row.name,
            description=row.description,
            is_active=bool(row.is_active),
            is_archived=row.archived_at is not None,
            created_at=row.created_at,
            last_activity_at=row.updated_at,
            updated_at=row.updated_at,
            owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
            member_count=member_counts.get(workspace_id, 0),
            project_count=project_counts.get(workspace_id, 0),
            icon_mode=row.icon_mode,
            icon_color=row.icon_color,
            icon_glyph=row.icon_glyph,
            icon_emoji=row.icon_emoji,
            icon_url=row.icon_url,
            restrictions=restrictions.get(workspace_id, []),
            commerce=commerce[workspace_id],
        )

    async def list_projects(
        self,
        *,
        params: PageParams,
        q: str | None,
        ordering: str | None,
        filters: DirectoryProjectListFilters,
    ) -> PageData[DirectoryProjectListItemOut]:
        operational_project_ids = await self.project_projection_reader.filter_project_ids(filters=filters)
        rows = await self.repo.list_projects_page(
            q=q,
            ordering=ordering,
            filters=filters,
            operational_project_ids=operational_project_ids,
            offset=params.offset,
            limit=params.limit,
        )
        project_ids = [UUID(str(row.id)) for row in rows]
        owner_ids = [_user_id(row.created_by_user_id) for row in rows]
        owners, member_counts, restrictions, projections = await gather(
            self.repo.get_users_by_ids(user_ids=[owner_id for owner_id in owner_ids if owner_id is not None]),
            self.repo.count_project_memberships_by_project_ids(project_ids=project_ids),
            self._restrictions_by_entity(
                entity_type=AccessRestrictionEntityType.PROJECT,
                entity_ids=project_ids,
            ),
            self.project_projection_reader.list_projections(
                project_activity={UUID(str(row.id)): row.updated_at for row in rows},
            ),
        )

        items = [
            DirectoryProjectListItemOut(
                project_id=row.id,
                workspace_id=row.workspace_id,
                workspace_name=row.workspace.name,
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
                last_activity_at=projections[UUID(str(row.id))].last_activity_at,
                owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
                member_count=member_counts.get(UUID(str(row.id)), 0),
                restrictions=restrictions.get(UUID(str(row.id)), []),
                operations=projections[UUID(str(row.id))],
            )
            for row, owner_id in zip(rows, owner_ids, strict=False)
        ]
        total = await self.repo.count_projects(
            q=q,
            filters=filters,
            operational_project_ids=operational_project_ids,
        )
        return _build_page(items, total=total, params=params)

    async def get_project_detail(self, *, project_id: UUID) -> DirectoryProjectDetailOut:
        row = await self.repo.get_project_by_id(project_id=project_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")

        owner_id = _user_id(row.created_by_user_id)
        owners, member_counts, restrictions, projections = await gather(
            self.repo.get_users_by_ids(user_ids=[owner_id] if owner_id is not None else []),
            self.repo.count_project_memberships_by_project_ids(project_ids=[project_id]),
            self._restrictions_by_entity(
                entity_type=AccessRestrictionEntityType.PROJECT,
                entity_ids=[project_id],
            ),
            self.project_projection_reader.list_projections(
                project_activity={project_id: row.updated_at},
            ),
        )

        return DirectoryProjectDetailOut(
            project_id=row.id,
            workspace_id=row.workspace_id,
            workspace_name=row.workspace.name,
            name=row.name,
            slug=row.slug,
            description=row.description,
            is_active=bool(row.is_active),
            created_at=row.created_at,
            last_activity_at=projections[project_id].last_activity_at,
            updated_at=row.updated_at,
            owner=self._to_actor(owners.get(owner_id)) if owner_id is not None else None,
            member_count=member_counts.get(project_id, 0),
            icon_mode=row.icon_mode,
            icon_color=row.icon_color,
            icon_glyph=row.icon_glyph,
            icon_emoji=row.icon_emoji,
            icon_url=row.icon_url,
            restrictions=restrictions.get(project_id, []),
            operations=projections[project_id],
        )

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
        acting_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest | AccessRestrictionLiftRequest,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        organization_id = UUID(str(row.organization_id))
        if enabled:
            if not isinstance(payload, AccessRestrictionLiftRequest):
                raise TypeError("Restoring a workspace requires AccessRestrictionLiftRequest")
            await self.restriction_service.lift(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_id=workspace_id,
                restriction_type=AccessRestrictionType.WORKSPACE_SUSPENDED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=organization_id,
                workspace_id=workspace_id,
            )
        else:
            if not isinstance(payload, AccessRestrictionEnforceRequest):
                raise TypeError("Suspending a workspace requires AccessRestrictionEnforceRequest")
            await self.restriction_service.enforce(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_id=workspace_id,
                restriction_type=AccessRestrictionType.WORKSPACE_SUSPENDED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=organization_id,
                workspace_id=workspace_id,
            )
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def archive_workspace(
        self,
        *,
        workspace_id: UUID,
        acting_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        async with self.tx() as conn:
            await self.restriction_service.enforce(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_id=workspace_id,
                restriction_type=AccessRestrictionType.WORKSPACE_ARCHIVED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=UUID(str(row.organization_id)),
                workspace_id=workspace_id,
                conn=conn,
            )
            if row.archived_at is None:
                row.archived_at = datetime.now(UTC)
                row.archived_by_user_id = acting_user_id
                await row.save(
                    update_fields=["archived_at", "archived_by_user_id", "updated_at"],
                    using_db=conn,
                )
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def restore_workspace(
        self,
        *,
        workspace_id: UUID,
        acting_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionLiftRequest,
    ) -> DirectoryWorkspaceDetailOut:
        row = await self.repo.get_workspace_by_id(workspace_id=workspace_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        async with self.tx() as conn:
            await self.restriction_service.lift(
                entity_type=AccessRestrictionEntityType.WORKSPACE,
                entity_id=workspace_id,
                restriction_type=AccessRestrictionType.WORKSPACE_ARCHIVED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=UUID(str(row.organization_id)),
                workspace_id=workspace_id,
                conn=conn,
            )
            if row.archived_at is not None or row.archived_by_user_id is not None:
                row.archived_at = None
                row.archived_by_user_id = None
                await row.save(
                    update_fields=["archived_at", "archived_by_user_id", "updated_at"],
                    using_db=conn,
                )
        return await self.get_workspace_detail(workspace_id=workspace_id)

    async def update_project(
        self,
        *,
        project_id: UUID,
        payload: DirectoryProjectUpdateRequest,
        acting_user_id: UUID,
    ) -> DirectoryProjectDetailOut:
        service_payload = ProjectUpdateRequest(**payload.model_dump(exclude_none=False, by_alias=False))
        await self.project_service.update_project(
            project_id=project_id,
            payload=service_payload,
            actor_user_id=acting_user_id,
        )
        return await self.get_project_detail(project_id=project_id)

    async def set_project_enabled(
        self,
        *,
        project_id: UUID,
        enabled: bool,
        acting_user_id: UUID,
        idempotency_key: str,
        payload: AccessRestrictionEnforceRequest | AccessRestrictionLiftRequest,
    ) -> DirectoryProjectDetailOut:
        row = await self.repo.get_project_by_id(project_id=project_id)
        if row is None:
            raise NotFound(error="NOT_FOUND")
        workspace_id = UUID(str(row.workspace_id))
        organization_id = UUID(str(row.workspace.organization_id))
        if enabled:
            if not isinstance(payload, AccessRestrictionLiftRequest):
                raise TypeError("Restoring a project requires AccessRestrictionLiftRequest")
            await self.restriction_service.lift(
                entity_type=AccessRestrictionEntityType.PROJECT,
                entity_id=project_id,
                restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
        else:
            if not isinstance(payload, AccessRestrictionEnforceRequest):
                raise TypeError("Suspending a project requires AccessRestrictionEnforceRequest")
            await self.restriction_service.enforce(
                entity_type=AccessRestrictionEntityType.PROJECT,
                entity_id=project_id,
                restriction_type=AccessRestrictionType.PROJECT_SUSPENDED,
                actor_user_id=acting_user_id,
                idempotency_key=idempotency_key,
                payload=payload,
                organization_id=organization_id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
        return await self.get_project_detail(project_id=project_id)

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
