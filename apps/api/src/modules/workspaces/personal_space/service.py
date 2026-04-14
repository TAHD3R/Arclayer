from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import cast
from uuid import UUID

from src.common.protocols.tortoise import HasOrganizationId
from src.common.services import BaseService
from src.config import Settings
from src.models.organization.org_membership import OrgRole
from src.models.organization.organization import Organization, OrganizationKind
from src.models.organization.user import User, UserStatus
from src.models.system.setting import SettingRecord
from src.models.workspaces.workspace import Workspace, WorkspaceKind, WorkspaceMembership, WorkspaceMembershipStatus
from src.modules.organization.repository import OrganizationRepository
from src.modules.organization.workspaces.repository import OrganizationWorkspaceRepository
from src.modules.workspaces.policy.service import OrgWorkspaceCreationPolicy
from src.modules.workspaces.settings.service import WorkspaceSettingsService
from src.modules.workspaces.site.service import WorkspaceSiteService
from src.modules.workspaces.slug.service import next_available_workspace_slug
from src.settings.scopes import SCOPE_TYPE_USER

PERSONAL_SPACE_STATE_NAMESPACE = "onboarding.personal_space"


class PersonalSpaceProvisionStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class EnsurePersonalSpaceResult:
    organization_id: UUID
    workspace_id: UUID
    created: bool
    restored: bool


@dataclass(frozen=True, slots=True)
class PersonalSpaceProvisionState:
    status: PersonalSpaceProvisionStatus
    workspace_id: UUID | None
    retry_available: bool
    last_error: str | None = None


