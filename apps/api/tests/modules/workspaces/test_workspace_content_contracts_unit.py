from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.workspaces.content.contracts.schema import (
    ContentItemOut,
    ContentModelCapability,
    ContentModelOut,
    ContentPresentationOut,
    ContentVersionOut,
)


def test_content_model_out_exposes_capability_oriented_contract() -> None:
    model = ContentModelOut(
        id=uuid4(),
        workspace_id=uuid4(),
        site_id=uuid4(),
        key="page",
        name="Page",
        description="Reusable routed pages for the site builder.",
        protocol_key="page",
        protocol_version=1,
        system_managed=True,
        system_field_keys=["title", "path", "route_pattern"],
        draft_contract_revision=2,
        published_contract_revision=1,
        category="site_builder",
        capabilities=["versioned", "routable", "treeable", "visual_editable", "publishable"],
        default_editor="visual",
        default_role="page",
        default_posture="page",
        default_surface="canvas",
        starter_pack_policy={"preset": "page"},
        surface_policy={"allowedSurfaces": ["canvas"]},
        field_schema={"title": {"type": "text"}},
        relation_schema={"layout": {"target": "layout", "kind": "one"}},
        routing_schema={"mode": "static_or_dynamic"},
        presentation_schema={"allowed": ["visual_blueprint", "seo"]},
        workflow_policy={"supportsSchedule": True},
        view_schema={"defaultView": "tree"},
    )

    payload = model.model_dump(mode="json")

    assert payload["category"] == "site_builder"
    assert payload["description"] == "Reusable routed pages for the site builder."
    assert payload["protocol_key"] == "page"
    assert payload["protocol_version"] == 1
    assert payload["system_managed"] is True
    assert payload["system_field_keys"] == ["title", "path", "route_pattern"]
    assert payload["draft_contract_revision"] == 2
    assert payload["published_contract_revision"] == 1
    assert payload["default_editor"] == "visual"
    assert payload["default_role"] == "page"
    assert payload["default_posture"] == "page"
    assert payload["default_surface"] == "canvas"
    assert payload["capabilities"] == [
        "versioned",
        "routable",
        "treeable",
        "visual_editable",
        "publishable",
    ]
    assert set(ContentModelCapability.__args__) >= {"versioned", "routable", "visual_editable"}


def test_content_model_out_rejects_unknown_capability() -> None:
    with pytest.raises(ValidationError):
        ContentModelOut(
            id=uuid4(),
            workspace_id=uuid4(),
            site_id=uuid4(),
            key="page",
            name="Page",
            protocol_key="page",
            category="site_builder",
            capabilities=cast(list[ContentModelCapability], ["page_magic"]),
            default_editor="visual",
        )


def test_content_item_out_is_identity_shell_without_page_specific_fields() -> None:
    assert set(ContentItemOut.model_fields) >= {
        "id",
        "workspace_id",
        "site_id",
        "model_id",
        "model_key",
        "slug",
        "title",
        "status",
        "visibility",
        "locale",
        "bootstrap_preset_key",
        "bootstrap_preset_state",
        "capability_pack_ids",
        "resolved_role",
        "resolved_posture",
        "resolved_surface",
        "shape_state",
        "shape_reason_code",
        "shape_reason_meta",
        "open_intent",
        "continuation_target",
        "draft_version",
        "published_version",
        "updated_at",
    }
    assert {"path", "parent_entry_id", "page_blueprint"}.isdisjoint(ContentItemOut.model_fields)
    assert ContentItemOut.model_fields["model_id"].is_required() is False
    assert ContentItemOut.model_fields["model_key"].is_required() is False


def test_content_version_out_supports_multiple_presentations() -> None:
    version = ContentVersionOut(
        item_id=uuid4(),
        version_number=3,
        state="draft",
        created_at=datetime(2026, 3, 7, 12, 0, tzinfo=UTC),
        created_by_user_id=uuid4(),
        fields_snapshot={"title": "Pricing"},
        presentations=[
            ContentPresentationOut(kind="visual_blueprint", payload={"root": "page_root"}),
            ContentPresentationOut(kind="seo", payload={"title": "Pricing"}),
        ],
        change_summary="Update hero and seo",
    )

    payload = version.model_dump(mode="json")

    assert payload["version_number"] == 3
    assert payload["state"] == "draft"
    assert [item["kind"] for item in payload["presentations"]] == ["visual_blueprint", "seo"]
