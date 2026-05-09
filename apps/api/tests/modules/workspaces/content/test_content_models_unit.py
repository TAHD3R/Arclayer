from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from tortoise.fields.data import CharEnumFieldInstance

from src.core.entity_manager.manager import EntityManager
from src.core.exceptions import Conflict
from src.models.content._enums import (
    ContentBootstrapPresetState,
    ContentItemStatus,
    ContentItemVisibility,
    ContentModelFieldType,
    ContentModelRelationType,
    ContentModelViewType,
    ContentPresentationKind,
    ContentVersionState,
)
from src.models.content.content_item import ContentItemRecord
from src.models.content.content_version import ContentVersionRecord
from src.models.content.hierarchy_node import HierarchyNodeRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.models.content.model_view import ContentModelViewRecord
from src.models.content.presentation_document import PresentationDocumentRecord
from src.models.content.published_graph import PublishedGraphRecord
from src.models.content.route_binding import RouteBindingRecord
from src.models.content.translation_group import TranslationGroupRecord
from src.modules.projects.content.contracts import schema as contracts_schema
from src.modules.projects.content.fields.base import FieldConfig
from src.modules.projects.content.fields.types import PasswordFieldType
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.domain_helpers import (
    item_has_capability,
    read_summary_field,
    read_title_field,
)
from src.modules.projects.content.items.input_schema import ContentItemCreateIn
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.models.field_type_registry import (
    clear_custom_content_model_field_types,
    content_model_field_type_registry,
    register_custom_content_model_field_type,
    validate_content_model_field_contract,
    validate_content_model_relation_contracts,
    validate_model_kind_contract,
)
from src.modules.projects.content.models.protocol_registry import list_official_model_protocols
from src.modules.projects.content.models.storage_sync import build_storage_sync_plan

REPO_ROOT = Path(__file__).resolve().parents[6]
MIGRATION_BASELINE = REPO_ROOT / "apps/api/src/migrations/0001_initial.py"
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


def test_content_item_contract_exposes_flattened_workbench_fields() -> None:
    item_fields = set(contracts_schema.ContentItemOut.model_fields.keys())

    assert "derived_status" in item_fields
    assert "runtime" in item_fields
    assert "context" in item_fields
    assert "library_group" in item_fields
    assert "edit_with" in item_fields
    assert "role" in item_fields


def test_content_item_record_does_not_persist_route_or_page_blueprint_state() -> None:
    item_fields = _field_names(ContentItemRecord)

    assert "path" not in item_fields
    assert "page_blueprint" not in item_fields
    assert "field_values" not in item_fields


def test_model_definition_record_persists_explicit_category_editor_and_policy_contracts() -> None:
    model_fields = set(contracts_schema.ContentModelDefinitionContract.model_fields.keys())
    out_fields = set(contracts_schema.ContentModelOut.model_fields.keys())
    record_fields = _field_names(ContentModelDefinitionRecord)

    assert "singular_key" in model_fields
    assert "plural_key" in model_fields
    assert "key" not in model_fields
    assert "singular_key" in out_fields
    assert "plural_key" in out_fields
    assert "key" not in out_fields
    assert "singular_key" in record_fields
    assert "plural_key" in record_fields
    assert "key" not in record_fields

    assert "category" in model_fields
    assert "default_editor" in model_fields
    assert "presentation" in model_fields
    assert "seo" in model_fields

    assert "category" in record_fields
    assert "default_editor" in record_fields
    assert "presentation_policy" in record_fields
    assert "seo_policy" in record_fields
    assert "protocol_key" in record_fields
    assert "protocol_version" in record_fields
    assert "is_system_managed" in record_fields
    assert "system_field_keys" in record_fields
    assert "draft_contract_revision" in record_fields
    assert "published_contract_revision" in record_fields
    assert "published_contract_snapshot" in record_fields
    assert "kind" not in record_fields


