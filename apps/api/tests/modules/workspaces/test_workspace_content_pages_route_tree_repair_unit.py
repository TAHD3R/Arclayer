from __future__ import annotations

from uuid import uuid4

import pytest

from apps.api.src.models.content.content import (
    ContentEntryRecord,
    ContentRevisionRecord,
    ContentTypeRecord,
)
from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord
from apps.api.src.models.organization.organization import Organization
from apps.api.src.models.sites.site import SiteRecord
from apps.api.src.models.workspaces.workspace import Workspace
from apps.api.src.modules.workspaces.content.pages.repair import repair_legacy_page_route_tree


@pytest.mark.asyncio
async def test_pages_route_tree_repair_uses_revision_meta_when_legacy_columns_absent(prepared_db) -> None:
    _ = prepared_db

    org = await Organization.create(slug=f"org_{uuid4().hex[:8]}", name="Org")
    owner_id = uuid4()
    ws = await Workspace.create(
        organization_id=org.id,
        slug=f"ws_{uuid4().hex[:8]}",
        name="Workspace",
        is_active=True,
        created_by_user_id=owner_id,
    )
    site = await SiteRecord.create(workspace_id=ws.id, slug="site", name="Site", created_by_user_id=owner_id)

    page_type = await ContentTypeRecord.create(
        workspace_id=ws.id,
        site_id=site.id,
        code="page",
        name="Page",
        kind="page",
    )

    parent = await ContentEntryRecord.create(
        workspace_id=ws.id,
        site_id=site.id,
        type_id=page_type.id,
        slug="docs",
        title="Docs",
        locale="zh-CN",
        created_by_user_id=owner_id,
        updated_by_user_id=owner_id,
    )
    child = await ContentEntryRecord.create(
        workspace_id=ws.id,
        site_id=site.id,
        type_id=page_type.id,
        slug="docs-getting-started",
        title="Getting started",
        locale="zh-CN",
        created_by_user_id=owner_id,
        updated_by_user_id=owner_id,
    )

    await ContentRevisionRecord.create(
        entry_id=parent.id,
        revision=1,
        snapshot={"meta": {"kind": "page", "path": "/docs"}},
        created_by_user_id=owner_id,
    )
    await ContentRevisionRecord.create(
        entry_id=child.id,
        revision=1,
        snapshot={"meta": {"kind": "page", "path": "/docs/getting-started"}},
        created_by_user_id=owner_id,
    )

    stats = await repair_legacy_page_route_tree(
        workspace_id=ws.id,
        site_id=site.id,
        page_entry_ids=[parent.id, child.id],
    )
    assert stats.missing_routes == 2
    assert stats.missing_tree_nodes == 2
    assert stats.repaired_routes == 2
    assert stats.repaired_tree_nodes == 2
    assert stats.orphan_parents_detached == 0

    parent_route = await ContentRouteRecord.get(site_id=site.id, entry_id=parent.id)
    child_route = await ContentRouteRecord.get(site_id=site.id, entry_id=child.id)
    assert parent_route.path == "/docs"
    assert child_route.path == "/docs/getting-started"

    parent_node = await ContentTreeNodeRecord.get(site_id=site.id, entry_id=parent.id)
    child_node = await ContentTreeNodeRecord.get(site_id=site.id, entry_id=child.id)
    assert parent_node.parent_entry_id is None
    assert child_node.parent_entry_id == parent.id
