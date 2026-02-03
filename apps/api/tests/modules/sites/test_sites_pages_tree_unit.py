from __future__ import annotations

from uuid import uuid4

from apps.api.modules.sites.service import _build_pages_tree


def _row(*, id, path: str, parent_id=None, sort_order: int = 0, visibility: str = "public"):
    return {
        "id": id,
        "path": path,
        "parent_id": parent_id,
        "sort_order": sort_order,
        "visibility": visibility,
        "draft_rev": 0,
        "published_rev": None,
    }


def test_build_pages_tree_sorts_children_deterministically():
    root = uuid4()
    c1 = uuid4()
    c2 = uuid4()

    rows = [
        _row(id=c1, path="/b", parent_id=root, sort_order=2),
        _row(id=c2, path="/a", parent_id=root, sort_order=2),
        _row(id=root, path="/", parent_id=None, sort_order=0),
    ]

    out = _build_pages_tree(rows)
    assert len(out) == 1
    assert out[0].id == root
    assert [c.path for c in out[0].children] == ["/a", "/b"]


def test_build_pages_tree_treats_orphans_as_roots():
    orphan = uuid4()
    missing_parent = uuid4()

    out = _build_pages_tree([_row(id=orphan, path="/orphan", parent_id=missing_parent)])
    assert len(out) == 1
    assert out[0].id == orphan
    assert out[0].parent_id is None
