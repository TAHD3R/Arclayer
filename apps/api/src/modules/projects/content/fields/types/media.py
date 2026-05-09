from __future__ import annotations

from uuid import UUID

from src.models.content._enums import ContentModelFieldType
from src.modules.projects.content.fields.base import AbstractFieldType, FieldConfig


class MediaFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.MEDIA
    display_name = "Media"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        mode = config.get("mediaMode", "single")
        return list[UUID] if mode == "multiple" else UUID

    def get_db_column_type(self, config: FieldConfig) -> str:
        mode = config.get("mediaMode", "single")
        return "FK[] → assets" if mode == "multiple" else "FK → assets"

    def get_graphql_type(self, config: FieldConfig) -> type:
        mode = config.get("mediaMode", "single")
        return list[str] if mode == "multiple" else str

    def get_admin_component(self, config: FieldConfig) -> str:
        return "media-picker"

    def validate_config(self, config: FieldConfig) -> None:
        mode = config.get("mediaMode", "single")
        if mode not in ("single", "multiple"):
            raise ValueError("mediaMode must be 'single' or 'multiple'")
        kind = config.get("mediaKind")
        if kind is not None and kind not in ("image", "video", "file"):
            raise ValueError("mediaKind must be 'image', 'video', or 'file'")
        allowed_types = config.get("allowedTypes")
        if allowed_types is not None:
            if not isinstance(allowed_types, list) or not allowed_types:
                raise ValueError("allowedTypes must include at least one media type")
            if any(item not in ("images", "videos", "files") for item in allowed_types):
                raise ValueError("allowedTypes must contain 'images', 'videos', or 'files'")
        _assert_multiple_item_bounds(config, mode=mode)


def _assert_multiple_item_bounds(config: FieldConfig, *, mode: object) -> None:
    if "min" not in config and "max" not in config:
        return
    if mode != "multiple":
        raise ValueError("min and max can only be configured when mediaMode is 'multiple'")
    min_value = config.get("min")
    max_value = config.get("max")
    if min_value is not None and (type(min_value) is not int or min_value < 0):
        raise ValueError("min must be a non-negative integer")
    if max_value is not None and (type(max_value) is not int or max_value < 0):
        raise ValueError("max must be a non-negative integer")
    if type(min_value) is int and type(max_value) is int and min_value > max_value:
        raise ValueError("min must not exceed max")


class LocationFieldType(AbstractFieldType):
    field_type = ContentModelFieldType.LOCATION
    display_name = "Location"

    def get_pydantic_type(self, config: FieldConfig) -> type:
        return dict

    def get_db_column_type(self, config: FieldConfig) -> str:
        return "JSONB"

    def get_graphql_type(self, config: FieldConfig) -> type:
        return dict

    def get_admin_component(self, config: FieldConfig) -> str:
        return "location-picker"
