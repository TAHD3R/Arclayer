from __future__ import annotations

import base64
import binascii
import hmac
import json
from collections.abc import Iterable
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, cast
from uuid import UUID

from pydantic import ConfigDict, Field

from src.common.schemas import BaseSchema
from src.config import Settings
from src.core.exceptions import Conflict, ServiceUnavailable
from src.core.http.pagination import PageData, PageParams, paginate_items
from src.models.content._enums import ContentShapeState
from src.models.content.content_item import ContentItemRecord
from src.models.content.model_definition import ContentModelDefinitionRecord
from src.models.content.model_field import ContentModelFieldRecord
from src.models.content.model_relation import ContentModelRelationRecord
from src.modules.workspaces.content.continuation import (
    MODEL_DEFAULT_INVALID_REASON_CODE,
    ContentItemContinuationTruth,
    resolve_model_continuation_defaults,
)
from src.modules.workspaces.content.contracts.schema import (
    ContentContinuationPosture,
    ContentContinuationRole,
    ContentContinuationSurface,
    ContentDefaultEditor,
    ContentModelCapability,
    ContentModelCategory,
    ContentModelDefinitionContract,
    ContentModelFieldContract,
    ContentModelImpactChangeOut,
    ContentModelImpactOut,
    ContentModelOut,
    ContentModelRelationContract,
    ContentModelRevisionSummaryOut,
    ContentModelSchemaApplyGateOut,
    ContentModelSchemaChangePlanOut,
    ContentModelSchemaDiffEntryOut,
    ContentModelSchemaDiffOut,
    ContentModelSchemaSnapshotOut,
    ContentModelViewContract,
    ContentRoutingContract,
    ContentWorkflowContract,
)
from src.modules.workspaces.content.models.domain_helpers import (
    dump_contract,
    normalize_default_editor,
    normalize_model_category,
    to_content_model_out,
)
from src.modules.workspaces.content.models.protocol_registry import (
    OfficialModelFieldDefinition,
    OfficialModelProtocol,
    get_official_model_protocol,
)
from src.modules.workspaces.content.models.repository import WorkspaceContentModelsRepository


class ContentModelDefinitionPatchContract(BaseSchema):
    model_config = BaseSchema.model_config | ConfigDict(extra="forbid")

    key: str | None = Field(default=None, min_length=1, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=512)
    category: ContentModelCategory | None = None
    default_editor: ContentDefaultEditor | None = None
    default_role: ContentContinuationRole | None = None
    default_posture: ContentContinuationPosture | None = None
    default_surface: ContentContinuationSurface | None = None
    fields: list[ContentModelFieldContract] | None = None
    relations: list[ContentModelRelationContract] | None = None
    capabilities: list[ContentModelCapability] | None = None
    routing: ContentRoutingContract | None = None
    workflow: ContentWorkflowContract | None = None
    views: list[ContentModelViewContract] | None = None
    presentation: dict[str, Any] | None = None
    seo: dict[str, Any] | None = None
    starter_pack_policy: dict[str, Any] | None = None
    surface_policy: dict[str, Any] | None = None
    impact_preview_token: str | None = None


def _normalize_required_text(value: str, *, error: str) -> str:
    out = value.strip()
    if not out:
        raise Conflict(error, error="CONTENT_MODEL_CONTRACT_INVALID")
    return out


def _capabilities(values: list[ContentModelCapability]) -> list[str]:
    return [str(value) for value in values]


_SYSTEM_MANAGED_PATCH_FIELDS = frozenset({
    "key",
    "name",
    "category",
    "default_editor",
    "capabilities",
    "routing",
    "presentation",
    "seo",
    "starter_pack_policy",
    "surface_policy",
    "workflow",
})


@dataclass(frozen=True)
class ContentModelMutationResult:
    record: ContentModelDefinitionRecord
    impact: ContentModelImpactOut
    preview: ContentModelImpactPreviewResult | None = None
    default_changes: dict[str, dict[str, Any | None]] | None = None


@dataclass(frozen=True)
class ContentModelImpactPreviewResult:
    affected_items_count: int
    recovery_items_count: int
    reshape_items_count: int
    has_blocking_changes: bool
    preview_token: str
    impact: ContentModelImpactOut
    change_plan: ContentModelSchemaChangePlanOut


@dataclass(frozen=True)
class _PreviewFieldRow:
    key: str
    field_type: str
    is_required: bool


@dataclass(frozen=True)
class _PreviewRelationRow:
    key: str
    relation_type: str
    target_model_key: str
    is_required: bool


@dataclass(frozen=True)
class _PreviewModelRecord:
    fields: tuple[ContentModelFieldRecord | _PreviewFieldRow, ...]
    relations: tuple[ContentModelRelationRecord | _PreviewRelationRow, ...]


@dataclass(frozen=True)
class _ModelUpdateContext:
    fields_to_update: dict[str, Any]
    preview: ContentModelImpactPreviewResult
    default_changes: dict[str, dict[str, Any | None]]


def _snapshot_counts(payload: dict[str, Any]) -> tuple[int, int, int]:
    fields = payload.get("fields")
    relations = payload.get("relations")
    views = payload.get("views")
    return (
        len(fields) if isinstance(fields, list) else 0,
        len(relations) if isinstance(relations, list) else 0,
        len(views) if isinstance(views, list) else 0,
    )


def _build_snapshot(
    *,
    stage: str,
    revision: int | None,
    payload: dict[str, Any],
) -> ContentModelSchemaSnapshotOut:
    field_count, relation_count, view_count = _snapshot_counts(payload)
    return ContentModelSchemaSnapshotOut(
        stage=cast(Any, stage),
        revision=revision,
        field_count=field_count,
        relation_count=relation_count,
        view_count=view_count,
        payload=payload,
    )


