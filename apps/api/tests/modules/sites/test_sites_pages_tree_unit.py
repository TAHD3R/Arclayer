from __future__ import annotations

from typing import Literal
from uuid import uuid4

from apps.api.modules.sites.schema import SitePageTreeNodeOut
from apps.api.modules.sites.utils import build_pages_tree


def _node(*, id, path: str, parent_id=None, sort_order: int = 0, visibility: Literal["public", "private"] = "public"):
    return SitePageTreeNodeOut(
        id=id,
        path=path,
        title=None,
        description=None,
        parent_id=parent_id,
        sort_order=sort_order,
        visibility=visibility,
        draft_revision=0,
        published_revision=None,
        updated_at=None,
        updated_by=None,
        children=[],
    )


def test_build_pages_tree_sorts_children_deterministically():
    root = uuid4()
    c1 = uuid4()
    c2 = uuid4()

    nodes = [
        _node(id=c1, path="/b", parent_id=root, sort_order=2),
        _node(id=c2, path="/a", parent_id=root, sort_order=2),
        _node(id=root, path="/", parent_id=None, sort_order=0),
    ]

    out = build_pages_tree(nodes)
    assert len(out) == 1
    assert out[0].id == root
    assert [c.path for c in out[0].children] == ["/a", "/b"]


def test_build_pages_tree_treats_orphans_as_roots():
    orphan = uuid4()
    missing_parent = uuid4()

    out = build_pages_tree([_node(id=orphan, path="/orphan", parent_id=missing_parent)])
    assert len(out) == 1
    assert out[0].id == orphan
    assert out[0].parent_id is None
