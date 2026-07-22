from __future__ import annotations

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
