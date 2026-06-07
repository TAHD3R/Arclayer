"""Migration 0008: add virtual_key_enc and metadata_json to ai_api_keys.

Phase 1 follow-up: Workspace-First LLM Key Resolution.
"""

from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0007_extension_activation")]

    initial = False

    operations = [
        ops.AddField(
            model_name="AIAPIKey",
            name="virtual_key_enc",
            field=fields.TextField(null=True),
        ),
        ops.AddField(
            model_name="AIAPIKey",
            name="metadata_json",
            field=fields.JSONField(null=True, default=None),
        ),
    ]