def test_official_model_registry_defines_v1_protocol_surface() -> None:
    protocols = {protocol.key: protocol for protocol in list_official_model_protocols()}

    assert set(protocols) == {"article", "page", "reusable-section", "category"}
    assert protocols["article"].singular_key == "article"
    assert protocols["article"].plural_key == "articles"
    assert protocols["page"].singular_key == "page"
    assert protocols["page"].plural_key == "pages"
    assert protocols["reusable-section"].singular_key == "reusable-section"
    assert protocols["reusable-section"].plural_key == "reusable-sections"
    assert protocols["category"].singular_key == "category"
    assert protocols["category"].plural_key == "categories"
    assert [field.key for field in protocols["article"].system_fields] == [
        "title",
        "slug",
        "summary",
        "content",
        "published_at",
    ]
    assert protocols["page"].default_surface == "canvas"
    assert protocols["page"].graphql_policy.list_query == "pages"
    assert protocols["page"].graphql_policy.single_query.name == "pageEntryByPath"
    assert protocols["reusable-section"].system_managed is True
    assert protocols["article"].routing_policy == {"mode": "none"}
    assert [filter.public_name for filter in protocols["article"].graphql_policy.filters] == [
        "slug",
        "titleContains",
        "revisionState",
    ]
    assert protocols["category"].routing_policy == {"mode": "single", "slug_field": "slug"}


def test_content_model_out_contract_registry_surfaces_formal_governance_sections() -> None:
    registry_fields = contracts_schema.ContentModelContractRegistryOut.model_fields
    boundary_fields = contracts_schema.ContentModelContractBoundaryOut.model_fields
    capability_fields = contracts_schema.ContentModelCapabilityRegistryOut.model_fields
    model_fields = contracts_schema.ContentModelOut.model_fields

    assert "contract_registry" in model_fields
    assert "boundaries" in registry_fields
    assert "capabilities" in registry_fields
    assert "workflow_policy" in registry_fields
    assert "delivery_policy" in registry_fields
    assert "graphql_policy" in registry_fields
    assert "system_fields" in boundary_fields
    assert "custom_fields" in boundary_fields
    assert "locked_field_keys" in boundary_fields
    assert "workflow" in capability_fields
    assert "delivery" in capability_fields
    assert "graphql" in capability_fields


def test_content_model_field_type_registry_exposes_builtin_and_plugin_contracts() -> None:
    clear_custom_content_model_field_types()
    register_custom_content_model_field_type(
        contracts_schema.ContentModelFieldTypeDefinitionOut(
            uid="plugin.color.swatch",
            config_kind="custom",
            source="plugin",
            scalar="text",
            group="custom",
            label="Color swatch",
            plugin_id="plugin.color",
            settings_sections=["basic", "advanced"],
            allowed_model_kinds=["collection_type", "single_type"],
        )
    )
    registry = content_model_field_type_registry()
    field_types = {field_type.uid: field_type for field_type in registry.field_types}
    model_kinds = {model_kind.id: model_kind for model_kind in registry.model_kinds}
    clear_custom_content_model_field_types()

    assert set(model_kinds) == {"collection_type", "single_type", "component"}
    assert model_kinds["collection_type"].default_capabilities == ["queryable"]
    assert model_kinds["component"].default_capabilities == []
    assert {
        "short_text",
        "rich_text",
        "email",
        "number",
        "decimal",
        "media",
        "reference",
        "component",
        "dynamic_zone",
        "blocks",
    } <= set(field_types)
    assert field_types["password"].scalar == "text"
    assert field_types["password"].config_schema["properties"] == {
        "minLength": "integer",
        "maxLength": "integer",
    }
    assert "uid" not in field_types
    assert field_types["short_text"].scalar == "text"
    assert field_types["reference"].allowed_model_kinds == ["collection_type", "single_type"]
    media_properties = cast(dict[str, object], field_types["media"].config_schema["properties"])
    assert media_properties["allowedTypes"] == "string[]"
    assert media_properties["min"] == "integer"
    assert media_properties["max"] == "integer"
    reference_properties = cast(dict[str, object], field_types["reference"].config_schema["properties"])
    assert reference_properties["min"] == "integer"
    assert reference_properties["max"] == "integer"
    component_properties = cast(dict[str, object], field_types["component"].config_schema["properties"])
    assert component_properties["repeatable"] == "boolean"
    assert component_properties["min"] == "integer"
    assert component_properties["max"] == "integer"
    dynamic_zone_properties = cast(dict[str, str], field_types["dynamic_zone"].config_schema["properties"])
    assert dynamic_zone_properties["components"] == "string[]"
    assert field_types["plugin.color.swatch"].source == "plugin"


def test_password_field_type_rejects_graphql_exposure() -> None:
    with pytest.raises(ValueError, match="write-only"):
        PasswordFieldType().get_graphql_type(FieldConfig(key="accessCode"))


