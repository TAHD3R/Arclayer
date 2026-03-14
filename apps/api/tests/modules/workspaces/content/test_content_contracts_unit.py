from __future__ import annotations

import re
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


def test_legacy_frontend_consumers_must_call_legacy_content_endpoints_only() -> None:
    studio_entries_api = _read_repo_file("apps/studio/src/api/content-entries.ts")
    studio_types_api = _read_repo_file("apps/studio/src/api/content-types.ts")
    studio_pages_api = _read_repo_file("apps/studio/src/api/pages.ts")
    portal_site_api = _read_repo_file("apps/portal/src/runtime/site-api.ts")

    assert "/legacy-content/entries" in studio_entries_api
    assert "/legacy-content/types" in studio_types_api
    assert "/legacy-content/pages" in studio_pages_api
    assert "/legacy-content/entries/" in portal_site_api

    assert "/workspaces/${workspaceId}/content/entries" not in studio_entries_api
    assert "/workspaces/${workspaceId}/content/types" not in studio_types_api
    assert "/workspaces/${workspaceId}/content/pages" not in studio_pages_api
    assert "/workspaces/${encodeURIComponent(wsId)}/content/entries/" not in portal_site_api


def test_admin_model_presets_must_be_explicitly_legacy_named() -> None:
    legacy_presets_file = _read_repo_file(
        "apps/admin/src/pages/workspaces/content/models/components/content-model-templates.ts"
    )
    create_dialog_file = _read_repo_file(
        "apps/admin/src/pages/workspaces/content/models/components/create-content-model-dialog.tsx"
    )

    assert "LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS" in legacy_presets_file
    assert "buildLegacyCreateContentModelInput" in legacy_presets_file
    assert "getLegacyContentModelTemplatePreset" in legacy_presets_file

    assert "LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS" in create_dialog_file
    assert "buildLegacyCreateContentModelInput" in create_dialog_file
    assert "getLegacyContentModelTemplatePreset" in create_dialog_file

    # Freeze guard: canonical preset-first symbols cannot remain as active contracts.
    assert "export const CONTENT_MODEL_TEMPLATE_PRESETS" not in legacy_presets_file
    assert "function buildCreateContentModelInput" not in legacy_presets_file
    assert "function getContentModelTemplatePreset" not in legacy_presets_file
    assert "type ContentModelTemplateId" not in create_dialog_file
    assert "buildCreateContentModelInput(" not in create_dialog_file
    assert "getContentModelTemplatePreset(" not in create_dialog_file

    # Freeze guard: legacy preset surface must be explicit and bounded.
    legacy_template_ids = set(re.findall(r'id:\s*"([a-z_]+)"', legacy_presets_file))
    assert legacy_template_ids == {
        "custom",
        "page",
        "post",
        "author",
        "testimonial",
        "pricing_tier",
        "legal_document",
        "reusable_block",
    }


def test_page_special_case_contract_surface_is_legacy_named_and_bounded() -> None:
    pages_api_file = _read_repo_file("apps/studio/src/api/pages.ts")

    legacy_page_paths = set(re.findall(r"/legacy-content/pages[^`\"']*", pages_api_file))
    assert legacy_page_paths == {
        "/legacy-content/pages/tree",
        "/legacy-content/pages",
        "/legacy-content/pages/${encodeURIComponent(pageId)}",
        "/legacy-content/pages/${encodeURIComponent(pageId)}/move",
        "/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/draft",
        "/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/published",
        "/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/publish",
        "/legacy-content/pages/${encodeURIComponent(pageId)}/revisions/unpublish",
    }
