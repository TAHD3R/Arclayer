from __future__ import annotations

from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict

from apps.api.src.common.protocols.tortoise import HasOrganizationId, HasWorkspaceId
from apps.api.src.common.services import BaseService
from apps.api.src.common.text.slug.service import slugify
from apps.api.src.common.utils.public_ids import encode_uuid
from apps.api.src.core.exceptions import BadRequest, NotFound
from apps.api.src.core.i18n import t
from apps.api.src.models.organization.org_membership import OrgMembership, OrgRole
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.organization.user import User
from apps.api.src.models.sites.site import SiteRecord
from apps.api.src.models.workspaces.workspace import (
    Workspace,
    WorkspaceMembership,
    WorkspaceMembershipRole,
    WorkspaceMembershipStatus,
)
from apps.api.src.modules.auth.repository import UserRepository
from apps.api.src.modules.provision.schema import BootstrapStateOut, ProvisionRepairOut
from apps.api.src.modules.system.rbac.constants.service import ROLE_ADMIN, ROLE_OWNER, ROLE_VIEWER
from apps.api.src.modules.system.rbac.service import RBACService
from apps.api.src.modules.workspaces.site.service import WorkspaceSiteService
from apps.api.src.modules.workspaces.slug.service import next_available_workspace_slug

ProvisionSource = Literal["setup", "register", "repair"]

MAX_ORG_NAME_LENGTH = 128
MAX_WORKSPACE_NAME_LENGTH = 128


class ProvisioningResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    organization_id: UUID | None
    workspace_id: UUID | None
    site_id: UUID | None
    actions: tuple[str, ...]


