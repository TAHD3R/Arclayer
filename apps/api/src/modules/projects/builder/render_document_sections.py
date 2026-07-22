from __future__ import annotations

from collections.abc import Mapping
from typing import Literal, cast
from uuid import UUID

from src.common.types.json_types import JsonObject, JsonValue
from src.models.content.content_version import ContentVersionRecord
from src.modules.projects.builder.render_document_design import render_component_recipe_with_blueprint
from src.modules.projects.builder.render_document_errors import raise_render_invalid
from src.modules.projects.builder.render_document_schema import (
    BuilderRenderGlobalReferenceHopOut,
    BuilderRenderSectionOut,
    BuilderRenderSlotOut,
)
from src.modules.projects.builder.schema import (
    BuilderRevisionGlobalSectionOut,
    BuilderRevisionOut,
    BuilderRevisionPageOut,
)
from src.modules.projects.builder.snapshot import canonical_hash
from src.modules.projects.builder.visual_blueprint_schema import VisualBlueprintSectionV1
from src.modules.projects.builder.wireframe_schema import (
    WireframeBindingV1,
    WireframeFieldBindingV1,
    WireframeInteractionRuleV1,
    WireframeLiteralBindingV1,
    WireframeSectionV1,
)
from src.modules.sites.component_catalogs.schema import (
    ComponentCatalogComponentV1,
    ComponentCatalogSlotV1,
    ComponentCatalogV1,
)
from src.modules.workspaces.design_systems.manifest import DesignComponentRecipeV1, TokenValue

SourceKind = Literal["page", "global_section"]
RevisionSource = BuilderRevisionPageOut | BuilderRevisionGlobalSectionOut


def build_render_sections(
    *,
    page: BuilderRevisionPageOut,
    revision: BuilderRevisionOut,
    version_by_item: Mapping[UUID, ContentVersionRecord],
    catalog: ComponentCatalogV1,
    recipes: Mapping[tuple[str, str], DesignComponentRecipeV1],
    token_values: Mapping[str, TokenValue],
) -> tuple[BuilderRenderSectionOut, ...]:
    validate_render_version_inputs(revision=revision, version_by_item=version_by_item)
    _validate_global_graph(revision)
    _validate_visual_blueprints(revision=revision, catalog=catalog)
    if page.wireframe is None:
        raise_render_invalid("BUILDER_RENDER_WIREFRAME_REQUIRED", itemId=str(page.item_id))
    global_by_id = {UUID(str(item.item_id)): item for item in revision.global_sections}
    sections = _expand_sections(
        source=page,
        source_kind="page",
        sections=page.wireframe.sections,
        global_by_id=global_by_id,
        version_by_item=version_by_item,
        catalog=catalog,
        recipes=recipes,
        token_values=token_values,
        lineage=(),
        active=frozenset(),
    )
    if not sections:
        raise_render_invalid("BUILDER_RENDER_SECTIONS_REQUIRED", pageItemId=str(page.item_id))
    instance_ids = tuple(section.instance_id for section in sections)
    if len(instance_ids) != len(set(instance_ids)):
        raise_render_invalid("BUILDER_RENDER_SECTION_INSTANCE_DUPLICATE")
    return sections


def _validate_visual_blueprints(*, revision: BuilderRevisionOut, catalog: ComponentCatalogV1) -> None:
    manifest = revision.site_revision
    for source in (*revision.pages, *revision.global_sections):
        blueprint = source.visual_blueprint
        if blueprint is None:
            continue
        wireframe = source.wireframe
        if (
            wireframe is None
            or UUID(str(blueprint.item_id)) != UUID(str(source.item_id))
            or blueprint.source_wireframe_checksum != canonical_hash(wireframe.model_dump(mode="json", by_alias=True))
            or UUID(str(blueprint.design_system_version_id)) != UUID(str(manifest.design_system_version_id))
            or blueprint.design_system_manifest_checksum != manifest.design_system_manifest_checksum
            or blueprint.component_catalog_version != catalog.catalog_version
            or blueprint.component_catalog_checksum != catalog.checksum
        ):
            raise_render_invalid("BUILDER_VISUAL_BLUEPRINT_STALE", itemId=str(source.item_id))


def validate_render_version_inputs(
    *,
    revision: BuilderRevisionOut,
    version_by_item: Mapping[UUID, ContentVersionRecord],
) -> None:
    pins = {
        UUID(str(item.item_id)): (UUID(str(item.content_version_id)), item.version_number)
        for item in (*revision.pages, *revision.global_sections)
    }
    if set(version_by_item) != set(pins):
        raise_render_invalid("BUILDER_RENDER_CONTENT_VERSION_INVALID")
    for item_id, (version_id, version_number) in pins.items():
        version = version_by_item[item_id]
        if (
            UUID(str(version.item_id)) != item_id
            or UUID(str(version.id)) != version_id
            or int(version.version) != version_number
            or not isinstance(version.fields_snapshot, dict)
        ):
            raise_render_invalid("BUILDER_RENDER_CONTENT_VERSION_INVALID", itemId=str(item_id))


