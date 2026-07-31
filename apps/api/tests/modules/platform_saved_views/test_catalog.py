from __future__ import annotations

import pytest

from src.core.exceptions import BadRequest
from src.modules.platform_saved_views.catalog import require_capability, validate_draft
from src.modules.platform_saved_views.schema import (
    PlatformSavedViewDraft,
    PlatformSavedViewFilter,
    PlatformSavedViewOrdering,
)


def test_accepts_audit_event_name_filter_from_the_system_list_contract() -> None:
    draft = PlatformSavedViewDraft(
        name="Saved view writes",
        filter_schema_revision="1",
        column_schema_revision="1",
        filters=(PlatformSavedViewFilter(code="event_name", value="platform.saved_view"),),
        ordering=PlatformSavedViewOrdering(code="occurred_at", direction="desc"),
        visible_columns=("occurred_at", "event_name"),
        column_order=("occurred_at", "event_name"),
        density="comfortable",
    )

    validate_draft(capability=require_capability("monitoring.audit"), draft=draft)


def test_rejects_workspace_response_field_as_an_ordering_code() -> None:
    draft = PlatformSavedViewDraft(
        name="Recent workspaces",
        filter_schema_revision="1",
        column_schema_revision="1",
        filters=(),
        ordering=PlatformSavedViewOrdering(code="last_activity_at", direction="desc"),
        visible_columns=("name",),
        column_order=("name",),
        density="comfortable",
    )

    with pytest.raises(BadRequest, match="PLATFORM_SAVED_VIEW_ORDERING_INVALID"):
        validate_draft(capability=require_capability("tenant.workspaces"), draft=draft)
