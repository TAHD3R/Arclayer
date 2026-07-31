from __future__ import annotations

from collections.abc import MutableSequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from src.core.exceptions import BadRequest
from src.models.platform_saved_views import PlatformSavedView
from src.modules.platform_identity.permissions import PlatformPermissionCode
from src.modules.platform_saved_views.schema import (
    PlatformSavedViewDraft,
    PlatformSavedViewEffectiveOut,
    PlatformSavedViewFilter,
    PlatformSavedViewOmission,
    PlatformSavedViewOrdering,
)


@dataclass(frozen=True)
class FilterDefinition:
    value_kind: Literal["boolean", "datetime", "enum", "integer", "string", "uuid"]
    allowed_values: frozenset[str] = frozenset()


@dataclass(frozen=True)
class CapabilityDefinition:
    capability_id: str
    filter_schema_revision: str
    column_schema_revision: str
    required_permissions: tuple[PlatformPermissionCode, ...]
    filters: dict[str, FilterDefinition]
    ordering: dict[str, frozenset[str]]
    columns: frozenset[str]
    densities: frozenset[str]


_OPERATIONS_SIGNALS_CAPABILITY = CapabilityDefinition(
    capability_id="operations.signals",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.OPERATIONS_SIGNALS_READ,),
    filters={
        "source_lifecycle": FilterDefinition("enum", frozenset({"unresolved", "resolved", "all"})),
        "coordination_state": FilterDefinition("enum", frozenset({"needs_attention", "in_progress", "remind_later"})),
        "assignee_user_id": FilterDefinition("uuid"),
        "workspace_id": FilterDefinition("uuid"),
        "project_id": FilterDefinition("uuid"),
        "site_id": FilterDefinition("uuid"),
        "include_reminded": FilterDefinition("boolean"),
    },
    ordering={"completed_at": frozenset({"asc"})},
    columns=frozenset({
        "severity",
        "priority",
        "source_lifecycle",
        "detected_at",
        "workspace_id",
        "project_id",
        "site_id",
        "coordination_state",
        "assignee_user_id",
        "reminder_at",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_TENANT_USERS_CAPABILITY = CapabilityDefinition(
    capability_id="tenant.users",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.TENANT_USERS_READ,),
    filters={
        "status": FilterDefinition("enum", frozenset({"active", "disabled", "locked"})),
        "has_password": FilterDefinition("boolean"),
        "two_factor_enabled": FilterDefinition("boolean"),
        "oauth_provider": FilterDefinition("string"),
        "created_from": FilterDefinition("datetime"),
        "created_to": FilterDefinition("datetime"),
        "last_login_from": FilterDefinition("datetime"),
        "last_login_to": FilterDefinition("datetime"),
        "workspace_member_of_id": FilterDefinition("uuid"),
        "project_member_of_id": FilterDefinition("uuid"),
        "owned_workspace_id": FilterDefinition("uuid"),
        "owned_project_id": FilterDefinition("uuid"),
    },
    ordering={
        field: frozenset({"asc", "desc"}) for field in ("created_at", "username", "email", "status", "last_login_at")
    },
    columns=frozenset({
        "username",
        "display_name",
        "email",
        "status",
        "has_password",
        "two_factor_enabled",
        "last_login_at",
        "created_at",
        "workspace_membership_count",
        "project_membership_count",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_TENANT_WORKSPACES_CAPABILITY = CapabilityDefinition(
    capability_id="tenant.workspaces",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.TENANT_WORKSPACES_READ,),
    filters={
        "is_archived": FilterDefinition("boolean"),
        "is_active": FilterDefinition("boolean"),
        "owner_user_id": FilterDefinition("uuid"),
        "plan_code": FilterDefinition("string"),
        "subscription_status": FilterDefinition("enum", frozenset({"active", "past_due", "canceled"})),
        "commerce_risk": FilterDefinition("enum", frozenset({"healthy", "attention_required", "data_missing"})),
        "created_from": FilterDefinition("datetime"),
        "created_to": FilterDefinition("datetime"),
        "activity_from": FilterDefinition("datetime"),
        "activity_to": FilterDefinition("datetime"),
    },
    ordering={
        field: frozenset({"asc", "desc"})
        for field in (
            "created_at",
            "activity_at",
            "name",
            "member_count",
            "project_count",
            "plan",
            "credit_risk",
            "renewal_at",
        )
    },
    columns=frozenset({
        "name",
        "is_active",
        "is_archived",
        "created_at",
        "last_activity_at",
        "owner",
        "member_count",
        "project_count",
        "commerce",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_TENANT_PROJECTS_CAPABILITY = CapabilityDefinition(
    capability_id="tenant.projects",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.TENANT_PROJECTS_READ,),
    filters={
        "workspace_id": FilterDefinition("uuid"),
        "is_active": FilterDefinition("boolean"),
        "owner_user_id": FilterDefinition("uuid"),
        "runtime_health": FilterDefinition(
            "enum", frozenset({"healthy", "degraded", "inactive", "not_deployed", "unavailable"})
        ),
        "domain_state": FilterDefinition("enum", frozenset({"ready", "attention_required", "none"})),
        "release_state": FilterDefinition(
            "enum", frozenset({"active", "scheduled", "published", "cancelled", "not_released"})
        ),
        "created_from": FilterDefinition("datetime"),
        "created_to": FilterDefinition("datetime"),
        "activity_from": FilterDefinition("datetime"),
        "activity_to": FilterDefinition("datetime"),
    },
    ordering={
        field: frozenset({"asc", "desc"})
        for field in ("activity_at", "created_at", "member_count", "name", "slug", "workspace_name")
    },
    columns=frozenset({
        "workspace_name",
        "name",
        "slug",
        "is_active",
        "created_at",
        "last_activity_at",
        "owner",
        "member_count",
        "operations",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_MONITORING_REQUEST_GROUPS_CAPABILITY = CapabilityDefinition(
    capability_id="monitoring.request-groups",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
    filters={
        "days": FilterDefinition("integer"),
        "method": FilterDefinition("string"),
        "status_class": FilterDefinition("integer"),
        "workspace_id": FilterDefinition("uuid"),
        "project_id": FilterDefinition("uuid"),
    },
    ordering={
        "requests": frozenset({"desc"}),
        "error_rate": frozenset({"desc"}),
        "p95_latency_ms": frozenset({"desc"}),
        "p99_latency_ms": frozenset({"desc"}),
        "avg_latency_ms": frozenset({"desc"}),
        "last_seen_at": frozenset({"desc"}),
    },
    columns=frozenset({
        "route_template",
        "method",
        "status_class",
        "requests",
        "error_requests",
        "error_rate",
        "avg_latency_ms",
        "p95_latency_ms",
        "p99_latency_ms",
        "max_latency_ms",
        "last_seen_at",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_MONITORING_REQUEST_RECORDS_CAPABILITY = CapabilityDefinition(
    capability_id="monitoring.request-records",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
    filters={
        "days": FilterDefinition("integer"),
        "method": FilterDefinition("string"),
        "status_class": FilterDefinition("integer"),
        "workspace_id": FilterDefinition("uuid"),
        "project_id": FilterDefinition("uuid"),
        "actor_user_id": FilterDefinition("uuid"),
        "min_duration_ms": FilterDefinition("integer"),
        "max_duration_ms": FilterDefinition("integer"),
        "has_error": FilterDefinition("boolean"),
    },
    ordering={
        "occurred_at": frozenset({"asc", "desc"}),
        "duration_ms": frozenset({"asc", "desc"}),
        "status_code": frozenset({"desc"}),
    },
    columns=frozenset({
        "occurred_at",
        "trace_id",
        "actor",
        "workspace_id",
        "project_id",
        "route_template",
        "method",
        "status_code",
        "duration_ms",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_MONITORING_AI_USAGE_CAPABILITY = CapabilityDefinition(
    capability_id="monitoring.ai-usage-groups",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.MONITORING_REQUESTS_READ,),
    filters={
        "days": FilterDefinition("integer"),
        "provider": FilterDefinition("string"),
        "workspace_id": FilterDefinition("uuid"),
        "project_id": FilterDefinition("uuid"),
    },
    ordering={"cost_micros": frozenset({"desc"})},
    columns=frozenset({
        "provider",
        "model",
        "requests",
        "error_requests",
        "error_rate",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "cost_micros",
        "avg_latency_ms",
        "last_seen_at",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_MONITORING_AUDIT_CAPABILITY = CapabilityDefinition(
    capability_id="monitoring.audit",
    filter_schema_revision="1",
    column_schema_revision="1",
    required_permissions=(PlatformPermissionCode.MONITORING_AUDIT_READ,),
    filters={
        "occurred_from": FilterDefinition("datetime"),
        "occurred_to": FilterDefinition("datetime"),
        "event_name": FilterDefinition("string"),
        "workspace_id": FilterDefinition("uuid"),
        "project_id": FilterDefinition("uuid"),
        "actor_user_id": FilterDefinition("uuid"),
        "subject_user_id": FilterDefinition("uuid"),
        "entity_type": FilterDefinition("string"),
        "entity_id": FilterDefinition("uuid"),
    },
    ordering={"occurred_at": frozenset({"asc", "desc"})},
    columns=frozenset({
        "occurred_at",
        "event_name",
        "workspace_id",
        "project_id",
        "actor",
        "subject",
        "entity_type",
        "entity_id",
        "source",
        "trace_id",
    }),
    densities=frozenset({"compact", "comfortable", "spacious"}),
)

_CAPABILITIES = {
    capability.capability_id: capability
    for capability in (
        _OPERATIONS_SIGNALS_CAPABILITY,
        _TENANT_USERS_CAPABILITY,
        _TENANT_WORKSPACES_CAPABILITY,
        _TENANT_PROJECTS_CAPABILITY,
        _MONITORING_REQUEST_GROUPS_CAPABILITY,
        _MONITORING_REQUEST_RECORDS_CAPABILITY,
        _MONITORING_AI_USAGE_CAPABILITY,
        _MONITORING_AUDIT_CAPABILITY,
    )
}


def get_capability(capability_id: str) -> CapabilityDefinition | None:
    return _CAPABILITIES.get(capability_id)


def require_capability(capability_id: str) -> CapabilityDefinition:
    capability = get_capability(capability_id)
    if capability is None:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_CAPABILITY_INVALID", meta={"capability_id": capability_id})
    return capability


def validate_draft(*, capability: CapabilityDefinition, draft: PlatformSavedViewDraft) -> None:
    if draft.filter_schema_revision != capability.filter_schema_revision:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_FILTER_SCHEMA_REVISION_INVALID")
    if draft.column_schema_revision != capability.column_schema_revision:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_COLUMN_SCHEMA_REVISION_INVALID")
    _validate_filters(capability=capability, draft=draft)
    _validate_ordering(capability=capability, draft=draft)
    _validate_columns(capability=capability, draft=draft)
    if draft.density not in capability.densities:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_DENSITY_INVALID", meta={"density": draft.density})


def effective_draft(
    *, view: PlatformSavedView, capability: CapabilityDefinition
) -> tuple[PlatformSavedViewEffectiveOut, tuple[PlatformSavedViewOmission, ...]]:
    omissions: list[PlatformSavedViewOmission] = []
    filters = _effective_filters(view=view, capability=capability, omissions=omissions)
    ordering = _effective_ordering(view=view, capability=capability, omissions=omissions)
    visible_columns, column_order = _effective_columns(view=view, capability=capability, omissions=omissions)
    density = _effective_density(view=view, capability=capability, omissions=omissions)
    return (
        PlatformSavedViewEffectiveOut(
            filter_schema_revision=capability.filter_schema_revision,
            column_schema_revision=capability.column_schema_revision,
            filters=filters,
            ordering=ordering,
            visible_columns=visible_columns,
            column_order=column_order,
            density=density,
        ),
        tuple(omissions),
    )


def _validate_filters(*, capability: CapabilityDefinition, draft: PlatformSavedViewDraft) -> None:
    seen_codes: set[str] = set()
    for condition in draft.filters:
        if condition.code in seen_codes:
            raise BadRequest(error="PLATFORM_SAVED_VIEW_FILTER_DUPLICATE", meta={"filter_code": condition.code})
        seen_codes.add(condition.code)
        if _filter_invalid(capability=capability, condition=condition):
            raise BadRequest(error="PLATFORM_SAVED_VIEW_FILTER_INVALID", meta={"filter_code": condition.code})


def _validate_ordering(*, capability: CapabilityDefinition, draft: PlatformSavedViewDraft) -> None:
    directions = capability.ordering.get(draft.ordering.code)
    if directions is None or draft.ordering.direction not in directions:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_ORDERING_INVALID", meta={"ordering_code": draft.ordering.code})


def _validate_columns(*, capability: CapabilityDefinition, draft: PlatformSavedViewDraft) -> None:
    visible = set(draft.visible_columns)
    order = set(draft.column_order)
    if len(visible) != len(draft.visible_columns) or len(order) != len(draft.column_order):
        raise BadRequest(error="PLATFORM_SAVED_VIEW_COLUMN_DUPLICATE")
    invalid = visible - capability.columns
    if invalid:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_COLUMN_INVALID", meta={"column_code": sorted(invalid)[0]})
    if visible != order:
        raise BadRequest(error="PLATFORM_SAVED_VIEW_COLUMN_ORDER_INVALID")


def _filter_invalid(*, capability: CapabilityDefinition, condition: PlatformSavedViewFilter) -> bool:
    definition = capability.filters.get(condition.code)
    if definition is None:
        return True
    if definition.value_kind == "boolean":
        return type(condition.value) is not bool
    if definition.value_kind == "enum":
        return condition.value not in definition.allowed_values
    if definition.value_kind == "integer":
        return type(condition.value) is not int
    if definition.value_kind == "string":
        return not isinstance(condition.value, str) or not condition.value.strip()
    if definition.value_kind == "datetime":
        if not isinstance(condition.value, str):
            return True
        try:
            datetime.fromisoformat(condition.value.replace("Z", "+00:00"))
        except ValueError:
            return True
        return False
    try:
        UUID(str(condition.value))
    except (TypeError, ValueError):
        return True
    return False


def _effective_filters(
    *,
    view: PlatformSavedView,
    capability: CapabilityDefinition,
    omissions: MutableSequence[PlatformSavedViewOmission],
) -> tuple[PlatformSavedViewFilter, ...]:
    if view.filter_schema_revision != capability.filter_schema_revision:
        omissions.append(
            PlatformSavedViewOmission(kind="filter_schema", code=view.filter_schema_revision, reason="unavailable")
        )
        return ()
    filters = tuple(PlatformSavedViewFilter.model_validate(item) for item in view.filters)
    valid_filters = tuple(item for item in filters if not _filter_invalid(capability=capability, condition=item))
    for item in filters:
        if item not in valid_filters:
            omissions.append(PlatformSavedViewOmission(kind="filter", code=item.code, reason="invalid"))
    return valid_filters


def _effective_ordering(
    *,
    view: PlatformSavedView,
    capability: CapabilityDefinition,
    omissions: MutableSequence[PlatformSavedViewOmission],
) -> PlatformSavedViewOrdering | None:
    ordering = PlatformSavedViewOrdering.model_validate(view.ordering)
    directions = capability.ordering.get(ordering.code)
    if directions is None or ordering.direction not in directions:
        omissions.append(PlatformSavedViewOmission(kind="ordering", code=ordering.code, reason="invalid"))
        return None
    return ordering


def _effective_columns(
    *,
    view: PlatformSavedView,
    capability: CapabilityDefinition,
    omissions: MutableSequence[PlatformSavedViewOmission],
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    if view.column_schema_revision != capability.column_schema_revision:
        omissions.append(
            PlatformSavedViewOmission(kind="column_schema", code=view.column_schema_revision, reason="unavailable")
        )
        return (), ()
    visible = tuple(str(code) for code in view.visible_columns)
    valid = tuple(code for code in visible if code in capability.columns)
    for code in visible:
        if code not in capability.columns:
            omissions.append(PlatformSavedViewOmission(kind="column", code=code, reason="invalid"))
    stored_order = tuple(str(code) for code in view.column_order)
    if (
        len(set(visible)) != len(visible)
        or len(set(stored_order)) != len(stored_order)
        or set(visible) != set(stored_order)
    ):
        omissions.append(PlatformSavedViewOmission(kind="column", code="column_order", reason="invalid"))
    return valid, tuple(code for code in stored_order if code in valid)


def _effective_density(
    *,
    view: PlatformSavedView,
    capability: CapabilityDefinition,
    omissions: MutableSequence[PlatformSavedViewOmission],
) -> Literal["compact", "comfortable", "spacious"] | None:
    if view.density not in capability.densities:
        omissions.append(PlatformSavedViewOmission(kind="density", code=view.density, reason="invalid"))
        return None
    return view.density
