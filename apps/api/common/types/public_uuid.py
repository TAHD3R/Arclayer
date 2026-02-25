from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from pydantic import PlainSerializer, PlainValidator, WithJsonSchema

from apps.api.common.utils.public_ids import decode_public_id, encode_uuid, is_public_id


def _parse_public_uuid(value: Any) -> UUID:
    if isinstance(value, UUID):
        return value

    if isinstance(value, str):
        raw = value.strip()
        if is_public_id(raw):
            return decode_public_id(raw)

        # Optional dev/test convenience: accept raw UUID strings if enabled.
        from apps.api.config import get_settings

        if get_settings().public_id.accept_raw_uuid_input:
            try:
                return UUID(raw)
            except (TypeError, ValueError):
                pass

    raise ValueError("Invalid id")


def _serialize_public_uuid(value: UUID) -> str:
    return encode_uuid(value)


PublicUUID = Annotated[
    UUID,
    PlainValidator(_parse_public_uuid),
    PlainSerializer(_serialize_public_uuid, return_type=str),
    WithJsonSchema({"type": "string", "pattern": "^[A-Za-z0-9_-]{22}$", "examples": ["1jz6k6rWQdK2nZk3fD3d1Q"]}),
]
