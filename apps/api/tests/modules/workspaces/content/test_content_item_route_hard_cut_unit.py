from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

from src.common.utils.public_ids import encode_uuid
from src.modules.projects.content.items.domain_helpers import to_item_out


def test_content_item_continuation_uses_the_canonical_project_route() -> None:
    project_id = uuid4()
    item_id = uuid4()
    item = SimpleNamespace(
        id=item_id,
        workspace_id=uuid4(),
        site_id=uuid4(),
        slug="article",
        title="Article",
        status="draft",
        visibility="public",
        locale="zh-CN",
        translation_group_id=None,
        bootstrap_preset_key=None,
        bootstrap_preset_state="none",
        capability_pack_ids=[],
        resolved_role="article",
        resolved_posture="structured",
        resolved_surface="writing",
        shape_state="ready",
        shape_reason_code=None,
        shape_reason_meta=None,
        workflow_stage="drafting",
        workflow_assignee_user_id=None,
        workflow_summary=None,
        workflow_notes=None,
        draft_version=1,
        published_version=None,
        created_by_user_id=None,
        updated_by_user_id=None,
        updated_at=datetime.now(UTC),
    )

    output = to_item_out(item, None, project_id=project_id)
    expected_route = f"/projects/{encode_uuid(project_id)}/content/library/{encode_uuid(item_id)}"

    assert output.open_intent.route == expected_route
    assert output.continuation_target.route == expected_route
    assert "/w/" not in expected_route
