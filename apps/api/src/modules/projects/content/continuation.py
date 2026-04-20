from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.models.content._enums import (
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
    ContentShapeState,
)
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.modules.projects.content.models.protocol_registry import get_official_model_protocol

UNSHAPED_ITEM_REASON_CODE = "UNSHAPED_ITEM"
MODEL_DEFAULT_INVALID_REASON_CODE = "MODEL_DEFAULT_INVALID"
CONTINUATION_TRUTH_MISSING_REASON_CODE = "CONTINUATION_TRUTH_MISSING"

_TOKEN_TO_ROLE: tuple[tuple[str, tuple[str, ...]], ...] = (
    (str(ContentContinuationRole.ARTICLE), ("article", "post", "blog", "story", "news")),
    (
        str(ContentContinuationRole.REUSABLE_SECTION),
        ("section", "block", "component", "reusable"),
    ),
    (str(ContentContinuationRole.TAXONOMY), ("taxonomy", "tag", "category", "topic")),
    (str(ContentContinuationRole.PERSON), ("person", "people", "author", "profile", "member", "team")),
    (str(ContentContinuationRole.SETTINGS), ("setting", "settings", "config", "preference")),
)
_PAGE_HINT_CAPABILITIES = frozenset({"visual_editable", "routable", "treeable"})
_CANVAS_HINT_CAPABILITIES = frozenset({"visual_editable", "has_slots"})
_WRITING_HINT_CAPABILITIES = frozenset({"rich_text_editable"})
_STRUCTURED_HINT_CAPABILITIES = frozenset({"queryable", "has_relations"})


@dataclass(frozen=True)
class ContentModelContinuationDefaults:
    default_role: str | None
    default_posture: str | None
    default_surface: str | None
    starter_pack_policy: dict[str, Any] | None
    surface_policy: dict[str, Any] | None


@dataclass(frozen=True)
class ContentItemContinuationTruth:
    resolved_role: str | None
    resolved_posture: str | None
    resolved_surface: str | None
    shape_state: str
    shape_reason_code: str | None
    shape_reason_meta: dict[str, Any] | None


