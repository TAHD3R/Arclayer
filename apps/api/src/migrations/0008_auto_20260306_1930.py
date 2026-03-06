from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields

from apps.api.src.models.assets.asset import AssetPurpose


class Migration(migrations.Migration):
    dependencies = [("models", "0007_auto_20260306_1852")]

    initial = False

    operations = [
        ops.AlterField(
            model_name="AssetRecord",
            name="purpose",
            field=fields.CharEnumField(
                db_index=True,
                description="AVATAR: avatar\nSITE_LOGO: site_logo\nWORKSPACE_ICON: workspace_icon\nFAVICON: favicon\nLIBRARY: library\nATTACHMENT: attachment\nARTICLE_COVER: article_cover",
                enum_type=AssetPurpose,
                max_length=64,
            ),
        ),
    ]