def test_content_model_field_contract_validation_rejects_unsafe_graphql_names() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="sys",
                label="System",
                scalar="text",
                config={"kind": "short_text"},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_KEY_RESERVED"


def test_content_model_field_contract_validation_rejects_unknown_custom_field_uid() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="color",
                label="Color",
                scalar="text",
                config={"kind": "custom", "customFieldUid": "plugin.colors.color"},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_TYPE_UNREGISTERED"


def test_content_model_field_contract_validation_rejects_disabled_custom_field_type() -> None:
    clear_custom_content_model_field_types()
    contracts_schema.ContentModelFieldTypeDefinitionOut(
        uid="plugin.colors.legacy",
        config_kind="custom",
        source="plugin",
        lifecycle="disabled",
        scalar="text",
        group="custom",
        label="Legacy color",
        plugin_id="plugin.colors",
        settings_sections=["basic", "advanced"],
        allowed_model_kinds=["collection_type"],
    )

    with pytest.raises(ValueError, match="Disabled custom content model field types cannot be registered"):
        register_custom_content_model_field_type(
            contracts_schema.ContentModelFieldTypeDefinitionOut(
                uid="plugin.colors.legacy",
                config_kind="custom",
                source="plugin",
                lifecycle="disabled",
                scalar="text",
                group="custom",
                label="Legacy color",
                plugin_id="plugin.colors",
                settings_sections=["basic", "advanced"],
                allowed_model_kinds=["collection_type"],
            )
        )


def test_content_model_field_contract_validation_rejects_custom_field_model_kind_mismatch() -> None:
    clear_custom_content_model_field_types()
    register_custom_content_model_field_type(
        contracts_schema.ContentModelFieldTypeDefinitionOut(
            uid="plugin.colors.swatch",
            config_kind="custom",
            source="plugin",
            scalar="text",
            group="custom",
            label="Color swatch",
            plugin_id="plugin.colors",
            settings_sections=["basic", "advanced"],
            allowed_model_kinds=["collection_type"],
        )
    )

    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="brandColor",
                label="Brand color",
                scalar="text",
                config={"kind": "custom", "customFieldUid": "plugin.colors.swatch"},
            ),
            model_kind="component",
        )

    clear_custom_content_model_field_types()
    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_TYPE_MODEL_KIND_UNSUPPORTED"


def test_content_model_field_contract_validation_requires_component_target() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="seo",
                label="SEO",
                scalar="json",
                config={"kind": "component"},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_COMPONENT_TARGET_REQUIRED"


def test_content_model_field_contract_validation_requires_dynamic_zone_components() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="sections",
                label="Sections",
                scalar="json",
                config={"kind": "dynamic_zone", "components": []},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_CONFIG_INVALID"


def test_content_model_field_contract_validation_rejects_invalid_decimal_places() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="price",
                label="Price",
                scalar="number",
                config={"kind": "decimal", "decimalPlaces": -1},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_CONFIG_INVALID"


def test_content_model_field_contract_validation_rejects_invalid_enumeration_default() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="status",
                label="Status",
                scalar="text",
                config={"kind": "enumeration", "options": ["draft", "published"], "defaultValue": "archived"},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_CONFIG_INVALID"


def test_content_model_field_contract_validation_accepts_media_allowed_types() -> None:
    validate_content_model_field_contract(
        contracts_schema.ContentModelFieldContract(
            key="gallery",
            label="Gallery",
            scalar="json",
            config={"kind": "media", "mediaMode": "multiple", "allowedTypes": ["images", "videos"]},
        ),
        model_kind="collection_type",
    )


def test_content_model_field_contract_validation_accepts_media_item_bounds() -> None:
    validate_content_model_field_contract(
        contracts_schema.ContentModelFieldContract(
            key="gallery",
            label="Gallery",
            scalar="json",
            config={"kind": "media", "mediaMode": "multiple", "min": 1, "max": 4},
        ),
        model_kind="collection_type",
    )


def test_content_model_field_contract_validation_rejects_invalid_media_allowed_types() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="gallery",
                label="Gallery",
                scalar="json",
                config={"kind": "media", "allowedTypes": ["documents"]},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_CONFIG_INVALID"


def test_content_model_field_contract_validation_rejects_single_media_item_bounds() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="gallery",
                label="Gallery",
                scalar="json",
                config={"kind": "media", "mediaMode": "single", "min": 1},
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_VALIDATION_INVALID"


