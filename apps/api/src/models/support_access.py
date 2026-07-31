from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class SupportAccessGrantState(StrEnum):
    ACTIVE = "active"
    REVOKED = "revoked"


class SupportAccessGrant(BaseModel):
    """Workspace Owner consent; never grants membership or a Product session."""

    workspace = fields.ForeignKeyField(
        "models.Workspace", related_name="support_access_grants", on_delete=fields.CASCADE
    )
    case_id = fields.CharField(max_length=128, db_index=True)
    reason = fields.TextField()
    expires_at = fields.DatetimeField(db_index=True)
    state = fields.CharEnumField(SupportAccessGrantState, default=SupportAccessGrantState.ACTIVE, db_index=True)
    revision = fields.BigIntField(default=1)
    created_by_user_id = fields.UUIDField(db_index=True)
    revoked_by_user_id = fields.UUIDField(null=True, db_index=True)
    revoked_at = fields.DatetimeField(null=True)

    class Meta(BaseModel.Meta):
        table = "support_access_grants"
        abstract = False
        indexes = (("workspace_id", "state", "expires_at"), ("case_id", "state"))


class SupportAccessGrantOperator(BaseModel):
    grant = fields.ForeignKeyField("models.SupportAccessGrant", related_name="operators", on_delete=fields.CASCADE)
    operator_user_id = fields.UUIDField(db_index=True)
    operator_revision = fields.BigIntField()

    class Meta(BaseModel.Meta):
        table = "support_access_grant_operators"
        abstract = False
        unique_together = (("grant_id", "operator_user_id"),)


class SupportAccessGrantScope(BaseModel):
    grant = fields.ForeignKeyField("models.SupportAccessGrant", related_name="scopes", on_delete=fields.CASCADE)
    project_id = fields.UUIDField(null=True, db_index=True)
    content_category = fields.CharField(max_length=64)

    class Meta(BaseModel.Meta):
        table = "support_access_grant_scopes"
        abstract = False
        unique_together = (("grant_id", "project_id", "content_category"),)
