from __future__ import annotations

from uuid import UUID

import pytest

from src.core.exceptions import Conflict
from src.models.builder._enums import BuilderProvenanceSource
from src.modules.projects.builder.design_change_set import analyze_design_change_set
from src.modules.projects.builder.design_change_set_schema import BuilderDesignOperationV1
from src.modules.projects.builder.design_contract_context import ResolvedBuilderDesignContract
from src.modules.projects.builder.schema import BuilderPageNodeSnapshotV1
from src.modules.projects.builder.snapshot import canonical_hash
from tests.modules.projects.test_site_builder_render_document_unit import _render_fixture


def _context():
    fixture = _render_fixture()
    page = fixture.revision.pages[0]
    assert page.wireframe is not None
    structure = fixture.revision.content_structure_revision.snapshot.model_copy(
        update={
            "pages": (
                BuilderPageNodeSnapshotV1(
                    item_id=page.item_id,
                    sort_order=0,
                    routes=page.routes,
                ),
            )
        }
    )
    return fixture, page, structure


def _operation(payload: dict[str, object]) -> BuilderDesignOperationV1:
    from pydantic import TypeAdapter

    return TypeAdapter(BuilderDesignOperationV1).validate_python(payload)


def test_design_change_set_initializes_and_sets_typed_style_token() -> None:
    fixture, page, structure = _context()
    wireframe = page.wireframe
    assert wireframe is not None
    checksum = canonical_hash(wireframe.model_dump(mode="json", by_alias=True))
    common = {
        "itemId": str(page.item_id),
        "expectedDraftVersion": page.version_number,
        "sourceWireframeChecksum": checksum,
    }

    result = analyze_design_change_set(
        structure=structure,
        manifest=fixture.revision.site_revision,
        wireframes_by_item={UUID(str(page.item_id)): wireframe},
        blueprints_by_item={UUID(str(page.item_id)): None},
        design_contract=ResolvedBuilderDesignContract(
            manifest=fixture.design_manifest,
            catalog=fixture.catalog,
        ),
        operations=(
            _operation({"type": "design.initialize", "operationId": "init", **common}),
            _operation({
                "type": "design.style.set",
                "operationId": "style",
                "sectionId": "hero",
                "stateKey": "default",
                "styleSlotKey": "surface.background",
                "tokenPath": "semantic.color.action.primary",
                **common,
            }),
        ),
        provenance_source=BuilderProvenanceSource.HUMAN,
    )

    candidate = result.design_candidates[0]
    assert candidate.base_content_version_id == page.content_version_id
    assert candidate.visual_blueprint.sections[0].states[0].style_tokens == {
        "surface.background": "semantic.color.action.primary"
    }
    assert result.approval_class.value == "none"


def test_design_change_set_rejects_duplicate_semantic_write() -> None:
    fixture, page, structure = _context()
    wireframe = page.wireframe
    assert wireframe is not None
    checksum = canonical_hash(wireframe.model_dump(mode="json", by_alias=True))
    common = {
        "itemId": str(page.item_id),
        "expectedDraftVersion": page.version_number,
        "sourceWireframeChecksum": checksum,
        "sectionId": "hero",
        "stateKey": "default",
        "styleSlotKey": "surface.background",
    }
    operations = (
        _operation({
            "type": "design.initialize",
            "operationId": "init",
            "itemId": str(page.item_id),
            "expectedDraftVersion": page.version_number,
            "sourceWireframeChecksum": checksum,
        }),
        _operation({
            "type": "design.style.set",
            "operationId": "first",
            "tokenPath": "semantic.color.action.primary",
            **common,
        }),
        _operation({
            "type": "design.style.clear",
            "operationId": "second",
            **common,
        }),
    )

    with pytest.raises(Conflict) as exc_info:
        analyze_design_change_set(
            structure=structure,
            manifest=fixture.revision.site_revision,
            wireframes_by_item={UUID(str(page.item_id)): wireframe},
            blueprints_by_item={UUID(str(page.item_id)): None},
            design_contract=ResolvedBuilderDesignContract(
                manifest=fixture.design_manifest,
                catalog=fixture.catalog,
            ),
            operations=operations,
            provenance_source=BuilderProvenanceSource.HUMAN,
        )

    assert exc_info.value.error == "BUILDER_DESIGN_OPERATION_DUPLICATE"
