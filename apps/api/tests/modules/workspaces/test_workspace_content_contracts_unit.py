from __future__ import annotations

from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.modules.projects.content.contracts.schema import (
    ContentItemOut,
    ContentModelCapability,
    ContentModelImpactPreviewOut,
    ContentModelOut,
    ContentPresentationOut,
    ContentVersionOut,
)


def test_content_model_out_exposes_capability_oriented_contract() -> None:
    model = ContentModelOut(
        id=uuid4(),
        workspace_id=uuid4(),
        site_id=uuid4(),
        singular_key="page",
        plural_key="pages",
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
        contract_registry={
            "protocol_key": "page",
            "protocol_version": 1,
            "category": "site_builder",
            "system_managed": True,
            "boundaries": {
                "system_fields": [
                    {
                        "key": "title",
                        "label": "Title",
                        "scalar": "text",
                        "required": True,
                    },
                    {
                        "key": "path",
                        "label": "Path",
                        "scalar": "text",
                        "required": True,
                    },
                    {
                        "key": "route_pattern",
                        "label": "Route Pattern",
                        "scalar": "text",
                        "required": False,
                    },
                ],
                "custom_fields": [],
                "locked_field_keys": ["title", "path", "route_pattern"],
                "custom_field_count": 0,
            },
            "capabilities": {
                "workflow": ["versioned", "publishable"],
                "delivery": ["routable", "treeable", "publishable"],
                "graphql": [],
            },
            "workflow_policy": {"supportsSchedule": True},
            "delivery_policy": {
                "routing": {"mode": "static_or_dynamic"},
                "presentation": {"allowed": ["visual_blueprint", "seo"]},
                "seo": None,
                "surface": {"allowedSurfaces": ["canvas"]},
            },
            "graphql_policy": {"enabled": False},
        },
        field_schema={"title": {"type": "text"}},
        relation_schema={"layout": {"target": "layout", "kind": "one"}},
        routing_schema={"mode": "static_or_dynamic"},
        presentation_schema={"allowed": ["visual_blueprint", "seo"]},
        workflow_policy={"supportsSchedule": True},
        view_schema={"defaultView": "tree"},
        updated_at=datetime.now(UTC),
        updated_by_user_id=uuid4(),
        updated_by={
            "user_id": str(uuid4()),
            "username": "admin",
        },
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
    assert payload["contract_registry"]["protocol_key"] == "page"
    assert payload["contract_registry"]["boundaries"]["locked_field_keys"] == ["title", "path", "route_pattern"]
    assert payload["contract_registry"]["capabilities"]["workflow"] == ["versioned", "publishable"]
    assert payload["contract_registry"]["delivery_policy"] == {
        "routing": {"mode": "static_or_dynamic"},
        "presentation": {"allowed": ["visual_blueprint", "seo"]},
        "seo": None,
        "surface": {"allowedSurfaces": ["canvas"]},
    }
    assert set(ContentModelCapability.__args__) >= {"versioned", "routable", "visual_editable"}


def test_content_model_impact_preview_out_exposes_change_plan() -> None:
    preview = ContentModelImpactPreviewOut(
        affected_items_count=1,
        recovery_items_count=0,
        reshape_items_count=1,
        has_blocking_changes=False,
        preview_token="preview-token",
        impact={
            "has_breaking_changes": False,
            "breaking_changes": [],
            "warnings": [],
        },
        change_plan={
            "revisions": {
                "current_draft_revision": 2,
                "published_revision": 1,
                "next_draft_revision": 3,
            },
            "current_snapshot": {
                "stage": "current_draft",
                "revision": 2,
                "field_count": 3,
                "relation_count": 1,
                "view_count": 1,
                "payload": {"singular_key": "page", "plural_key": "pages", "fields": [{"key": "title"}]},
            },
            "next_snapshot": {
                "stage": "next_draft",
                "revision": 3,
                "field_count": 4,
                "relation_count": 1,
                "view_count": 1,
                "payload": {
                    "singular_key": "page",
                    "plural_key": "pages",
                    "fields": [{"key": "title"}, {"key": "summary"}],
                },
            },
            "published_snapshot": {
                "stage": "published",
                "revision": 1,
                "field_count": 3,
                "relation_count": 1,
                "view_count": 1,
                "payload": {"singular_key": "page", "plural_key": "pages", "fields": [{"key": "title"}]},
            },
            "diff": {
                "has_changes": True,
                "has_breaking_changes": False,
                "breaking_change_count": 0,
                "entries": [
                    {
                        "kind": "field",
                        "operation": "added",
                        "target": "fields.summary",
                        "summary": "Field 'summary' will be added to the next draft.",
                        "breaking": False,
                        "before": None,
                        "after": {"key": "summary"},
                    }
                ],
            },
            "apply_gates": [
                {
                    "code": "impact_scope",
                    "status": "review",
                    "title": "Impact scope",
                    "detail": "1 items will need lifecycle review.",
                }
            ],
            "apply_ready": True,
        },
    )

    payload = preview.model_dump(mode="json")

    assert payload["change_plan"]["revisions"] == {
        "current_draft_revision": 2,
        "published_revision": 1,
        "next_draft_revision": 3,
    }
    assert payload["change_plan"]["diff"]["entries"][0]["target"] == "fields.summary"


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