def _validate_global_graph(revision: BuilderRevisionOut) -> None:
    graph = revision.global_section_graph
    if graph.unknown_references:
        raise_render_invalid("BUILDER_RENDER_GLOBAL_REFERENCE_UNKNOWN")
    if graph.missing_wireframe_references:
        raise_render_invalid("BUILDER_RENDER_GLOBAL_WIREFRAME_REQUIRED")
    if graph.cycles:
        raise_render_invalid(
            "BUILDER_RENDER_GLOBAL_REFERENCE_CYCLE",
            cycles=[[str(item) for item in cycle.item_path] for cycle in graph.cycles],
        )


def _expand_sections(
    *,
    source: RevisionSource,
    source_kind: SourceKind,
    sections: tuple[WireframeSectionV1, ...],
    global_by_id: Mapping[UUID, BuilderRevisionGlobalSectionOut],
    version_by_item: Mapping[UUID, ContentVersionRecord],
    catalog: ComponentCatalogV1,
    recipes: Mapping[tuple[str, str], DesignComponentRecipeV1],
    token_values: Mapping[str, TokenValue],
    lineage: tuple[BuilderRenderGlobalReferenceHopOut, ...],
    active: frozenset[UUID],
) -> tuple[BuilderRenderSectionOut, ...]:
    result: list[BuilderRenderSectionOut] = []
    source_item_id = UUID(str(source.item_id))
    fields = cast(JsonObject, version_by_item[source_item_id].fields_snapshot)
    for section in sections:
        if section.global_reference_id is not None:
            result.extend(
                _expand_reference(
                    source=source,
                    section=section,
                    global_by_id=global_by_id,
                    version_by_item=version_by_item,
                    catalog=catalog,
                    recipes=recipes,
                    token_values=token_values,
                    lineage=lineage,
                    active=active,
                )
            )
            continue
        result.append(
            _render_section(
                source=source,
                source_kind=source_kind,
                section=section,
                fields=fields,
                catalog=catalog,
                recipe=recipes.get((section.component_key, section.variant_key)),
                token_values=token_values,
                lineage=lineage,
            )
        )
    return tuple(result)


def _expand_reference(
    *,
    source: RevisionSource,
    section: WireframeSectionV1,
    global_by_id: Mapping[UUID, BuilderRevisionGlobalSectionOut],
    version_by_item: Mapping[UUID, ContentVersionRecord],
    catalog: ComponentCatalogV1,
    recipes: Mapping[tuple[str, str], DesignComponentRecipeV1],
    token_values: Mapping[str, TokenValue],
    lineage: tuple[BuilderRenderGlobalReferenceHopOut, ...],
    active: frozenset[UUID],
) -> tuple[BuilderRenderSectionOut, ...]:
    target_id = UUID(str(section.global_reference_id))
    target = global_by_id.get(target_id)
    if target is None or target.wireframe is None:
        raise_render_invalid("BUILDER_RENDER_GLOBAL_REFERENCE_INVALID", targetItemId=str(target_id))
    if target_id in active:
        raise_render_invalid("BUILDER_RENDER_GLOBAL_REFERENCE_CYCLE", targetItemId=str(target_id))
    hop = BuilderRenderGlobalReferenceHopOut(
        host_item_id=source.item_id,
        host_section_id=section.id,
        target_item_id=target.item_id,
    )
    return _expand_sections(
        source=target,
        source_kind="global_section",
        sections=target.wireframe.sections,
        global_by_id=global_by_id,
        version_by_item=version_by_item,
        catalog=catalog,
        recipes=recipes,
        token_values=token_values,
        lineage=(*lineage, hop),
        active=active | {target_id},
    )


