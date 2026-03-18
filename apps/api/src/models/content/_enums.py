from __future__ import annotations

from enum import StrEnum


class ContentModelFieldType(StrEnum):
    TEXT = "text"
    LONG_TEXT = "long_text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    DATE_TIME = "date_time"
    JSON = "json"


class ContentModelRelationType(StrEnum):
    ONE_TO_ONE = "one_to_one"
    ONE_TO_MANY = "one_to_many"
    MANY_TO_ONE = "many_to_one"
    MANY_TO_MANY = "many_to_many"


class ContentModelViewType(StrEnum):
    DETAIL = "detail"
    LIST = "list"
    TABLE = "table"
    GRID = "grid"
    TREE = "tree"


class ContentItemStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ContentItemVisibility(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"


class ContentBootstrapPresetState(StrEnum):
    SELECTED = "selected"
    CUSTOMIZED = "customized"
    NONE = "none"


class ContentVersionState(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    SCHEDULED = "scheduled"
    ARCHIVED = "archived"


class ContentModelKind(StrEnum):
    PAGE = "page"
    POST = "post"
    TEMPLATE = "template"
    BLOCK = "block"
    MENU = "menu"
    VIEW = "view"
    COMPONENT = "component"
    CUSTOM = "custom"


class ContentPresentationKind(StrEnum):
    FORM_DATA = "form_data"
    RICH_TEXT_DOCUMENT = "rich_text_document"
    VISUAL_BLUEPRINT = "visual_blueprint"
    QUERY_DEFINITION = "query_definition"
    SLOT_MAPPING = "slot_mapping"
    SEO = "seo"


class PublishArtifactKind(StrEnum):
    ROUTE_MANIFEST = "route_manifest"
    COMPONENT_MANIFEST = "component_manifest"
    BINDING_MANIFEST = "binding_manifest"
    SEO_METADATA = "seo_metadata"
    ASSET_MANIFEST = "asset_manifest"
    RENDER_HINTS = "render_hints"
