from __future__ import annotations

from uuid import uuid4

import pytest

from src.modules.projects.builder.wireframe_schema import (
    WireframeDocumentV1,
    WireframeInteractionRuleV1,
    WireframeLiteralBindingV1,
    WireframeResponsiveRuleV1,
    WireframeSectionV1,
)
from src.modules.sites.component_catalogs.official import get_official_component_catalog_registry
from src.modules.sites.component_catalogs.registry import ComponentCatalogRegistry
from src.modules.sites.component_catalogs.schema import ComponentCatalogV1
from src.modules.sites.component_catalogs.wireframe_validation import validate_wireframe_component_compatibility

CATALOG_VERSION = "arclayer-wireframe-v1"


def _catalog() -> ComponentCatalogV1:
    catalog = get_official_component_catalog_registry().resolve(CATALOG_VERSION)
    if catalog is None:
        raise AssertionError("Official catalog is unavailable")
    return catalog


def test_packaged_catalog_is_deterministic_registered_and_bilingual() -> None:
    catalog = _catalog()
    registry = get_official_component_catalog_registry()

    assert catalog.checksum == "sha256:4e0ac533318237a2f30d526450e9a802af16712e1039836e2149b42bbacd93e2"
    assert registry.resolve(CATALOG_VERSION) is catalog
    assert [component.key for component in catalog.components] == [
        "site.header",
        "landing.hero",
        "landing.feature-grid",
        "landing.cta",
        "site.footer",
    ]
    assert all(set(component.label_by_locale) == {"zh-CN", "en-US"} for component in catalog.components)
    with pytest.raises(ValueError, match="Duplicate component catalog version"):
        ComponentCatalogRegistry((catalog, catalog))


def test_wireframe_validation_reports_registered_contract_blockers() -> None:
    catalog = _catalog()
    document = WireframeDocumentV1(
        page_item_id=uuid4(),
        design_system_version_id=uuid4(),
        component_catalog_version=CATALOG_VERSION,
        sections=(
            WireframeSectionV1(
                id="unknown-component",
                intent_id="intent.unknown-component",
                component_key="landing.unregistered",
                variant_key="default",
                label="Unknown component",
            ),
            WireframeSectionV1(
                id="unknown-variant",
                intent_id="intent.unknown-variant",
                component_key="landing.hero",
                variant_key="unregistered",
                label="Unknown variant",
            ),
            WireframeSectionV1(
                id="invalid-contract",
                intent_id="intent.invalid-contract",
                component_key="landing.hero",
                variant_key="default",
                label="Invalid contract",
                bindings=(
                    WireframeLiteralBindingV1(kind="literal", slot_key="heading", value=42),
                    WireframeLiteralBindingV1(kind="literal", slot_key="ghost", value="Unknown"),
                ),
                responsive_rules=(
                    WireframeResponsiveRuleV1(
                        breakpoint="desktop",
                        layout="overlay",
                        columns=3,
                    ),
                ),
                interaction_rules=(WireframeInteractionRuleV1(event="submit", action="submit"),),
            ),
        ),
    )

    codes = {
        finding.code
        for finding in validate_wireframe_component_compatibility(
            document=document,
            catalog=catalog,
        )
    }

    assert codes == {
        "BUILDER_COMPONENT_NOT_REGISTERED",
        "BUILDER_COMPONENT_VARIANT_NOT_REGISTERED",
        "BUILDER_COMPONENT_LITERAL_TYPE_INVALID",
        "BUILDER_COMPONENT_SLOT_NOT_REGISTERED",
        "BUILDER_COMPONENT_RESPONSIVE_RULE_UNSUPPORTED",
        "BUILDER_COMPONENT_INTERACTION_UNSUPPORTED",
    }


def test_wireframe_catalog_version_must_match_exactly() -> None:
    document = WireframeDocumentV1(
        page_item_id=uuid4(),
        design_system_version_id=uuid4(),
        component_catalog_version="another-catalog-v1",
    )
    findings = validate_wireframe_component_compatibility(document=document, catalog=_catalog())

    assert [finding.code for finding in findings] == ["BUILDER_COMPONENT_CATALOG_MISMATCH"]
