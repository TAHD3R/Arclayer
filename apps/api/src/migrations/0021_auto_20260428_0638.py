from tortoise import fields, migrations
from tortoise.migrations import operations as ops
from tortoise.migrations.constraints import UniqueConstraint


class Migration(migrations.Migration):
    dependencies = [("models", "0020_auto_20260425_1810")]

    operations = [
        ops.RemoveConstraint(
            model_name="ContentModelDefinitionRecord",
            name=None,
            fields=["workspace_id", "site_id", "key"],
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="singular_key",
            field=fields.CharField(db_index=True, max_length=64),
        ),
        ops.AddField(
            model_name="ContentModelDefinitionRecord",
            name="plural_key",
            field=fields.CharField(db_index=True, max_length=64),
        ),
        ops.RemoveField(
            model_name="ContentModelDefinitionRecord",
            name="key",
        ),
        ops.AddConstraint(
            model_name="ContentModelDefinitionRecord",
            constraint=UniqueConstraint(
                fields=("workspace_id", "site_id", "singular_key"),
                name="uq_domain_content_model_definitions_singular_key",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentModelDefinitionRecord",
            constraint=UniqueConstraint(
                fields=("workspace_id", "site_id", "plural_key"),
                name="uq_domain_content_model_definitions_plural_key",
            ),
        ),
    ]