def _render_section(
    *,
    source: RevisionSource,
    source_kind: SourceKind,
    section: WireframeSectionV1,
    fields: JsonObject,
    catalog: ComponentCatalogV1,
    recipe: DesignComponentRecipeV1 | None,
    token_values: Mapping[str, TokenValue],
    lineage: tuple[BuilderRenderGlobalReferenceHopOut, ...],
) -> BuilderRenderSectionOut:
    component = next((item for item in catalog.components if item.key == section.component_key), None)
    if component is None:
        raise_render_invalid("BUILDER_COMPONENT_NOT_REGISTERED", sectionId=section.id)
    variant = next((item for item in component.variants if item.key == section.variant_key), None)
    if variant is None:
        raise_render_invalid("BUILDER_COMPONENT_VARIANT_NOT_REGISTERED", sectionId=section.id)
    slots = _render_slots(section=section, component=component, fields=fields)
    _validate_responsive(section=section, component=component)
    _validate_interactions(section=section, component=component)
    lineage_key = "/".join(f"{hop.host_section_id}:{hop.target_item_id}" for hop in lineage)
    instance_id = f"{lineage_key}/{source.item_id}:{section.id}" if lineage_key else f"{source.item_id}:{section.id}"
    return BuilderRenderSectionOut(
        instance_id=instance_id,
        source_kind=source_kind,
        source_item_id=source.item_id,
        source_content_version_id=source.content_version_id,
        source_section_id=section.id,
        reference_lineage=lineage,
        intent_id=section.intent_id,
        component_key=section.component_key,
        variant_key=section.variant_key,
        label=section.label,
        slots=slots,
        responsive_rules=section.responsive_rules,
        interaction_rules=section.interaction_rules,
        asset_references=section.asset_references,
        component_recipe=render_component_recipe_with_blueprint(
            recipe=recipe,
            blueprint_section=_visual_section(source=source, section=section),
            token_values=token_values,
        ),
    )


def _visual_section(
    *,
    source: RevisionSource,
    section: WireframeSectionV1,
) -> VisualBlueprintSectionV1 | None:
    blueprint = source.visual_blueprint
    if blueprint is None:
        return None
    matching = next((item for item in blueprint.sections if item.section_id == section.id), None)
    if matching is not None and (
        matching.component_key != section.component_key or matching.variant_key != section.variant_key
    ):
        raise_render_invalid("BUILDER_VISUAL_BLUEPRINT_STALE", sectionId=section.id)
    return matching


def _render_slots(
    *,
    section: WireframeSectionV1,
    component: ComponentCatalogComponentV1,
    fields: JsonObject,
) -> tuple[BuilderRenderSlotOut, ...]:
    slot_by_key = {slot.key: slot for slot in component.slots}
    bound_keys: set[str] = set()
    result: list[BuilderRenderSlotOut] = []
    for binding in section.bindings:
        slot = slot_by_key.get(binding.slot_key)
        if slot is None:
            raise_render_invalid(
                "BUILDER_COMPONENT_SLOT_NOT_REGISTERED",
                sectionId=section.id,
                slotKey=binding.slot_key,
            )
        if binding.kind == "missing":
            raise_render_invalid("BUILDER_COMPONENT_SLOT_REQUIRED", sectionId=section.id, slotKey=binding.slot_key)
        if binding.kind not in slot.accepted_binding_kinds:
            raise_render_invalid(
                "BUILDER_COMPONENT_BINDING_KIND_UNSUPPORTED",
                sectionId=section.id,
                slotKey=slot.key,
            )
        result.append(_render_slot(section=section, slot=slot, binding=binding, fields=fields))
        bound_keys.add(slot.key)
    variant = next(item for item in component.variants if item.key == section.variant_key)
    required = {*(slot.key for slot in component.slots if slot.required), *variant.required_slot_keys}
    missing = sorted(required - bound_keys)
    if missing:
        raise_render_invalid(
            "BUILDER_COMPONENT_SLOT_REQUIRED",
            sectionId=section.id,
            slotKeys=cast(JsonValue, missing),
        )
    return tuple(result)


def _render_slot(
    *,
    section: WireframeSectionV1,
    slot: ComponentCatalogSlotV1,
    binding: WireframeBindingV1,
    fields: JsonObject,
) -> BuilderRenderSlotOut:
    if isinstance(binding, WireframeFieldBindingV1):
        if binding.field_key not in fields:
            raise_render_invalid(
                "BUILDER_RENDER_FIELD_REQUIRED",
                sectionId=section.id,
                slotKey=slot.key,
                fieldKey=binding.field_key,
            )
        raw_value = fields[binding.field_key]
        field_key = binding.field_key
    elif isinstance(binding, WireframeLiteralBindingV1):
        raw_value = binding.value
        field_key = None
    else:
        raise_render_invalid("BUILDER_COMPONENT_SLOT_REQUIRED", sectionId=section.id, slotKey=slot.key)
    return BuilderRenderSlotOut(
        key=slot.key,
        value_kind=slot.value_kind,
        value=_normalize_slot_value(
            value=raw_value,
            slot=slot,
            interactions=section.interaction_rules,
            section_id=section.id,
        ),
        source=binding.kind,
        field_key=field_key,
    )


