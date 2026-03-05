from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.routing import APIRoute

from apps.api.src.modules.assets.admin.assets.router import router as assets_router
from apps.api.src.modules.assets.admin.uploads.router import router as uploads_router
from apps.api.src.modules.assets.admin.usages.router import router as usages_router
from apps.api.src.modules.sites.domains.router import router as domains_router
from apps.api.src.modules.system.admin.extensions.router import router as admin_extensions_router
from apps.api.src.modules.system.admin.notifications.router import router as notifications_router
from apps.api.src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from apps.api.src.modules.workspaces.content.router import router as content_router
from apps.api.src.modules.workspaces.site.router import router as site_router
from apps.api.src.modules.workspaces.themes.router import router as themes_router


def _route_permissions(router: APIRouter, *, path: str, method: str) -> set[str]:
    method_norm = method.upper()
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path != path:
            continue
        if method_norm not in route.methods:
            continue
        return _extract_permissions(route.dependencies)
    raise AssertionError(f"Route not found: {method_norm} {path}")


def _extract_permissions(depends_list: list[Depends]) -> set[str]:
    permissions: set[str] = set()
    for depends in depends_list:
        fn = getattr(depends, "dependency", None)
        if not callable(fn):
            continue
        closure = getattr(fn, "__closure__", None) or ()
        for cell in closure:
            value = cell.cell_contents
            if isinstance(value, str) and ":" in value:
                permissions.add(value)
    return permissions


def _project_root() -> Path:
    return Path(__file__).resolve().parents[5]


def test_workspace_catalog_includes_content_site_theme_permissions_with_defaults() -> None:
    templates = {tpl.code: tpl for tpl in CORE_PERMISSION_TEMPLATES}
    expected_defaults = {
        "system:site:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:site:manage": {"owner", "admin", "editor", "designer"},
        "system:content:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:content:manage": {"owner", "admin", "editor", "designer"},
        "system:content:publish": {"owner", "admin", "editor"},
        "system:themes:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:themes:manage": {"owner", "admin", "designer"},
        "system:assets:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:assets:manage": {"owner", "admin", "editor", "designer"},
        "system:domains:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:domains:manage": {"owner", "admin"},
        "system:notifications:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:notifications:manage": {"owner", "admin"},
    }

    for code, expected_roles in expected_defaults.items():
        assert code in templates
        template = templates[code]
        assert set(template.default_roles or []) == expected_roles
        assert template.name_i18n and template.name_i18n.startswith("rbac:")
        assert template.description_i18n and template.description_i18n.startswith("rbac:")


def test_workspace_catalog_i18n_keys_exist_in_locale_files() -> None:
    locale_root = _project_root() / "locales"
    en_locale = json.loads((locale_root / "en-US" / "rbac.json").read_text())
    zh_locale = json.loads((locale_root / "zh-CN" / "rbac.json").read_text())

    for template in CORE_PERMISSION_TEMPLATES:
        for i18n_ref in (template.name_i18n, template.description_i18n):
            assert i18n_ref
            assert i18n_ref.startswith("rbac:")
            key = i18n_ref.split(":", 1)[1]
            assert key in en_locale
            assert key in zh_locale


def test_content_router_uses_granular_permissions() -> None:
    list_types = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/types",
        method="GET",
    )
    create_type = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/types",
        method="POST",
    )
    publish_entry = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/entries/{entry_id}/publish",
        method="POST",
    )
    create_page = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/pages",
        method="POST",
    )
    publish_page = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/pages/{page_id}/revisions/publish",
        method="POST",
    )
    set_global_style = _route_permissions(
        content_router,
        path="/workspaces/{workspace_id}/content/appearance/styles/global",
        method="PUT",
    )

    assert list_types == {"system:content:read"}
    assert create_type == {"system:content:read", "system:content:manage"}
    assert publish_entry == {"system:content:read", "system:content:publish"}
    assert create_page == {"system:content:read", "system:content:manage"}
    assert publish_page == {"system:content:read", "system:content:publish"}
    assert set_global_style == {"system:content:read", "system:content:manage"}
    assert (
        "admin:access" not in list_types | create_type | publish_entry | create_page | publish_page | set_global_style
    )


def test_site_and_theme_routers_use_granular_permissions() -> None:
    site_read = _route_permissions(site_router, path="/workspaces/{workspace_id}/site", method="GET")
    site_preview = _route_permissions(site_router, path="/workspaces/{workspace_id}/site/preview-tokens", method="POST")
    import_theme = _route_permissions(themes_router, path="/workspaces/{workspace_id}/themes/import", method="POST")
    delete_theme = _route_permissions(
        themes_router,
        path="/workspaces/{workspace_id}/themes/{theme_id}/{version}",
        method="DELETE",
    )

    assert site_read == {"system:site:read"}
    assert site_preview == {"system:site:read", "system:site:manage"}
    assert import_theme == {"system:themes:read", "system:themes:manage"}
    assert delete_theme == {"system:themes:read", "system:themes:manage"}
    assert "admin:access" not in site_read | site_preview | import_theme | delete_theme


def test_assets_domains_notifications_and_extensions_use_granular_permissions() -> None:
    assets_list = _route_permissions(assets_router, path="/workspaces/{workspace_id}/assets", method="GET")
    assets_update = _route_permissions(
        assets_router,
        path="/workspaces/{workspace_id}/assets/{asset_id}",
        method="PATCH",
    )
    usages_list = _route_permissions(
        usages_router,
        path="/workspaces/{workspace_id}/assets/{asset_id}/usages",
        method="GET",
    )
    usages_upsert = _route_permissions(usages_router, path="/workspaces/{workspace_id}/asset-usages", method="PUT")
    upload_init = _route_permissions(uploads_router, path="/workspaces/{workspace_id}/uploads/init", method="POST")
    domains_list = _route_permissions(domains_router, path="/workspaces/{workspace_id}/site/domains", method="GET")
    domains_create = _route_permissions(domains_router, path="/workspaces/{workspace_id}/site/domains", method="POST")
    notif_list = _route_permissions(
        notifications_router,
        path="/workspaces/{workspace_id}/notifications",
        method="GET",
    )
    notif_seed = _route_permissions(
        notifications_router,
        path="/workspaces/{workspace_id}/notifications/dev/seed",
        method="POST",
    )
    admin_exts = _route_permissions(
        admin_extensions_router,
        path="/workspaces/{workspace_id}/extensions/admin",
        method="GET",
    )

    assert assets_list == {"system:assets:read"}
    assert assets_update == {"system:assets:read", "system:assets:manage"}
    assert usages_list == {"system:assets:read"}
    assert usages_upsert == {"system:assets:read", "system:assets:manage"}
    assert upload_init == {"system:assets:manage"}
    assert domains_list == {"system:domains:read"}
    assert domains_create == {"system:domains:read", "system:domains:manage"}
    assert notif_list == {"system:notifications:read"}
    assert notif_seed == {"system:notifications:read", "system:notifications:manage"}
    assert admin_exts == {"system:extensions:read"}


def test_workspace_routers_forbid_admin_access_coarse_permission_dependency() -> None:
    modules_root = _project_root() / "apps" / "api" / "src" / "modules"
    offenders: list[str] = []
    marker = 'require_workspace_permission("admin:access")'
    for router_file in modules_root.rglob("router.py"):
        if marker in router_file.read_text():
            offenders.append(router_file.relative_to(_project_root()).as_posix())
    assert not offenders