class PersonalSpaceService(BaseService):
    """Single idempotent entry for creating or repairing a user's personal space."""

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        self.org_repo = OrganizationRepository()
        self.workspace_repo = OrganizationWorkspaceRepository()
        self.workspace_policy = OrgWorkspaceCreationPolicy(settings)
        self.site_service = WorkspaceSiteService(settings)
        self.settings_service = WorkspaceSettingsService(settings)

    async def get_state(self, *, user_id: UUID) -> PersonalSpaceProvisionState:
        workspace = await self._get_ready_workspace(user_id=user_id)
        if workspace is not None:
            return PersonalSpaceProvisionState(
                status=PersonalSpaceProvisionStatus.READY,
                workspace_id=UUID(str(workspace.id)),
                retry_available=False,
            )

        record = await self._get_state_record(user_id=user_id)
        if record is None or not isinstance(record.value, dict):
            return PersonalSpaceProvisionState(
                status=PersonalSpaceProvisionStatus.PENDING,
                workspace_id=None,
                retry_available=False,
            )

        raw_status = str(record.value.get("status") or "").strip().lower()
        last_error = str(record.value.get("last_error") or "").strip() or None
        if raw_status == PersonalSpaceProvisionStatus.FAILED.value:
            return PersonalSpaceProvisionState(
                status=PersonalSpaceProvisionStatus.FAILED,
                workspace_id=None,
                retry_available=True,
                last_error=last_error,
            )
        return PersonalSpaceProvisionState(
            status=PersonalSpaceProvisionStatus.PENDING,
            workspace_id=None,
            retry_available=False,
            last_error=last_error,
        )

    async def ensure_for_login(self, *, user_id: UUID) -> EnsurePersonalSpaceResult:
        await self._set_state(user_id=user_id, status=PersonalSpaceProvisionStatus.PENDING, last_error=None)
        try:
            result = await self.ensure_personal_space(user_id=user_id)
        except Exception as exc:
            await self._set_state(
                user_id=user_id,
                status=PersonalSpaceProvisionStatus.FAILED,
                last_error=exc.__class__.__name__,
            )
            raise
        await self._set_state(
            user_id=user_id,
            status=PersonalSpaceProvisionStatus.READY,
            workspace_id=result.workspace_id,
            last_error=None,
        )
        return result

    async def trigger_background_ensure(self, *, user_id: UUID) -> PersonalSpaceProvisionState:
        workspace = await self._get_ready_workspace(user_id=user_id)
        if workspace is not None:
            return PersonalSpaceProvisionState(
                status=PersonalSpaceProvisionStatus.READY,
                workspace_id=UUID(str(workspace.id)),
                retry_available=False,
            )

        record = await self._get_state_record(user_id=user_id)
        if record is not None and isinstance(record.value, dict):
            raw_status = str(record.value.get("status") or "").strip().lower()
            if raw_status == PersonalSpaceProvisionStatus.PENDING.value:
                return PersonalSpaceProvisionState(
                    status=PersonalSpaceProvisionStatus.PENDING,
                    workspace_id=None,
                    retry_available=False,
                )

        await self._set_state(user_id=user_id, status=PersonalSpaceProvisionStatus.PENDING, last_error=None)
        asyncio.create_task(self._run_background_ensure(user_id=user_id))
        return PersonalSpaceProvisionState(
            status=PersonalSpaceProvisionStatus.PENDING,
            workspace_id=None,
            retry_available=False,
        )

    async def retry_prepare(self, *, user_id: UUID) -> PersonalSpaceProvisionState:
        return await self.trigger_background_ensure(user_id=user_id)

    async def ensure_personal_space(
        self,
        *,
        user_id: UUID,
        workspace_name: str | None = None,
        workspace_slug: str | None = None,
    ) -> EnsurePersonalSpaceResult:
        user = await User.get(id=user_id)
        requested_workspace_name = str(workspace_name or "").strip() or None
        requested_workspace_slug = str(workspace_slug or "").strip() or None
        resolved_workspace_name = requested_workspace_name or self._personal_space_name(user=user)

        organization = await Organization.get_or_none(
            kind=OrganizationKind.PERSONAL,
            owner_user_id=user_id,
        )
        created = False
        restored = False

        if organization is None:
            organization = await self.org_repo.create_organization(
                slug=self._personal_org_slug(user_id=user_id),
                name=resolved_workspace_name,
                kind=OrganizationKind.PERSONAL,
                owner_user_id=user_id,
            )
            created = True
        elif organization.deleted_at is not None or not organization.is_active:
            organization.deleted_at = None
            organization.is_active = True
            await organization.save(update_fields=["deleted_at", "is_active", "updated_at"])
            restored = True

        if requested_workspace_name and organization.name != requested_workspace_name:
            organization.name = requested_workspace_name
            await organization.save(update_fields=["name", "updated_at"])

        await self.org_repo.ensure_org_membership(
            user_id=user_id,
            organization_id=UUID(str(organization.id)),
            role=OrgRole.OWNER,
        )

        workspace = await Workspace.get_or_none(
            kind=WorkspaceKind.PERSONAL,
            owner_user_id=user_id,
        )
        if workspace is None:
            await self.workspace_policy.assert_can_create(organization_id=UUID(str(organization.id)))
            workspace = await self.workspace_repo.create_workspace(
                organization_id=UUID(str(organization.id)),
                slug=requested_workspace_slug or await self._next_personal_workspace_slug(user=user),
                name=resolved_workspace_name,
                description=None,
                created_by_user_id=user_id,
                kind=WorkspaceKind.PERSONAL,
                owner_user_id=user_id,
            )
            created = True
        else:
            update_fields: list[str] = []
            workspace_with_org_id = cast(HasOrganizationId, workspace)
            if UUID(str(workspace_with_org_id.organization_id)) != UUID(str(organization.id)):
                workspace_with_org_id.organization_id = organization.id
                update_fields.append("organization_id")
            if workspace.deleted_at is not None:
                workspace.deleted_at = None
                update_fields.append("deleted_at")
            if not workspace.is_active:
                workspace.is_active = True
                update_fields.append("is_active")
            if workspace.archived_at is not None:
                workspace.archived_at = None
                update_fields.append("archived_at")
            if workspace.archived_by_user_id is not None:
                workspace.archived_by_user_id = None
                update_fields.append("archived_by_user_id")
            if requested_workspace_name and workspace.name != requested_workspace_name:
                workspace.name = requested_workspace_name
                update_fields.append("name")
            if requested_workspace_slug and workspace.slug != requested_workspace_slug:
                workspace.slug = requested_workspace_slug
                update_fields.append("slug")
            if update_fields:
                await workspace.save(update_fields=[*update_fields, "updated_at"])
                restored = True

        await self._ensure_workspace_membership(workspace_id=UUID(str(workspace.id)), user_id=user_id)
        await self._ensure_workspace_baseline(workspace_id=UUID(str(workspace.id)), user_id=user_id)
        await self._sync_user_status(user=user, workspace=workspace)

        return EnsurePersonalSpaceResult(
            organization_id=UUID(str(organization.id)),
            workspace_id=UUID(str(workspace.id)),
            created=created,
            restored=restored,
        )

    async def mark_personal_space_inactive(self, *, user_id: UUID) -> None:
        now = datetime.now(UTC)
        await Organization.filter(kind=OrganizationKind.PERSONAL, owner_user_id=user_id).update(
            is_active=False,
            deleted_at=now,
        )
        await Workspace.filter(kind=WorkspaceKind.PERSONAL, owner_user_id=user_id).update(
            is_active=False,
            deleted_at=now,
        )
        await self._set_state(user_id=user_id, status=PersonalSpaceProvisionStatus.FAILED, last_error="USER_INACTIVE")

    async def _ensure_workspace_membership(self, *, workspace_id: UUID, user_id: UUID) -> WorkspaceMembership:
        membership, _created = await WorkspaceMembership.get_or_create(
            workspace_id=workspace_id,
            user_id=user_id,
            defaults={
                "status": WorkspaceMembershipStatus.ACTIVE,
                "invited_by_user_id": None,
            },
        )
        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            membership.status = WorkspaceMembershipStatus.ACTIVE
            await membership.save(update_fields=["status", "updated_at"])
        return membership

    async def _sync_user_status(self, *, user: User, workspace: Workspace) -> None:
        should_be_active = user.status == UserStatus.ACTIVE
        workspace_active = bool(workspace.is_active and workspace.deleted_at is None)
        if should_be_active == workspace_active:
            return
        if should_be_active:
            workspace.is_active = True
            workspace.deleted_at = None
            await workspace.save(update_fields=["is_active", "deleted_at", "updated_at"])
            return
        await self.mark_personal_space_inactive(user_id=UUID(str(user.id)))

    async def _run_background_ensure(self, *, user_id: UUID) -> None:
        try:
            result = await self.ensure_personal_space(user_id=user_id)
        except Exception as exc:
            self.logger.warning(
                "Personal space background ensure failed",
                user_id=str(user_id),
                error=str(exc),
            )
            await self._set_state(
                user_id=user_id,
                status=PersonalSpaceProvisionStatus.FAILED,
                last_error=exc.__class__.__name__,
            )
            return

        await self._set_state(
            user_id=user_id,
            status=PersonalSpaceProvisionStatus.READY,
            workspace_id=result.workspace_id,
            last_error=None,
        )

    async def _get_ready_workspace(self, *, user_id: UUID) -> Workspace | None:
        return await Workspace.get_or_none(
            kind=WorkspaceKind.PERSONAL,
            owner_user_id=user_id,
            is_active=True,
            deleted_at__isnull=True,
        )

    async def _ensure_workspace_baseline(self, *, workspace_id: UUID, user_id: UUID) -> None:
        await self.site_service.get_or_create_site_for_workspace(
            workspace_id=workspace_id,
            actor_user_id=user_id,
        )
        await self.settings_service.patch_core(
            workspace_id=workspace_id,
            patch={
                "content_strategy": {
                    "autosave": {"enabled": True, "interval_sec": 30, "save_on_blur": True},
                    "retention": {"draft_max_revisions": 100},
                }
            },
            updated_by=user_id,
        )

    async def _get_state_record(self, *, user_id: UUID) -> SettingRecord | None:
        return await SettingRecord.get_or_none(
            scope_type=SCOPE_TYPE_USER,
            scope_id=user_id,
            namespace=PERSONAL_SPACE_STATE_NAMESPACE,
        )

    async def _set_state(
        self,
        *,
        user_id: UUID,
        status: PersonalSpaceProvisionStatus,
        workspace_id: UUID | None = None,
        last_error: str | None = None,
    ) -> None:
        value = {
            "status": status.value,
            "workspace_id": str(workspace_id) if workspace_id is not None else None,
            "last_error": last_error,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        record = await self._get_state_record(user_id=user_id)
        if record is None:
            await SettingRecord.create(
                scope_type=SCOPE_TYPE_USER,
                scope_id=user_id,
                namespace=PERSONAL_SPACE_STATE_NAMESPACE,
                value=value,
                updated_by=user_id,
            )
            return

        record.value = value
        record.updated_by = user_id
        await record.save(update_fields=["value", "updated_by", "updated_at"])

    @staticmethod
    def _personal_org_slug(*, user_id: UUID) -> str:
        return f"personal-org-{user_id.hex}"

    async def _next_personal_workspace_slug(self, *, user: User) -> str:
        seed = str(user.username or user.display_name or f"personal-{UUID(str(user.id)).hex[:12]}").strip()
        return await next_available_workspace_slug(
            base_slug=seed,
            exists_fn=lambda slug: self.workspace_repo.slug_exists(slug=slug),
        )

    @staticmethod
    def _personal_space_name(*, user: User) -> str:
        label = str(user.display_name or user.username or "Personal").strip() or "Personal"
        return f"{label} Personal Space"