def _normalize_slot_value(
    *,
    value: JsonValue,
    slot: ComponentCatalogSlotV1,
    interactions: tuple[WireframeInteractionRuleV1, ...],
    section_id: str,
) -> JsonValue:
    kind = slot.value_kind
    if kind in {"text", "rich-text"} and isinstance(value, str) and value.strip():
        return value
    if kind == "boolean" and isinstance(value, bool):
        return value
    if kind == "number" and isinstance(value, int | float) and not isinstance(value, bool):
        return value
    if kind == "image":
        return _normalize_image(value=value, section_id=section_id, slot_key=slot.key)
    if kind in {"action", "link"}:
        return _normalize_action(
            value=value,
            interactions=interactions,
            section_id=section_id,
            slot_key=slot.key,
        )
    if kind == "list" and isinstance(value, list):
        return cast(
            JsonValue,
            [_normalize_list_item(item=item, section_id=section_id, slot_key=slot.key) for item in value],
        )
    raise_render_invalid(
        "BUILDER_RENDER_SLOT_VALUE_INVALID",
        sectionId=section_id,
        slotKey=slot.key,
        valueKind=kind,
    )


def _normalize_image(*, value: JsonValue, section_id: str, slot_key: str) -> JsonValue:
    if isinstance(value, str) and value.strip():
        return {"src": value}
    if isinstance(value, dict) and set(value).issubset({"src", "alt"}):
        src = value.get("src")
        alt = value.get("alt")
        if isinstance(src, str) and src.strip() and (alt is None or isinstance(alt, str)):
            return cast(JsonValue, {"src": src, **({"alt": alt} if alt is not None else {})})
    raise_render_invalid(
        "BUILDER_RENDER_SLOT_VALUE_INVALID",
        sectionId=section_id,
        slotKey=slot_key,
        valueKind="image",
    )


def _normalize_action(
    *,
    value: JsonValue,
    interactions: tuple[WireframeInteractionRuleV1, ...],
    section_id: str,
    slot_key: str,
) -> JsonValue:
    label, declared_action, declared_target = _action_parts(
        value=value,
        section_id=section_id,
        slot_key=slot_key,
    )
    interaction = next(
        (
            item
            for item in interactions
            if item.action in {"navigate", "submit", "open"}
            and (declared_action is None or item.action == declared_action)
            and (declared_target is None or item.target == declared_target)
        ),
        None,
    )
    if interaction is None:
        raise_render_invalid(
            "BUILDER_RENDER_ACTION_INTERACTION_REQUIRED",
            sectionId=section_id,
            slotKey=slot_key,
        )
    return cast(
        JsonValue,
        {
            "label": label,
            "action": interaction.action,
            **({"target": interaction.target} if interaction.target is not None else {}),
        },
    )


def _action_parts(*, value: JsonValue, section_id: str, slot_key: str) -> tuple[str, str | None, str | None]:
    if isinstance(value, str) and value.strip():
        return value, None, None
    if not isinstance(value, dict) or not set(value).issubset({"label", "action", "target", "href"}):
        raise_render_invalid("BUILDER_RENDER_SLOT_VALUE_INVALID", sectionId=section_id, slotKey=slot_key)
    label = value.get("label")
    action = value.get("action")
    target = value.get("target", value.get("href"))
    if (
        not isinstance(label, str)
        or not label.strip()
        or (action is not None and not isinstance(action, str))
        or (target is not None and not isinstance(target, str))
    ):
        raise_render_invalid("BUILDER_RENDER_SLOT_VALUE_INVALID", sectionId=section_id, slotKey=slot_key)
    return label, action, target


def _normalize_list_item(*, item: JsonValue, section_id: str, slot_key: str) -> JsonObject:
    if isinstance(item, str) and item.strip():
        return {"label": item}
    allowed = {"label", "title", "body", "href", "image"}
    if isinstance(item, dict) and set(item).issubset(allowed):
        has_label = any(isinstance(item.get(key), str) and cast(str, item[key]).strip() for key in ("label", "title"))
        if has_label and all(value is None or isinstance(value, str) for value in item.values()):
            return cast(JsonObject, dict(item))
    raise_render_invalid("BUILDER_RENDER_SLOT_VALUE_INVALID", sectionId=section_id, slotKey=slot_key)


def _validate_responsive(*, section: WireframeSectionV1, component: ComponentCatalogComponentV1) -> None:
    variant = next(item for item in component.variants if item.key == section.variant_key)
    for rule in section.responsive_rules:
        if rule.layout not in variant.supported_responsive_layouts or rule.columns > variant.max_columns:
            raise_render_invalid(
                "BUILDER_COMPONENT_RESPONSIVE_RULE_UNSUPPORTED",
                sectionId=section.id,
                breakpoint=rule.breakpoint,
            )


def _validate_interactions(*, section: WireframeSectionV1, component: ComponentCatalogComponentV1) -> None:
    contracts = {(item.event, item.action): item for item in component.interactions}
    for rule in section.interaction_rules:
        contract = contracts.get((rule.event, rule.action))
        if contract is None or (contract.target_required and rule.target is None):
            raise_render_invalid("BUILDER_COMPONENT_INTERACTION_UNSUPPORTED", sectionId=section.id)


__all__ = ["build_render_sections", "validate_render_version_inputs"]
