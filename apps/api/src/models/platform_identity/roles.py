from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from tortoise import fields

from src.common.models import BaseModel


class PlatformRoleKind(StrEnum):
    BUILT_IN = "built_in"
    CUSTOM = "custom"


class PlatformPermission(BaseModel):
    """Trusted, deployment-wide Platform permission catalog entry."""

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    owner_domain = fields.CharField(max_length=64, db_index=True)
    name_i18n = fields.CharField(max_length=200)
    description_i18n = fields.CharField(max_length=200)
    is_delegable = fields.BooleanField(default=True, db_index=True)
    catalog_revision = fields.BigIntField(default=1)
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "platform_permissions"
        table_description = "Trusted exact Platform permission catalog."
        abstract = False
        indexes = (("owner_domain", "is_active"),)


class PlatformRole(BaseModel):
    """A reusable Platform role; Instance Owner authority is never a role."""

    code = fields.CharField(max_length=128, unique=True, db_index=True)
    kind = fields.CharEnumField(PlatformRoleKind, db_index=True)
    name = fields.CharField(max_length=128)
    description = fields.TextField(null=True)
    name_i18n = fields.CharField(max_length=200, null=True)
    description_i18n = fields.CharField(max_length=200, null=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    is_active = fields.BooleanField(default=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "platform_roles"
        table_description = "Built-in and deployment-owned Custom Platform Roles."
        abstract = False
        indexes = (("kind", "is_active"),)


class PlatformRoleRevision(BaseModel):
    """One immutable permission set; exactly one revision is current per role."""

    role = fields.ForeignKeyField("models.PlatformRole", related_name="revisions", on_delete=fields.CASCADE)
    sequence = fields.IntField()
    is_current = fields.BooleanField(default=False, db_index=True)
    created_by_user_id = fields.UUIDField(null=True, db_index=True)
    superseded_at = fields.DatetimeField(null=True)

    if TYPE_CHECKING:
        role_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_role_revisions"
        table_description = "Immutable Platform Role permission revisions."
        abstract = False
        unique_together = (("role_id", "sequence"),)
        indexes = (("role_id", "is_current"),)


class PlatformRoleRevisionPermission(BaseModel):
    """One permission contained by an immutable Platform Role revision."""

    role_revision = fields.ForeignKeyField(
        "models.PlatformRoleRevision",
        related_name="permission_bindings",
        on_delete=fields.CASCADE,
    )
    permission = fields.ForeignKeyField(
        "models.PlatformPermission",
        related_name="role_revision_bindings",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        role_revision_id: UUID
        permission_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_role_revision_permissions"
        table_description = "Permission membership for one immutable Platform Role revision."
        abstract = False
        unique_together = (("role_revision_id", "permission_id"),)


class PlatformOperatorRoleAssignment(BaseModel):
    """A role assignment without a permission or revision snapshot."""

    operator = fields.ForeignKeyField(
        "models.PlatformOperator",
        related_name="role_assignments",
        on_delete=fields.RESTRICT,
    )
    role = fields.ForeignKeyField("models.PlatformRole", related_name="operator_assignments", on_delete=fields.RESTRICT)
    assigned_by_user_id = fields.UUIDField(null=True, db_index=True)
    started_at = fields.DatetimeField(db_index=True)
    ended_at = fields.DatetimeField(null=True, db_index=True)

    if TYPE_CHECKING:
        operator_id: UUID
        role_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_operator_role_assignments"
        table_description = "Time-bounded Platform Role assignments resolved through current revisions."
        abstract = False
        indexes = (("operator_id", "ended_at"), ("role_id", "ended_at"))


class PlatformOperatorInvitationRole(BaseModel):
    """The exact role revision reviewed when a Platform invitation was sent."""

    invitation = fields.ForeignKeyField(
        "models.PlatformOperatorInvitation",
        related_name="role_bindings",
        on_delete=fields.CASCADE,
    )
    role = fields.ForeignKeyField("models.PlatformRole", related_name="invitation_bindings", on_delete=fields.RESTRICT)
    role_revision = fields.ForeignKeyField(
        "models.PlatformRoleRevision",
        related_name="invitation_bindings",
        on_delete=fields.RESTRICT,
    )

    if TYPE_CHECKING:
        invitation_id: UUID
        role_id: UUID
        role_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_operator_invitation_roles"
        table_description = "Revision-bound intended roles for a pending Platform invitation."
        abstract = False
        unique_together = (("invitation_id", "role_id"),)


class PlatformRoleChangePreview(BaseModel):
    """Server-authored Custom Role review state bound to current authority facts."""

    role = fields.ForeignKeyField("models.PlatformRole", related_name="change_previews", on_delete=fields.CASCADE)
    actor_user = fields.ForeignKeyField(
        "models.User", related_name="platform_role_change_previews", on_delete=fields.RESTRICT
    )
    expected_role_revision = fields.ForeignKeyField(
        "models.PlatformRoleRevision", related_name="change_previews", on_delete=fields.RESTRICT
    )
    proposed_name = fields.CharField(max_length=128)
    proposed_description = fields.TextField(null=True)
    proposed_permission_codes = fields.JSONField()
    assignment_fingerprint = fields.CharField(max_length=64)
    catalog_fingerprint = fields.CharField(max_length=64)

    if TYPE_CHECKING:
        role_id: UUID
        actor_user_id: UUID
        expected_role_revision_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_role_change_previews"
        table_description = "Revision-bound server previews for Custom Platform Role changes."
        abstract = False
        indexes = (("role_id", "created_at"), ("actor_user_id", "created_at"))


class PlatformIdentityMutationReceipt(BaseModel):
    """Durable idempotency receipt for Platform Access and Security mutations."""

    actor_user = fields.ForeignKeyField(
        "models.User", related_name="platform_identity_mutation_receipts", on_delete=fields.RESTRICT
    )
    action = fields.CharField(max_length=64)
    idempotency_key = fields.CharField(max_length=128)
    request_fingerprint = fields.CharField(max_length=64)
    entity_id = fields.UUIDField()
    correlation_id = fields.UUIDField(unique=True, db_index=True)

    if TYPE_CHECKING:
        actor_user_id: UUID

    class Meta(BaseModel.Meta):
        table = "platform_identity_mutation_receipts"
        table_description = "Idempotency receipts for Platform Access and Security commands."
        abstract = False
        unique_together = (("actor_user_id", "action", "idempotency_key"),)
