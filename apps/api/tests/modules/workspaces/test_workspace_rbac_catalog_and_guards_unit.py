from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter
from fastapi.params import Depends
from fastapi.routing import APIRoute

from src.modules.organization.rbac.catalog import get_organization_permission_catalog
from src.modules.projects.api_keys.router import router as project_api_keys_router
from src.modules.projects.assets.router import router as project_assets_router
from src.modules.projects.content.items.router import router as project_items_router
from src.modules.projects.content.models.router import router as project_models_router
from src.modules.projects.content.routing.router import router as project_routing_router
from src.modules.projects.domains.router import router as project_domains_router
from src.modules.projects.publish.router import router as project_publish_router
from src.modules.projects.releases.router import router as project_releases_router
from src.modules.projects.runtime.router import project_router as project_runtime_router
from src.modules.system.admin.notifications.router import router as notifications_router
from src.modules.system.rbac.catalog.service import CORE_PERMISSION_TEMPLATES
from src.modules.workspaces.permissions import get_permission_action_registry
from src.modules.workspaces.rbac.router import router as workspace_rbac_router


def _route_permissions(router: APIRouter, *, path: str, method: str) -> set[str]:
    route = _find_api_route(router, path=path, method=method)
    return _extract_permissions(route.dependencies)


def _find_api_route(router: APIRouter, *, path: str, method: str) -> APIRoute:
    method_norm = method.upper()
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path != path:
            continue
        if method_norm not in route.methods:
            continue
        return route
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


def _route_dependency_call_names(router: APIRouter, *, path: str, method: str) -> set[str]:
    route = _find_api_route(router, path=path, method=method)
    names: set[str] = set()

    def _walk(dependant: object) -> None:
        call = getattr(dependant, "call", None)
        if callable(call):
            names.add(getattr(call, "__name__", str(call)))
        for dependency in getattr(dependant, "dependencies", []) or []:
            _walk(dependency)

    _walk(route.dependant)
    return names


def _project_root() -> Path:
    return Path(__file__).resolve().parents[5]


