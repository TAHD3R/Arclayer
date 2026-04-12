from __future__ import annotations

from uuid import uuid4

from src.common.utils.routing import extract_workspace_id_from_path


def test_extract_workspace_id_from_path_returns_workspace_id() -> None:
    workspace_id = uuid4()

    result = extract_workspace_id_from_path(f"/api/v1/workspaces/{workspace_id}/assets")

    assert result == workspace_id


def test_extract_workspace_id_from_path_rejects_invalid_paths() -> None:
    assert extract_workspace_id_from_path("/api/v1/system/runtime") is None
    assert extract_workspace_id_from_path("/api/v1/workspaces/not-a-uuid/assets") is None
