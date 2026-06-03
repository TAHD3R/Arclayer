"""Add extension_revision to domain_workspaces for cache invalidation."""

from tortoise import fields, migrations


class Migration(migrations.Migration):
    dependencies = [("models", "0005_ai_infrastructure")]

    initial = False

    operations = [
        migrations.AddField(
            "domain_workspaces",
            "extension_revision",
            fields.BigIntField(default=1),
        ),
    ]
