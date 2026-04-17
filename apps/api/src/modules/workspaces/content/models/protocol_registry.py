from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class OfficialModelFieldDefinition:
    key: str
    label: str
    scalar: str
    required: bool
    config: dict[str, Any] | None = None


@dataclass(frozen=True)
class OfficialModelProtocol:
    key: str
    name: str
    description: str
    category: str
    default_editor: str
    default_role: str
    default_posture: str
    default_surface: str
    capabilities: tuple[str, ...]
    routing_policy: dict[str, Any] | None
    presentation_policy: dict[str, Any] | None
    seo_policy: dict[str, Any] | None
    starter_pack_policy: dict[str, Any] | None
    surface_policy: dict[str, Any] | None
    workflow_policy: dict[str, Any] | None
    system_fields: tuple[OfficialModelFieldDefinition, ...]
    protocol_version: int = 1
    system_managed: bool = True


_OFFICIAL_MODEL_PROTOCOLS: dict[str, OfficialModelProtocol] = {
    "article": OfficialModelProtocol(
        key="article",
        name="Article",
        description="Structured long-form content with SEO and publishing semantics.",
        category="content_library",
        default_editor="rich_text",
        default_role="article",
        default_posture="structured",
        default_surface="writing",
        capabilities=(
            "versioned",
            "rich_text_editable",
            "has_relations",
            "publishable",
            "seo_managed",
        ),
        routing_policy={"mode": "none"},
        presentation_policy={"allowedKinds": ["form_data", "rich_text_document", "seo"]},
        seo_policy={"titleField": "title", "descriptionField": "summary"},
        starter_pack_policy={"mode": "article"},
        surface_policy={"allowedSurfaces": ["writing", "structured"]},
        workflow_policy={"states": ["draft", "published"], "initial_state": "draft"},
        system_fields=(
            OfficialModelFieldDefinition(key="title", label="Title", scalar="text", required=True),
            OfficialModelFieldDefinition(key="slug", label="Slug", scalar="text", required=True),
            OfficialModelFieldDefinition(key="summary", label="Summary", scalar="long_text", required=False),
            OfficialModelFieldDefinition(key="content", label="Content", scalar="long_text", required=False),
            OfficialModelFieldDefinition(
                key="published_at",
                label="Published At",
                scalar="date_time",
                required=False,
            ),
        ),
    ),
    "page": OfficialModelProtocol(
        key="page",
        name="Page",
        description="Route-owned page protocol for static and dynamic delivery.",
        category="site_builder",
        default_editor="visual",
        default_role="page",
        default_posture="page",
        default_surface="canvas",
        capabilities=(
            "versioned",
            "routable",
            "treeable",
            "visual_editable",
            "has_slots",
            "publishable",
            "seo_managed",
        ),
        routing_policy={"mode": "localized", "slug_field": "path"},
        presentation_policy={"allowedKinds": ["form_data", "visual_blueprint", "slot_mapping", "seo"]},
        seo_policy={"titleField": "title"},
        starter_pack_policy={"mode": "page"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
        workflow_policy={"states": ["draft", "published"], "initial_state": "draft"},
        system_fields=(
            OfficialModelFieldDefinition(key="title", label="Title", scalar="text", required=True),
            OfficialModelFieldDefinition(key="path", label="Path", scalar="text", required=True),
            OfficialModelFieldDefinition(
                key="route_pattern",
                label="Route Pattern",
                scalar="text",
                required=False,
            ),
        ),
    ),
    "reusable-section": OfficialModelProtocol(
        key="reusable-section",
        name="Reusable Section",
        description="Reusable visual section protocol for slots, globals, and composition.",
        category="site_builder",
        default_editor="visual",
        default_role="reusable-section",
        default_posture="composition",
        default_surface="canvas",
        capabilities=("versioned", "visual_editable", "has_slots", "publishable", "localizable"),
        routing_policy={"mode": "none"},
        presentation_policy={"allowedKinds": ["form_data", "visual_blueprint", "slot_mapping"]},
        seo_policy=None,
        starter_pack_policy={"mode": "section"},
        surface_policy={"allowedSurfaces": ["canvas", "structured"]},
        workflow_policy={"states": ["draft", "published"], "initial_state": "draft"},
        system_fields=(
            OfficialModelFieldDefinition(key="title", label="Title", scalar="text", required=True),
            OfficialModelFieldDefinition(
                key="section_key",
                label="Section Key",
                scalar="text",
                required=True,
            ),
            OfficialModelFieldDefinition(
                key="props_defaults",
                label="Props Defaults",
                scalar="json",
                required=False,
            ),
        ),
    ),
    "category": OfficialModelProtocol(
        key="category",
        name="Category",
        description="Taxonomy protocol for relation modeling and primary-context lookups.",
        category="content_library",
        default_editor="form",
        default_role="taxonomy",
        default_posture="structured",
        default_surface="structured",
        capabilities=("versioned", "queryable", "has_relations", "publishable", "localizable"),
        routing_policy={"mode": "single", "slug_field": "slug"},
        presentation_policy={"allowedKinds": ["form_data", "seo"]},
        seo_policy={"titleField": "name", "descriptionField": "description"},
        starter_pack_policy={"mode": "category"},
        surface_policy={"allowedSurfaces": ["structured"]},
        workflow_policy={"states": ["draft", "published"], "initial_state": "draft"},
        system_fields=(
            OfficialModelFieldDefinition(key="name", label="Name", scalar="text", required=True),
            OfficialModelFieldDefinition(key="slug", label="Slug", scalar="text", required=True),
            OfficialModelFieldDefinition(
                key="description",
                label="Description",
                scalar="long_text",
                required=False,
            ),
        ),
    ),
}


def list_official_model_protocols() -> tuple[OfficialModelProtocol, ...]:
    return tuple(_OFFICIAL_MODEL_PROTOCOLS.values())


def get_official_model_protocol(key: str | None) -> OfficialModelProtocol | None:
    normalized = (key or "").strip()
    if not normalized:
        return None
    return _OFFICIAL_MODEL_PROTOCOLS.get(normalized)


def is_official_model_key(key: str | None) -> bool:
    return get_official_model_protocol(key) is not None
