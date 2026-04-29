from __future__ import annotations

from src.core.logging import get_logger
from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig
from src.modules.projects.content.fields.types.boolean import BooleanFieldType
from src.modules.projects.content.fields.types.datetime import DateFieldType, DateTimeFieldType, TimeFieldType
from src.modules.projects.content.fields.types.enumeration import EnumerationFieldType
from src.modules.projects.content.fields.types.json import BlocksFieldType, JSONFieldType
from src.modules.projects.content.fields.types.media import LocationFieldType, MediaFieldType
from src.modules.projects.content.fields.types.number import BigIntegerFieldType, DecimalFieldType, NumberFieldType
from src.modules.projects.content.fields.types.relation import (
    ComponentFieldType,
    DynamicZoneFieldType,
    ReferenceFieldType,
)
from src.modules.projects.content.fields.types.text import (
    EmailFieldType,
    LongTextFieldType,
    MarkdownFieldType,
    RichTextFieldType,
    SlugFieldType,
    TextFieldType,
)

logger = get_logger(__name__)

_BUILT_IN_TYPES: dict[ContentModelFieldType, AbstractFieldType] = {
    ContentModelFieldType.TEXT: TextFieldType(),
    ContentModelFieldType.LONG_TEXT: LongTextFieldType(),
    ContentModelFieldType.RICH_TEXT: RichTextFieldType(),
    ContentModelFieldType.MARKDOWN: MarkdownFieldType(),
    ContentModelFieldType.SLUG: SlugFieldType(),
    ContentModelFieldType.EMAIL: EmailFieldType(),
    ContentModelFieldType.NUMBER: NumberFieldType(),
    ContentModelFieldType.DECIMAL: DecimalFieldType(),
    ContentModelFieldType.BIG_INTEGER: BigIntegerFieldType(),
    ContentModelFieldType.BOOLEAN: BooleanFieldType(),
    ContentModelFieldType.DATE_TIME: DateTimeFieldType(),
    ContentModelFieldType.DATE: DateFieldType(),
    ContentModelFieldType.TIME: TimeFieldType(),
    ContentModelFieldType.JSON: JSONFieldType(),
    ContentModelFieldType.BLOCKS: BlocksFieldType(),
    ContentModelFieldType.ENUMERATION: EnumerationFieldType(),
    ContentModelFieldType.MEDIA: MediaFieldType(),
    ContentModelFieldType.LOCATION: LocationFieldType(),
    ContentModelFieldType.REFERENCE: ReferenceFieldType(),
    ContentModelFieldType.COMPONENT: ComponentFieldType(),
    ContentModelFieldType.DYNAMIC_ZONE: DynamicZoneFieldType(),
}


class FieldTypeRegistry:
    """Central registry mapping ContentModelFieldType values to AbstractFieldType instances.

    Supports plugin-registered custom field types via register().
    """

    def __init__(self) -> None:
        self._types: dict[ContentModelFieldType, AbstractFieldType] = dict(_BUILT_IN_TYPES)

    def resolve(self, field_type: ContentModelFieldType) -> AbstractFieldType:
        impl = self._types.get(field_type)
        if impl is None:
            raise ValueError(f"No field type implementation registered for: {field_type}")
        return impl

    def register(self, field_type: ContentModelFieldType, implementation: AbstractFieldType) -> None:
        if field_type in self._types:
            logger.warning("Field type already registered, replacing", field_type=str(field_type))
        self._types[field_type] = implementation

    def unregister(self, field_type: ContentModelFieldType) -> None:
        if field_type not in _BUILT_IN_TYPES:
            self._types.pop(field_type, None)

    @property
    def registered_types(self) -> frozenset[ContentModelFieldType]:
        return frozenset(self._types.keys())

    def get_pydantic_type(self, field_type: ContentModelFieldType, config: FieldConfig | None = None) -> type:
        return self.resolve(field_type).get_pydantic_type(config or FieldConfig(key=""))

    def get_db_column_type(self, field_type: ContentModelFieldType, config: FieldConfig | None = None) -> str:
        return self.resolve(field_type).get_db_column_type(config or FieldConfig(key=""))

    def get_graphql_type(self, field_type: ContentModelFieldType, config: FieldConfig | None = None) -> type:
        return self.resolve(field_type).get_graphql_type(config or FieldConfig(key=""))

    def get_admin_component(self, field_type: ContentModelFieldType, config: FieldConfig | None = None) -> str:
        return self.resolve(field_type).get_admin_component(config or FieldConfig(key=""))


# Singleton instance for the field type registry.
field_type_registry = FieldTypeRegistry()
