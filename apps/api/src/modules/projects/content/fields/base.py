from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.models.content._enums import ContentModelFieldType


@dataclass(frozen=True)
class FieldConfig:
    """Normalized field configuration passed to field type methods."""

    key: str
    required: bool = False
    unique: bool = False
    localizable: bool = False
    hidden_in_editor: bool = False
    omit_from_api_response: bool = False
    default_value: Any = None
    options: dict[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        return self.options.get(key, default)


class AbstractFieldType(ABC):
    """Polymorphic interface for content model field types.

    Each field type maps to four concerns:
    - Pydantic type for request/response validation
    - Database column type for schema synchronization
    - GraphQL scalar type for Strawberry schema generation
    - Admin component name for the content type builder UI

    Plugins register new field types by subclassing and using
    @hookimpl(arclayer_register) to register with CustomFieldRegistry.
    """

    field_type: ContentModelFieldType
    display_name: str = ""

    @abstractmethod
    def get_pydantic_type(self, config: FieldConfig) -> type:
        """Return the Pydantic type used for field validation."""

    @abstractmethod
    def get_db_column_type(self, config: FieldConfig) -> str:
        """Return the SQL column type for dynamic table creation."""

    @abstractmethod
    def get_graphql_type(self, config: FieldConfig) -> type:
        """Return the Strawberry GraphQL scalar or type."""

    @abstractmethod
    def get_admin_component(self, config: FieldConfig) -> str:
        """Return the React admin component name for this field."""

    def validate_config(self, config: FieldConfig) -> None:
        """Validate field-type-specific configuration. Override in subtypes."""
        del config  # no-op: only overridden subtypes perform validation
