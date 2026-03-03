from __future__ import annotations

from typing import cast
from uuid import UUID

from apps.api.src.common.protocols.tortoise import HasOrganizationId
from apps.api.src.config import Settings
from apps.api.src.modules.system.setup.shared.service import _raise_if_fatal


class SystemSetupWorkspaceBootstrapMixin:
    settings: Settings
    logger: object

    async def _ensure_default_workspace(self, *, org_id, owner_user_id, workspace_name: str) -> UUID | None:
        try:
            from apps.api.src.modules.organization.models.org_membership import OrgMembership, OrgRole
            from apps.api.src.modules.system.rbac.service import RBACService
            from apps.api.src.modules.workspaces.models.workspace import (
                Workspace,
                WorkspaceMembership,
                WorkspaceMembershipRole,
                WorkspaceMembershipStatus,
            )

            await OrgMembership.get_or_create(
                user_id=owner_user_id,
                defaults={
                    "organization_id": org_id,
                    "role": OrgRole.OWNER,
                    "role_code": OrgRole.OWNER.value,
                    "status": "active",
                },
            )
            orgm = await OrgMembership.get_or_none(user_id=owner_user_id)
            if orgm is not None:
                orgm_like = cast(HasOrganizationId, orgm)
                changed = False
                if str(orgm_like.organization_id) != str(org_id):
                    orgm_like.organization_id = org_id
                    changed = True
                if orgm.role != OrgRole.OWNER:
                    orgm.role = OrgRole.OWNER
                    changed = True
                if str(getattr(orgm, "role_code", "") or "").strip().lower() != OrgRole.OWNER.value:
                    orgm.role_code = OrgRole.OWNER.value
                    changed = True
                if orgm.status != "active":
                    orgm.status = "active"
                    changed = True
                if changed:
                    await orgm.save(update_fields=["organization_id", "role", "role_code", "status", "updated_at"])

            ws = await Workspace.filter(organization_id=org_id).order_by("created_at").first()
            if ws is None:
                name = (workspace_name or "Default").strip() or "Default"
                from apps.api.src.modules.workspaces.slug_policy import next_available_workspace_slug

                slug = await next_available_workspace_slug(
                    base_slug=name,
                    exists_fn=lambda candidate: Workspace.filter(slug=candidate).exists(),
                )
                ws = await Workspace.create(
                    organization_id=org_id,
                    slug=slug,
                    name=name,
                    is_active=True,
                    created_by_user_id=owner_user_id,
                )

            wsm, _ = await WorkspaceMembership.get_or_create(
                user_id=owner_user_id,
                workspace_id=ws.id,
                defaults={"status": WorkspaceMembershipStatus.ACTIVE},
            )
            if wsm.status != WorkspaceMembershipStatus.ACTIVE:
                wsm.status = WorkspaceMembershipStatus.ACTIVE
                await wsm.save(update_fields=["status", "updated_at"])

            rbac = RBACService(self.settings)
            await rbac.ensure_workspace_system_roles(workspace_id=ws.id)
            role_owner = await rbac.repo.get_role_by_code(workspace_id=ws.id, code="owner")
            if role_owner is not None:
                await WorkspaceMembershipRole.get_or_create(membership_id=wsm.id, role_id=role_owner.id)
            return ws.id
        except BaseException as exc:
            _raise_if_fatal(exc)
            self.logger.warning(
                "Ensure default workspace failed",
                action="ensure_default_workspace",
                error=str(exc),
                org_id=str(org_id),
                user_id=str(owner_user_id),
            )
            return None
