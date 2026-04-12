from src.common.utils.ids import uuid7
from src.models.content._enums import PublishArtifactKind
from tortoise import fields
from tortoise import migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0012_auto_20260314_1905")]

    initial = False

    operations = [
        ops.CreateModel(
            name="SEOProfileRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "version",
                    fields.OneToOneField(
                        "models.ContentVersionRecord",
                        source_field="version_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="seo_profile",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("meta_title", fields.CharField(max_length=256, null=True)),
                ("meta_description", fields.CharField(max_length=512, null=True)),
                ("canonical_url", fields.CharField(max_length=1024, null=True)),
                ("robots_directive", fields.CharField(max_length=128, null=True)),
                ("payload", fields.JSONField(null=True)),
            ],
            options={
                "table": "content_seo_profiles",
                "app": "models",
                "pk_attr": "id",
                "table_description": "Immutable SEO profile persisted alongside a content version.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ComponentBindingRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "version",
                    fields.ForeignKeyField(
                        "models.ContentVersionRecord",
                        source_field="version_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="component_bindings",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("component_key", fields.CharField(max_length=128, db_index=True)),
                ("binding_key", fields.CharField(max_length=128, db_index=True)),
                ("binding_payload", fields.JSONField(null=True)),
                ("sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_component_bindings",
                "app": "models",
                "unique_together": (("version_id", "component_key", "binding_key"),),
                "pk_attr": "id",
                "table_description": "Immutable component binding manifest scoped to a content version.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PublishArtifactRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "workspace",
                    fields.ForeignKeyField(
                        "models.Workspace",
                        source_field="workspace_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="content_publish_artifacts",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "site",
                    fields.ForeignKeyField(
                        "models.SiteRecord",
                        source_field="site_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="content_publish_artifacts",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "item",
                    fields.ForeignKeyField(
                        "models.ContentItemRecord",
                        source_field="item_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="publish_artifacts",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "version",
                    fields.ForeignKeyField(
                        "models.ContentVersionRecord",
                        source_field="version_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="publish_artifacts",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("artifact_kind", fields.CharEnumField(PublishArtifactKind, max_length=32, db_index=True)),
                ("locale", fields.CharField(max_length=16, default="zh-CN", db_index=True)),
                ("payload", fields.JSONField(null=True)),
                ("html", fields.TextField(null=True)),
            ],
            options={
                "table": "content_publish_artifacts",
                "app": "models",
                "unique_together": (("site_id", "item_id", "version_id", "artifact_kind", "locale"),),
                "pk_attr": "id",
                "table_description": "Published manifest artifact derived from an immutable content version.",
            },
            bases=["BaseModel"],
        ),
    ]
