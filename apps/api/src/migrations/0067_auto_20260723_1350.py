from tortoise import migrations
from tortoise.migrations import operations as ops
from orjson import loads
from src.common.utils.ids import uuid7
from src.models.system.notification_campaign import NotificationCampaignChannel, NotificationCampaignConflictPolicy, NotificationCampaignState, NotificationDeliveryState, NotificationPresentation
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0066_auto_20260723_1250')]

    initial = False

    operations = [
        ops.CreateModel(
            name='NotificationCampaignRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('name', fields.CharField(db_index=True, max_length=160)),
                ('internal_description', fields.TextField(null=True, unique=False)),
                ('owner_user_id', fields.UUIDField(db_index=True)),
                ('revision', fields.IntField(default=1)),
                ('state', fields.CharEnumField(default=NotificationCampaignState.DRAFT, db_index=True, description='DRAFT: draft\nSCHEDULED: scheduled\nDISPATCHING: dispatching\nCOMPLETED: completed\nPARTIALLY_FAILED: partially_failed\nCANCELLED: cancelled\nARCHIVED: archived', enum_type=NotificationCampaignState, max_length=32)),
                ('audience', fields.JSONField(default=dict, encoder=JSON_DUMPS, decoder=loads)),
                ('audience_estimate', fields.IntField(null=True)),
                ('audience_snapshot_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('schedule_at', fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ('timezone', fields.CharField(default='UTC', max_length=64)),
                ('display_start_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('display_end_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('priority', fields.SmallIntField(default=0, db_index=True)),
                ('conflict_policy', fields.CharEnumField(default=NotificationCampaignConflictPolicy.QUEUE, description='QUEUE: queue\nREPLACE_LOWER_PRIORITY: replace_lower_priority', enum_type=NotificationCampaignConflictPolicy, max_length=32)),
                ('channels', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('presentations', fields.JSONField(default=list, encoder=JSON_DUMPS, decoder=loads)),
                ('fallback_locale', fields.CharField(null=True, max_length=16)),
                ('operation_job_id', fields.UUIDField(null=True, db_index=True)),
                ('recipient_count', fields.IntField(default=0)),
                ('pending_count', fields.IntField(default=0)),
                ('sent_count', fields.IntField(default=0)),
                ('delivered_count', fields.IntField(default=0)),
                ('failed_count', fields.IntField(default=0)),
                ('suppressed_count', fields.IntField(default=0)),
                ('read_count', fields.IntField(default=0)),
                ('clicked_count', fields.IntField(default=0)),
                ('dismissed_count', fields.IntField(default=0)),
                ('published_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('dispatch_started_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('completed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('cancelled_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('archived_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
            ],
            options={'table': 'notification_campaigns', 'app': 'models', 'indexes': [Index(fields=['state', 'schedule_at']), Index(fields=['state', 'updated_at'])], 'pk_attr': 'id', 'table_description': 'Revision-controlled global notification campaigns.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='NotificationCampaignVariantRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('campaign', fields.ForeignKeyField('models.NotificationCampaignRecord', source_field='campaign_id', db_constraint=True, to_field='id', related_name='variants', on_delete=OnDelete.CASCADE)),
                ('locale', fields.CharField(db_index=True, max_length=16)),
                ('revision', fields.IntField(default=1)),
                ('is_fallback', fields.BooleanField(default=False)),
                ('inbox_payload', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('email_payload', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('modal_payload', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('banner_payload', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                ('toast_payload', fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={'table': 'notification_campaign_variants', 'app': 'models', 'unique_together': (('campaign_id', 'locale'),), 'pk_attr': 'id', 'table_description': 'Localized presentation payloads for notification campaigns.'},
            bases=['BaseModel'],
        ),
        ops.CreateModel(
            name='NotificationDeliveryRecord',
            fields=[
                ('id', fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ('created_at', fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
                ('campaign', fields.ForeignKeyField('models.NotificationCampaignRecord', source_field='campaign_id', db_constraint=True, to_field='id', related_name='deliveries', on_delete=OnDelete.CASCADE)),
                ('variant', fields.ForeignKeyField('models.NotificationCampaignVariantRecord', source_field='variant_id', db_constraint=True, to_field='id', related_name='deliveries', on_delete=OnDelete.RESTRICT)),
                ('recipient_user_id', fields.UUIDField(db_index=True)),
                ('recipient_locale', fields.CharField(max_length=16)),
                ('channel', fields.CharEnumField(db_index=True, description='IN_APP: in_app\nEMAIL: email', enum_type=NotificationCampaignChannel, max_length=16)),
                ('presentation', fields.CharEnumField(db_index=True, description='INBOX: inbox\nTOAST: toast\nMODAL: modal\nBANNER: banner\nEMAIL: email', enum_type=NotificationPresentation, max_length=16)),
                ('idempotency_key', fields.CharField(unique=True, max_length=256)),
                ('state', fields.CharEnumField(default=NotificationDeliveryState.PENDING, db_index=True, description='PENDING: pending\nPROCESSING: processing\nSENT: sent\nDELIVERED: delivered\nFAILED: failed\nSUPPRESSED: suppressed\nCANCELLED: cancelled', enum_type=NotificationDeliveryState, max_length=16)),
                ('attempt_count', fields.IntField(default=0)),
                ('scheduled_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('processing_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('sent_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('delivered_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('read_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('clicked_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('dismissed_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('notification_id', fields.UUIDField(null=True, db_index=True)),
                ('provider_message_id', fields.CharField(null=True, db_index=True, max_length=256)),
                ('failure_code', fields.CharField(null=True, max_length=128)),
                ('failure_message', fields.CharField(null=True, max_length=512)),
                ('is_retryable', fields.BooleanField(default=False, db_index=True)),
            ],
            options={'table': 'notification_deliveries', 'app': 'models', 'indexes': [Index(fields=['campaign_id', 'state']), Index(fields=['recipient_user_id', 'presentation', 'state']), Index(fields=['campaign_id', 'recipient_user_id'])], 'pk_attr': 'id', 'table_description': 'Per-recipient notification delivery and interaction ledger.'},
            bases=['BaseModel'],
        ),
        ops.AlterField(
            model_name='NotificationRecord',
            name='body',
            field=fields.TextField(null=True, unique=False),
        ),
    ]
