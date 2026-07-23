from __future__ import annotations

from enum import StrEnum

from tortoise import fields

from src.common.models import BaseModel


class EmailTemplateRecord(BaseModel):
    key = fields.CharField(max_length=96, db_index=True)
    locale = fields.CharField(max_length=16, db_index=True)
    name = fields.CharField(max_length=160)
    description = fields.CharField(max_length=500, null=True)
    subject_template = fields.CharField(max_length=500)
    html_template = fields.TextField()
    text_template = fields.TextField()
    variables = fields.JSONField(default=list)
    is_enabled = fields.BooleanField(default=True, db_index=True)
    version = fields.IntField(default=1)

    class Meta(BaseModel.Meta):
        table = "system_email_templates"
        table_description = "Localized editable email templates used by all mail Connectors."
        abstract = False
        unique_together = (("key", "locale"),)


class EmailTemplateRevisionAction(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    RESTORED = "restored"
    DELETED = "deleted"


class EmailTemplateRevisionRecord(BaseModel):
    template_id = fields.UUIDField(db_index=True)
    key = fields.CharField(max_length=96, db_index=True)
    locale = fields.CharField(max_length=16, db_index=True)
    version = fields.IntField()
    action = fields.CharEnumField(EmailTemplateRevisionAction, db_index=True)
    name = fields.CharField(max_length=160)
    description = fields.CharField(max_length=500, null=True)
    subject_template = fields.CharField(max_length=500)
    html_template = fields.TextField()
    text_template = fields.TextField()
    variables = fields.JSONField(default=list)
    is_enabled = fields.BooleanField()
    changed_fields = fields.JSONField(default=list)
    actor_user_id = fields.UUIDField(null=True, db_index=True)
    audit_event_id = fields.UUIDField(null=True, db_index=True)

    class Meta(BaseModel.Meta):
        table = "system_email_template_revisions"
        table_description = "Immutable localized email template revision snapshots."
        abstract = False
        unique_together = (("template_id", "version"),)
