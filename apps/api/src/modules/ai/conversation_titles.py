from __future__ import annotations

import re

from src.common.types.json_types import JsonObject, JsonValue
from src.modules.ai.schema import AIConversationMessage

_DEFAULT_TITLE = "新对话"
_MAX_TITLE_LENGTH = 160
_COMPACT_TITLE_LENGTH = 72
_TRAILING_PUNCTUATION_RE = re.compile(r"[\s:：,，.;；!?！？。]+$")
_AUTO_CONTEXT_TITLES = {
    "Access policy review",
    "AI agent settings",
    "Asset library",
    "Content item assistant",
    "Content model assistant",
    "Content workbench",
    "Project settings",
}


def generate_conversation_title(
    *,
    explicit_title: str | None,
    messages: list[AIConversationMessage],
    context_snapshot: JsonObject,
) -> str:
    explicit = _normalize_text(explicit_title)
    first_user_message = _first_user_message(messages)
    if explicit and _is_manual_title(explicit=explicit, first_user_message=first_user_message):
        return _truncate(explicit, _MAX_TITLE_LENGTH)

    recommendation_title = _recommendation_title(
        first_user_message=first_user_message,
        context_snapshot=context_snapshot,
    )
    if recommendation_title:
        return recommendation_title

    message_title = _message_title(first_user_message)
    if message_title:
        return message_title

    context_title = _context_title(context_snapshot)
    if context_title:
        return context_title
    return _DEFAULT_TITLE


def _is_manual_title(*, explicit: str, first_user_message: str | None) -> bool:
    if explicit == _DEFAULT_TITLE:
        return False
    if first_user_message is None:
        return explicit not in _AUTO_CONTEXT_TITLES
    return explicit not in _legacy_frontend_titles(first_user_message)


def _recommendation_title(*, first_user_message: str | None, context_snapshot: JsonObject) -> str | None:
    if first_user_message is None:
        return None
    first_line = _first_non_empty_line(first_user_message)
    if first_line is None:
        return None
    for detail in _recommendation_details(context_snapshot):
        label = _normalize_text(_text(detail.get("label")))
        description = _normalize_text(_text(detail.get("description")))
        if label and (first_line == label or first_user_message.startswith(f"{label}\n")):
            return _truncate(label, _COMPACT_TITLE_LENGTH)
        if label and description and first_user_message.startswith(f"{label}\n\n{description}"):
            return _truncate(label, _COMPACT_TITLE_LENGTH)
    return None


def _message_title(first_user_message: str | None) -> str | None:
    if first_user_message is None:
        return None
    first_line = _first_non_empty_line(first_user_message)
    if first_line is None:
        return None
    cleaned = _TRAILING_PUNCTUATION_RE.sub("", first_line)
    return _truncate(cleaned, _COMPACT_TITLE_LENGTH) if cleaned else None


def _context_title(context_snapshot: JsonObject) -> str | None:
    surface = _text(context_snapshot.get("surface"))
    section = _text(context_snapshot.get("section"))
    entity = context_snapshot.get("entity")
    if isinstance(entity, dict):
        entity_type = _text(entity.get("type"))
        if entity_type == "content-item":
            return "Content item assistant"
        if entity_type == "content-model":
            return "Content model assistant"
    if surface == "system-settings" and section == "agents":
        return "AI agent settings"
    if surface == "system-settings" and section == "access":
        return "Access policy review"
    if surface == "content-workbench":
        return "Content workbench"
    if surface == "asset-library":
        return "Asset library"
    if surface == "project-settings":
        return "Project settings"
    return None


def _recommendation_details(context_snapshot: JsonObject) -> list[dict[str, JsonValue]]:
    details = context_snapshot.get("recommendedActionDetails")
    if not isinstance(details, list):
        return []
    return [item for item in details if isinstance(item, dict)]


def _first_user_message(messages: list[AIConversationMessage]) -> str | None:
    for message in messages:
        if message.role == "user":
            content = _normalize_message(message.content)
            if content:
                return content
    return None


def _first_non_empty_line(value: str) -> str | None:
    for line in value.splitlines():
        cleaned = _normalize_text(line)
        if cleaned:
            return cleaned
    return None


def _legacy_frontend_titles(value: str) -> set[str]:
    normalized = _normalize_text(value)
    if len(normalized) <= 30:
        return {normalized}
    return {f"{normalized[:30]}...", f"{normalized[:30]}…"}


def _normalize_text(value: str | None) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _normalize_message(value: str) -> str:
    return "\n".join(_normalize_text(line) for line in value.strip().splitlines())


def _text(value: JsonValue | None) -> str:
    return value if isinstance(value, str) else ""


def _truncate(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return f"{value[: max_length - 3]}..."
