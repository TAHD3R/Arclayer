from __future__ import annotations

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.common.types.json_types import JsonObject, JsonValue
from src.modules.projects.builder.wireframe_schema import (
    WireframeDocumentV1,
    WireframeLiteralBindingV1,
)
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1


class ComponentCatalogFindingV1(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid", frozen=True)

    code: str = Field(min_length=1, max_length=96)
    meta: JsonObject = Field(default_factory=dict)


def validate_wireframe_component_compatibility(
    *,
    document: WireframeDocumentV1,
    catalog: ComponentCatalogV1,
) -> tuple[ComponentCatalogFindingV1, ...]:
    if document.component_catalog_version != catalog.catalog_version:
        return (
            _finding(
                "BUILDER_COMPONENT_CATALOG_MISMATCH",
                expectedCatalogVersion=catalog.catalog_version,
                actualCatalogVersion=document.component_catalog_version,
            ),
        )

    components = {component.key: component for component in catalog.components}
    findings: list[ComponentCatalogFindingV1] = []
    for section in document.sections:
        component = components.get(section.component_key)
        if component is None:
            findings.append(
                _finding(
                    "BUILDER_COMPONENT_NOT_REGISTERED",
                    sectionId=section.id,
                    componentKey=section.component_key,
                )
            )
            continue
        variants = {variant.key: variant for variant in component.variants}
        variant = variants.get(section.variant_key)
        if variant is None:
            findings.append(
                _finding(
                    "BUILDER_COMPONENT_VARIANT_NOT_REGISTERED",
                    sectionId=section.id,
                    componentKey=section.component_key,
                    variantKey=section.variant_key,
                )
            )
            continue
        slots = {slot.key: slot for slot in component.slots}
        bound_slot_keys: set[str] = set()
        for binding in section.bindings:
            slot = slots.get(binding.slot_key)
            if slot is None:
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_SLOT_NOT_REGISTERED",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        slotKey=binding.slot_key,
                    )
                )
                continue
            if binding.kind == "missing":
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_SLOT_REQUIRED",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        variantKey=section.variant_key,
                        slotKey=binding.slot_key,
                    )
                )
                continue
            bound_slot_keys.add(binding.slot_key)
            if binding.kind not in slot.accepted_binding_kinds:
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_BINDING_KIND_UNSUPPORTED",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        slotKey=binding.slot_key,
                        bindingKind=binding.kind,
                    )
                )
            elif isinstance(binding, WireframeLiteralBindingV1) and not _literal_matches_slot(
                value=binding.value,
                value_kind=slot.value_kind,
            ):
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_LITERAL_TYPE_INVALID",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        slotKey=binding.slot_key,
                        valueKind=slot.value_kind,
                    )
                )
        required_slots = {
            *(slot.key for slot in component.slots if slot.required),
            *variant.required_slot_keys,
        }
        for slot_key in sorted(required_slots - bound_slot_keys):
            findings.append(
                _finding(
                    "BUILDER_COMPONENT_SLOT_REQUIRED",
                    sectionId=section.id,
                    componentKey=section.component_key,
                    variantKey=section.variant_key,
                    slotKey=slot_key,
                )
            )
        for rule in section.responsive_rules:
            if rule.layout not in variant.supported_responsive_layouts or rule.columns > variant.max_columns:
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_RESPONSIVE_RULE_UNSUPPORTED",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        variantKey=section.variant_key,
                        breakpoint=rule.breakpoint,
                        layout=rule.layout,
                        columns=rule.columns,
                    )
                )
        supported_interactions = {(item.event, item.action): item for item in component.interactions}
        for rule in section.interaction_rules:
            contract = supported_interactions.get((rule.event, rule.action))
            if contract is None or (contract.target_required and rule.target is None):
                findings.append(
                    _finding(
                        "BUILDER_COMPONENT_INTERACTION_UNSUPPORTED",
                        sectionId=section.id,
                        componentKey=section.component_key,
                        event=rule.event,
                        action=rule.action,
                    )
                )
    return tuple(findings)


def _literal_matches_slot(*, value: object, value_kind: str) -> bool:
    if value_kind in {"text", "rich-text"}:
        return isinstance(value, str)
    if value_kind == "boolean":
        return isinstance(value, bool)
    if value_kind == "number":
        return isinstance(value, int | float) and not isinstance(value, bool)
    if value_kind == "list":
        return isinstance(value, list)
    if value_kind in {"image", "link", "action"}:
        return isinstance(value, str | dict)
    return False


def _finding(code: str, **meta: JsonValue) -> ComponentCatalogFindingV1:
    return ComponentCatalogFindingV1(code=code, meta=meta)


__all__ = ["ComponentCatalogFindingV1", "validate_wireframe_component_compatibility"]
