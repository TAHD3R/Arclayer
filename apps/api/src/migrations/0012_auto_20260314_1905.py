from tortoise import migrations
from tortoise.migrations import operations as ops

class Migration(migrations.Migration):
    dependencies = [('models', '0011_content_kernel_initial')]

    initial = False

    operations = [
        ops.RemoveConstraint(
            model_name='ContentItemRecord',
            name='ck_content_items_status',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='ContentItemRecord',
            name='ck_content_items_visibility',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='ContentModelFieldRecord',
            name='ck_content_model_fields_field_type',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='ContentModelRelationRecord',
            name='ck_content_model_relations_relation_type',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='ContentModelViewRecord',
            name='ck_content_model_views_view_type',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='ContentVersionRecord',
            name='ck_content_versions_state',
            fields=None,
        ),
        ops.RemoveConstraint(
            model_name='PresentationDocumentRecord',
            name='ck_content_presentation_documents_kind',
            fields=None,
        ),
    ]
