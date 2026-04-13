from __future__ import annotations

import base64
import binascii
import hmac
import json
from collections.abc import Iterable
from dataclasses import dataclass
from hashlib import sha256
from typing import Any
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


def _build_preview_model_record(
    *,
    record: ContentModelDefinitionRecord,
    payload: ContentModelDefinitionPatchContract,
) -> _PreviewModelRecord:
    return _PreviewModelRecord(
        fields=_preview_field_rows(payload, record),
        relations=_preview_relation_rows(payload, record),
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
        defaults = resolve_model_continuation_defaults(
            key=payload.key,
            name=payload.name,
            category=payload.category,
            default_editor=payload.default_editor,
            capabilities=_capabilities(payload.capabilities),
            default_role=payload.default_role,
            default_posture=payload.default_posture,
            default_surface=payload.default_surface,
            starter_pack_policy=payload.starter_pack_policy,
            surface_policy=payload.surface_policy,
        )
        if defaults.default_role is None or defaults.default_posture is None or defaults.default_surface is None:
            raise ValueError("Content model continuation defaults must resolve before create_model_definition")
        record = await self.repo.create_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            key=_normalize_required_text(payload.key, error="Invalid model key"),
            name=_normalize_required_text(payload.name, error="Invalid model name"),
            description=payload.description,
            category=normalize_model_category(payload.category),
            default_editor=normalize_default_editor(payload.default_editor),
            default_role=defaults.default_role,
            default_posture=defaults.default_posture,
            default_surface=defaults.default_surface,
            capabilities=_capabilities(payload.capabilities),
            routing_policy=dump_contract(payload.routing),
            presentation_policy=dump_contract(payload.presentation),
            seo_policy=dump_contract(payload.seo),
            starter_pack_policy=defaults.starter_pack_policy,
            surface_policy=defaults.surface_policy,
            workflow_policy=dump_contract(payload.workflow),
            fields=payload.fields,
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
        fields_to_update = _build_patch_updates(payload)
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
        preview = ContentModelImpactPreviewResult(
            affected_items_count=affected_items_count,
            recovery_items_count=recovery_items_count,
            reshape_items_count=reshape_items_count,
            has_blocking_changes=recovery_items_count > 0,
            preview_token=_build_impact_preview_token(self.settings, claims=claims),
            impact=_build_mutation_impact(
                record,
                _build_preview_model_record(record=record, payload=payload),
            ),
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
        updated = await self.repo.update_model_definition(
            workspace_id=workspace_id,
            site_id=site_id,
            model_id=model_id,
            fields_to_update=context.fields_to_update,
            fields=(payload.fields if "fields" in fields_set else None),
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
