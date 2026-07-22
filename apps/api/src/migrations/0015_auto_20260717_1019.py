from orjson import loads
from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.indexes import Index
from tortoise.migrations import operations as ops

from src.common.utils.ids import uuid7
from src.models.jobs.provider_effect import ProviderEffectDisposition
from src.models.storage.storage_profile import StorageProfileConfigSource


class Migration(migrations.Migration):
    dependencies = [("models", "0014_auto_20260717_0427")]

    initial = False

    operations = [
        ops.CreateModel(
            name="StorageProfileRouteRevision",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "profile",
                    fields.ForeignKeyField(
                        "models.StorageProfile",
                        source_field="profile_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="route_revisions",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("revision_number", fields.IntField()),
                ("route", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("route_hash", fields.CharField(max_length=64)),
            ],
            options={
                "table": "storage_profile_route_revisions",
                "app": "models",
                "unique_together": (("profile_id", "revision_number"), ("profile_id", "route_hash")),
                "pk_attr": "id",
                "table_description": "Immutable non-secret storage provider route revisions.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ProviderEffectRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "job",
                    fields.ForeignKeyField(
                        "models.BackgroundJobRecord",
                        source_field="job_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="provider_effects",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "owner_attempt",
                    fields.ForeignKeyField(
                        "models.JobAttemptRecord",
                        source_field="owner_attempt_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="owned_provider_effects",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "profile",
                    fields.ForeignKeyField(
                        "models.StorageProfile",
                        source_field="profile_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="provider_effects",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                (
                    "profile_revision",
                    fields.ForeignKeyField(
                        "models.StorageProfileRouteRevision",
                        source_field="profile_revision_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="provider_effects",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("effect_type", fields.CharField(max_length=128)),
                ("effect_key", fields.CharField(max_length=256)),
                ("schema_version", fields.IntField()),
                ("manifest", fields.JSONField(encoder=JSON_DUMPS, decoder=loads)),
                ("manifest_hash", fields.CharField(max_length=64)),
                (
                    "disposition",
                    fields.CharEnumField(
                        default=ProviderEffectDisposition.ACTIVE,
                        db_index=True,
                        description="ACTIVE: active\nCOMMITTED: committed\nCLEANED: cleaned",
                        enum_type=ProviderEffectDisposition,
                        max_length=16,
                    ),
                ),
                ("registered_at", fields.DatetimeField(auto_now=False, auto_now_add=False)),
                ("settled_at", fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                (
                    "settled_by_attempt",
                    fields.ForeignKeyField(
                        "models.JobAttemptRecord",
                        source_field="settled_by_attempt_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="settled_provider_effects",
                        on_delete=OnDelete.RESTRICT,
                    ),
                ),
                ("settlement_reference", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
            ],
            options={
                "table": "provider_effect_records",
                "app": "models",
                "unique_together": (("owner_attempt_id", "effect_type", "effect_key"),),
                "indexes": [
                    Index(fields=["job_id", "disposition", "registered_at"]),
                    Index(fields=["profile_id", "disposition", "registered_at"]),
                ],
                "pk_attr": "id",
                "table_description": "Durable provider effects owned and settled by fenced Job Attempts.",
            },
            bases=["BaseModel"],
        ),
        ops.AddField(
            model_name="StorageProfile",
            name="config_source",
            field=fields.CharEnumField(
                default=StorageProfileConfigSource.DATABASE,
                description="DATABASE: database\nENVIRONMENT: environment",
                db_default=StorageProfileConfigSource.DATABASE,
                enum_type=StorageProfileConfigSource,
                max_length=16,
            ),
        ),
        ops.AddField(
            model_name="StorageProfile",
            name="tombstoned_at",
            field=fields.DatetimeField(null=True, auto_now=False, auto_now_add=False),
        ),
    ]
