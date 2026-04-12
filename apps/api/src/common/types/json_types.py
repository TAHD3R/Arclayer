from __future__ import annotations

from typing import Union

JsonScalar = Union[str, int, float, bool, None]

# NOTE: Use a named recursive type alias so Pydantic can generate JSON schema safely.
type JsonValue = Union[JsonScalar, list["JsonValue"], dict[str, "JsonValue"]]
JsonObject = dict[str, JsonValue]
