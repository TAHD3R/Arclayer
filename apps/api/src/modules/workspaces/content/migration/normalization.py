from __future__ import annotations

from apps.api.src.models.content._enums import (
    ContentItemStatus,
    ContentItemVisibility,
    ContentModelFieldType,
    ContentModelKind,
    ContentVersionState,
)
from apps.api.src.models.content.content import ContentEntryRecord
from apps.api.src.modules.workspaces.content.migration.reporting import LegacyImportIssue, LegacyImportReport

_FIELD_TYPE_MAP: dict[str, ContentModelFieldType] = {
    "text": ContentModelFieldType.TEXT,
    "long_text": ContentModelFieldType.LONG_TEXT,
    "number": ContentModelFieldType.NUMBER,
    "boolean": ContentModelFieldType.BOOLEAN,
    "date_time": ContentModelFieldType.DATE_TIME,
    "json": ContentModelFieldType.JSON,
}
_SUPPORTED_ITEM_STATUSES = {item.value for item in ContentItemStatus}
_SUPPORTED_VISIBILITIES = {item.value for item in ContentItemVisibility}
_SUPPORTED_KINDS = {item.value for item in ContentModelKind}


def append_issue(report: LegacyImportReport, code: str, message: str, legacy_ref: str | None = None) -> None:
    report.unsupported_payloads.append(LegacyImportIssue(code=code, message=message, legacy_ref=legacy_ref))


def capabilities_for_kind(kind: str) -> list[str]:
    if kind == ContentModelKind.PAGE.value:
        return ["versioned", "publishable", "routable", "treeable", "visual_editable"]
    if kind == ContentModelKind.POST.value:
        return ["versioned", "publishable", "rich_text_editable"]
    return ["versioned", "publishable"]


def normalize_kind(legacy_kind: str | None, report: LegacyImportReport, type_code: str) -> str:
    candidate = (legacy_kind or "").strip().lower()
    if candidate in _SUPPORTED_KINDS:
        return candidate
    append_issue(
        report,
        "LEGACY_KIND_UNSUPPORTED",
        f"Legacy content kind '{legacy_kind}' is not supported; fallback to 'custom'.",
        legacy_ref=type_code,
    )
    return ContentModelKind.CUSTOM.value


def extract_legacy_field_rows(
    field_schema: object,
    report: LegacyImportReport,
    type_code: str,
) -> list[dict[str, object]]:
    if field_schema is None:
        return []
    rows: object = field_schema
    if isinstance(field_schema, dict):
        rows = field_schema.get("fields", [])
    if not isinstance(rows, list):
        append_issue(
            report,
            "LEGACY_FIELD_SCHEMA_UNSUPPORTED",
            "Legacy field schema must be a list or an object containing 'fields'.",
            legacy_ref=type_code,
        )
        return []
    return [row for row in rows if isinstance(row, dict)]


def normalize_field_type(
    raw_scalar: object, report: LegacyImportReport, type_code: str, key: str
) -> ContentModelFieldType:
    scalar = str(raw_scalar or "").strip().lower()
    if scalar in _FIELD_TYPE_MAP:
        return _FIELD_TYPE_MAP[scalar]
    append_issue(
        report,
        "LEGACY_FIELD_TYPE_UNSUPPORTED",
        f"Legacy field scalar '{raw_scalar}' is not supported; fallback to 'json'.",
        legacy_ref=f"{type_code}:{key}",
    )
    return ContentModelFieldType.JSON


def normalize_status(raw_status: str | None, report: LegacyImportReport, entry_slug: str) -> str:
    status = str(raw_status or "").strip().lower()
    if status in _SUPPORTED_ITEM_STATUSES:
        return status
    append_issue(
        report,
        "LEGACY_STATUS_UNSUPPORTED",
        f"Legacy status '{raw_status}' is not supported; fallback to 'draft'.",
        legacy_ref=entry_slug,
    )
    return ContentItemStatus.DRAFT.value


def normalize_visibility(raw_visibility: str | None, report: LegacyImportReport, entry_slug: str) -> str:
    visibility = str(raw_visibility or "").strip().lower()
    if visibility in _SUPPORTED_VISIBILITIES:
        return visibility
    append_issue(
        report,
        "LEGACY_VISIBILITY_UNSUPPORTED",
        f"Legacy visibility '{raw_visibility}' is not supported; fallback to 'public'.",
        legacy_ref=entry_slug,
    )
    return ContentItemVisibility.PUBLIC.value


def resolve_version_state(entry: ContentEntryRecord, revision: int) -> str:
    if entry.published_revision == revision:
        return ContentVersionState.PUBLISHED.value
    if entry.draft_revision == revision:
        return ContentVersionState.DRAFT.value
    return ContentVersionState.ARCHIVED.value


def snapshot_field_values(snapshot: object) -> dict[str, object] | None:
    if not isinstance(snapshot, dict):
        return None
    payload = snapshot.get("field_values", snapshot.get("fieldValues"))
    return payload if isinstance(payload, dict) else None


def snapshot_page_blueprint(snapshot: object) -> object:
    if not isinstance(snapshot, dict):
        return None
    return snapshot.get("page_blueprint", snapshot.get("pageBlueprint"))