def test_content_model_field_contract_validation_accepts_reference_item_bounds() -> None:
    validate_content_model_field_contract(
        contracts_schema.ContentModelFieldContract(
            key="relatedArticles",
            label="Related articles",
            scalar="json",
            config={
                "kind": "reference",
                "referenceMode": "multiple",
                "targetModelKey": "article",
                "min": 1,
                "max": 3,
            },
        ),
        model_kind="collection_type",
    )


def test_content_model_field_contract_validation_rejects_single_reference_item_bounds() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="relatedArticles",
                label="Related articles",
                scalar="json",
                config={
                    "kind": "reference",
                    "referenceMode": "single",
                    "targetModelKey": "article",
                    "min": 1,
                },
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_VALIDATION_INVALID"


def test_content_model_field_contract_validation_accepts_repeatable_component_bounds() -> None:
    validate_content_model_field_contract(
        contracts_schema.ContentModelFieldContract(
            key="seo",
            label="SEO",
            scalar="json",
            config={
                "kind": "component",
                "targetComponentKey": "seoBlock",
                "repeatable": True,
                "min": 1,
                "max": 3,
            },
        ),
        model_kind="collection_type",
    )


def test_content_model_field_contract_validation_rejects_non_repeatable_component_bounds() -> None:
    with pytest.raises(Exception) as exc:
        validate_content_model_field_contract(
            contracts_schema.ContentModelFieldContract(
                key="seo",
                label="SEO",
                scalar="json",
                config={
                    "kind": "component",
                    "targetComponentKey": "seoBlock",
                    "repeatable": False,
                    "min": 1,
                },
            ),
            model_kind="collection_type",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_FIELD_VALIDATION_INVALID"


def test_component_model_kind_rejects_delivery_capabilities() -> None:
    with pytest.raises(Exception) as exc:
        validate_model_kind_contract(
            model_kind="component",
            capabilities=["queryable"],
            routing_mode="none",
        )

    assert getattr(exc.value, "error", None) == "CONTENT_MODEL_COMPONENT_DELIVERY_UNSUPPORTED"


@pytest.mark.asyncio
async def test_content_item_creation_rejects_component_models() -> None:
    workspace_id = uuid4()
    site_id = uuid4()
    repo = SimpleNamespace(
        get_model_definition_by_key=AsyncMock(
            return_value=SimpleNamespace(id=uuid4(), model_kind="component"),
        ),
        count_items_for_model=AsyncMock(return_value=0),
        create_item=AsyncMock(),
    )
    service = ProjectContentCanonicalItemsService(
        repo=cast(Any, repo),
        entity_manager=cast(Any, EntityManager(items_repo=cast(ProjectContentItemsRepository, repo))),
    )

    with pytest.raises(Conflict) as exc:
        await service.create_item(
            workspace_id=workspace_id,
            site_id=site_id,
            actor_user_id=None,
            payload=ContentItemCreateIn(title="SEO Card", locale="en-US", model_key="seoCard"),
        )

    assert exc.value.error == "CONTENT_ITEM_COMPONENT_MODEL_UNSUPPORTED"
    repo.create_item.assert_not_awaited()


@pytest.mark.asyncio
async def test_content_item_creation_rejects_second_single_type_for_locale() -> None:
    workspace_id = uuid4()
    site_id = uuid4()
    model_id = uuid4()
    repo = SimpleNamespace(
        get_model_definition_by_key=AsyncMock(
            return_value=SimpleNamespace(id=model_id, model_kind="single_type"),
        ),
        count_items_for_model=AsyncMock(return_value=1),
        create_item=AsyncMock(),
    )
    service = ProjectContentCanonicalItemsService(
        repo=cast(Any, repo),
        entity_manager=cast(Any, EntityManager(items_repo=cast(ProjectContentItemsRepository, repo))),
    )

    with pytest.raises(Conflict) as exc:
        await service.create_item(
            workspace_id=workspace_id,
            site_id=site_id,
            actor_user_id=None,
            payload=ContentItemCreateIn(title="Homepage", locale="en-US", model_key="homepage"),
        )

    assert exc.value.error == "CONTENT_ITEM_SINGLE_TYPE_ALREADY_EXISTS"
    repo.count_items_for_model.assert_awaited_once_with(
        workspace_id=workspace_id,
        site_id=site_id,
        environment_id=None,
        model_definition_id=model_id,
        locale="en-US",
    )
    repo.create_item.assert_not_awaited()


def test_content_model_impact_preview_contract_surfaces_change_plan_artifacts() -> None:
    preview_fields = contracts_schema.ContentModelImpactPreviewOut.model_fields
    change_plan_fields = contracts_schema.ContentModelSchemaChangePlanOut.model_fields
    revision_fields = contracts_schema.ContentModelRevisionSummaryOut.model_fields
    snapshot_fields = contracts_schema.ContentModelSchemaSnapshotOut.model_fields
    diff_fields = contracts_schema.ContentModelSchemaDiffOut.model_fields
    diff_entry_fields = contracts_schema.ContentModelSchemaDiffEntryOut.model_fields
    gate_fields = contracts_schema.ContentModelSchemaApplyGateOut.model_fields
    storage_plan_fields = contracts_schema.ContentModelStorageSyncPlanOut.model_fields
    storage_field_fields = contracts_schema.ContentModelStorageFieldOut.model_fields
    storage_migration_fields = contracts_schema.ContentModelStorageMigrationOut.model_fields

    assert "change_plan" in preview_fields
    assert "revisions" in change_plan_fields
    assert "current_snapshot" in change_plan_fields
    assert "next_snapshot" in change_plan_fields
    assert "published_snapshot" in change_plan_fields
    assert "diff" in change_plan_fields
    assert "apply_gates" in change_plan_fields
    assert "apply_ready" in change_plan_fields
    assert "storage_sync" in change_plan_fields
    assert "current_draft_revision" in revision_fields
    assert "published_revision" in revision_fields
    assert "next_draft_revision" in revision_fields
    assert "stage" in snapshot_fields
    assert "revision" in snapshot_fields
    assert "payload" in snapshot_fields
    assert "entries" in diff_fields
    assert "breaking_change_count" in diff_fields
    assert "kind" in diff_entry_fields
    assert "operation" in diff_entry_fields
    assert "target" in diff_entry_fields
    assert "summary" in diff_entry_fields
    assert "breaking" in diff_entry_fields
    assert "code" in gate_fields
    assert "status" in gate_fields
    assert "title" in gate_fields
    assert "detail" in gate_fields
    assert "strategy" in storage_plan_fields
    assert "schema_revision" in storage_plan_fields
    assert "storage_target" in storage_plan_fields
    assert "migrations" in storage_plan_fields
    assert "db_column_type" in storage_field_fields
    assert "json_path" in storage_field_fields
    assert "operation" in storage_migration_fields
    assert "forward_steps" in storage_migration_fields
    assert "rollback_steps" in storage_migration_fields


def test_content_model_storage_sync_plan_tracks_migrations_and_rollbacks() -> None:
    current_snapshot = {
        "fields": [
            {"key": "title", "label": "Title", "scalar": "text", "config": {"indexed": False}},
            {"key": "legacyTitle", "label": "Legacy Title", "scalar": "text"},
            {"key": "count", "label": "Count", "scalar": "number"},
            {"key": "retired", "label": "Retired", "scalar": "boolean"},
        ],
    }
    next_snapshot = {
        "fields": [
            {"key": "title", "label": "Title", "scalar": "text", "config": {"indexed": True}},
            {"key": "headline", "label": "Legacy Title", "scalar": "text"},
            {"key": "count", "label": "Count", "scalar": "long_text"},
            {"key": "summary", "label": "Summary", "scalar": "text"},
        ],
    }

    plan = build_storage_sync_plan(
        current_snapshot=current_snapshot,
        next_snapshot=next_snapshot,
        schema_revision=3,
    )

    operations = {migration.operation for migration in plan.migrations}
    assert plan.strategy == "jsonb_snapshot"
    assert plan.schema_revision == 3
    assert plan.storage_target == "domain_content_versions.fields_snapshot"
    assert {field.key: field.db_column_type for field in plan.fields} == {
        "title": "VARCHAR(255)",
        "headline": "VARCHAR(255)",
        "count": "TEXT",
        "summary": "VARCHAR(255)",
    }
    assert operations == {
        "field_add",
        "field_remove",
        "field_rename",
        "field_type_change",
        "field_index_change",
    }
    assert all(migration.forward_steps for migration in plan.migrations)
    assert all(migration.rollback_steps for migration in plan.migrations)
    assert any(
        migration.target == "fields_snapshot.legacyTitle->fields_snapshot.headline" for migration in plan.migrations
    )
    assert any(migration.target == "fields_snapshot.title" for migration in plan.migrations)


def test_item_has_capability_merges_item_and_model_capabilities() -> None:
    item_only = SimpleNamespace(
        capability_pack_ids=["publishable"],
        model_definition=SimpleNamespace(capabilities=["rich_text_editable"]),
    )
    model_only = SimpleNamespace(
        capability_pack_ids=[],
        model_definition=SimpleNamespace(capabilities=["routable"]),
    )

    assert item_has_capability(cast(ContentItemRecord, item_only), "publishable") is True
    assert item_has_capability(cast(ContentItemRecord, item_only), "rich_text_editable") is True
    assert item_has_capability(cast(ContentItemRecord, model_only), "routable") is True
    assert item_has_capability(cast(ContentItemRecord, model_only), "treeable") is False


def test_read_summary_field_reads_only_summary() -> None:
    assert read_summary_field({"summary": "Summary", "description": "Description"}) == "Summary"
    assert read_summary_field({"description": "Description"}) is None
    assert read_summary_field({"summary": "   "}) is None


def test_read_title_field_reads_only_title() -> None:
    assert read_title_field({"title": "Article Title", "name": "Fallback Name"}) == "Article Title"
    assert read_title_field({"name": "Fallback Name"}) is None
    assert read_title_field({"title": "   "}) is None


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


def test_content_item_record_unique_key_is_environment_model_locale_slug() -> None:
    assert getattr(ContentItemRecord.Meta, "unique_together", None) == (
        ("model_definition_id", "environment_id", "locale", "slug"),
    )


def test_content_item_record_supports_translation_group_link() -> None:
    item_fields = _field_names(ContentItemRecord)

    assert "translation_group" in item_fields
    translation_group_field = _field(ContentItemRecord, "translation_group")
    assert translation_group_field.null is True
    assert getattr(translation_group_field, "model_name", None) == "models.TranslationGroupRecord"


def test_translation_group_record_links_workspace_site_and_primary_item() -> None:
    assert TranslationGroupRecord.Meta.table == "domain_content_translation_groups"
    assert _field(TranslationGroupRecord, "workspace").null is False
    assert _field(TranslationGroupRecord, "site").null is False
    primary_item_id_field = _field(TranslationGroupRecord, "primary_item_id")
    assert primary_item_id_field.null is True
    assert primary_item_id_field.index is True
    assert _field(TranslationGroupRecord, "primary_locale").max_length == 16


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


def test_content_model_relation_types_include_polymorphic_target_and_one_way_values() -> None:
    assert {item.value for item in ContentModelRelationType} >= {
        "one_way",
        "many_way",
        "morph_one",
        "morph_many",
    }
    assert contracts_schema.RelationType.__args__ == (
        "one_to_one",
        "one_to_many",
        "many_to_one",
        "many_to_many",
        "one_way",
        "many_way",
        "morph_to_one",
        "morph_to_many",
        "morph_one",
        "morph_many",
    )


def test_content_model_relation_validator_accepts_new_relation_semantics() -> None:
    validate_content_model_relation_contracts([
        contracts_schema.ContentModelRelationContract(
            key="featuredAsset",
            relation="one_way",
            target_model_key="asset",
            config={"inverseEditable": False},
        ),
        contracts_schema.ContentModelRelationContract(
            key="relatedAssets",
            relation="many_way",
            target_model_key="asset",
            config={"cardinality": "many"},
        ),
        contracts_schema.ContentModelRelationContract(
            key="linkedFrom",
            relation="morph_one",
            target_model_key="article",
            config={"polymorphic": True, "sourceDiscriminatorField": "sourceType"},
        ),
        contracts_schema.ContentModelRelationContract(
            key="linkedEntries",
            relation="morph_many",
            target_model_key="article",
            config={"sourceDiscriminatorField": "sourceType"},
        ),
    ])


def test_content_model_relation_validator_rejects_invalid_new_relation_configs() -> None:
    with pytest.raises(Conflict) as one_way_error:
        validate_content_model_relation_contracts([
            contracts_schema.ContentModelRelationContract(
                key="featuredAsset",
                relation="one_way",
                target_model_key="asset",
                config={"inverseEditable": True},
            )
        ])
    assert one_way_error.value.error == "CONTENT_MODEL_RELATION_ONE_WAY_INVERSE_INVALID"

    with pytest.raises(Conflict) as polymorphic_error:
        validate_content_model_relation_contracts([
            contracts_schema.ContentModelRelationContract(
                key="linkedFrom",
                relation="morph_one",
                target_model_key="article",
                config={"polymorphic": True},
            )
        ])
    assert polymorphic_error.value.error == "CONTENT_MODEL_RELATION_CONFIG_REQUIRED"

    with pytest.raises(Conflict) as cardinality_error:
        validate_content_model_relation_contracts([
            contracts_schema.ContentModelRelationContract(
                key="relatedAssets",
                relation="many_way",
                target_model_key="asset",
                config={"cardinality": "one"},
            )
        ])
    assert cardinality_error.value.error == "CONTENT_MODEL_RELATION_CARDINALITY_MISMATCH"

    with pytest.raises(Conflict) as config_error:
        validate_content_model_relation_contracts([
            contracts_schema.ContentModelRelationContract.model_construct(
                key="featuredAsset",
                relation="one_way",
                target_model_key="asset",
                required=False,
                config=[],
            )
        ])
    assert config_error.value.error == "CONTENT_MODEL_RELATION_CONFIG_INVALID"


def test_route_binding_and_hierarchy_are_different_persistence_records() -> None:
    route_fields = _field_names(RouteBindingRecord)
    hierarchy_fields = _field_names(HierarchyNodeRecord)

    assert getattr(RouteBindingRecord.Meta, "table", None) == "domain_content_route_bindings"
    assert getattr(HierarchyNodeRecord.Meta, "table", None) == "domain_content_hierarchy_nodes"

    assert "path" in route_fields
    assert "environment" in route_fields
    assert "path" not in hierarchy_fields
    assert "parent_item" in hierarchy_fields
    assert "parent_item" not in route_fields
    assert getattr(RouteBindingRecord.Meta, "unique_together", None) == (
        ("site_id", "environment_id", "locale", "path"),
        ("item_id", "environment_id", "locale"),
    )


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


def test_migration_baseline_matches_content_kernel_constraints() -> None:
    migration = MIGRATION_BASELINE.read_text(encoding="utf-8")
    model_definition_section = migration.split("name='ContentModelDefinitionRecord'", maxsplit=1)[1]
    model_definition_section = model_definition_section.split("name='ContentItemRecord'", maxsplit=1)[0]

    assert "'target_model_key'" in migration
    assert "'category'" in migration
    assert "'default_editor'" in migration
    assert "'presentation_policy'" in migration
    assert "'seo_policy'" in migration
    assert "'protocol_key'" in migration
    assert "'protocol_version'" in migration
    assert "'is_system_managed'" in migration
    assert "'system_field_keys'" in migration
    assert "'draft_contract_revision'" in migration
    assert "'published_contract_revision'" in migration
    assert "'published_contract_snapshot'" in migration
    assert "'bootstrap_preset_key'" in migration
    assert "'bootstrap_preset_state'" in migration
    assert "'capability_pack_ids'" in migration
    assert "'shape_state'" in migration
    assert "'last_transition_by_user_id'" in migration
    assert "'unique_together': (('model_definition_id', 'environment_id', 'locale', 'slug'),)" in migration
    assert "'field_values'" not in migration
    assert "'kind'" not in model_definition_section

    hierarchy_node_section = migration.split("name='HierarchyNodeRecord'", maxsplit=1)[1]
    hierarchy_node_section = hierarchy_node_section.split("name='PresentationDocumentRecord'", maxsplit=1)[0]
    assert "'unique_together'" not in hierarchy_node_section


def test_migration_baseline_includes_rebuild_kernel_records() -> None:
    migration = MIGRATION_BASELINE.read_text(encoding="utf-8")
    assert "name='SEOProfileRecord'" in migration
    assert "name='ComponentBindingRecord'" in migration
    assert "name='PublishArtifactRecord'" in migration


def test_migration_baseline_includes_content_bootstrap_shape_storage() -> None:
    migration = MIGRATION_BASELINE.read_text(encoding="utf-8")
    assert "'model_definition'" in migration
    assert "null=True" in migration
    assert "'bootstrap_preset_key'" in migration
    assert "'bootstrap_preset_state'" in migration
    assert "'capability_pack_ids'" in migration
