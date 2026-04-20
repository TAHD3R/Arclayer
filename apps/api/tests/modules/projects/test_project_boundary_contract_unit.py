from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[5]

PROJECT_OWNED_WORKSPACE_ROUTERS = {
    "apps/api/src/modules/workspaces/content/models/router.py": 'prefix="/workspaces/{workspace_id}/content"',
    "apps/api/src/modules/workspaces/content/items/router.py": 'prefix="/workspaces/{workspace_id}/content"',
    "apps/api/src/modules/workspaces/content/routing/router.py": 'prefix="/workspaces/{workspace_id}/content/routing"',
    "apps/api/src/modules/workspaces/content/bindings/router.py": 'prefix="/workspaces/{workspace_id}/content"',
    "apps/api/src/modules/workspaces/content/presentations/router.py": 'prefix="/workspaces/{workspace_id}/content"',
    "apps/api/src/modules/workspaces/content/seo/router.py": 'prefix="/workspaces/{workspace_id}/content"',
    "apps/api/src/modules/workspaces/publish/router.py": 'prefix="/workspaces/{workspace_id}/publish"',
    "apps/api/src/modules/workspaces/releases/router.py": 'prefix="/workspaces/{workspace_id}/releases"',
    "apps/api/src/modules/sites/domains/router.py": 'prefix="/workspaces/{workspace_id}/site/domains"',
    "apps/api/src/modules/workspaces/themes/router.py": 'prefix="/workspaces/{workspace_id}"',
}

WORKSPACE_SINGLE_SITE_MARKERS = {
    "apps/api/src/models/sites/site.py": [
        "Single-site workspace model",
        'unique_together = (("workspace_id",),)',
    ],
    "apps/api/src/modules/workspaces/content/shared/router.py": [
        "get_or_create_site_for_workspace",
    ],
    "apps/api/src/modules/projects/runtime/service.py": [
        "get_or_create_site_for_workspace",
    ],
}

PROJECT_OWNED_WORKSPACE_MOUNTS = {
    "workspace_content_models_router",
    "workspace_content_items_router",
    "workspace_content_presentations_router",
    "workspace_content_seo_router",
    "workspace_content_bindings_router",
    "workspace_content_routing_router",
    "workspace_releases_router",
    "workspace_publish_router",
    "workspace_themes_router",
}


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_project_owned_management_routes_are_not_mounted_under_workspaces() -> None:
    violations = [
        f"{relative_path} contains {marker}"
        for relative_path, marker in PROJECT_OWNED_WORKSPACE_ROUTERS.items()
        if marker in _read(relative_path)
    ]

    assert violations == []


def test_site_runtime_identity_is_not_workspace_singleton() -> None:
    violations: list[str] = []
    for relative_path, markers in WORKSPACE_SINGLE_SITE_MARKERS.items():
        source = _read(relative_path)
        violations.extend(f"{relative_path} contains {marker}" for marker in markers if marker in source)

    assert violations == []


def test_workspace_router_mounts_only_collaboration_container_features() -> None:
    source = _read("apps/api/src/modules/workspaces/router.py")
    violations = sorted(
        router_name
        for router_name in PROJECT_OWNED_WORKSPACE_MOUNTS
        if f"router.include_router({router_name})" in source
    )

    assert violations == []
