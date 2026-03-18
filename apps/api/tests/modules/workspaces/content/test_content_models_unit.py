from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Any

from tortoise.fields.data import CharEnumFieldInstance

from apps.api.src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentModelFieldType,
    ContentModelRelationType,
    ContentModelViewType,
    ContentPresentationKind,
    ContentVersionState,
)
from apps.api.src.models.content.content_item import ContentItemRecord
from apps.api.src.models.content.content_version import ContentVersionRecord
from apps.api.src.models.content.hierarchy_node import HierarchyNodeRecord
from apps.api.src.models.content.model_definition import ContentModelDefinitionRecord
from apps.api.src.models.content.model_field import ContentModelFieldRecord
from apps.api.src.models.content.model_relation import ContentModelRelationRecord
from apps.api.src.models.content.model_view import ContentModelViewRecord
from apps.api.src.models.content.presentation_document import PresentationDocumentRecord
from apps.api.src.models.content.published_graph import PublishedGraphRecord
from apps.api.src.models.content.route_binding import RouteBindingRecord
from apps.api.src.modules.workspaces.content.contracts import schema as contracts_schema

REPO_ROOT = Path(__file__).resolve().parents[6]
MIGRATION_0011 = REPO_ROOT / "apps/api/src/migrations/0011_content_kernel_initial.py"
MIGRATION_0013 = REPO_ROOT / "apps/api/src/migrations/0013_content_platform_rebuild.py"
MIGRATION_0015 = REPO_ROOT / "apps/api/src/migrations/0015_content_bootstrap_shape.py"
SEO_PROFILE_MODEL = REPO_ROOT / "apps/api/src/models/content/seo_profile.py"
COMPONENT_BINDING_MODEL = REPO_ROOT / "apps/api/src/models/content/component_binding.py"
PUBLISH_ARTIFACT_MODEL = REPO_ROOT / "apps/api/src/models/content/publish_artifact.py"


def _field_names(model: type[Any]) -> set[str]:
    return set(model._meta.fields_map.keys())


def _field(model: type[Any], name: str) -> Any:
    return model._meta.fields_map[name]


def _assert_char_enum_field(model: type[Any], name: str, enum_type: type[Any]) -> None:
    field = _field(model, name)
    assert isinstance(field, CharEnumFieldInstance)
    assert field.enum_type is enum_type


def test_model_definition_contract_is_explicit_and_template_free() -> None:
    model_contract = contracts_schema.ContentModelDefinitionContract
    field_names = set(model_contract.model_fields.keys())

    assert "templateKey" not in field_names
    assert "template_key" not in field_names
    assert "kind" not in field_names

    assert "fields" in field_names
    assert "relations" in field_names
    assert "capabilities" in field_names
    assert "routing" in field_names
    assert "workflow" in field_names
    assert "views" in field_names


def test_model_impact_contract_surfaces_breaking_changes_and_warnings() -> None:
    impact_fields = set(contracts_schema.ContentModelImpactOut.model_fields.keys())
    change_fields = set(contracts_schema.ContentModelImpactChangeOut.model_fields.keys())

    assert "has_breaking_changes" in impact_fields
    assert "breaking_changes" in impact_fields
    assert "warnings" in impact_fields

    assert "code" in change_fields
    assert "target" in change_fields
    assert "message" in change_fields


def test_content_item_record_does_not_persist_route_or_page_blueprint_state() -> None:
    item_fields = _field_names(ContentItemRecord)

    assert "path" not in item_fields
    assert "page_blueprint" not in item_fields
    assert "field_values" not in item_fields


def test_model_definition_record_persists_explicit_category_editor_and_policy_contracts() -> None:
    model_fields = set(contracts_schema.ContentModelDefinitionContract.model_fields.keys())
    record_fields = _field_names(ContentModelDefinitionRecord)

    assert "category" in model_fields
    assert "default_editor" in model_fields
    assert "presentation" in model_fields
    assert "seo" in model_fields

    assert "category" in record_fields
    assert "default_editor" in record_fields
    assert "presentation_policy" in record_fields
    assert "seo_policy" in record_fields


def test_content_model_relation_persists_target_model_key_and_optional_target_model_definition() -> None:
    relation_fields = _field_names(ContentModelRelationRecord)
    contract_fields = contracts_schema.ContentModelRelationContract.model_fields

    assert "target_model_key" in relation_fields
    assert "target_model_definition" in relation_fields
    assert "target_model_key" in contract_fields
    assert contract_fields["target_model_key"].is_required() is True

    target_model_definition_field = _field(ContentModelRelationRecord, "target_model_definition")
    target_model_key_field = _field(ContentModelRelationRecord, "target_model_key")
    assert target_model_definition_field.null is True
    assert target_model_key_field.null is False
    assert target_model_key_field.max_length == 64
    assert target_model_key_field.index is True


def test_content_item_record_unique_key_is_model_locale_slug() -> None:
    assert getattr(ContentItemRecord.Meta, "unique_together", None) == (("model_definition_id", "locale", "slug"),)


def test_content_item_record_supports_model_less_bootstrap_shape() -> None:
    model_definition_field = _field(ContentItemRecord, "model_definition")
    preset_state_field = _field(ContentItemRecord, "bootstrap_preset_state")
    capability_pack_ids_field = _field(ContentItemRecord, "capability_pack_ids")

    assert model_definition_field.null is True
    assert preset_state_field.enum_type is ContentBootstrapPresetState
    assert capability_pack_ids_field.null is False
    assert "bootstrap_preset_key" in _field_names(ContentItemRecord)


