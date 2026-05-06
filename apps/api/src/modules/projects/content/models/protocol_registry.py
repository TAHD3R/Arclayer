from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class OfficialModelFieldDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    key: str
    label: str
    scalar: str
    required: bool
    config: dict[str, Any] | None = None


class OfficialModelGraphQLSingleQuery(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str
    argument: str
    resolver: str


class OfficialModelGraphQLFilterDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    public_name: str
    field_key: str
    operator: Literal["exact", "contains"]


class OfficialModelGraphQLSortDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)
    public_name: str
    field_key: str


class OfficialModelGraphQLPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)
    enabled: bool
    entry_type: str
    list_query: str
    single_query: OfficialModelGraphQLSingleQuery
    filters: tuple[OfficialModelGraphQLFilterDefinition, ...]
    sorts: tuple[OfficialModelGraphQLSortDefinition, ...]
    custom_fields_container: str = "customFields"
    schema_field_provider: str = "official-protocol-system-fields"
    query_post_processor: str = "official-protocol-query-contract"


class OfficialModelProtocol(BaseModel):
    model_config = ConfigDict(frozen=True)
    key: str
    singular_key: str
    plural_key: str
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
    graphql_policy: OfficialModelGraphQLPolicy
    system_fields: tuple[OfficialModelFieldDefinition, ...]
    protocol_version: int = 1
    system_managed: bool = True


_OFFICIAL_MODEL_PROTOCOLS: dict[str, OfficialModelProtocol] = {
    "article": OfficialModelProtocol(
        key="article",
        singular_key="article",
        plural_key="articles",
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
        graphql_policy=OfficialModelGraphQLPolicy(
            enabled=True,
            entry_type="ArticleEntry",
            list_query="articles",
            single_query=OfficialModelGraphQLSingleQuery(
                name="articleBySlug",
                argument="slug",
                resolver="get_record_by_slug",
            ),
            filters=(
                OfficialModelGraphQLFilterDefinition(public_name="slug", field_key="slug", operator="exact"),
                OfficialModelGraphQLFilterDefinition(
                    public_name="titleContains", field_key="title", operator="contains"
                ),
                OfficialModelGraphQLFilterDefinition(
                    public_name="revisionState", field_key="revision_state", operator="exact"
                ),
            ),
            sorts=(
                OfficialModelGraphQLSortDefinition(public_name="TITLE", field_key="title"),
                OfficialModelGraphQLSortDefinition(public_name="SLUG", field_key="slug"),
                OfficialModelGraphQLSortDefinition(public_name="REVISION", field_key="revision"),
            ),
        ),
        system_fields=(
            OfficialModelFieldDefinition(key="title", label="Title", scalar="text", required=True),
            OfficialModelFieldDefinition(key="slug", label="Slug", scalar="text", required=True),
            OfficialModelFieldDefinition(key="summary", label="Summary", scalar="long_text", required=False),
            OfficialModelFieldDefinition(key="content", label="Content", scalar="long_text", required=False),
            OfficialModelFieldDefinition(key="published_at", label="Published At", scalar="date_time", required=False),
        ),
    ),
    "page": OfficialModelProtocol(
        key="page",
        singular_key="page",
        plural_key="pages",
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
        graphql_policy=OfficialModelGraphQLPolicy(
            enabled=True,
            entry_type="PageEntry",
            list_query="pages",
            single_query=OfficialModelGraphQLSingleQuery(
                name="pageEntryByPath",
                argument="path",
                resolver="get_page_record_by_path",
            ),
            filters=(
                OfficialModelGraphQLFilterDefinition(public_name="path", field_key="path", operator="exact"),
                OfficialModelGraphQLFilterDefinition(
                    public_name="titleContains", field_key="title", operator="contains"
                ),
                OfficialModelGraphQLFilterDefinition(
                    public_name="revisionState", field_key="revision_state", operator="exact"
                ),
            ),
            sorts=(
                OfficialModelGraphQLSortDefinition(public_name="TITLE", field_key="title"),
                OfficialModelGraphQLSortDefinition(public_name="PATH", field_key="path"),
                OfficialModelGraphQLSortDefinition(public_name="REVISION", field_key="revision"),
            ),
        ),
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
        singular_key="reusable-section",
        plural_key="reusable-sections",
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
        graphql_policy=OfficialModelGraphQLPolicy(
            enabled=True,
            entry_type="ReusableSectionEntry",
            list_query="reusableSections",
            single_query=OfficialModelGraphQLSingleQuery(
                name="reusableSectionByAlias",
                argument="alias",
                resolver="get_reusable_section_record_by_alias",
            ),
            filters=(
                OfficialModelGraphQLFilterDefinition(
                    public_name="sectionKey", field_key="section_key", operator="exact"
                ),
                OfficialModelGraphQLFilterDefinition(
                    public_name="titleContains", field_key="title", operator="contains"
                ),
                OfficialModelGraphQLFilterDefinition(
                    public_name="revisionState", field_key="revision_state", operator="exact"
                ),
            ),
            sorts=(
                OfficialModelGraphQLSortDefinition(public_name="TITLE", field_key="title"),
                OfficialModelGraphQLSortDefinition(public_name="SECTION_KEY", field_key="section_key"),
                OfficialModelGraphQLSortDefinition(public_name="REVISION", field_key="revision"),
            ),
        ),
        system_fields=(
            OfficialModelFieldDefinition(key="title", label="Title", scalar="text", required=True),
            OfficialModelFieldDefinition(key="section_key", label="Section Key", scalar="text", required=True),
            OfficialModelFieldDefinition(key="props_defaults", label="Props Defaults", scalar="json", required=False),
        ),
    ),
    "category": OfficialModelProtocol(
        key="category",
        singular_key="category",
        plural_key="categories",
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
        graphql_policy=OfficialModelGraphQLPolicy(
            enabled=True,
            entry_type="CategoryEntry",
            list_query="categories",
            single_query=OfficialModelGraphQLSingleQuery(
                name="categoryBySlug",
                argument="slug",
                resolver="get_record_by_slug",
            ),
            filters=(
                OfficialModelGraphQLFilterDefinition(public_name="slug", field_key="slug", operator="exact"),
                OfficialModelGraphQLFilterDefinition(public_name="nameContains", field_key="name", operator="contains"),
                OfficialModelGraphQLFilterDefinition(
                    public_name="revisionState", field_key="revision_state", operator="exact"
                ),
            ),
            sorts=(
                OfficialModelGraphQLSortDefinition(public_name="NAME", field_key="name"),
                OfficialModelGraphQLSortDefinition(public_name="SLUG", field_key="slug"),
                OfficialModelGraphQLSortDefinition(public_name="REVISION", field_key="revision"),
            ),
        ),
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


def get_official_model_protocol(singular_key: str | None) -> OfficialModelProtocol | None:
    normalized = (singular_key or "").strip()
    if not normalized:
        return None
    return _OFFICIAL_MODEL_PROTOCOLS.get(normalized)


def is_official_model_singular_key(singular_key: str | None) -> bool:
    return get_official_model_protocol(singular_key) is not None
