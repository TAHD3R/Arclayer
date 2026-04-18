from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.workspaces.workspace import WorkspaceIconMode
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0011_auto_20260418_1321')]

    initial = False

    operations = [
        ops.AddField(
            model_name='ProjectRecord',
            name='icon_color',
            field=fields.CharField(default='#337ea9', db_default='#337ea9', max_length=16),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='icon_emoji',
            field=fields.CharField(null=True, max_length=32),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='icon_glyph',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='icon_mode',
            field=fields.CharEnumField(default=WorkspaceIconMode.INITIALS, description='INITIALS: initials\nGLYPH: glyph\nEMOJI: emoji\nIMAGE: image', db_default=WorkspaceIconMode.INITIALS, enum_type=WorkspaceIconMode, max_length=8),
        ),
        ops.AddField(
            model_name='ProjectRecord',
            name='icon_url',
            field=fields.CharField(null=True, max_length=1024),
        ),
        ops.RemoveConstraint(
            model_name='PublishArtifactRecord',
            name=None,
            fields=['site_id', 'item_id', 'version_id', 'artifact_kind', 'locale'],
        ),
        ops.RemoveConstraint(
            model_name='PublishedGraphRecord',
            name=None,
            fields=['site_id', 'locale', 'route_path'],
        ),
        ops.RemoveConstraint(
            model_name='PublishedGraphRecord',
            name=None,
            fields=['item_id', 'locale'],
        ),
    ]
