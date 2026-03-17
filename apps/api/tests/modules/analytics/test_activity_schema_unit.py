from __future__ import annotations


def test_audit_event_list_query_accepts_camel_case_time_range() -> None:
    from apps.api.src.modules.analytics.schema import AuditEventListQuery

    query = AuditEventListQuery.model_validate({
        "occurredFrom": "2026-01-01T00:00:00Z",
        "occurredTo": "2026-01-02T00:00:00Z",
    })

    assert query.occurred_from is not None
    assert query.occurred_to is not None


def test_audit_event_list_query_keeps_short_time_range_aliases() -> None:
    from apps.api.src.modules.analytics.schema import AuditEventListQuery

    query = AuditEventListQuery.model_validate({
        "from": "2026-01-01T00:00:00Z",
        "to": "2026-01-02T00:00:00Z",
    })

    assert query.occurred_from is not None
    assert query.occurred_to is not None