def _normalize_string(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_string_list(values: list[str] | None) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _normalized_tokens(*values: str | None) -> list[str]:
    tokens: list[str] = []
    for value in values:
        normalized = _normalize_string(value)
        if normalized is None:
            continue
        tokens.append(normalized.lower())
    return tokens


def _matches_tokens(*, values: list[str], candidates: tuple[str, ...]) -> bool:
    return any(candidate in value for value in values for candidate in candidates)


def _normalize_policy(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _derive_surface(
    *,
    default_editor: str | None,
    model_capabilities: list[str],
    capability_pack_ids: list[str],
) -> str:
    if default_editor == "visual":
        return str(ContentContinuationSurface.CANVAS)
    if default_editor == "rich_text":
        return str(ContentContinuationSurface.WRITING)
    if default_editor in {"form", "table"}:
        return str(ContentContinuationSurface.STRUCTURED)

    all_capabilities = set(model_capabilities) | set(capability_pack_ids)
    if all_capabilities & _CANVAS_HINT_CAPABILITIES:
        return str(ContentContinuationSurface.CANVAS)
    if all_capabilities & _WRITING_HINT_CAPABILITIES:
        return str(ContentContinuationSurface.WRITING)
    return str(ContentContinuationSurface.STRUCTURED)


def _derive_role(
    *,
    preset_key: str | None,
    model_key: str | None,
    model_name: str | None,
    model_category: str | None,
    model_capabilities: list[str],
    capability_pack_ids: list[str],
) -> str:
    preset_to_role = {
        "page": str(ContentContinuationRole.PAGE),
        "post": str(ContentContinuationRole.ARTICLE),
        "reusable-block": str(ContentContinuationRole.REUSABLE_SECTION),
        "taxonomy-item": str(ContentContinuationRole.TAXONOMY),
    }
    if preset_key in preset_to_role:
        return preset_to_role[preset_key]

    tokens = _normalized_tokens(model_key, model_name)
    for role, candidates in _TOKEN_TO_ROLE:
        if _matches_tokens(values=tokens, candidates=candidates):
            return role

    all_capabilities = set(model_capabilities) | set(capability_pack_ids)
    if model_category == "system":
        return str(ContentContinuationRole.SETTINGS)
    if model_category == "site_builder" or all_capabilities & _PAGE_HINT_CAPABILITIES:
        return str(ContentContinuationRole.PAGE)
    if all_capabilities & _STRUCTURED_HINT_CAPABILITIES:
        return str(ContentContinuationRole.DATA)
    return str(ContentContinuationRole.GENERAL)


def _derive_posture(*, role: str, surface: str) -> str:
    if role == str(ContentContinuationRole.PAGE):
        return str(ContentContinuationPosture.PAGE)
    if role == str(ContentContinuationRole.REUSABLE_SECTION):
        return str(ContentContinuationPosture.COMPOSITION)
    if surface == str(ContentContinuationSurface.STRUCTURED) or role in {
        str(ContentContinuationRole.TAXONOMY),
        str(ContentContinuationRole.PERSON),
        str(ContentContinuationRole.SETTINGS),
        str(ContentContinuationRole.DATA),
    }:
        return str(ContentContinuationPosture.STRUCTURED)
    return str(ContentContinuationPosture.ENTRY)


def resolve_model_continuation_defaults(
    *,
    key: str | None,
    name: str | None,
    category: str | None,
    default_editor: str | None,
    capabilities: list[str] | None,
    default_role: str | None,
    default_posture: str | None,
    default_surface: str | None,
    starter_pack_policy: Any,
    surface_policy: Any,
) -> ContentModelContinuationDefaults:
    protocol = get_official_model_protocol(key)
    if protocol is not None:
        return ContentModelContinuationDefaults(
            default_role=protocol.default_role,
            default_posture=protocol.default_posture,
            default_surface=protocol.default_surface,
            starter_pack_policy=protocol.starter_pack_policy,
            surface_policy=protocol.surface_policy,
        )

    normalized_capabilities = _normalize_string_list(capabilities)
    resolved_surface = _normalize_string(default_surface) or _derive_surface(
        default_editor=default_editor,
        model_capabilities=normalized_capabilities,
        capability_pack_ids=[],
    )
    resolved_role = _normalize_string(default_role) or _derive_role(
        preset_key=None,
        model_key=key,
        model_name=name,
        model_category=category,
        model_capabilities=normalized_capabilities,
        capability_pack_ids=[],
    )
    resolved_posture = _normalize_string(default_posture) or _derive_posture(
        role=resolved_role,
        surface=resolved_surface,
    )
    return ContentModelContinuationDefaults(
        default_role=resolved_role,
        default_posture=resolved_posture,
        default_surface=resolved_surface,
        starter_pack_policy=_normalize_policy(starter_pack_policy),
        surface_policy=_normalize_policy(surface_policy),
    )


def read_record_continuation_defaults(
    record: ContentModelDefinitionRecord,
) -> ContentModelContinuationDefaults:
    return ContentModelContinuationDefaults(
        default_role=(str(record.default_role) if record.default_role is not None else None),
        default_posture=(str(record.default_posture) if record.default_posture is not None else None),
        default_surface=(str(record.default_surface) if record.default_surface is not None else None),
        starter_pack_policy=record.starter_pack_policy,
        surface_policy=record.surface_policy,
    )


def resolve_item_continuation_truth(
    *,
    model: ContentModelDefinitionRecord | None,
    preset_key: str | None,
    capability_pack_ids: list[str] | None,
) -> ContentItemContinuationTruth:
    normalized_preset = _normalize_string(preset_key)
    normalized_capability_pack_ids = _normalize_string_list(capability_pack_ids)

    if model is None and normalized_preset is None and not normalized_capability_pack_ids:
        return ContentItemContinuationTruth(
            resolved_role=None,
            resolved_posture=None,
            resolved_surface=None,
            shape_state=str(ContentShapeState.UNSHAPED),
            shape_reason_code=UNSHAPED_ITEM_REASON_CODE,
            shape_reason_meta={"reason": "item_has_no_shape_inputs"},
        )

    if model is not None:
        defaults = read_record_continuation_defaults(model)
        if defaults.default_role is None or defaults.default_posture is None or defaults.default_surface is None:
            return ContentItemContinuationTruth(
                resolved_role=None,
                resolved_posture=None,
                resolved_surface=None,
                shape_state=str(ContentShapeState.UNSHAPED),
                shape_reason_code=MODEL_DEFAULT_INVALID_REASON_CODE,
                shape_reason_meta={"modelKey": model.key},
            )
        return ContentItemContinuationTruth(
            resolved_role=defaults.default_role,
            resolved_posture=defaults.default_posture,
            resolved_surface=defaults.default_surface,
            shape_state=str(ContentShapeState.READY),
            shape_reason_code=None,
            shape_reason_meta=None,
        )

    resolved_surface = _derive_surface(
        default_editor=None,
        model_capabilities=[],
        capability_pack_ids=normalized_capability_pack_ids,
    )
    resolved_role = _derive_role(
        preset_key=normalized_preset,
        model_key=None,
        model_name=None,
        model_category=None,
        model_capabilities=[],
        capability_pack_ids=normalized_capability_pack_ids,
    )
    resolved_posture = _derive_posture(role=resolved_role, surface=resolved_surface)
    return ContentItemContinuationTruth(
        resolved_role=resolved_role,
        resolved_posture=resolved_posture,
        resolved_surface=resolved_surface,
        shape_state=str(ContentShapeState.READY),
        shape_reason_code=None,
        shape_reason_meta=None,
    )
