from __future__ import annotations


def test_org_assets_router_exposes_library_endpoints() -> None:
    # Unit-level router shape test: avoids requiring DB/auth to validate the org-scoped API surface.
    from fastapi.routing import APIRoute

    from src.modules.assets.admin.assets.org_router import router

    paths = {r.path for r in router.routes if isinstance(r, APIRoute)}

    assert "/organizations/{organization_id}/assets" in paths
    assert "/organizations/{organization_id}/assets/{asset_id}" in paths


def test_org_uploads_router_exposes_init_endpoint() -> None:
    from fastapi.routing import APIRoute

    from src.modules.assets.admin.uploads.org_router import router

    paths = {r.path for r in router.routes if isinstance(r, APIRoute)}

    assert "/organizations/{organization_id}/uploads/init" in paths
