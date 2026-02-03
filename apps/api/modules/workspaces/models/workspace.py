from __future__ import annotations

from enum import StrEnum

from tortoise import fields
from tortoise.signals import post_save

from apps.api.common.models.base import BaseModel


class WorkspaceMembershipStatus(StrEnum):
    """Workspace membership status."""

    ACTIVE = "active"
    INVITED = "invited"
    DISABLED = "disabled"


class Workspace(BaseModel):
    """Workspace (project) under an organization."""

    organization = fields.ForeignKeyField(
        "models.Organization",
        related_name="workspaces",
        on_delete=fields.CASCADE,
    )
    slug = fields.CharField(max_length=64, db_index=True)
    name = fields.CharField(max_length=128)
    is_active = fields.BooleanField(default=True, db_index=True)

    created_by_user_id = fields.UUIDField(db_index=True)

    class Meta(BaseModel.Meta):
        table = "workspaces"
        abstract = False
        unique_together = (("organization_id", "slug"),)


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

    from apps.api.core.exceptions import Conflict
    from apps.api.core.i18n import t
    from apps.api.core.rbac.constants import (
        ROLE_ADMIN,
        ROLE_DESIGNER,
        ROLE_EDITOR,
        ROLE_OWNER,
        ROLE_VIEWER,
    )
    from apps.api.modules.system.models.rbac import Role

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
                    message=t("rbac", "ROLE_CODE_RESERVED", default="角色编码已被系统保留"),
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
            name_l10n=None,
            description_l10n=None,
            is_system=True,
            is_default=bool(d["is_default"]),
            is_superuser=bool(d["is_superuser"]),
        )


class WorkspaceMembership(BaseModel):
    """User membership in a workspace (the admin governance boundary)."""

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

    class Meta(BaseModel.Meta):
        table = "workspace_memberships"
        abstract = False
        unique_together = (("workspace_id", "user_id"),)


class WorkspaceMembershipRole(BaseModel):
    """Role binding for a workspace membership."""

    membership = fields.ForeignKeyField(
        "models.WorkspaceMembership",
        related_name="membership_roles",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField("models.Role", related_name="workspace_membership_roles", on_delete=fields.CASCADE)

    class Meta(BaseModel.Meta):
        table = "workspace_membership_roles"
        abstract = False
        unique_together = (("membership_id", "role_id"),)
