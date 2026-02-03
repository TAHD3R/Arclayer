from __future__ import annotations

from uuid import UUID

from apps.api.core.exceptions import Conflict
from apps.api.modules.sites.schema import SitePageTreeNodeOut


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    pathname = path if path.startswith("/") else f"/{path}"
    if pathname == "/":
        return "/"
    return pathname[:-1] if pathname.endswith("/") else pathname


def validate_page_pathname(path: str) -> str:
    """
    Validate and normalize a site page pathname.

    Notes:
    - Page paths are used as public URLs and must be stable.
    - Keep it conservative to prevent path traversal, control characters, and ambiguous routing.
    """

    pathname = normalize_path(path)

    if "?" in pathname or "#" in pathname:
        raise Conflict("Invalid path", error="PAGE_PATH_INVALID")
    if "\\" in pathname:
        raise Conflict("Invalid path", error="PAGE_PATH_INVALID")
    # Control characters should never appear in a pathname.
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in pathname):
        raise Conflict("Invalid path", error="PAGE_PATH_INVALID")

    if pathname == "/":
        return "/"

    # Avoid ambiguous routing and traversal.
    if "//" in pathname:
        raise Conflict("Invalid path", error="PAGE_PATH_INVALID")
    segments = pathname.split("/")[1:]
    for seg in segments:
        if not seg:
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")
        if seg in (".", ".."):
            raise Conflict("Invalid path", error="PAGE_PATH_INVALID")
    return pathname


def validate_route_template_pattern(path_pattern: str) -> str:
    """
    Validate and normalize a RouteTemplate path pattern.

    Sprint 3 rules:
    - Only allow single-segment `:param` placeholders.
    - No splat, no optional segments.
    """

    pattern = normalize_path(path_pattern)
    if "?" in pattern or "#" in pattern or "\\" in pattern:
        raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in pattern):
        raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
    if pattern == "/":
        raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
    if "//" in pattern:
        raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")

    segments = pattern.split("/")[1:]
    for seg in segments:
        if not seg:
            raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
        if seg in (".", ".."):
            raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
        # No splat / wildcard segments in Sprint 3 (e.g. "/blog/*").
        if "*" in seg:
            raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
        if ":" in seg:
            # Only allow a full param segment like ":slug".
            if not seg.startswith(":"):
                raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
            if seg.count(":") != 1:
                raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
            name = seg[1:]
            if not name:
                raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
            if not (name[0].isalpha() or name[0] == "_"):
                raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
            if not all(ch.isalnum() or ch == "_" for ch in name):
                raise Conflict("Invalid path pattern", error="ROUTE_TEMPLATE_PATTERN_INVALID")
    return pattern


def validate_entry_type_code(code: str) -> str:
    """
    Validate a stable entry type code (e.g. blog_post).

    Notes:
    - Keep it conservative because it becomes part of API paths/filters and plugin integrations.
    """

    c = (code or "").strip()
    if not c:
        raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
    if len(c) > 64:
        raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
    if not (c[0].isalpha() or c[0] == "_"):
        raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
    if not all(ch.isalnum() or ch == "_" for ch in c):
        raise Conflict("Invalid entry type code", error="ENTRY_TYPE_CODE_INVALID")
    return c


def is_descendant_or_self(
    *,
    node_id: UUID,
    candidate_parent_id: UUID,
    parent_by_id: dict[UUID, UUID | None],
) -> bool:
    """
    Returns True if candidate_parent_id is node_id itself or a descendant of node_id.

    Used to prevent cycles when updating the page tree.
    """

    cur: UUID | None = candidate_parent_id
    visited: set[UUID] = set()
    while cur is not None:
        if cur == node_id:
            return True
        if cur in visited:
            # Defensive: corrupted tree should not cause infinite loops.
            return True
        visited.add(cur)
        cur = parent_by_id.get(cur)
    return False


def build_pages_tree(nodes: list[SitePageTreeNodeOut]) -> list[SitePageTreeNodeOut]:
    """
    Build a deterministic page tree from flat nodes.
    """

    nodes_by_id: dict[UUID, SitePageTreeNodeOut] = {node.id: node for node in nodes}
    children_by_parent: dict[UUID | None, list[UUID]] = {}

    # Build parent -> children adjacency.
    for node in nodes_by_id.values():
        parent_id = node.parent_id
        # Orphan nodes (missing parent) are treated as roots to keep tree resilient.
        if parent_id is not None and parent_id not in nodes_by_id:
            parent_id = None
            node.parent_id = None
        children_by_parent.setdefault(parent_id, []).append(node.id)

    def sort_key(n: SitePageTreeNodeOut) -> tuple[int, str, str]:
        return (int(n.sort_order or 0), n.path, str(n.id))

    def build(parent_id: UUID | None) -> list[SitePageTreeNodeOut]:
        ids = children_by_parent.get(parent_id, [])
        nodes = [nodes_by_id[i] for i in ids if i in nodes_by_id]
        nodes.sort(key=sort_key)
        for n in nodes:
            n.children = build(n.id)
        return nodes

    return build(None)
