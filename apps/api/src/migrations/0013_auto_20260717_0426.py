from tortoise import migrations
from tortoise.migrations import operations as ops
from src.models.assets.upload import UploadStatus
from tortoise import fields

class Migration(migrations.Migration):
    dependencies = [('models', '0012_auto_20260715_2043')]

    initial = False

    operations = [
        ops.AlterField(
            model_name='UploadSessionRecord',
            name='status',
            field=fields.CharEnumField(default=UploadStatus.INITIATED, db_index=True, description='INITIATED: initiated\nUPLOADING: uploading\nCOMPLETING: completing\nSTORAGE_FINALIZED: storage_finalized\nCOMPLETED: completed\nABORTED: aborted\nEXPIRED: expired', enum_type=UploadStatus, max_length=32),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='completion_claim_token',
            field=fields.UUIDField(null=True, unique=True),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='completion_generation',
            field=fields.BigIntField(default=0, db_default=0),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='completion_heartbeat_at',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='completion_lease_until',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='finalized_storage_bucket',
            field=fields.CharField(null=True, max_length=255),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='storage_checksum_sha256',
            field=fields.CharField(null=True, max_length=64),
        ),
        ops.AddField(
            model_name='UploadSessionRecord',
            name='storage_finalized_at',
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
    ]