def _read_snapshot_fields(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = payload.get("fields")
    if not isinstance(rows, list):
        return {}
    return {str(row["key"]): row for row in rows if isinstance(row, dict) and isinstance(row.get("key"), str)}


def _read_snapshot_relations(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = payload.get("relations")
    if not isinstance(rows, list):
        return {}
    return {str(row["key"]): row for row in rows if isinstance(row, dict) and isinstance(row.get("key"), str)}


def _read_snapshot_views(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    rows = payload.get("views")
    if not isinstance(rows, list):
        return {}
    return {str(row["key"]): row for row in rows if isinstance(row, dict) and isinstance(row.get("key"), str)}


def _schema_diff_entry(
    *,
    kind: str,
    operation: str,
    target: str,
    summary: str,
    breaking: bool = False,
    before: Any | None = None,
    after: Any | None = None,
) -> ContentModelSchemaDiffEntryOut:
    return ContentModelSchemaDiffEntryOut(
        kind=cast(Any, kind),
        operation=cast(Any, operation),
        target=target,
        summary=summary,
        breaking=breaking,
        before=before,
        after=after,
    )


def _append_mapping_diff_entries(
    *,
    entries: list[ContentModelSchemaDiffEntryOut],
    kind: str,
    prefix: str,
    before_map: dict[str, dict[str, Any]],
    after_map: dict[str, dict[str, Any]],
) -> None:
    for key in sorted(before_map.keys() - after_map.keys()):
        entries.append(
            _schema_diff_entry(
                kind=kind,
                operation="removed",
                target=f"{prefix}.{key}",
                summary=f"{kind.title()} '{key}' will be removed from the next draft.",
                breaking=kind in {"field", "relation"},
                before=before_map[key],
                after=None,
            )
        )
    for key in sorted(after_map.keys() - before_map.keys()):
        entries.append(
            _schema_diff_entry(
                kind=kind,
                operation="added",
                target=f"{prefix}.{key}",
                summary=f"{kind.title()} '{key}' will be added to the next draft.",
                breaking=False,
                before=None,
                after=after_map[key],
            )
        )
    for key in sorted(before_map.keys() & after_map.keys()):
        if before_map[key] == after_map[key]:
            continue
        entries.append(
            _schema_diff_entry(
                kind=kind,
                operation="changed",
                target=f"{prefix}.{key}",
                summary=f"{kind.title()} '{key}' will change in the next draft.",
                breaking=kind in {"field", "relation"},
                before=before_map[key],
                after=after_map[key],
            )
        )


def _append_scalar_diff_entries(
    *,
    entries: list[ContentModelSchemaDiffEntryOut],
    kind: str,
    targets: dict[str, tuple[str, Any | None, Any | None]],
) -> None:
    for target, (summary, before, after) in targets.items():
        if before == after:
            continue
        operation = (
            "added"
            if before is None and after is not None
            else "removed"
            if before is not None and after is None
            else "changed"
        )
        entries.append(
            _schema_diff_entry(
                kind=kind,
                operation=operation,
                target=target,
                summary=summary,
                before=before,
                after=after,
            )
        )


def _build_schema_diff(
    *,
    current_snapshot: dict[str, Any],
    next_snapshot: dict[str, Any],
    impact: ContentModelImpactOut,
) -> ContentModelSchemaDiffOut:
    entries: list[ContentModelSchemaDiffEntryOut] = []
    _append_mapping_diff_entries(
        entries=entries,
        kind="field",
        prefix="fields",
        before_map=_read_snapshot_fields(current_snapshot),
        after_map=_read_snapshot_fields(next_snapshot),
    )
    _append_mapping_diff_entries(
        entries=entries,
        kind="relation",
        prefix="relations",
        before_map=_read_snapshot_relations(current_snapshot),
        after_map=_read_snapshot_relations(next_snapshot),
    )
    _append_mapping_diff_entries(
        entries=entries,
        kind="view",
        prefix="views",
        before_map=_read_snapshot_views(current_snapshot),
        after_map=_read_snapshot_views(next_snapshot),
    )
    _append_scalar_diff_entries(
        entries=entries,
        kind="default",
        targets={
            "defaults.default_role": (
                "Default role will change for newly created entries.",
                current_snapshot.get("default_role"),
                next_snapshot.get("default_role"),
            ),
            "defaults.default_posture": (
                "Default posture will change for newly created entries.",
                current_snapshot.get("default_posture"),
                next_snapshot.get("default_posture"),
            ),
            "defaults.default_surface": (
                "Default surface will change for newly created entries.",
                current_snapshot.get("default_surface"),
                next_snapshot.get("default_surface"),
            ),
        },
    )
    _append_scalar_diff_entries(
        entries=entries,
        kind="meta",
        targets={
            "meta.description": (
                "Model description will change.",
                current_snapshot.get("description"),
                next_snapshot.get("description"),
            ),
            "meta.starter_pack_policy": (
                "Starter pack policy will change.",
                current_snapshot.get("starter_pack_policy"),
                next_snapshot.get("starter_pack_policy"),
            ),
            "meta.surface_policy": (
                "Surface policy will change.",
                current_snapshot.get("surface_policy"),
                next_snapshot.get("surface_policy"),
            ),
        },
    )
    _append_scalar_diff_entries(
        entries=entries,
        kind="policy",
        targets={
            "policy.workflow": (
                "Workflow policy will change.",
                current_snapshot.get("workflow_policy"),
                next_snapshot.get("workflow_policy"),
            ),
            "policy.routing": (
                "Routing policy will change.",
                current_snapshot.get("routing_policy"),
                next_snapshot.get("routing_policy"),
            ),
            "policy.presentation": (
                "Presentation policy will change.",
                current_snapshot.get("presentation_policy"),
                next_snapshot.get("presentation_policy"),
            ),
            "policy.seo": (
                "SEO policy will change.",
                current_snapshot.get("seo_policy"),
                next_snapshot.get("seo_policy"),
            ),
        },
    )
    _append_scalar_diff_entries(
        entries=entries,
        kind="capability",
        targets={
            "capabilities": (
                "Capability contract will change.",
                current_snapshot.get("capabilities"),
                next_snapshot.get("capabilities"),
            ),
        },
    )

    breaking_targets = {change.target for change in impact.breaking_changes}
    if breaking_targets:
        normalized_entries: list[ContentModelSchemaDiffEntryOut] = []
        for entry in entries:
            normalized_entries.append(
                entry.model_copy(
                    update={
                        "breaking": entry.breaking or entry.target in breaking_targets,
                    }
                )
            )
        entries = normalized_entries

    breaking_count = sum(1 for entry in entries if entry.breaking)
    return ContentModelSchemaDiffOut(
        has_changes=bool(entries),
        has_breaking_changes=breaking_count > 0,
        breaking_change_count=breaking_count,
        entries=entries,
    )


def _build_apply_gates(
    *,
    diff: ContentModelSchemaDiffOut,
    affected_items_count: int,
    recovery_items_count: int,
    reshape_items_count: int,
    has_blocking_changes: bool,
) -> list[ContentModelSchemaApplyGateOut]:
    gates = [
        ContentModelSchemaApplyGateOut(
            code="impact_scope",
            status="review" if affected_items_count > 0 else "ready",
            title="Impact scope",
            detail=(
                f"{affected_items_count} items will need lifecycle review."
                if affected_items_count > 0
                else "No existing items are affected by this draft change."
            ),
        ),
        ContentModelSchemaApplyGateOut(
            code="revision_delta",
            status="review" if diff.has_changes else "ready",
            title="Revision delta",
            detail=(
                f"{len(diff.entries)} schema entries will move into the next draft revision."
                if diff.has_changes
                else "The preview payload does not change the saved draft contract."
            ),
        ),
        ContentModelSchemaApplyGateOut(
            code="breaking_changes",
            status="review" if diff.has_breaking_changes else "ready",
            title="Breaking contract review",
            detail=(
                f"{diff.breaking_change_count} breaking changes require operator review."
                if diff.has_breaking_changes
                else "No breaking schema contract changes were detected."
            ),
        ),
        ContentModelSchemaApplyGateOut(
            code="continuation_recovery",
            status="blocked" if has_blocking_changes else "ready",
            title="Continuation recovery",
            detail=(
                f"{recovery_items_count} items would move into recovery and block apply."
                if has_blocking_changes
                else (
                    f"{reshape_items_count} items stay ready and require reshape."
                    if reshape_items_count > 0
                    else "No item recovery work is required before apply."
                )
            ),
        ),
    ]
    return gates


def _breaking_change(*, code: str, target: str, message: str) -> ContentModelImpactChangeOut:
    return ContentModelImpactChangeOut(code=code, target=target, message=message)


def _field_rows(
    record: ContentModelDefinitionRecord | _PreviewModelRecord,
) -> dict[str, ContentModelFieldRecord | _PreviewFieldRow]:
    fields = getattr(record, "fields", ())
    return {field.key: field for field in fields if isinstance(field, ContentModelFieldRecord | _PreviewFieldRow)}


def _relation_rows(
    record: ContentModelDefinitionRecord | _PreviewModelRecord,
) -> dict[str, ContentModelRelationRecord | _PreviewRelationRow]:
    relations = getattr(record, "relations", ())
    return {
        relation.key: relation
        for relation in relations
        if isinstance(relation, ContentModelRelationRecord | _PreviewRelationRow)
    }


def _compare_field_changes(
    before: Iterable[ContentModelFieldRecord | _PreviewFieldRow],
    after: Iterable[ContentModelFieldRecord | _PreviewFieldRow],
) -> list[ContentModelImpactChangeOut]:
    before_map = {field.key: field for field in before}
    after_map = {field.key: field for field in after}
    changes = [
        _breaking_change(
            code="field_removed",
            target=f"fields.{key}",
            message=f"Field '{key}' was removed from the model contract.",
        )
        for key in sorted(before_map.keys() - after_map.keys())
    ]
    for key in sorted(before_map.keys() & after_map.keys()):
        previous = before_map[key]
        current = after_map[key]
        if str(previous.field_type) != str(current.field_type):
            changes.append(
                _breaking_change(
                    code="field_scalar_changed",
                    target=f"fields.{key}",
                    message=f"Field '{key}' changed scalar type from '{previous.field_type}' to '{current.field_type}'.",
                )
            )
        if not previous.is_required and current.is_required:
            changes.append(
                _breaking_change(
                    code="field_required_enabled",
                    target=f"fields.{key}",
                    message=f"Field '{key}' became required.",
                )
            )
    return changes


def _compare_relation_changes(
    before: Iterable[ContentModelRelationRecord | _PreviewRelationRow],
    after: Iterable[ContentModelRelationRecord | _PreviewRelationRow],
) -> list[ContentModelImpactChangeOut]:
    before_map = {relation.key: relation for relation in before}
    after_map = {relation.key: relation for relation in after}
    changes = [
        _breaking_change(
            code="relation_removed",
            target=f"relations.{key}",
            message=f"Relation '{key}' was removed from the model contract.",
        )
        for key in sorted(before_map.keys() - after_map.keys())
    ]
    for key in sorted(before_map.keys() & after_map.keys()):
        previous = before_map[key]
        current = after_map[key]
        if str(previous.relation_type) != str(current.relation_type):
            changes.append(
                _breaking_change(
                    code="relation_type_changed",
                    target=f"relations.{key}",
                    message=(
                        f"Relation '{key}' changed cardinality from "
                        f"'{previous.relation_type}' to '{current.relation_type}'."
                    ),
                )
            )
        if previous.target_model_key != current.target_model_key:
            changes.append(
                _breaking_change(
                    code="relation_target_changed",
                    target=f"relations.{key}",
                    message=(
                        f"Relation '{key}' changed target model from "
                        f"'{previous.target_model_key}' to '{current.target_model_key}'."
                    ),
                )
            )
        if not previous.is_required and current.is_required:
            changes.append(
                _breaking_change(
                    code="relation_required_enabled",
                    target=f"relations.{key}",
                    message=f"Relation '{key}' became required.",
                )
            )
    return changes


def _build_mutation_impact(
    before: ContentModelDefinitionRecord | None,
    after: ContentModelDefinitionRecord | _PreviewModelRecord,
) -> ContentModelImpactOut:
    if before is None:
        return ContentModelImpactOut()
    breaking_changes = _compare_field_changes(_field_rows(before).values(), _field_rows(after).values())
    breaking_changes.extend(_compare_relation_changes(_relation_rows(before).values(), _relation_rows(after).values()))
    return ContentModelImpactOut(
        has_breaking_changes=bool(breaking_changes),
        breaking_changes=breaking_changes,
        warnings=[],
    )


def _preview_field_rows(
    payload: ContentModelDefinitionPatchContract, record: ContentModelDefinitionRecord
) -> tuple[Any, ...]:
    if "fields" not in payload.model_fields_set:
        return tuple(_field_rows(record).values())
    return tuple(
        _PreviewFieldRow(
            key=item.key,
            field_type=item.scalar,
            is_required=item.required,
        )
        for item in (payload.fields or [])
    )


def _preview_field_rows_from_contracts(fields: list[ContentModelFieldContract]) -> tuple[Any, ...]:
    return tuple(
        _PreviewFieldRow(
            key=item.key,
            field_type=item.scalar,
            is_required=item.required,
        )
        for item in fields
    )


def _preview_relation_rows(
    payload: ContentModelDefinitionPatchContract, record: ContentModelDefinitionRecord
) -> tuple[Any, ...]:
    if "relations" not in payload.model_fields_set:
        return tuple(_relation_rows(record).values())
    return tuple(
        _PreviewRelationRow(
            key=item.key,
            relation_type=item.relation,
            target_model_key=item.target_model_key,
            is_required=item.required,
        )
        for item in (payload.relations or [])
    )


def _preview_payload_fingerprint(payload: ContentModelDefinitionPatchContract) -> dict[str, Any]:
    explicit_fields = sorted(name for name in payload.model_fields_set if name != "impact_preview_token")
    explicit_values = payload.model_dump(
        mode="json",
        exclude={"impact_preview_token"},
        exclude_unset=True,
    )
    return {
        "fields_set": explicit_fields,
        "values": explicit_values,
    }


def _get_preview_signing_secret(settings: Settings) -> bytes:
    secret = (settings.auth.jwt_secret.get_secret_value() or "").strip()
    if not secret:
        raise ServiceUnavailable(error="CONTENT_MODEL_PREVIEW_SECRET_MISSING")
    return secret.encode("utf-8")


def _serialize_preview_claims(claims: dict[str, Any]) -> str:
    return json.dumps(claims, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _build_preview_claims(
    *,
    workspace_id: UUID,
    site_id: UUID,
    model_id: UUID,
    updated_at: Any,
    payload: ContentModelDefinitionPatchContract,
) -> dict[str, Any]:
    return {
        "workspace_id": str(workspace_id),
        "site_id": str(site_id),
        "model_id": str(model_id),
        "updated_at": updated_at.isoformat(),
        "payload": _preview_payload_fingerprint(payload),
    }


def _build_impact_preview_token(settings: Settings, *, claims: dict[str, Any]) -> str:
    raw = _serialize_preview_claims(claims)
    body = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")
    sig = hmac.new(_get_preview_signing_secret(settings), raw.encode("utf-8"), sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")
    return f"{body}.{sig_b64}"


def _verify_impact_preview_token(
    settings: Settings,
    *,
    token: str,
    claims: dict[str, Any],
) -> bool:
    raw = (token or "").strip()
    if not raw or "." not in raw:
        return False
    body, sig_b64 = raw.split(".", 1)
    if not body or not sig_b64:
        return False

    padding = "=" * (-len(body) % 4)
    try:
        payload_raw = base64.urlsafe_b64decode((body + padding).encode("ascii")).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return False

    expected_raw = _serialize_preview_claims(claims)
    if payload_raw != expected_raw:
        return False

    sig_padding = "=" * (-len(sig_b64) % 4)
    try:
        sig = base64.urlsafe_b64decode((sig_b64 + sig_padding).encode("ascii"))
    except (binascii.Error, ValueError):
        return False

    expected_sig = hmac.new(_get_preview_signing_secret(settings), expected_raw.encode("utf-8"), sha256).digest()
    return hmac.compare_digest(sig, expected_sig)


def _read_existing_default_value(record: ContentModelDefinitionRecord, field_name: str) -> Any:
    value = getattr(record, field_name)
    if field_name in {"default_role", "default_posture", "default_surface"}:
        return str(value) if value is not None else None
    return value


def _continuation_controls_touched(fields_set: set[str]) -> bool:
    return bool({"default_role", "default_posture", "default_surface"} & fields_set)


def _resolved_next_defaults(
    *,
    record: ContentModelDefinitionRecord,
    fields_to_update: dict[str, Any],
    fields_set: set[str],
) -> tuple[str | None, str | None, str | None]:
    if not _continuation_controls_touched(fields_set):
        return (
            str(record.default_role) if record.default_role is not None else None,
            str(record.default_posture) if record.default_posture is not None else None,
            str(record.default_surface) if record.default_surface is not None else None,
        )
    return (
        fields_to_update.get("default_role", str(record.default_role) if record.default_role is not None else None),
        fields_to_update.get(
            "default_posture",
            str(record.default_posture) if record.default_posture is not None else None,
        ),
        fields_to_update.get(
            "default_surface",
            str(record.default_surface) if record.default_surface is not None else None,
        ),
    )


def _build_preview_truth(
    *,
    model_key: str,
    default_role: str | None,
    default_posture: str | None,
    default_surface: str | None,
) -> ContentItemContinuationTruth:
    if default_role is None or default_posture is None or default_surface is None:
        return ContentItemContinuationTruth(
            resolved_role=None,
            resolved_posture=None,
            resolved_surface=None,
            shape_state=str(ContentShapeState.UNSHAPED),
            shape_reason_code=MODEL_DEFAULT_INVALID_REASON_CODE,
            shape_reason_meta={"modelKey": model_key},
        )
    return ContentItemContinuationTruth(
        resolved_role=default_role,
        resolved_posture=default_posture,
        resolved_surface=default_surface,
        shape_state=str(ContentShapeState.READY),
        shape_reason_code=None,
        shape_reason_meta=None,
    )


def _truth_signature_from_item(item: ContentItemRecord) -> tuple[Any, ...]:
    return (
        str(item.resolved_role) if item.resolved_role is not None else None,
        str(item.resolved_posture) if item.resolved_posture is not None else None,
        str(item.resolved_surface) if item.resolved_surface is not None else None,
        str(item.shape_state),
        item.shape_reason_code,
    )


def _truth_signature_from_preview(truth: ContentItemContinuationTruth) -> tuple[Any, ...]:
    return (
        truth.resolved_role,
        truth.resolved_posture,
        truth.resolved_surface,
        truth.shape_state,
        truth.shape_reason_code,
    )


def _build_default_changes(
    *,
    record: ContentModelDefinitionRecord,
    fields_to_update: dict[str, Any],
    fields_set: set[str],
) -> dict[str, dict[str, Any | None]]:
    next_default_role, next_default_posture, next_default_surface = _resolved_next_defaults(
        record=record,
        fields_to_update=fields_to_update,
        fields_set=fields_set,
    )
    after_values = {
        "default_role": next_default_role,
        "default_posture": next_default_posture,
        "default_surface": next_default_surface,
        "starter_pack_policy": fields_to_update.get("starter_pack_policy", record.starter_pack_policy),
        "surface_policy": fields_to_update.get("surface_policy", record.surface_policy),
    }
    changes: dict[str, dict[str, Any | None]] = {}
    for field_name, after_value in after_values.items():
        before_value = _read_existing_default_value(record, field_name)
        if before_value == after_value:
            continue
        changes[field_name] = {
            "before": before_value,
            "after": after_value,
        }
    return changes


def _to_field_contract(field: OfficialModelFieldDefinition) -> ContentModelFieldContract:
    return ContentModelFieldContract(
        key=field.key,
        label=field.label,
        scalar=field.scalar,
        required=field.required,
        config=field.config,
    )


def _system_field_keys(protocol: OfficialModelProtocol) -> list[str]:
    return [field.key for field in protocol.system_fields]


def _merge_system_and_custom_fields(
    *,
    protocol: OfficialModelProtocol,
    custom_fields: list[ContentModelFieldContract],
) -> list[ContentModelFieldContract]:
    return [_to_field_contract(field) for field in protocol.system_fields] + list(custom_fields)


def _assert_custom_fields_do_not_shadow_system_fields(
    *,
    protocol: OfficialModelProtocol,
    fields: list[ContentModelFieldContract],
) -> None:
    reserved = set(_system_field_keys(protocol))
    collisions = sorted({field.key for field in fields if field.key in reserved})
    if collisions:
        raise Conflict(
            "Custom fields cannot shadow system protocol fields",
            error="CONTENT_MODEL_SYSTEM_FIELD_COLLISION",
            meta={"fieldKeys": collisions, "protocolKey": protocol.key},
        )


def _assert_protocol_identity_matches_payload(
    *,
    payload: ContentModelDefinitionContract,
    protocol: OfficialModelProtocol,
) -> None:
    if payload.name.strip() != protocol.name:
        raise Conflict(
            "Official protocol model name must match the platform contract",
            error="CONTENT_MODEL_PROTOCOL_IDENTITY_MISMATCH",
            meta={"expectedName": protocol.name, "protocolKey": protocol.key},
        )


def _assert_system_patch_fields_are_not_mutated(
    *,
    record: ContentModelDefinitionRecord,
    fields_set: set[str],
) -> None:
    if not record.is_system_managed:
        return
    locked_fields = sorted(field_name for field_name in fields_set if field_name in _SYSTEM_MANAGED_PATCH_FIELDS)
    if locked_fields:
        raise Conflict(
            "System managed model contract fields are locked",
            error="CONTENT_MODEL_SYSTEM_FIELD_LOCKED",
            meta={"fieldNames": locked_fields, "protocolKey": record.protocol_key},
        )


def _contract_snapshot_payload(
    *,
    protocol: OfficialModelProtocol,
    description: str | None,
    fields: list[ContentModelFieldContract],
    relations: list[ContentModelRelationContract],
    views: list[ContentModelViewContract],
) -> dict[str, Any]:
    return {
        "protocol_key": protocol.key,
        "protocol_version": protocol.protocol_version,
        "system_managed": protocol.system_managed,
        "system_field_keys": _system_field_keys(protocol),
        "key": protocol.key,
        "name": protocol.name,
        "description": description,
        "category": protocol.category,
        "default_editor": protocol.default_editor,
        "default_role": protocol.default_role,
        "default_posture": protocol.default_posture,
        "default_surface": protocol.default_surface,
        "capabilities": list(protocol.capabilities),
        "routing_policy": protocol.routing_policy,
        "presentation_policy": protocol.presentation_policy,
        "seo_policy": protocol.seo_policy,
        "starter_pack_policy": protocol.starter_pack_policy,
        "surface_policy": protocol.surface_policy,
        "workflow_policy": protocol.workflow_policy,
        "fields": [field.model_dump(mode="json", by_alias=False, exclude_none=True) for field in fields],
        "relations": [relation.model_dump(mode="json", by_alias=False, exclude_none=True) for relation in relations],
        "views": [view.model_dump(mode="json", by_alias=False, exclude_none=True) for view in views],
    }


def _bump_draft_contract_revision(record: ContentModelDefinitionRecord, *, fields_set: set[str]) -> int:
    mutable_fields = fields_set - {"impact_preview_token"}
    current = int(record.draft_contract_revision or 1)
    if not mutable_fields:
        return current
    return current + 1


def _build_patch_updates(payload: ContentModelDefinitionPatchContract) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    fields_set = payload.model_fields_set
    if "key" in fields_set:
        if payload.key is None:
            raise Conflict("Invalid model key", error="CONTENT_MODEL_CONTRACT_INVALID")
        updates["key"] = _normalize_required_text(payload.key, error="Invalid model key")
    if "name" in fields_set:
        if payload.name is None:
            raise Conflict("Invalid model name", error="CONTENT_MODEL_CONTRACT_INVALID")
        updates["name"] = _normalize_required_text(payload.name, error="Invalid model name")
    if "description" in fields_set:
        updates["description"] = payload.description
    if "category" in fields_set:
        updates["category"] = normalize_model_category(payload.category)
    if "default_editor" in fields_set:
        updates["default_editor"] = normalize_default_editor(payload.default_editor)
    if "default_role" in fields_set:
        updates["default_role"] = payload.default_role
    if "default_posture" in fields_set:
        updates["default_posture"] = payload.default_posture
    if "default_surface" in fields_set:
        updates["default_surface"] = payload.default_surface
    if "capabilities" in fields_set:
        updates["capabilities"] = _capabilities(payload.capabilities or [])
    if "routing" in fields_set:
        updates["routing_policy"] = dump_contract(payload.routing)
    if "presentation" in fields_set:
        updates["presentation_policy"] = dump_contract(payload.presentation)
    if "seo" in fields_set:
        updates["seo_policy"] = dump_contract(payload.seo)
    if "starter_pack_policy" in fields_set:
        updates["starter_pack_policy"] = dump_contract(payload.starter_pack_policy)
    if "surface_policy" in fields_set:
        updates["surface_policy"] = dump_contract(payload.surface_policy)
    if "workflow" in fields_set:
        updates["workflow_policy"] = dump_contract(payload.workflow)
    return updates


def _record_snapshot_payload(record: ContentModelDefinitionRecord) -> dict[str, Any]:
    return {
        "protocol_key": record.protocol_key,
        "protocol_version": int(record.protocol_version or 1),
        "system_managed": bool(record.is_system_managed),
        "system_field_keys": list(record.system_field_keys or []),
        "key": str(record.key),
        "name": str(record.name),
        "description": record.description,
        "category": str(record.category or "custom"),
        "default_editor": str(record.default_editor or "form"),
        "default_role": str(record.default_role) if record.default_role is not None else None,
        "default_posture": str(record.default_posture) if record.default_posture is not None else None,
        "default_surface": str(record.default_surface) if record.default_surface is not None else None,
        "capabilities": list(record.capabilities or []),
        "routing_policy": record.routing_policy,
        "presentation_policy": record.presentation_policy,
        "seo_policy": record.seo_policy,
        "starter_pack_policy": record.starter_pack_policy,
        "surface_policy": record.surface_policy,
        "workflow_policy": record.workflow_policy,
        "fields": [
            ContentModelFieldContract(
                key=str(field.key),
                label=str(field.label),
                scalar=cast(Any, str(field.field_type)),
                required=bool(field.is_required),
                config=field.config,
            ).model_dump(mode="json", by_alias=False, exclude_none=True)
            for field in record.fields
        ],
        "relations": [
            ContentModelRelationContract(
                key=str(relation.key),
                relation=cast(Any, str(relation.relation_type)),
                target_model_key=str(relation.target_model_key),
                required=bool(relation.is_required),
                config=relation.config,
            ).model_dump(mode="json", by_alias=False, exclude_none=True)
            for relation in record.relations
        ],
        "views": [
            ContentModelViewContract(
                key=str(view.key),
                label=str(view.label),
                type=cast(Any, str(view.view_type)),
                config=view.dsl,
            ).model_dump(mode="json", by_alias=False, exclude_none=True)
            for view in record.views
        ],
    }


def _next_snapshot_payload(
    *,
    record: ContentModelDefinitionRecord,
    fields_to_update: dict[str, Any],
    fields_set: set[str],
    fields: list[ContentModelFieldContract],
    relations: list[ContentModelRelationContract] | None,
    views: list[ContentModelViewContract] | None,
) -> dict[str, Any]:
    current_payload = _record_snapshot_payload(record)
    next_payload = dict(current_payload)
    for field_name in (
        "key",
        "name",
        "description",
        "category",
        "default_editor",
        "default_role",
        "default_posture",
        "default_surface",
        "capabilities",
        "routing_policy",
        "presentation_policy",
        "seo_policy",
        "starter_pack_policy",
        "surface_policy",
        "workflow_policy",
    ):
        if field_name in fields_to_update:
            next_payload[field_name] = fields_to_update[field_name]
    if "fields" in fields_set:
        next_payload["fields"] = [field.model_dump(mode="json", by_alias=False, exclude_none=True) for field in fields]
    if "relations" in fields_set:
        next_payload["relations"] = [
            relation.model_dump(mode="json", by_alias=False, exclude_none=True) for relation in (relations or [])
        ]
    if "views" in fields_set:
        next_payload["views"] = [
            view.model_dump(mode="json", by_alias=False, exclude_none=True) for view in (views or [])
        ]
    return next_payload


class WorkspaceContentCanonicalModelsService:
    def __init__(self, repo: WorkspaceContentModelsRepository, settings: Settings) -> None:
        self.repo = repo
        self.settings = settings

    async def list_models_paginated(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        params: PageParams,
    ) -> PageData[ContentModelOut]:
        records = await self.repo.list_model_definitions(workspace_id=workspace_id, site_id=site_id)
        rows = [to_content_model_out(record) for record in records]
        return paginate_items(rows, params=params)

    async def create_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        payload: ContentModelDefinitionContract,
    ) -> ContentModelMutationResult:
        protocol = get_official_model_protocol(payload.key)
        if protocol is None:
            raise Conflict(
                "Headless CMS v1 only supports official protocol models",
                error="CONTENT_MODEL_PROTOCOL_UNSUPPORTED",
                meta={"supportedKeys": ["article", "page", "reusable-section", "category"]},
            )
        _assert_protocol_identity_matches_payload(payload=payload, protocol=protocol)
        _assert_custom_fields_do_not_shadow_system_fields(protocol=protocol, fields=payload.fields)
        merged_fields = _merge_system_and_custom_fields(protocol=protocol, custom_fields=payload.fields)
        published_contract_snapshot = _contract_snapshot_payload(
            protocol=protocol,
            description=payload.description,
            fields=merged_fields,
            relations=payload.relations,
            views=payload.views,
        )
        defaults = resolve_model_continuation_defaults(
            key=protocol.key,
            name=protocol.name,
            category=protocol.category,
            default_editor=protocol.default_editor,
            capabilities=list(protocol.capabilities),
            default_role=protocol.default_role,
            default_posture=protocol.default_posture,
            default_surface=protocol.default_surface,
            starter_pack_policy=protocol.starter_pack_policy,
            surface_policy=protocol.surface_policy,
        )
        if defaults.default_role is None or defaults.default_posture is None or defaults.default_surface is None:
            raise ValueError("Content model continuation defaults must resolve before create_model_definition")
        record = await self.repo.create_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            key=_normalize_required_text(protocol.key, error="Invalid model key"),
            name=_normalize_required_text(protocol.name, error="Invalid model name"),
            description=payload.description,
            category=normalize_model_category(cast(ContentModelCategory, protocol.category)),
            default_editor=normalize_default_editor(cast(ContentDefaultEditor, protocol.default_editor)),
            default_role=defaults.default_role,
            default_posture=defaults.default_posture,
            default_surface=defaults.default_surface,
            protocol_key=protocol.key,
            protocol_version=protocol.protocol_version,
            is_system_managed=protocol.system_managed,
            system_field_keys=_system_field_keys(protocol),
            draft_contract_revision=1,
            published_contract_revision=1,
            published_contract_snapshot=published_contract_snapshot,
            capabilities=list(protocol.capabilities),
            routing_policy=protocol.routing_policy,
            presentation_policy=protocol.presentation_policy,
            seo_policy=protocol.seo_policy,
            starter_pack_policy=defaults.starter_pack_policy,
            surface_policy=defaults.surface_policy,
            workflow_policy=protocol.workflow_policy,
            fields=merged_fields,
            relations=payload.relations,
            views=payload.views,
        )
        return ContentModelMutationResult(record=record, impact=ContentModelImpactOut())

    async def _build_update_context(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        record: ContentModelDefinitionRecord,
        payload: ContentModelDefinitionPatchContract,
    ) -> _ModelUpdateContext:
        fields_set = set(payload.model_fields_set)
        _assert_system_patch_fields_are_not_mutated(record=record, fields_set=fields_set)
        protocol = get_official_model_protocol(record.protocol_key or record.key)
        if record.is_system_managed and protocol is None:
            raise Conflict(
                "System managed model is missing an official protocol registry entry",
                error="CONTENT_MODEL_PROTOCOL_MISSING",
                meta={"protocolKey": record.protocol_key or record.key},
            )
        if protocol is not None and "fields" in fields_set:
            _assert_custom_fields_do_not_shadow_system_fields(protocol=protocol, fields=payload.fields or [])
        fields_to_update = _build_patch_updates(payload)
        if record.is_system_managed and protocol is not None and "fields" in fields_set:
            payload_fields = _merge_system_and_custom_fields(protocol=protocol, custom_fields=payload.fields or [])
        else:
            payload_fields = (
                list(payload.fields or [])
                if "fields" in fields_set
                else [
                    ContentModelFieldContract(
                        key=str(field.key),
                        label=str(field.label),
                        scalar=cast(Any, str(field.field_type)),
                        required=bool(field.is_required),
                        config=field.config,
                    )
                    for field in record.fields
                ]
            )
        next_relations = (
            list(payload.relations or [])
            if "relations" in fields_set
            else [
                ContentModelRelationContract(
                    key=str(relation.key),
                    relation=cast(Any, str(relation.relation_type)),
                    target_model_key=str(relation.target_model_key),
                    required=bool(relation.is_required),
                    config=relation.config,
                )
                for relation in record.relations
            ]
        )
        next_views = (
            list(payload.views or [])
            if "views" in fields_set
            else [
                ContentModelViewContract(
                    key=str(view.key),
                    label=str(view.label),
                    type=cast(Any, str(view.view_type)),
                    config=view.dsl,
                )
                for view in record.views
            ]
        )
        next_draft_revision = _bump_draft_contract_revision(record, fields_set=fields_set)
        fields_to_update["draft_contract_revision"] = next_draft_revision
        next_default_role, next_default_posture, next_default_surface = _resolved_next_defaults(
            record=record,
            fields_to_update=fields_to_update,
            fields_set=fields_set,
        )
        next_truth = _build_preview_truth(
            model_key=str(record.key),
            default_role=next_default_role,
            default_posture=next_default_posture,
            default_surface=next_default_surface,
        )
        items = await self.repo.list_items_for_model(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
        )
        next_signature = _truth_signature_from_preview(next_truth)
        affected_items_count = 0
        recovery_items_count = 0
        reshape_items_count = 0
        for item in items:
            if _truth_signature_from_item(item) == next_signature:
                continue
            affected_items_count += 1
            if next_truth.shape_state != str(ContentShapeState.READY):
                recovery_items_count += 1
            else:
                reshape_items_count += 1
        claims = _build_preview_claims(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            updated_at=record.updated_at,
            payload=payload,
        )
        impact = _build_mutation_impact(
            record,
            _PreviewModelRecord(
                fields=_preview_field_rows_from_contracts(payload_fields),
                relations=tuple(
                    _PreviewRelationRow(
                        key=item.key,
                        relation_type=item.relation,
                        target_model_key=item.target_model_key,
                        is_required=item.required,
                    )
                    for item in next_relations
                ),
            ),
        )
        current_snapshot_payload = _record_snapshot_payload(record)
        next_snapshot_payload = _next_snapshot_payload(
            record=record,
            fields_to_update=fields_to_update,
            fields_set=fields_set,
            fields=payload_fields,
            relations=next_relations,
            views=next_views,
        )
        diff = _build_schema_diff(
            current_snapshot=current_snapshot_payload,
            next_snapshot=next_snapshot_payload,
            impact=impact,
        )
        apply_gates = _build_apply_gates(
            diff=diff,
            affected_items_count=affected_items_count,
            recovery_items_count=recovery_items_count,
            reshape_items_count=reshape_items_count,
            has_blocking_changes=recovery_items_count > 0,
        )
        published_snapshot_payload = (
            dict(record.published_contract_snapshot) if isinstance(record.published_contract_snapshot, dict) else None
        )
        change_plan = ContentModelSchemaChangePlanOut(
            revisions=ContentModelRevisionSummaryOut(
                current_draft_revision=int(record.draft_contract_revision or 1),
                published_revision=(
                    int(record.published_contract_revision) if record.published_contract_revision is not None else None
                ),
                next_draft_revision=next_draft_revision,
            ),
            current_snapshot=_build_snapshot(
                stage="current_draft",
                revision=int(record.draft_contract_revision or 1),
                payload=current_snapshot_payload,
            ),
            next_snapshot=_build_snapshot(
                stage="next_draft",
                revision=next_draft_revision,
                payload=next_snapshot_payload,
            ),
            published_snapshot=(
                _build_snapshot(
                    stage="published",
                    revision=(
                        int(record.published_contract_revision)
                        if record.published_contract_revision is not None
                        else None
                    ),
                    payload=published_snapshot_payload,
                )
                if published_snapshot_payload is not None
                else None
            ),
            diff=diff,
            apply_gates=apply_gates,
            apply_ready=not any(gate.status == "blocked" for gate in apply_gates),
        )
        preview = ContentModelImpactPreviewResult(
            affected_items_count=affected_items_count,
            recovery_items_count=recovery_items_count,
            reshape_items_count=reshape_items_count,
            has_blocking_changes=recovery_items_count > 0,
            preview_token=_build_impact_preview_token(self.settings, claims=claims),
            impact=impact,
            change_plan=change_plan,
        )
        return _ModelUpdateContext(
            fields_to_update=fields_to_update,
            preview=preview,
            default_changes=_build_default_changes(
                record=record,
                fields_to_update=fields_to_update,
                fields_set=fields_set,
            ),
        )

    async def preview_model_update(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        payload: ContentModelDefinitionPatchContract,
    ) -> ContentModelImpactPreviewResult | None:
        existing = await self.repo.get_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
        )
        if existing is None:
            return None
        context = await self._build_update_context(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            record=existing,
            payload=payload,
        )
        return context.preview

    async def update_model(
        self,
        *,
        workspace_id: UUID,
        site_id: UUID,
        model_id: UUID,
        payload: ContentModelDefinitionPatchContract,
    ) -> ContentModelMutationResult | None:
        existing = await self.repo.get_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
        )
        if existing is None:
            return None
        _assert_system_patch_fields_are_not_mutated(
            record=existing,
            fields_set=set(payload.model_fields_set),
        )
        preview_token = (payload.impact_preview_token or "").strip()
        if not preview_token:
            raise Conflict(
                "Impact preview required before saving model changes", error="CONTENT_MODEL_IMPACT_PREVIEW_REQUIRED"
            )
        context = await self._build_update_context(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            record=existing,
            payload=payload,
        )
        claims = _build_preview_claims(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            updated_at=existing.updated_at,
            payload=payload,
        )
        if not _verify_impact_preview_token(
            self.settings,
            token=preview_token,
            claims=claims,
        ):
            raise Conflict("Invalid impact preview token", error="CONTENT_MODEL_IMPACT_PREVIEW_TOKEN_INVALID")
        if context.preview.has_blocking_changes:
            raise Conflict(
                "Impact preview contains blocking continuation changes",
                error="CONTENT_MODEL_IMPACT_PREVIEW_BLOCKING",
            )
        fields_set = payload.model_fields_set
        protocol = get_official_model_protocol(existing.protocol_key or existing.key)
        merged_fields = (
            _merge_system_and_custom_fields(protocol=protocol, custom_fields=payload.fields or [])
            if protocol is not None and "fields" in fields_set
            else payload.fields
        )
        updated = await self.repo.update_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            fields_to_update=context.fields_to_update,
            fields=(merged_fields if "fields" in fields_set else None),
            relations=(payload.relations if "relations" in fields_set else None),
            views=(payload.views if "views" in fields_set else None),
        )
        if updated is None:
            return None
        return ContentModelMutationResult(
            record=updated,
            impact=context.preview.impact,
            preview=context.preview,
            default_changes=context.default_changes,
        )
