from apps.api.src.common.utils.ids import uuid7
from apps.api.src.models.content._enums import (
    ContentItemStatus,
    ContentItemVisibility,
    ContentModelFieldType,
    ContentModelRelationType,
    ContentModelViewType,
    ContentPresentationKind,
    ContentVersionState,
)
from tortoise import fields
from tortoise import migrations
from tortoise.fields.base import OnDelete
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0010_auto_20260307_1547")]

    initial = False

    operations = [
        ops.CreateModel(
            name="ContentModelDefinitionRecord",
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
                        related_name="content_model_definitions",
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
                        related_name="content_model_definitions",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("key", fields.CharField(max_length=64, db_index=True)),
                ("name", fields.CharField(max_length=128)),
                ("description", fields.CharField(max_length=512, null=True)),
                ("kind", fields.CharField(max_length=64, null=True, db_index=True)),
                ("capabilities", fields.JSONField(null=True)),
                ("routing_policy", fields.JSONField(null=True)),
                ("workflow_policy", fields.JSONField(null=True)),
            ],
            options={
                "table": "content_model_definitions",
                "app": "models",
                "unique_together": (("workspace_id", "site_id", "key"),),
                "pk_attr": "id",
                "table_description": "Rebuilt content model definition scoped by workspace and site.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentModelFieldRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "model_definition",
                    fields.ForeignKeyField(
                        "models.ContentModelDefinitionRecord",
                        source_field="model_definition_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="fields",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("key", fields.CharField(max_length=64, db_index=True)),
                ("label", fields.CharField(max_length=128)),
                ("field_type", fields.CharEnumField(ContentModelFieldType, max_length=32, db_index=True)),
                ("is_required", fields.BooleanField(default=False)),
                ("default_value", fields.JSONField(null=True)),
                ("config", fields.JSONField(null=True)),
                ("sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_model_fields",
                "app": "models",
                "unique_together": (("model_definition_id", "key"),),
                "pk_attr": "id",
                "table_description": "Structured field definition under a rebuilt content model.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentModelRelationRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "model_definition",
                    fields.ForeignKeyField(
                        "models.ContentModelDefinitionRecord",
                        source_field="model_definition_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="relations",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "target_model_definition",
                    fields.ForeignKeyField(
                        "models.ContentModelDefinitionRecord",
                        source_field="target_model_definition_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="incoming_relations",
                        on_delete=OnDelete.SET_NULL,
                    ),
                ),
                ("target_model_key", fields.CharField(max_length=64, db_index=True)),
                ("key", fields.CharField(max_length=64, db_index=True)),
                ("relation_type", fields.CharEnumField(ContentModelRelationType, max_length=32, db_index=True)),
                ("is_required", fields.BooleanField(default=False)),
                ("config", fields.JSONField(null=True)),
                ("sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_model_relations",
                "app": "models",
                "unique_together": (("model_definition_id", "key"),),
                "pk_attr": "id",
                "table_description": "Relation contract between rebuilt content models.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentModelViewRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "model_definition",
                    fields.ForeignKeyField(
                        "models.ContentModelDefinitionRecord",
                        source_field="model_definition_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="views",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("key", fields.CharField(max_length=64, db_index=True)),
                ("label", fields.CharField(max_length=128)),
                ("view_type", fields.CharEnumField(ContentModelViewType, max_length=32, db_index=True)),
                ("dsl", fields.JSONField(null=True)),
                ("is_enabled", fields.BooleanField(default=True, db_index=True)),
                ("sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_model_views",
                "app": "models",
                "unique_together": (("model_definition_id", "key"),),
                "pk_attr": "id",
                "table_description": "View DSL contract under a rebuilt content model.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentItemRecord",
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
                        related_name="content_items",
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
                        related_name="content_items",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "model_definition",
                    fields.ForeignKeyField(
                        "models.ContentModelDefinitionRecord",
                        source_field="model_definition_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="items",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("slug", fields.CharField(max_length=256, db_index=True)),
                ("title", fields.CharField(max_length=256, null=True)),
                ("status", fields.CharEnumField(ContentItemStatus, max_length=16, default=ContentItemStatus.DRAFT, db_index=True)),
                ("visibility", fields.CharEnumField(ContentItemVisibility, max_length=16, default=ContentItemVisibility.PUBLIC, db_index=True)),
                ("locale", fields.CharField(max_length=16, default="zh-CN", db_index=True)),
                ("field_values", fields.JSONField(null=True)),
                ("draft_version", fields.IntField(default=0)),
                ("published_version", fields.IntField(null=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("updated_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "content_items",
                "app": "models",
                "unique_together": (("model_definition_id", "locale", "slug"),),
                "pk_attr": "id",
                "table_description": "Mutable content item state without route/tree blueprint coupling.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="ContentVersionRecord",
            fields=[
                ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                (
                    "item",
                    fields.ForeignKeyField(
                        "models.ContentItemRecord",
                        source_field="item_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="versions",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("version", fields.IntField()),
                ("state", fields.CharEnumField(ContentVersionState, max_length=16, default=ContentVersionState.DRAFT, db_index=True)),
                ("fields_snapshot", fields.JSONField(null=True)),
                ("change_summary", fields.CharField(max_length=512, null=True)),
                ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ("last_transition_by_user_id", fields.UUIDField(null=True, db_index=True)),
            ],
            options={
                "table": "content_versions",
                "app": "models",
                "unique_together": (("item_id", "version"),),
                "pk_attr": "id",
                "table_description": "Immutable version snapshot for a rebuilt content item.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PresentationDocumentRecord",
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
                        related_name="presentation_documents",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("kind", fields.CharEnumField(ContentPresentationKind, max_length=32, db_index=True)),
                ("payload", fields.JSONField(null=True)),
            ],
            options={
                "table": "content_presentation_documents",
                "app": "models",
                "unique_together": (("version_id", "kind"),),
                "pk_attr": "id",
                "table_description": "Version-scoped presentation payload (visual, rich text, query DSL, etc.).",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="RouteBindingRecord",
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
                        related_name="content_route_bindings",
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
                        related_name="content_route_bindings",
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
                        related_name="route_bindings",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("locale", fields.CharField(max_length=16, default="zh-CN", db_index=True)),
                ("path", fields.CharField(max_length=512, db_index=True)),
                ("is_active", fields.BooleanField(default=True, db_index=True)),
            ],
            options={
                "table": "content_route_bindings",
                "app": "models",
                "unique_together": (("site_id", "locale", "path"), ("item_id", "locale")),
                "pk_attr": "id",
                "table_description": "Route record separated from mutable content item payload.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="HierarchyNodeRecord",
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
                        related_name="content_hierarchy_nodes",
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
                        related_name="content_hierarchy_nodes",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "item",
                    fields.OneToOneField(
                        "models.ContentItemRecord",
                        source_field="item_id",
                        db_constraint=True,
                        to_field="id",
                        related_name="hierarchy_node",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                (
                    "parent_item",
                    fields.ForeignKeyField(
                        "models.ContentItemRecord",
                        source_field="parent_item_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="child_hierarchy_nodes",
                        on_delete=OnDelete.SET_NULL,
                    ),
                ),
                ("sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_hierarchy_nodes",
                "app": "models",
                "pk_attr": "id",
                "table_description": "Hierarchy record separated from route binding and item payload.",
            },
            bases=["BaseModel"],
        ),
        ops.CreateModel(
            name="PublishedGraphRecord",
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
                        related_name="content_published_graphs",
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
                        related_name="content_published_graphs",
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
                        related_name="published_graph_nodes",
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
                        related_name="published_graph_nodes",
                        on_delete=OnDelete.CASCADE,
                    ),
                ),
                ("locale", fields.CharField(max_length=16, default="zh-CN", db_index=True)),
                ("route_path", fields.CharField(max_length=512, db_index=True)),
                (
                    "hierarchy_parent_item",
                    fields.ForeignKeyField(
                        "models.ContentItemRecord",
                        source_field="hierarchy_parent_item_id",
                        null=True,
                        db_constraint=True,
                        to_field="id",
                        related_name="published_graph_children",
                        on_delete=OnDelete.SET_NULL,
                    ),
                ),
                ("hierarchy_sort_order", fields.IntField(default=0)),
            ],
            options={
                "table": "content_published_graph",
                "app": "models",
                "unique_together": (("site_id", "locale", "route_path"), ("item_id", "locale")),
                "pk_attr": "id",
                "table_description": "Published graph node references immutable content versions.",
            },
            bases=["BaseModel"],
        ),
        ops.AddConstraint(
            model_name="ContentModelFieldRecord",
            constraint=ops.CheckConstraint(
                check=(
                    "field_type IN ('text', 'long_text', 'number', "
                    "'boolean', 'date_time', 'json')"
                ),
                name="ck_content_model_fields_field_type",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentModelRelationRecord",
            constraint=ops.CheckConstraint(
                check=(
                    "relation_type IN ('one_to_one', 'one_to_many', "
                    "'many_to_one', 'many_to_many')"
                ),
                name="ck_content_model_relations_relation_type",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentModelViewRecord",
            constraint=ops.CheckConstraint(
                check="view_type IN ('detail', 'list', 'table', 'grid', 'tree')",
                name="ck_content_model_views_view_type",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentItemRecord",
            constraint=ops.CheckConstraint(
                check="status IN ('draft', 'published', 'archived')",
                name="ck_content_items_status",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentItemRecord",
            constraint=ops.CheckConstraint(
                check="visibility IN ('public', 'private')",
                name="ck_content_items_visibility",
            ),
        ),
        ops.AddConstraint(
            model_name="ContentVersionRecord",
            constraint=ops.CheckConstraint(
                check="state IN ('draft', 'published', 'scheduled', 'archived')",
                name="ck_content_versions_state",
            ),
        ),
        ops.AddConstraint(
            model_name="PresentationDocumentRecord",
            constraint=ops.CheckConstraint(
                check=(
                    "kind IN ('form_data', 'rich_text_document', 'visual_blueprint', "
                    "'query_definition', 'slot_mapping', 'seo')"
                ),
                name="ck_content_presentation_documents_kind",
            ),
        ),
    ]
