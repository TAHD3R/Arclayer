from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0109_platform_sign_in_settings_action")]
    initial = False
    operations = [
        ops.AddField(
            model_name="AIAPIKey",
            name="provider_api_key_enc",
            field=fields.TextField(null=True),
        )
    ]
