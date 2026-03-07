from __future__ import annotations

from apps.api.src.models.content.route import ContentRouteRecord
from apps.api.src.models.content.tree import ContentTreeNodeRecord


def test_content_route_record_meta_is_stable() -> None:
    assert getattr(ContentRouteRecord.Meta, "table", None) == "content_routes"
    assert ("site_id", "locale", "path") in getattr(ContentRouteRecord.Meta, "unique_together", ())
    assert ("entry_id", "locale") in getattr(ContentRouteRecord.Meta, "unique_together", ())


def test_content_tree_node_record_meta_is_stable() -> None:
    assert getattr(ContentTreeNodeRecord.Meta, "table", None) == "content_tree_nodes"
    assert ("site_id", "entry_id") in getattr(ContentTreeNodeRecord.Meta, "unique_together", ())