def test_workspace_catalog_includes_content_site_permissions_with_defaults() -> None:
    templates = {tpl.code: tpl for tpl in CORE_PERMISSION_TEMPLATES}
    expected_defaults = {
        "system:site:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:site:manage": {"owner", "admin", "editor", "designer"},
        "system:content:read": {"owner", "admin", "editor", "designer", "viewer"},
        "system:content:manage": {"owner", "admin", "editor", "designer"},
        "system:content:publish": {"owner", "admin", "editor"},
        "system:keys:read": {"owner", "admin"},
        "system:keys:manage": {"owner", "admin"},
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


def test_workspace_action_catalog_includes_delivery_and_workspace_actions() -> None:
    registry = get_permission_action_registry()

    assert "system:content:read" in registry
    assert registry["system:content:read"].permission_codes == ("system:content:read",)
    assert "content:items:write" in registry
    assert registry["content:items:write"].permission_codes == ("system:content:manage",)
    assert "content:site-builder:write" in registry
    assert registry["content:site-builder:write"].subject_kinds == (
        "workspace_member",
        "personal_api_key",
        "workspace_api_key",
    )
    assert "content:routing:read" in registry
    assert registry["content:routing:read"].permission_codes == ("system:content:read",)
    assert "content:routing:write" in registry
    assert registry["content:routing:write"].permission_codes == ("system:content:manage",)
    assert "site:read" in registry
    assert registry["site:read"].permission_codes == ("system:site:read",)
    assert "site:manage" in registry
    assert registry["site:manage"].permission_codes == ("system:site:manage",)
    assert "release:read" in registry
    assert registry["release:read"].permission_codes == ("system:content:read",)
    assert "release:publish" in registry
    assert registry["release:publish"].permission_codes == ("system:content:publish",)
    assert "release:rollback" in registry
    assert registry["release:rollback"].permission_codes == ("system:content:publish",)
    assert "delivery:graphql:read" in registry
    assert registry["delivery:graphql:read"].subject_kinds == ("delivery_api_key",)


def test_organization_permission_catalog_is_derived_from_unified_registry() -> None:
    registry = get_organization_permission_catalog()

    assert "org.roles.write" in registry
    assert registry["org.roles.write"].scope == "org"
    assert registry["org.roles.write"].permission_codes == ("org.roles.write",)
    assert registry["org.settings.delete"].default_role_codes == ("owner",)
    assert registry["org.members.read"].module == "members"


def test_content_router_uses_granular_permissions() -> None:
    list_models_calls = _route_dependency_call_names(
        project_models_router,
        path="/projects/{project_id}/content/models",
        method="GET",
    )
    create_model_calls = _route_dependency_call_names(
        project_models_router,
        path="/projects/{project_id}/content/models",
        method="POST",
    )
    list_items_calls = _route_dependency_call_names(
        project_items_router,
        path="/projects/{project_id}/content/items",
        method="GET",
    )
    publish_item_calls = _route_dependency_call_names(
        project_items_router,
        path="/projects/{project_id}/content/items/{item_id}/versions/{version_number}/publish",
        method="POST",
    )
    upsert_binding_calls = _route_dependency_call_names(
        project_routing_router,
        path="/projects/{project_id}/content/routing/bindings/{item_id}",
        method="PUT",
    )

    assert "require_project_content_read_context" in list_models_calls
    assert "require_project_content_manage_context" in create_model_calls
    assert "require_project_content_read_context" in list_items_calls
    assert "require_project_content_publish_context" in publish_item_calls
    assert "require_project_content_manage_context" in upsert_binding_calls


def test_site_router_uses_granular_permissions() -> None:
    site_read = _route_permissions(project_runtime_router, path="/projects/{project_id}/site", method="GET")
    site_preview = _route_permissions(
        project_runtime_router,
        path="/projects/{project_id}/site/preview-tokens",
        method="POST",
    )

    assert site_read == {"project:site:read"}
    assert site_preview == {"project:site:manage"}
    assert "admin:access" not in site_read | site_preview


def test_project_router_excludes_runtime_bridge_mounts() -> None:
    router_source = (Path(__file__).resolve().parents[3] / "src" / "modules" / "projects" / "router.py").read_text()
    assert "projects_runtime_bridge_router" not in router_source


def test_project_api_key_router_uses_granular_permissions() -> None:
    list_keys = _route_permissions(
        project_api_keys_router,
        path="/projects/{project_id}/api-keys",
        method="GET",
    )
    create_key = _route_permissions(
        project_api_keys_router,
        path="/projects/{project_id}/api-keys",
        method="POST",
    )
    rotate_key = _route_permissions(
        project_api_keys_router,
        path="/projects/{project_id}/api-keys/{key_id}/rotate",
        method="POST",
    )
    list_actions = _route_permissions(
        workspace_rbac_router,
        path="/workspaces/{workspace_id}/rbac/actions",
        method="GET",
    )

    assert list_keys == {"project:api-keys:read"}
    assert create_key == {"project:api-keys:manage"}
    assert rotate_key == {"project:api-keys:manage"}
    assert list_actions == {"rbac:permissions:read"}
    assert "admin:access" not in list_keys | create_key | rotate_key | list_actions


def test_workspace_rbac_router_hard_cuts_matrix_route() -> None:
    paths = {route.path for route in workspace_rbac_router.routes if isinstance(route, APIRoute)}

    assert "/workspaces/{workspace_id}/rbac/matrix" not in paths
    assert "/workspaces/{workspace_id}/rbac/roles" in paths
    assert "/workspaces/{workspace_id}/rbac/permissions" in paths
    assert "/workspaces/{workspace_id}/rbac/actions" in paths


def test_project_releases_router_uses_granular_permissions() -> None:
    list_releases = _route_permissions(
        project_releases_router,
        path="/projects/{project_id}/releases",
        method="GET",
    )
    publish_release = _route_permissions(
        project_releases_router,
        path="/projects/{project_id}/releases/publish",
        method="POST",
    )
    rollback_release = _route_permissions(
        project_releases_router,
        path="/projects/{project_id}/releases/{release_id}/rollback",
        method="POST",
    )

    assert list_releases == {"project:release:read"}
    assert publish_release == {"project:release:publish"}
    assert rollback_release == {"project:release:rollback"}
    assert "admin:access" not in list_releases | publish_release | rollback_release


def test_project_publish_router_uses_granular_permissions() -> None:
    impact_permissions = _route_permissions(
        project_publish_router,
        path="/projects/{project_id}/publish/impact",
        method="GET",
    )
    preview_contract_permissions = _route_permissions(
        project_publish_router,
        path="/projects/{project_id}/publish/preview-contract",
        method="GET",
    )

    assert impact_permissions == {"project:release:read"}
    assert preview_contract_permissions == {"project:release:read"}
    assert "admin:access" not in impact_permissions | preview_contract_permissions


def test_project_content_routing_router_uses_granular_permissions() -> None:
    list_bindings_calls = _route_dependency_call_names(
        project_routing_router,
        path="/projects/{project_id}/content/routing/bindings",
        method="GET",
    )
    upsert_binding_calls = _route_dependency_call_names(
        project_routing_router,
        path="/projects/{project_id}/content/routing/bindings/{item_id}",
        method="PUT",
    )
    list_hierarchy_calls = _route_dependency_call_names(
        project_routing_router,
        path="/projects/{project_id}/content/routing/hierarchy",
        method="GET",
    )
    upsert_hierarchy_calls = _route_dependency_call_names(
        project_routing_router,
        path="/projects/{project_id}/content/routing/hierarchy/{item_id}",
        method="PUT",
    )

    assert "require_project_content_read_context" in list_bindings_calls
    assert "require_project_content_manage_context" in upsert_binding_calls
    assert "require_project_content_read_context" in list_hierarchy_calls
    assert "require_project_content_manage_context" in upsert_hierarchy_calls


def test_assets_domains_and_notifications_use_granular_permissions() -> None:
    assets_list = _route_permissions(project_assets_router, path="/projects/{project_id}/assets", method="GET")
    assets_update = _route_permissions(
        project_assets_router,
        path="/projects/{project_id}/assets/{asset_id}",
        method="PATCH",
    )
    usages_list = _route_permissions(
        project_assets_router,
        path="/projects/{project_id}/assets/{asset_id}/usages",
        method="GET",
    )
    usages_upsert = _route_permissions(project_assets_router, path="/projects/{project_id}/asset-usages", method="PUT")
    upload_init = _route_permissions(project_assets_router, path="/projects/{project_id}/uploads/init", method="POST")
    domains_list = _route_permissions(project_domains_router, path="/projects/{project_id}/domains", method="GET")
    domains_create = _route_permissions(project_domains_router, path="/projects/{project_id}/domains", method="POST")
    notif_seed = _route_permissions(
        notifications_router,
        path="/workspaces/{workspace_id}/notifications/dev/seed",
        method="POST",
    )
    assert assets_list == {"project:assets:read"}
    assert assets_update == {"project:assets:manage"}
    assert usages_list == {"project:assets:read"}
    assert usages_upsert == {"project:assets:manage"}
    assert upload_init == {"project:assets:manage"}
    assert domains_list == {"project:domains:read"}
    assert domains_create == {"project:domains:manage"}
    assert notif_seed == {"system:notifications:read", "system:notifications:manage"}


def test_workspace_routers_forbid_admin_access_coarse_permission_dependency() -> None:
    modules_root = _project_root() / "apps" / "api" / "src" / "modules"
    offenders: list[str] = []
    marker = 'require_workspace_permission("admin:access")'
    for router_file in modules_root.rglob("router.py"):
        if marker in router_file.read_text():
            offenders.append(router_file.relative_to(_project_root()).as_posix())
    assert not offenders
