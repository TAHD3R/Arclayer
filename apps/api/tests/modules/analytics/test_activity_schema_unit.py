from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4


def test_audit_event_output_does_not_expose_internal_organization_identity() -> None:
    from src.modules.analytics.schema import AuditEventOut

    now = datetime.now(UTC)
    event = AuditEventOut.model_validate({
        "id": uuid4(),
        "created_at": now,
        "updated_at": now,
        "occurred_at": now,
        "event_name": "system.settings.updated",
        "organization_id": uuid4(),
    })

    assert "organizationId" not in event.model_dump(mode="json", by_alias=True)
    assert "organizationId" not in AuditEventOut.model_json_schema(by_alias=True)["properties"]


def test_audit_event_list_query_accepts_camel_case_time_range() -> None:
    from src.modules.analytics.schema import AuditEventListQuery

    query = AuditEventListQuery.model_validate({
        "occurredFrom": "2026-01-01T00:00:00Z",
        "occurredTo": "2026-01-02T00:00:00Z",
    })

    assert query.occurred_from is not None
    assert query.occurred_to is not None


def test_audit_event_list_query_keeps_short_time_range_aliases() -> None:
    from src.modules.analytics.schema import AuditEventListQuery

    query = AuditEventListQuery.model_validate({
        "from": "2026-01-01T00:00:00Z",
        "to": "2026-01-02T00:00:00Z",
    })

    assert query.occurred_from is not None
    assert query.occurred_to is not None


def test_audit_event_repository_applies_ascending_order() -> None:
    from src.models.analytics.audit_event import AuditEvent
    from src.modules.analytics.repository import AuditEventRepository
    from src.modules.analytics.schema import AuditEventListQuery, AuditEventOrdering

    queryset = MagicMock()
    ascending_queryset = MagicMock()
    queryset.order_by.return_value = ascending_queryset

    with patch.object(AuditEvent, "all", return_value=queryset):
        result = AuditEventRepository().build_queryset(
            organization_id=None,
            filters=AuditEventListQuery(ordering=AuditEventOrdering.OCCURRED_ASC),
        )

    queryset.order_by.assert_called_once_with("occurred_at", "id")
    assert result is ascending_queryset