class TenantProvisioningService(BaseService):
    """
    Single orchestrator for org/workspace/site bootstrap.

    Design goals:
    - idempotent for repeated invocations
    - safe to call from setup, public register, and explicit repair endpoint
    """

    def __init__(self, settings) -> None:
        super().__init__(settings)
        self.user_repo = UserRepository()
        self.workspace_site_service = WorkspaceSiteService(settings)

    async def get_bootstrap_state(self, *, user_id: UUID) -> BootstrapStateOut:
        orgm = await OrgMembership.filter(user_id=user_id, status="active").order_by("created_at", "id").first()
        if orgm is None:
            return BootstrapStateOut(
                ready=False,
                repair_required=True,
                organization_id=None,
                workspace_id=None,
                site_id=None,
                next_path="/",
                reason="ORG_MEMBERSHIP_MISSING",
            )

        org_id = UUID(str(cast(HasOrganizationId, orgm).organization_id))
        membership = (
            await WorkspaceMembership
            .filter(
                user_id=user_id,
                status=WorkspaceMembershipStatus.ACTIVE,
                workspace__organization_id=org_id,
                workspace__is_active=True,
            )
            .prefetch_related("workspace")
            .order_by("created_at")
            .first()
        )
        if membership is None:
            return BootstrapStateOut(
                ready=False,
                repair_required=True,
                organization_id=org_id,
                workspace_id=None,
                site_id=None,
                next_path="/",
                reason="WORKSPACE_MEMBERSHIP_MISSING",
            )

        workspace_id = UUID(str(cast(HasWorkspaceId, membership).workspace_id))
        site = await SiteRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").first()
        if site is None:
            return BootstrapStateOut(
                ready=False,
                repair_required=True,
                organization_id=org_id,
                workspace_id=workspace_id,
                site_id=None,
                next_path=f"/w/{encode_uuid(workspace_id)}",
                reason="WORKSPACE_SITE_MISSING",
            )

        return BootstrapStateOut(
            ready=True,
            repair_required=False,
            organization_id=org_id,
            workspace_id=workspace_id,
            site_id=UUID(str(site.id)),
            next_path=f"/w/{encode_uuid(workspace_id)}",
            reason=None,
        )

    async def repair_user_bootstrap(self, *, user_id: UUID) -> ProvisionRepairOut:
        result = await self.ensure_user_bootstrap(user_id=user_id, source="repair")
        state = await self.get_bootstrap_state(user_id=user_id)
        return ProvisionRepairOut(
            repaired=bool(result.actions),
            ready=state.ready,
            organization_id=state.organization_id,
            workspace_id=state.workspace_id,
            site_id=state.site_id,
            actions=list(result.actions),
        )

    async def ensure_user_bootstrap(
        self,
        *,
        user_id: UUID,
        source: ProvisionSource,
        organization_name: str | None = None,
        organization_slug: str | None = None,
        organization_logo_url: str | None = None,
        workspace_name: str | None = None,
    ) -> ProvisioningResult:
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFound(message="User not found", error="USER_NOT_FOUND")

        actions: list[str] = []

        organization, orgm, org_actions = await self._ensure_organization(
            user=user,
            source=source,
            preferred_name=organization_name,
            preferred_slug=organization_slug,
            preferred_logo_url=organization_logo_url,
        )
        actions.extend(org_actions)

        # Workspace slug is the public portal identifier; default to username when available.
        preferred_ws_slug = (user.username or "").strip() or None
        workspace, ws_actions = await self._ensure_workspace(
            organization_id=organization.id,
            actor_user_id=user.id,
            preferred_name=workspace_name,
            preferred_slug=preferred_ws_slug,
            fallback_seed=(user.display_name or user.username or "User"),
        )
        actions.extend(ws_actions)

        membership, membership_actions = await self._ensure_workspace_membership(
            user_id=user.id,
            workspace_id=workspace.id,
        )
        actions.extend(membership_actions)

        role_actions = await self._ensure_workspace_role_binding(
            workspace_id=workspace.id,
            membership_id=membership.id,
            org_role=orgm.role,
        )
        actions.extend(role_actions)

        site, site_actions = await self._ensure_workspace_site(
            workspace_id=workspace.id,
            actor_user_id=user.id,
        )
        actions.extend(site_actions)

        return ProvisioningResult(
            organization_id=UUID(str(organization.id)),
            workspace_id=UUID(str(workspace.id)),
            site_id=UUID(str(site.id)),
            actions=tuple(actions),
        )

    async def _ensure_organization(
        self,
        *,
        user: User,
        source: ProvisionSource,
        preferred_name: str | None,
        preferred_slug: str | None,
        preferred_logo_url: str | None,
    ) -> tuple[Organization, OrgMembership, list[str]]:
        actions: list[str] = []

        # A user can belong to multiple organizations; bootstrap reuses the oldest membership.
        orgm = await OrgMembership.filter(user_id=user.id, status="active").order_by("created_at", "id").first()
        if orgm is not None:
            orgm_like = cast(HasOrganizationId, orgm)
            organization = await Organization.get_or_none(id=orgm_like.organization_id)
            if organization is None:
                # Defensive self-healing for broken foreign key relationships.
                await orgm.delete()
            else:
                changed = False
                if orgm.status != "active":
                    orgm.status = "active"
                    changed = True
                if changed:
                    await orgm.save(update_fields=["status", "updated_at"])
                    actions.append("org_membership_activated")

                return organization, orgm, actions

        seed = (user.display_name or user.username or "User").strip() or "User"
        base_name = (preferred_name or f"{seed}'s Organization").strip() or f"{seed}'s Organization"
        if len(base_name) > MAX_ORG_NAME_LENGTH:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="ORG_NAME_TOO_LONG")
        base_slug_seed = (preferred_slug or base_name).strip() or "workspace"
        base_slug = self._normalize_slug(base_slug_seed, fallback=f"org-{str(user.id)[:8]}")
        org_slug = await self._next_available_org_slug(base_slug)

        organization = await Organization.create(
            slug=org_slug,
            name=base_name,
            logo_url=preferred_logo_url,
            is_active=True,
        )
        actions.append("organization_created")

        org_role = OrgRole.OWNER if source in {"setup", "register", "repair"} else OrgRole.MEMBER
        orgm = await OrgMembership.create(
            organization_id=organization.id,
            user_id=user.id,
            role=org_role,
            role_code=org_role.value,
            status="active",
        )
        actions.append("org_membership_created")
        return organization, orgm, actions

    async def _ensure_workspace(
        self,
        *,
        organization_id: UUID,
        actor_user_id: UUID,
        preferred_name: str | None,
        preferred_slug: str | None,
        fallback_seed: str,
    ) -> tuple[Workspace, list[str]]:
        actions: list[str] = []

        workspace = (
            await Workspace.filter(organization_id=organization_id, is_active=True).order_by("created_at").first()
        )
        if workspace is not None:
            return workspace, actions

        seed = (fallback_seed or "User").strip() or "User"
        name = (preferred_name or f"{seed}'s Workspace").strip() or f"{seed}'s Workspace"
        if len(name) > MAX_WORKSPACE_NAME_LENGTH:
            raise BadRequest(message=t("errors", "BAD_REQUEST", default="参数错误"), error="WORKSPACE_NAME_TOO_LONG")
        slug_seed = (preferred_slug or seed).strip() or "workspace"
        slug = await next_available_workspace_slug(
            base_slug=slug_seed,
            exists_fn=lambda candidate: Workspace.filter(slug=candidate).exists(),
        )
        workspace = await Workspace.create(
            organization_id=organization_id,
            slug=slug,
            name=name,
            is_active=True,
            created_by_user_id=actor_user_id,
        )
        actions.append("workspace_created")
        return workspace, actions

    async def _ensure_workspace_membership(
        self,
        *,
        user_id: UUID,
        workspace_id: UUID,
    ) -> tuple[WorkspaceMembership, list[str]]:
        actions: list[str] = []

        membership, created = await WorkspaceMembership.get_or_create(
            user_id=user_id,
            workspace_id=workspace_id,
            defaults={"status": WorkspaceMembershipStatus.ACTIVE, "invited_by_user_id": None},
        )
        if created:
            actions.append("workspace_membership_created")

        if membership.status != WorkspaceMembershipStatus.ACTIVE:
            membership.status = WorkspaceMembershipStatus.ACTIVE
            await membership.save(update_fields=["status", "updated_at"])
            actions.append("workspace_membership_activated")

        return membership, actions

    async def _ensure_workspace_role_binding(
        self,
        *,
        workspace_id: UUID,
        membership_id: UUID,
        org_role: OrgRole,
    ) -> list[str]:
        actions: list[str] = []

        role_code = ROLE_VIEWER
        if org_role == OrgRole.OWNER:
            role_code = ROLE_OWNER
        elif org_role == OrgRole.ADMIN:
            role_code = ROLE_ADMIN

        rbac = RBACService(self.settings)
        await rbac.ensure_workspace_system_roles(workspace_id=workspace_id)
        role = await rbac.repo.get_role_by_code(workspace_id=workspace_id, code=role_code)
        if role is None:
            return actions

        _binding, created = await WorkspaceMembershipRole.get_or_create(membership_id=membership_id, role_id=role.id)
        if created:
            actions.append(f"workspace_role_bound:{role_code}")
        return actions

    async def _ensure_workspace_site(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID,
    ) -> tuple[SiteRecord, list[str]]:
        actions: list[str] = []

        existing = await SiteRecord.filter(workspace_id=workspace_id).order_by("created_at", "id").first()
        if existing is not None:
            return existing, actions

        site = await self.workspace_site_service.get_or_create_site_for_workspace(
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
        )
        actions.append("workspace_site_created")
        return site, actions

    async def _next_available_org_slug(self, base_slug: str) -> str:
        return await self._next_available_slug(
            exists_fn=lambda slug: Organization.filter(slug=slug).exists(),
            base_slug=base_slug,
        )

    async def _next_available_slug(self, *, exists_fn, base_slug: str) -> str:  # type: ignore[no-untyped-def]
        base = self._normalize_slug(base_slug, fallback="default")
        candidate = base[:64]
        for index in range(1, 200):
            exists = await exists_fn(candidate)
            if not exists:
                return candidate
            suffix = f"-{index + 1}"
            candidate = f"{base[: max(1, 64 - len(suffix))]}{suffix}"
        return f"{base[:55]}-{uuid4().hex[:8]}"

    def _normalize_slug(self, value: str, *, fallback: str) -> str:
        raw = slugify(value)
        if raw == "asset":
            return self._normalize_slug(fallback, fallback="default")
        return raw[:64]
