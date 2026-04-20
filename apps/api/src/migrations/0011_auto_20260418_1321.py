from orjson import loads
from tortoise import fields
from tortoise import migrations
from tortoise.fields.base import OnDelete
from tortoise.fields.data import JSON_DUMPS
from tortoise.migrations.constraints import UniqueConstraint
from tortoise.migrations.operations import (
    AddConstraint,
    AddField,
    CreateModel,
    TortoiseOperation,
)

from src.common.utils.ids import uuid7
from src.models.projects.membership import ProjectMemberRole
from src.models.projects.runtime import ProjectRuntimeKind
from src.models.projects.api_key import ApiKeyFamily, DeliveryKeyPerspective


class StateOnly(TortoiseOperation):
    def __init__(self, operation: TortoiseOperation) -> None:
        self.operation = operation

    def describe(self) -> str:
        return f"State only: {self.operation.describe()}"

    def state_forward(self, app_label: str, state) -> None:  # type: ignore[override]
        self.operation.state_forward(app_label, state)


class Migration(migrations.Migration):
    dependencies = [("models", "0010_project_memberships")]

    initial = False

    operations = [
        StateOnly(
            CreateModel(
                name="ApiKeyRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "owner_user",
                        fields.ForeignKeyField(
                            "models.User",
                            source_field="owner_user_id",
                            null=True,
                            db_constraint=True,
                            to_field="id",
                            related_name="api_keys",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "workspace",
                        fields.ForeignKeyField(
                            "models.Workspace",
                            source_field="workspace_id",
                            null=True,
                            db_constraint=True,
                            to_field="id",
                            related_name="api_keys",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "site",
                        fields.ForeignKeyField(
                            "models.SiteRecord",
                            source_field="site_id",
                            null=True,
                            db_constraint=True,
                            to_field="id",
                            related_name="api_keys",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "key_family",
                        fields.CharEnumField(
                            db_index=True,
                            description="PERSONAL_MANAGEMENT: personal_management\nWORKSPACE_SERVICE: workspace_service\nDELIVERY: delivery",
                            enum_type=ApiKeyFamily,
                            max_length=32,
                        ),
                    ),
                    (
                        "delivery_perspective",
                        fields.CharEnumField(
                            null=True,
                            db_index=True,
                            description="PUBLISHED: published\nPREVIEW: preview",
                            enum_type=DeliveryKeyPerspective,
                            max_length=16,
                        ),
                    ),
                    ("name", fields.CharField(max_length=128)),
                    ("description", fields.CharField(null=True, max_length=512)),
                    ("token_public_id", fields.CharField(unique=True, db_index=True, max_length=32)),
                    ("token_hash", fields.CharField(unique=True, db_index=True, max_length=64)),
                    ("token_mask", fields.CharField(max_length=128)),
                    ("scopes", fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads)),
                    ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                    ("last_used_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                    ("expires_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                    ("revoked_at", fields.DatetimeField(null=True, db_index=True, auto_now=False, auto_now_add=False)),
                ],
                options={"table": "domain_api_keys", "app": "models", "pk_attr": "id", "table_description": "Domain model for API key records."},
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            CreateModel(
                name="ContentReleaseRecord",
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
                            related_name="content_releases",
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
                            related_name="content_releases",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    ("release_number", fields.IntField()),
                    ("is_active", fields.BooleanField(default=True, db_index=True)),
                    ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                    ("activated_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                ],
                options={
                    "table": "domain_content_releases",
                    "app": "models",
                    "unique_together": (("site_id", "release_number"),),
                    "pk_attr": "id",
                    "table_description": "Domain model for content release records.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            CreateModel(
                name="ProjectRecord",
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
                            related_name="projects",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    ("slug", fields.CharField(db_index=True, max_length=64)),
                    ("name", fields.CharField(max_length=128)),
                    ("description", fields.CharField(null=True, max_length=256)),
                    ("is_active", fields.BooleanField(default=True, db_index=True)),
                    ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ],
                options={
                    "table": "domain_projects",
                    "app": "models",
                    "unique_together": (("workspace_id", "slug"),),
                    "pk_attr": "id",
                    "table_description": "Domain model for project records.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            CreateModel(
                name="ProjectMembership",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "project",
                        fields.ForeignKeyField(
                            "models.ProjectRecord",
                            source_field="project_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="memberships",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "user",
                        fields.ForeignKeyField(
                            "models.User",
                            source_field="user_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="project_memberships",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "role",
                        fields.CharEnumField(
                            default=ProjectMemberRole.EDITOR,
                            db_index=True,
                            description="OWNER: owner\nEDITOR: editor\nVIEWER: viewer",
                            enum_type=ProjectMemberRole,
                            max_length=6,
                        ),
                    ),
                    ("created_by_user_id", fields.UUIDField(null=True, db_index=True)),
                ],
                options={
                    "table": "domain_project_memberships",
                    "app": "models",
                    "unique_together": (("project_id", "user_id"),),
                    "pk_attr": "id",
                    "table_description": "Project-scoped member role binding.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            CreateModel(
                name="ProjectRuntimeRecord",
                fields=[
                    ("id", fields.UUIDField(primary_key=True, default=uuid7, unique=True, db_index=True)),
                    ("created_at", fields.DatetimeField(db_index=True, auto_now=False, auto_now_add=True)),
                    ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
                    (
                        "project",
                        fields.ForeignKeyField(
                            "models.ProjectRecord",
                            source_field="project_id",
                            db_constraint=True,
                            to_field="id",
                            related_name="runtimes",
                            on_delete=OnDelete.CASCADE,
                        ),
                    ),
                    (
                        "kind",
                        fields.CharEnumField(
                            default=ProjectRuntimeKind.PRIMARY,
                            db_index=True,
                            description="PRIMARY: primary",
                            enum_type=ProjectRuntimeKind,
                            max_length=7,
                        ),
                    ),
                    ("name", fields.CharField(default="Primary", max_length=64)),
                    ("is_active", fields.BooleanField(default=True, db_index=True)),
                ],
                options={
                    "table": "domain_project_runtimes",
                    "app": "models",
                    "unique_together": (("project_id", "kind"),),
                    "pk_attr": "id",
                    "table_description": "Domain model for project runtime records.",
                },
                bases=["BaseModel"],
            )
        ),
        StateOnly(
            AddField(
                model_name="PublishArtifactRecord",
                name="release",
                field=fields.ForeignKeyField(
                    "models.ContentReleaseRecord",
                    source_field="release_id",
                    db_constraint=True,
                    to_field="id",
                    related_name="artifacts",
                    on_delete=OnDelete.CASCADE,
                ),
            )
        ),
        StateOnly(
            AddField(
                model_name="PublishedGraphRecord",
                name="release",
                field=fields.ForeignKeyField(
                    "models.ContentReleaseRecord",
                    source_field="release_id",
                    db_constraint=True,
                    to_field="id",
                    related_name="graph_nodes",
                    on_delete=OnDelete.CASCADE,
                ),
            )
        ),
        StateOnly(
            AddField(
                model_name="PublishedGraphRecord",
                name="route_contract",
                field=fields.JSONField(null=True, encoder=JSON_DUMPS, decoder=loads),
            )
        ),
        StateOnly(
            AddConstraint(
                model_name="PublishArtifactRecord",
                constraint=UniqueConstraint(
                    fields=("release_id", "site_id", "item_id", "version_id", "artifact_kind", "locale"),
                    name=None,
                ),
            )
        ),
        StateOnly(
            AddConstraint(
                model_name="PublishedGraphRecord",
                constraint=UniqueConstraint(fields=("release_id", "site_id", "locale", "route_path"), name=None),
            )
        ),
        StateOnly(
            AddConstraint(
                model_name="PublishedGraphRecord",
                constraint=UniqueConstraint(fields=("release_id", "item_id", "locale"), name=None),
            )
        ),
    ]