def test_kernel_model_fields_use_char_enum_fields() -> None:
    _assert_char_enum_field(ContentModelFieldRecord, "field_type", ContentModelFieldType)
    _assert_char_enum_field(ContentModelRelationRecord, "relation_type", ContentModelRelationType)
    _assert_char_enum_field(ContentModelViewRecord, "view_type", ContentModelViewType)
    _assert_char_enum_field(ContentItemRecord, "status", ContentItemStatus)
    _assert_char_enum_field(ContentItemRecord, "visibility", ContentItemVisibility)
    _assert_char_enum_field(ContentVersionRecord, "state", ContentVersionState)
    _assert_char_enum_field(PresentationDocumentRecord, "kind", ContentPresentationKind)


def test_kernel_enum_types_are_str_enum() -> None:
    assert issubclass(ContentModelFieldType, StrEnum)
    assert issubclass(ContentModelRelationType, StrEnum)
    assert issubclass(ContentModelViewType, StrEnum)
    assert issubclass(ContentItemStatus, StrEnum)
    assert issubclass(ContentItemVisibility, StrEnum)
    assert issubclass(ContentVersionState, StrEnum)
    assert issubclass(ContentPresentationKind, StrEnum)


def test_route_binding_and_hierarchy_are_different_persistence_records() -> None:
    route_fields = _field_names(RouteBindingRecord)
    hierarchy_fields = _field_names(HierarchyNodeRecord)

    assert getattr(RouteBindingRecord.Meta, "table", None) == "content_route_bindings"
    assert getattr(HierarchyNodeRecord.Meta, "table", None) == "content_hierarchy_nodes"

    assert "path" in route_fields
    assert "path" not in hierarchy_fields
    assert "parent_item" in hierarchy_fields
    assert "parent_item" not in route_fields


def test_hierarchy_node_record_has_no_redundant_unique_together() -> None:
    assert getattr(HierarchyNodeRecord.Meta, "unique_together", None) in (None, ())


def test_published_graph_points_to_version_snapshot_instead_of_item_mutable_payload() -> None:
    graph_fields = _field_names(PublishedGraphRecord)

    assert "version" in graph_fields
    assert "fields_snapshot" not in graph_fields
    assert "page_blueprint" not in graph_fields

    version_field = PublishedGraphRecord._meta.fields_map["version"]
    assert getattr(version_field, "model_name", None) == "models.ContentVersionRecord"


def test_rebuild_kernel_requires_first_class_seo_component_binding_and_publish_artifact_models() -> None:
    assert SEO_PROFILE_MODEL.exists()
    assert COMPONENT_BINDING_MODEL.exists()
    assert PUBLISH_ARTIFACT_MODEL.exists()


def test_migration_0011_matches_kernel_constraints() -> None:
    migration = MIGRATION_0011.read_text(encoding="utf-8")

    assert '"target_model_key"' in migration
    assert '"category"' in migration
    assert '"default_editor"' in migration
    assert '"presentation_policy"' in migration
    assert '"seo_policy"' in migration
    assert "fields.CharEnumField(ContentModelFieldType" in migration
    assert "fields.CharEnumField(ContentModelRelationType" in migration
    assert "fields.CharEnumField(ContentModelViewType" in migration
    assert "fields.CharEnumField(ContentItemStatus" in migration
    assert "fields.CharEnumField(ContentItemVisibility" in migration
    assert "fields.CharEnumField(ContentVersionState" in migration
    assert "fields.CharEnumField(ContentPresentationKind" in migration
    assert '"last_transition_by_user_id"' in migration
    assert '"unique_together": (("model_definition_id", "locale", "slug"),)' in migration
    assert '"field_values"' not in migration
    assert '"unique_together": (("site_id", "item_id"),)' not in migration
    assert 'name="ck_content_model_fields_field_type"' in migration
    assert 'name="ck_content_model_relations_relation_type"' in migration
    assert 'name="ck_content_model_views_view_type"' in migration
    assert 'name="ck_content_items_status"' in migration
    assert 'name="ck_content_items_visibility"' in migration
    assert 'name="ck_content_versions_state"' in migration
    assert 'name="ck_content_presentation_documents_kind"' in migration

    hierarchy_node_section = migration.split('name="HierarchyNodeRecord"', maxsplit=1)[1]
    hierarchy_node_section = hierarchy_node_section.split('name="PublishedGraphRecord"', maxsplit=1)[0]
    assert '"unique_together"' not in hierarchy_node_section


def test_migration_0013_adds_rebuild_kernel_records() -> None:
    assert MIGRATION_0013.exists()

    migration = MIGRATION_0013.read_text(encoding="utf-8")
    assert 'name="SEOProfileRecord"' in migration
    assert 'name="ComponentBindingRecord"' in migration
    assert 'name="PublishArtifactRecord"' in migration


def test_migration_0015_adds_content_bootstrap_shape_storage() -> None:
    assert MIGRATION_0015.exists()

    migration = MIGRATION_0015.read_text(encoding="utf-8")
    assert 'name="model_definition"' in migration
    assert "null=True" in migration
    assert 'name="bootstrap_preset_key"' in migration
    assert 'name="bootstrap_preset_state"' in migration
    assert 'name="capability_pack_ids"' in migration
    assert "content_model_definitions AS models" in migration
