from __future__ import annotations

from enum import StrEnum


class ContentModelFieldType(StrEnum):
    TEXT = "text"
    LONG_TEXT = "long_text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    DATE_TIME = "date_time"
    JSON = "json"
    RICH_TEXT = "rich_text"
    MARKDOWN = "markdown"
    SLUG = "slug"
    ENUMERATION = "enumeration"
    EMAIL = "email"
    PASSWORD = "password"
    MEDIA = "media"
    LOCATION = "location"
    REFERENCE = "reference"
    COMPONENT = "component"
    DYNAMIC_ZONE = "dynamic_zone"
    TIME = "time"
    DATE = "date"
    DECIMAL = "decimal"
    BIG_INTEGER = "biginteger"
    BLOCKS = "blocks"


class ContentModelRelationType(StrEnum):
    ONE_TO_ONE = "one_to_one"
    ONE_TO_MANY = "one_to_many"
    MANY_TO_ONE = "many_to_one"
    MANY_TO_MANY = "many_to_many"
    ONE_WAY = "one_way"
    MANY_WAY = "many_way"
    MORPH_TO_ONE = "morph_to_one"
    MORPH_TO_MANY = "morph_to_many"
    MORPH_ONE = "morph_one"
    MORPH_MANY = "morph_many"


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


class ContentContinuationRole(StrEnum):
    PAGE = "page"
    ARTICLE = "article"
    REUSABLE_SECTION = "reusable-section"
    TAXONOMY = "taxonomy"
    PERSON = "person"
    SETTINGS = "settings"
    DATA = "data"
    GENERAL = "general"


class ContentContinuationPosture(StrEnum):
    PAGE = "page"
    ENTRY = "entry"
    COMPOSITION = "composition"
    STRUCTURED = "structured"


class ContentContinuationSurface(StrEnum):
    WRITING = "writing"
    CANVAS = "canvas"
    STRUCTURED = "structured"


class ContentShapeState(StrEnum):
    READY = "ready"
    BLOCKED = "blocked"
    UNSHAPED = "unshaped"


class ContentWorkflowStage(StrEnum):
    DRAFTING = "drafting"
    IN_REVIEW = "in_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"


class ContentVersionState(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    SCHEDULED = "scheduled"
    ARCHIVED = "archived"


class ContentReleaseStatus(StrEnum):
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    CANCELLED = "cancelled"


class PublishJobStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PublishJobType(StrEnum):
    SCHEDULED_PUBLISH = "scheduled_publish"
    MANUAL_PUBLISH = "manual_publish"
    RETRY = "retry"


class ContentModelKind(StrEnum):
    COLLECTION_TYPE = "collection_type"
    SINGLE_TYPE = "single_type"
    COMPONENT = "component"


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
