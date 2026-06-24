from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields
from tortoise.signals import post_delete, post_save, pre_save

from src.common.models import BaseModel


class WorkspaceMembershipStatus(StrEnum):
    """Workspace membership status."""

    ACTIVE = "active"
    INVITED = "invited"
    DISABLED = "disabled"


class WorkspaceKind(StrEnum):
    """Workspace identity kind."""

    TEAM = "team"


class WorkspaceIconMode(StrEnum):
    """Workspace icon presentation mode."""

    INITIALS = "initials"
    GLYPH = "glyph"
    EMOJI = "emoji"
    IMAGE = "image"


# Workspace (admin governance boundary).
class Workspace(BaseModel):
    """Domain model for workspaces."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="workspaces",
        on_delete=fields.CASCADE,
    )
    name = fields.CharField(max_length=128)
    kind = fields.CharEnumField(WorkspaceKind, default=WorkspaceKind.TEAM, db_index=True)
    owner_user_id = fields.UUIDField(null=True, db_index=True)
    description = fields.CharField(max_length=256, null=True)
    icon_mode = fields.CharEnumField(WorkspaceIconMode, default=WorkspaceIconMode.INITIALS)
    icon_color = fields.CharField(max_length=16, default="#337ea9")
    icon_glyph = fields.CharField(max_length=64, null=True)
    icon_emoji = fields.CharField(max_length=32, null=True)
    icon_url = fields.CharField(max_length=1024, null=True)
    is_active = fields.BooleanField(default=True, db_index=True)
    archived_at = fields.DatetimeField(null=True, db_index=True)
    archived_by_user_id = fields.UUIDField(null=True, db_index=True)
    deleted_at = fields.DatetimeField(null=True, db_index=True)

    created_by_user_id = fields.UUIDField(db_index=True)

    # Extension activation revision — incremented on any activate/deactivate/config_update.
    # Consumers use this for cache invalidation (see TenantAwareContentTypeRegistry).
    extension_revision = fields.BigIntField(default=1)

    if TYPE_CHECKING:
        organization_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_workspaces"
        abstract = False


@post_save(Workspace)
async def _bootstrap_workspace_system_roles(  # type: ignore[no-untyped-def]
    sender,
    instance: Workspace,
    created: bool,
    using_db,
    update_fields,
) -> None:
    """
    Ensure each newly-created workspace has the immutable system roles.

    Why:
    - New workspaces can be created after app startup.
    - Many flows (invites, admin console access, permission checks) assume system roles exist.
    - Startup bootstrap only covers workspaces that already existed at boot time.

    Notes:
    - We keep this minimal (roles only). Permission grants are reconciled lazily on first access
      via `require_workspace_permission()` to avoid coupling workspace creation to permission catalog timing.
    """

    if not created:
        return

    from src.core.exceptions import Conflict
    from src.core.i18n import t
    from src.models.system.rbac import Role
    from src.modules.system.rbac.constants.service import (
        ROLE_ADMIN,
        ROLE_DESIGNER,
        ROLE_EDITOR,
        ROLE_OWNER,
        ROLE_VIEWER,
    )

    # Fast path: already has any system role -> assume bootstrapped.
    if await Role.filter(workspace_id=instance.id, is_system=True).using_db(using_db).exists():
        return

    system_defs = [
        {
            "code": ROLE_OWNER,
            "name": "Owner",
            "description": "Full access within this workspace.",
            "name_i18n": "rbac:RBAC_ROLE_OWNER_NAME",
            "description_i18n": "rbac:RBAC_ROLE_OWNER_DESC",
            "is_default": False,
            "is_superuser": True,
        },
        {
            "code": ROLE_ADMIN,
            "name": "Admin",
            "description": "Workspace administration (team, settings, permissions).",
            "name_i18n": "rbac:RBAC_ROLE_ADMIN_NAME",
            "description_i18n": "rbac:RBAC_ROLE_ADMIN_DESC",
            "is_default": False,
            "is_superuser": False,
        },
        {
            "code": ROLE_EDITOR,
            "name": "Editor",
            "description": "Content editing and publishing.",
            "name_i18n": "rbac:RBAC_ROLE_EDITOR_NAME",
            "description_i18n": "rbac:RBAC_ROLE_EDITOR_DESC",
            "is_default": False,
            "is_superuser": False,
        },
        {
            "code": ROLE_DESIGNER,
            "name": "Designer",
            "description": "Theme and page design.",
            "name_i18n": "rbac:RBAC_ROLE_DESIGNER_NAME",
            "description_i18n": "rbac:RBAC_ROLE_DESIGNER_DESC",
            "is_default": False,
            "is_superuser": False,
        },
        {
            "code": ROLE_VIEWER,
            "name": "Viewer",
            "description": "Read-only access to the admin console.",
            "name_i18n": "rbac:RBAC_ROLE_VIEWER_NAME",
            "description_i18n": "rbac:RBAC_ROLE_VIEWER_DESC",
            "is_default": True,
            "is_superuser": False,
        },
    ]

    for d in system_defs:
        existing = await Role.get_or_none(workspace_id=instance.id, code=d["code"], using_db=using_db)
        if existing is not None:
            # Defensive: avoid collisions where a custom role uses a reserved system code.
            if not bool(existing.is_system):
                raise Conflict(
                    message=t("rbac", "ROLE_CODE_RESERVED"),
                    error="ROLE_CODE_RESERVED",
                    meta={"code": d["code"]},
                )
            continue

        await Role.create(
            using_db=using_db,
            workspace_id=instance.id,
            code=d["code"],
            name=d["name"],
            description=d["description"],
            name_i18n=d["name_i18n"],
            description_i18n=d["description_i18n"],
            is_system=True,
            is_default=bool(d["is_default"]),
            is_superuser=bool(d["is_superuser"]),
        )


# Workspace membership (user -> workspace).
class WorkspaceMembership(BaseModel):
    """Domain model for workspace memberships."""

    workspace = fields.ForeignKeyField(
        "models.Workspace",
        related_name="memberships",
        on_delete=fields.CASCADE,
    )
    user = fields.ForeignKeyField(
        "models.User",
        related_name="workspace_memberships",
        on_delete=fields.CASCADE,
    )
    status = fields.CharEnumField(WorkspaceMembershipStatus, default=WorkspaceMembershipStatus.ACTIVE, db_index=True)

    invited_by_user_id = fields.UUIDField(null=True, db_index=True)

    if TYPE_CHECKING:
        workspace_id: UUID
        user_id: UUID

    class Meta(BaseModel.Meta):
        table = "domain_workspace_memberships"
        abstract = False
        unique_together = (("workspace_id", "user_id"),)


# Workspace membership role edge (membership -> role).
class WorkspaceMembershipRole(BaseModel):
    """Domain model for workspace membership roles."""

    membership = fields.ForeignKeyField(
        "models.WorkspaceMembership",
        related_name="membership_roles",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField("models.Role", related_name="workspace_membership_roles", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "domain_workspace_membership_roles"
        abstract = False
        unique_together = (("membership_id", "role_id"),)


@pre_save(WorkspaceMembership)
async def _revoke_grants_on_membership_disable(  # type: ignore[no-untyped-def]
    sender,
    instance: WorkspaceMembership,
    using_db,
    update_fields,
) -> None:
    """Revoke active grants when membership status changes to DISABLED."""
    if not instance.id:
        return  # New record, not a status change.

    existing = await WorkspaceMembership.filter(id=instance.id).using_db(using_db).first()

    if existing is None:
        return
    if existing.status != WorkspaceMembershipStatus.DISABLED and instance.status == WorkspaceMembershipStatus.DISABLED:
        from src.llm.keys import revoke_user_grants_for_workspace

        await revoke_user_grants_for_workspace(
            user_id=instance.user_id,
            workspace_id=instance.workspace_id,
            using_db=using_db,
        )


@post_delete(WorkspaceMembership)
async def _revoke_grants_on_member_delete(  # type: ignore[no-untyped-def]
    sender,
    instance: WorkspaceMembership,
    using_db,
) -> None:
    """Revoke all active grants when a membership is deleted."""
    from src.llm.keys import revoke_user_grants_for_workspace

    await revoke_user_grants_for_workspace(
        user_id=instance.user_id,
        workspace_id=instance.workspace_id,
        using_db=using_db,
    )
