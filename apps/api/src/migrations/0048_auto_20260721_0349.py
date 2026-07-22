from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.content._enums import ContentPresentationKind
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0047_auto_20260721_0158')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='PresentationDocumentRecord',
            name='kind',
            field=fields.CharEnumField(db_index=True, description='FORM_DATA: form_data\nRICH_TEXT_DOCUMENT: rich_text_document\nWIREFRAME: wireframe\nVISUAL_BLUEPRINT: visual_blueprint\nQUERY_DEFINITION: query_definition\nSLOT_MAPPING: slot_mapping\nSEO: seo', enum_type=ContentPresentationKind, max_length=32),
        ),
    ]
