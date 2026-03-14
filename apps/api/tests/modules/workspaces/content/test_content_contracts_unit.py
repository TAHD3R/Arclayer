from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[6]


def _read_repo_file(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_legacy_content_stack_must_not_occupy_canonical_workspace_content_prefix() -> None:
    content_router = _read_repo_file("apps/api/src/modules/workspaces/content/router.py")
    workspace_router = _read_repo_file("apps/api/src/modules/workspaces/router.py")

    assert 'prefix="/workspaces/{workspace_id}/legacy-content"' in content_router
    assert 'prefix="/workspaces/{workspace_id}/content"' not in content_router
    assert "workspace_legacy_content_router" in workspace_router
    assert "workspace_content_router" not in workspace_router
